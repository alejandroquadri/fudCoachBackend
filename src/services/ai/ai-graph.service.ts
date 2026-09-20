import { ChatAnthropic } from '@langchain/anthropic';
import {
  AIMessage,
  BaseMessage,
  HumanMessage,
  RemoveMessage,
  SystemMessage,
} from '@langchain/core/messages';
import { RunnableConfig } from '@langchain/core/runnables';
import {
  END,
  MessagesValue,
  START,
  StateGraph,
  StateSchema,
} from '@langchain/langgraph';
import { MongoDBSaver } from '@langchain/langgraph-checkpoint-mongodb';
import { ChatOpenAI } from '@langchain/openai';
import { z } from 'zod';
import { UserProfile } from '../../types';
import { AiRunModel } from '../../models/ai-run.model';
import {
  ADVICE_PROMPT,
  EXERCISE_EXTRACTION_PROMPT,
  MEAL_EXTRACTION_PROMPT,
  PREFERENCE_EXTRACTION_PROMPT,
  ROUTER_PROMPT,
  SUMMARY_PROMPT,
  WEIGHT_EXTRACTION_PROMPT,
} from './ai-prompts';
import { AiActionsService } from './ai-actions.service';

const RouteSchema = z.object({
  route: z.enum([
    'ADVICE',
    'LOG_WEIGHT',
    'LOG_MEAL',
    'EXERCISE_LOG',
    'PREFERENCES',
    'UNKNOWN',
  ]),
  confidence: z.number().min(0).max(1),
  reason: z.string(),
});

const MealSchema = z.object({
  name: z.string().min(1),
  quantity: z.number().positive(),
  serving_size: z.enum(['small', 'medium', 'large']),
  calories: z.number().int().nonnegative(),
  protein: z.number().int().nonnegative(),
  carbs: z.number().int().nonnegative(),
  fat: z.number().int().nonnegative(),
});

const MealsSchema = z.object({ meals: z.array(MealSchema) });
const WeightSchema = z.object({ weight: z.number().positive() });
const ExerciseSchema = z.object({
  exerciseName: z.string().min(1),
  duration: z.number().int().positive(),
  caloriesBurned: z.number().int().nonnegative(),
});
const PreferenceListChangeSchema = z.object({
  operation: z.enum(['add', 'remove', 'replace']),
  values: z.array(z.string()),
});
const PreferenceChangeSchema = z.object({
  name: z.string().optional(),
  likes: PreferenceListChangeSchema.optional(),
  dislikes: PreferenceListChangeSchema.optional(),
});

const AgentState = new StateSchema({
  messages: MessagesValue,
  route: z.string().default('ADVICE'),
  extractedMeals: z.array(MealSchema).default(() => []),
  summary: z.string().default(''),
  runId: z.string(),
  userId: z.string(),
  profile: z.record(z.string(), z.unknown()).default(() => ({})),
});

type ImageInput = { buffer: Buffer; mimeType: string };
type AgentRoute = z.infer<typeof RouteSchema>['route'] | 'VISION';

export class AiGraphService {
  private readonly textModel: ChatAnthropic;
  private readonly visionModel: ChatOpenAI;
  private readonly actions = new AiActionsService();
  private readonly runs = new AiRunModel();
  private readonly images = new Map<string, ImageInput>();
  private readonly graph;

  constructor(checkpointer: MongoDBSaver) {
    this.textModel = new ChatAnthropic({
      model: process.env.AI_TEXT_MODEL || 'claude-haiku-4-5-20251001',
      temperature: 0,
      apiKey: this.requireEnv('ANTHROPIC_API_KEY'),
    });
    this.visionModel = new ChatOpenAI({
      model: process.env.AI_VISION_MODEL || 'gpt-4o-mini',
      temperature: 0,
      apiKey: this.requireEnv('OPENAI_API_KEY'),
    });
    this.graph = this.buildGraph(checkpointer);
  }

  setImage(runId: string, image: ImageInput) {
    this.images.set(runId, image);
  }

  clearImage(runId: string) {
    this.images.delete(runId);
  }

  invoke(
    input: {
      message: HumanMessage;
      runId: string;
      userId: string;
      profile: Record<string, unknown>;
    },
    threadId: string
  ) {
    return this.graph.invoke(
      {
        messages: [input.message],
        runId: input.runId,
        userId: input.userId,
        profile: input.profile,
      },
      { configurable: { thread_id: threadId } }
    );
  }

  getState(threadId: string) {
    return this.graph.getState({ configurable: { thread_id: threadId } });
  }

  updateState(
    threadId: string,
    values: { messages?: BaseMessage[]; profile?: Record<string, unknown> }
  ) {
    return this.graph.updateState(
      { configurable: { thread_id: threadId } },
      values
    );
  }

  private buildGraph(checkpointer: MongoDBSaver) {
    return new StateGraph(AgentState)
      .addNode('ROUTER', this.routeNode)
      .addNode('ADVICE', this.adviceNode)
      .addNode('WEIGHT_LOG', this.weightNode)
      .addNode('MEAL_EXTRACT', this.mealExtractNode)
      .addNode('MEAL_LOG', this.mealLogNode)
      .addNode('EXERCISE_LOG', this.exerciseNode)
      .addNode('VISION', this.visionNode)
      .addNode('PREFERENCES', this.preferencesNode)
      .addNode('SUMMARIZE', this.summarizeNode)
      .addEdge(START, 'ROUTER')
      .addConditionalEdges('ROUTER', this.nextNode)
      .addEdge('MEAL_EXTRACT', 'MEAL_LOG')
      .addEdge('ADVICE', 'SUMMARIZE')
      .addEdge('WEIGHT_LOG', 'SUMMARIZE')
      .addEdge('MEAL_LOG', 'SUMMARIZE')
      .addEdge('EXERCISE_LOG', 'SUMMARIZE')
      .addEdge('VISION', 'SUMMARIZE')
      .addEdge('PREFERENCES', 'SUMMARIZE')
      .addEdge('SUMMARIZE', END)
      .compile({ checkpointer });
  }

  private routeNode = async (
    state: typeof AgentState.State,
    _config: RunnableConfig
  ) => {
    let route: AgentRoute;
    if (this.images.has(state.runId)) {
      route = 'VISION';
    } else {
      const decision = await this.textModel
        .withStructuredOutput(RouteSchema, { name: 'route_decision' })
        .invoke([
          new SystemMessage(ROUTER_PROMPT),
          this.lastHumanMessage(state.messages),
        ]);
      route = decision.route === 'UNKNOWN' ? 'ADVICE' : decision.route;
      if (route === 'PREFERENCES' && decision.confidence < 0.6) {
        route = 'ADVICE';
      }
    }
    await this.runs.setRoute(state.runId, route);
    return { route };
  };

  private nextNode = (state: typeof AgentState.State) => {
    const routes: Record<string, string> = {
      LOG_WEIGHT: 'WEIGHT_LOG',
      LOG_MEAL: 'MEAL_EXTRACT',
      EXERCISE_LOG: 'EXERCISE_LOG',
      VISION: 'VISION',
      PREFERENCES: 'PREFERENCES',
    };
    return routes[state.route] ?? 'ADVICE';
  };

  private adviceNode = async (state: typeof AgentState.State) => {
    const profile = this.profileToString(state.profile).slice(0, 1200);
    const summary = state.summary || 'No earlier conversation summary.';
    const system = new SystemMessage(
      `${ADVICE_PROMPT}\n\nCurrent user profile:\n${profile}\n\nEarlier conversation summary:\n${summary}`
    );
    const response = await this.textModel.invoke([
      system,
      ...state.messages.slice(-8),
    ]);
    return { messages: [new AIMessage(this.messageText(response))] };
  };

  private weightNode = async (state: typeof AgentState.State) => {
    const parsed = await this.textModel
      .withStructuredOutput(WeightSchema, { name: 'weight_log' })
      .invoke([
        new SystemMessage(WEIGHT_EXTRACTION_PROMPT),
        this.lastHumanMessage(state.messages),
      ]);
    await this.actions.logWeight(state.runId, state.userId, parsed.weight);
    return {
      messages: [
        new AIMessage(
          `Weight logged successfully. (logged ${parsed.weight.toFixed(1)} kg)`
        ),
      ],
    };
  };

  private mealExtractNode = async (state: typeof AgentState.State) => {
    const parsed = await this.textModel
      .withStructuredOutput(MealsSchema, { name: 'meal_log' })
      .invoke([
        new SystemMessage(MEAL_EXTRACTION_PROMPT),
        this.lastHumanMessage(state.messages),
      ]);
    return { extractedMeals: parsed.meals };
  };

  private mealLogNode = async (state: typeof AgentState.State) => {
    if (state.extractedMeals.length === 0) {
      return {
        messages: [
          new AIMessage(
            "I couldn't find a meal to log. Please include the items and approximate amounts."
          ),
        ],
      };
    }
    await this.actions.logMeals(
      state.runId,
      state.userId,
      state.extractedMeals
    );
    return {
      messages: [new AIMessage(this.mealConfirmation(state.extractedMeals))],
    };
  };

  private exerciseNode = async (state: typeof AgentState.State) => {
    const exercise = await this.textModel
      .withStructuredOutput(ExerciseSchema, { name: 'exercise_log' })
      .invoke([
        new SystemMessage(EXERCISE_EXTRACTION_PROMPT),
        this.lastHumanMessage(state.messages),
      ]);
    await this.actions.logExercise(state.runId, state.userId, exercise);
    return {
      messages: [
        new AIMessage(
          `Exercise logged successfully. — ${exercise.exerciseName} for ${exercise.duration} min (~${exercise.caloriesBurned} kcal).`
        ),
      ],
    };
  };

  private visionNode = async (state: typeof AgentState.State) => {
    const image = this.images.get(state.runId);
    if (!image) throw new Error('The uploaded image is no longer available');

    const description = await this.visionModel.invoke([
      new HumanMessage({
        content: [
          {
            type: 'text',
            text: 'Describe every food item and its approximate portion in this image.',
          },
          {
            type: 'image_url',
            image_url: {
              url: `data:${image.mimeType};base64,${image.buffer.toString(
                'base64'
              )}`,
            },
          },
        ],
      }),
    ]);
    const parsed = await this.textModel
      .withStructuredOutput(MealsSchema, { name: 'image_meal_log' })
      .invoke([
        new SystemMessage(MEAL_EXTRACTION_PROMPT),
        new HumanMessage(this.messageText(description)),
      ]);
    if (parsed.meals.length === 0) {
      return {
        messages: [
          new AIMessage("I couldn't detect a clear meal in the image."),
        ],
      };
    }
    await this.actions.logMeals(state.runId, state.userId, parsed.meals);
    return { messages: [new AIMessage(this.mealConfirmation(parsed.meals))] };
  };

  private preferencesNode = async (state: typeof AgentState.State) => {
    const change = await this.textModel
      .withStructuredOutput(PreferenceChangeSchema, {
        name: 'preference_change',
      })
      .invoke([
        new SystemMessage(PREFERENCE_EXTRACTION_PROMPT),
        this.lastHumanMessage(state.messages),
      ]);
    const updated = await this.actions.updatePreferences(
      state.runId,
      state.userId,
      change
    );
    const response = await this.textModel.invoke([
      new SystemMessage(
        'Briefly confirm only the preference changes that were saved. Do not mention JSON, tools, or internal state.'
      ),
      new HumanMessage(JSON.stringify(updated)),
    ]);
    return {
      profile: { ...state.profile, ...updated },
      messages: [new AIMessage(this.messageText(response))],
    };
  };

  private summarizeNode = async (state: typeof AgentState.State) => {
    const keep = 10;
    if (state.messages.length <= 20) return {};
    const oldMessages = state.messages.slice(0, -keep);
    const response = await this.textModel.invoke([
      new SystemMessage(SUMMARY_PROMPT),
      new HumanMessage(
        `Existing summary:\n${
          state.summary || 'none'
        }\n\nMessages to summarize:\n${oldMessages
          .map(message => `${message.getType()}: ${this.messageText(message)}`)
          .join('\n')}`
      ),
    ]);
    const removals = oldMessages.flatMap(message =>
      message.id ? [new RemoveMessage({ id: message.id })] : []
    );
    return {
      summary: this.messageText(response),
      messages: removals,
    };
  };

  private lastHumanMessage(messages: BaseMessage[]) {
    const message = [...messages]
      .reverse()
      .find(item => item.getType() === 'human');
    if (!message) throw new Error('No user message was provided');
    return message;
  }

  private mealConfirmation(meals: z.infer<typeof MealSchema>[]) {
    const calories = meals.reduce((total, meal) => total + meal.calories, 0);
    return `Meal logged successfully. — Logged: ${meals
      .map(meal => meal.name)
      .join(', ')} (≈${calories} kcal).`;
  }

  private profileToString(profile: Record<string, unknown>) {
    const entries = Object.entries(profile).filter(
      ([, value]) => value != null
    );
    return entries.length === 0
      ? 'No profile information available.'
      : entries
          .map(
            ([key, value]) =>
              `${key}: ${
                Array.isArray(value) ? value.join(', ') : JSON.stringify(value)
              }`
          )
          .join('\n');
  }

  private messageText(message: BaseMessage) {
    if (typeof message.content === 'string') return message.content;
    return message.content
      .flatMap(part =>
        typeof part === 'string'
          ? [part]
          : part && typeof part === 'object' && 'text' in part
          ? [String(part.text)]
          : []
      )
      .join('\n');
  }

  private requireEnv(name: string) {
    const value = process.env[name];
    if (!value)
      throw new Error(`Missing required environment variable ${name}`);
    return value;
  }
}
