import {
  AIMessage,
  BaseMessage,
  HumanMessage,
  RemoveMessage,
  SystemMessage,
} from '@langchain/core/messages';
import {
  END,
  MessagesValue,
  START,
  StateGraph,
  StateSchema,
  REMOVE_ALL_MESSAGES,
  messagesStateReducer,
} from '@langchain/langgraph';
import { BaseCheckpointSaver } from '@langchain/langgraph-checkpoint';
import { z } from 'zod';
import { AiRunModel } from '../../models/ai-run.model';
import { AiFoodLogPayload } from '../../types';
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
import { AiCallContext, AiModelService, messageText } from './ai-model.service';
import {
  ExerciseSchema,
  MealAnalysis,
  MealAnalysisSchema,
  PendingMealSchema,
  PreferenceChangeSchema,
  RouteSchema,
  WeightSchema,
} from './ai-schemas';
import { MealNutritionService } from './meal-nutrition.service';
import { UsdaError } from '../usda.service';
import { CoachMemory, emptyMemory, memoryText } from './coach-memory';
import { CoachMemoryService } from './coach-memory.service';
import {
  clipHistoricalMessage,
  clipText,
  compactProfile,
  INCOMPLETE_CONTEXT,
  summaryChunk,
} from './ai-context';

export const AgentState = new StateSchema({
  messages: MessagesValue,
  route: z.string().default('ADVICE'),
  extractedMeals: z.array(z.custom<AiFoodLogPayload>()).default(() => []),
  pendingMeal: PendingMealSchema.nullable().default(null),
  summary: z.string().default(''),
  memory: z.custom<CoachMemory>().default(emptyMemory),
  memoryEnabled: z.boolean().default(false),
  runId: z.string(),
  userId: z.string(),
  profile: z.record(z.string(), z.unknown()).default(() => ({})),
});

type State = typeof AgentState.State;
type ImageInput = { buffer: Buffer; mimeType: string };
type Dependencies = {
  models?: Pick<AiModelService, 'context' | 'structured' | 'text'>;
  nutrition?: Pick<MealNutritionService, 'resolve'>;
  actions?: Pick<
    AiActionsService,
    'logMeals' | 'logWeight' | 'logExercise' | 'updatePreferences'
  >;
  runs?: Pick<AiRunModel, 'get' | 'setRoute' | 'recordModelCall'>;
  memory?: Pick<CoachMemoryService, 'observe'>;
};

export class AiGraphService {
  private readonly models;
  private readonly nutrition;
  private readonly actions;
  private readonly runs;
  private readonly memory;
  private readonly images = new Map<string, ImageInput>();
  private readonly barcodeMeals = new Map<string, AiFoodLogPayload>();
  private readonly contexts = new Map<string, AiCallContext>();
  private readonly graph;

  constructor(
    checkpointer: BaseCheckpointSaver,
    dependencies: Dependencies = {}
  ) {
    this.actions = dependencies.actions ?? new AiActionsService();
    this.runs = dependencies.runs ?? new AiRunModel();
    this.models =
      dependencies.models ??
      new AiModelService((runId, call) =>
        this.runs.recordModelCall(runId, call)
      );
    this.nutrition =
      dependencies.nutrition ?? new MealNutritionService(this.models);
    this.memory = dependencies.memory ?? new CoachMemoryService(this.models);
    this.graph = this.buildGraph(checkpointer);
  }

  setImage(runId: string, image: ImageInput) {
    this.images.set(runId, image);
  }
  clearImage(runId: string) {
    this.images.delete(runId);
    this.barcodeMeals.delete(runId);
  }
  setBarcodeMeal(runId: string, meal: AiFoodLogPayload) {
    this.barcodeMeals.set(runId, meal);
  }

  async invoke(
    input: {
      message: HumanMessage;
      runId: string;
      userId: string;
      profile: Record<string, unknown>;
      memory?: CoachMemory;
      recentMessages?: BaseMessage[];
      observeMemory?: boolean;
    },
    threadId: string
  ) {
    const profile = compactProfile(input.profile);
    const previous = await this.getState(threadId);
    this.contexts.set(input.runId, this.models.context(input.runId));
    const rawMessages = (previous.values.messages ?? []) as BaseMessage[];
    const previousMessages = rawMessages.map(clipHistoricalMessage);
    const clippedHistory = previousMessages.some(
      (message, index) => message !== rawMessages[index]
    );
    const retryIndex = previousMessages.findIndex(
      message => message.id === input.message.id
    );
    const prefix =
      retryIndex >= 0
        ? previousMessages.slice(0, retryIndex)
        : previousMessages;
    const boundedHistory = prefix.slice(-63);
    const pruned = prefix.length > 63;
    const previousSummary = String(previous.values.summary ?? '');
    const oldMemory = previous.values.memory as CoachMemory | undefined;
    const reset = Boolean(
      input.memory?.contextResetAt &&
      input.memory.contextResetAt !== oldMemory?.contextResetAt
    );
    const hydrate =
      reset || !(previous.values.messages as unknown[] | undefined)?.length;
    return this.graph
      .invoke(
        {
          messages: hydrate
            ? [
                new RemoveMessage({ id: REMOVE_ALL_MESSAGES }),
                ...(input.recentMessages ?? []).map(clipHistoricalMessage),
                input.message,
              ]
            : retryIndex >= 0
              ? [
                  new RemoveMessage({ id: REMOVE_ALL_MESSAGES }),
                  ...boundedHistory,
                  input.message,
                ]
              : clippedHistory || pruned
                ? [
                    new RemoveMessage({ id: REMOVE_ALL_MESSAGES }),
                    ...boundedHistory,
                    input.message,
                  ]
                : [input.message],
          runId: input.runId,
          userId: input.userId,
          profile,
          extractedMeals: [],
          summary: clipText(
            pruned && !previousSummary.startsWith(INCOMPLETE_CONTEXT)
              ? INCOMPLETE_CONTEXT + previousSummary
              : previousSummary,
            2400
          ),
          memory: input.memory ?? emptyMemory(),
          memoryEnabled:
            input.memory !== undefined && input.observeMemory !== false,
          ...(reset ? { summary: '', pendingMeal: null } : {}),
        },
        { configurable: { thread_id: threadId } }
      )
      .finally(() => this.contexts.delete(input.runId));
  }

  getState(threadId: string) {
    return this.graph.getState({ configurable: { thread_id: threadId } });
  }
  async updateState(
    threadId: string,
    values: { messages?: BaseMessage[]; profile?: Record<string, unknown> }
  ) {
    if (values.messages) {
      const previous = await this.getState(threadId);
      const messages = messagesStateReducer(
        (previous.values.messages ?? []) as BaseMessage[],
        values.messages
      ).map(clipHistoricalMessage);
      const summary = String(previous.values.summary ?? '');
      return this.graph.updateState(
        { configurable: { thread_id: threadId } },
        {
          ...values,
          ...(values.profile
            ? { profile: compactProfile(values.profile) }
            : {}),
          messages: [
            new RemoveMessage({ id: REMOVE_ALL_MESSAGES }),
            ...messages.slice(-64),
          ],
          ...(messages.length > 64
            ? {
                summary: clipText(
                  summary.startsWith(INCOMPLETE_CONTEXT)
                    ? summary
                    : INCOMPLETE_CONTEXT + summary,
                  2400
                ),
              }
            : {}),
        }
      );
    }
    return this.graph.updateState(
      { configurable: { thread_id: threadId } },
      {
        ...values,
        ...(values.profile ? { profile: compactProfile(values.profile) } : {}),
      }
    );
  }

  private buildGraph(checkpointer: BaseCheckpointSaver) {
    return new StateGraph(AgentState)
      .addNode('MEMORY', this.memoryNode)
      .addNode('ROUTER', this.routeNode)
      .addNode('ADVICE', this.adviceNode)
      .addNode('WEIGHT_LOG', this.weightNode)
      .addNode('MEAL_EXTRACT', this.mealExtractNode)
      .addNode('MEAL_LOG', this.mealLogNode)
      .addNode('EXERCISE_LOG', this.exerciseNode)
      .addNode('VISION', this.visionNode)
      .addNode('PREFERENCES', this.preferencesNode)
      .addNode('RECOVER', this.recoverNode)
      .addNode('SUMMARIZE', this.summarizeNode)
      .addEdge(START, 'MEMORY')
      .addEdge('MEMORY', 'ROUTER')
      .addConditionalEdges('ROUTER', this.nextNode)
      .addConditionalEdges('MEAL_EXTRACT', this.afterMealAnalysis)
      .addConditionalEdges('VISION', this.afterMealAnalysis)
      .addEdge('ADVICE', 'SUMMARIZE')
      .addEdge('WEIGHT_LOG', 'SUMMARIZE')
      .addEdge('MEAL_LOG', 'SUMMARIZE')
      .addEdge('EXERCISE_LOG', 'SUMMARIZE')
      .addEdge('PREFERENCES', 'SUMMARIZE')
      .addEdge('RECOVER', 'SUMMARIZE')
      .addEdge('SUMMARIZE', END)
      .compile({ checkpointer });
  }

  private memoryNode = async (state: State) => {
    if (!state.memoryEnabled) return {};
    if (
      messageText(this.lastHumanMessage(state.messages)) ===
      '[User uploaded an image]'
    )
      return {};
    // Completed actions recover without another inference or memory rewrite.
    const run = await this.runs.get(state.runId);
    if (run?.operations?.some(operation => operation.status === 'completed'))
      return {};
    const context = this.context(state);
    const turnDeadline = context.deadline;
    context.deadline = Math.min(turnDeadline, Date.now() + 8000);
    try {
      const latest = this.lastHumanMessage(state.messages);
      const memory = await this.memory.observe(
        state.userId,
        state.memory,
        state.profile,
        state.messages.slice(0, state.messages.indexOf(latest)),
        latest,
        this.context(state)
      );
      if (memory.contextResetAt !== state.memory.contextResetAt) {
        return {
          memory,
          summary: '',
          pendingMeal: null,
          messages: [new RemoveMessage({ id: REMOVE_ALL_MESSAGES }), latest],
        };
      }
      return { memory };
    } catch {
      // Personalization must not prevent a reply or a meal log.
      console.warn('Coach memory update deferred');
      return {};
    } finally {
      context.deadline = turnDeadline;
    }
  };

  private routeNode = async (state: State) => {
    const previous = await this.runs.get(state.runId);
    if (
      previous?.operations?.some(operation => operation.status === 'completed')
    )
      return { route: 'RECOVER', extractedMeals: [] };
    let route: string;
    if (this.barcodeMeals.has(state.runId)) route = 'LOG_MEAL';
    else if (this.images.has(state.runId)) route = 'VISION';
    else {
      const pendingContext = state.pendingMeal
        ? `\nA meal is awaiting clarification: ${JSON.stringify(
            state.pendingMeal
          )}\nIf the message answers or cancels that pending meal, select LOG_MEAL. Unrelated clear requests use their usual route.`
        : '';
      const decision = await this.models.structured(
        'router',
        RouteSchema,
        [
          new SystemMessage(ROUTER_PROMPT + pendingContext),
          ...state.messages.slice(-6),
        ],
        this.context(state)
      );
      route = decision.route === 'UNKNOWN' ? 'ADVICE' : decision.route;
      if (route === 'PREFERENCES' && decision.confidence < 0.6)
        route = 'ADVICE';
    }
    await this.runs.setRoute(state.runId, route);
    return {
      route,
      ...(route === 'LOG_MEAL' || route === 'ADVICE'
        ? {}
        : { pendingMeal: null }),
    };
  };

  private nextNode = (state: State) => {
    const routes: Record<string, string> = {
      LOG_WEIGHT: 'WEIGHT_LOG',
      LOG_MEAL: 'MEAL_EXTRACT',
      EXERCISE_LOG: 'EXERCISE_LOG',
      VISION: 'VISION',
      PREFERENCES: 'PREFERENCES',
      RECOVER: 'RECOVER',
    };
    return routes[state.route] ?? 'ADVICE';
  };

  private afterMealAnalysis = (state: State) =>
    state.extractedMeals.length ? 'MEAL_LOG' : 'SUMMARIZE';

  private adviceNode = async (state: State) => {
    const profile = Object.entries(compactProfile(state.profile))
      .filter(([, value]) => value != null)
      .map(([key, value]) => `${key}: ${JSON.stringify(value)}`)
      .join('\n')
      .slice(0, 10000);
    const response = await this.models.text(
      'advice',
      [
        new SystemMessage(
          `${ADVICE_PROMPT}\n\nCurrent user profile:\n${profile}\n\nEarlier conversation summary:\n${
            clipText(state.summary, 2400) || 'none'
          }\n\nPersonal notes the user can review and edit:\n${memoryText(
            state.memory
          )}\n\nCurrent date (UTC): ${new Date().toISOString().slice(0, 10)}`
        ),
        ...state.messages.slice(-16),
      ],
      this.context(state)
    );
    return { messages: [new AIMessage(response)] };
  };

  private weightNode = async (state: State) => {
    const parsed = await this.models.structured(
      'weight',
      WeightSchema,
      [
        new SystemMessage(WEIGHT_EXTRACTION_PROMPT),
        ...state.messages.slice(-6),
      ],
      this.context(state)
    );
    const saved = await this.actions.logWeight(
      state.runId,
      state.userId,
      parsed.weight
    );
    return {
      messages: [
        new AIMessage(
          `Weight logged successfully. (logged ${saved.weight.toFixed(1)} kg)`
        ),
      ],
    };
  };

  private mealExtractNode = async (state: State) => {
    const barcodeMeal = this.barcodeMeals.get(state.runId);
    if (barcodeMeal)
      return { extractedMeals: [barcodeMeal], pendingMeal: null };
    const pending = state.pendingMeal
      ? `\nPending meal observations and question:\n${JSON.stringify(
          state.pendingMeal
        )}`
      : '';
    const analysis = await this.models.structured(
      'meal',
      MealAnalysisSchema,
      [
        new SystemMessage(MEAL_EXTRACTION_PROMPT + pending),
        ...state.messages.slice(-6),
      ],
      this.context(state)
    );
    return this.resolveMealAnalysis(state, analysis);
  };

  private visionNode = async (state: State) => {
    const image = this.images.get(state.runId);
    if (!image)
      throw new Error(
        'The uploaded image is no longer available; please upload it again'
      );
    const caption = messageText(this.lastHumanMessage(state.messages));
    const analysis = await this.models.structured(
      'vision',
      MealAnalysisSchema,
      [
        new SystemMessage(
          MEAL_EXTRACTION_PROMPT +
            '\nAnalyze this food photo. Image portions are estimates. For an unclear photo, ask for the specific missing information instead of inventing a meal.'
        ),
        new HumanMessage({
          content: [
            {
              type: 'text',
              text:
                caption === '[User uploaded an image]'
                  ? 'Identify the foods and their approximate edible portions.'
                  : caption,
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
      ],
      this.context(state)
    );
    analysis.items = analysis.items.map(item => ({
      ...item,
      quantityEstimated: true,
    }));
    return this.resolveMealAnalysis(state, analysis);
  };

  private async resolveMealAnalysis(state: State, analysis: MealAnalysis) {
    if (analysis.outcome === 'cancel')
      return {
        extractedMeals: [],
        pendingMeal: null,
        messages: [
          new AIMessage('The pending meal was canceled. Nothing was logged.'),
        ],
      };
    if (analysis.outcome === 'no_food')
      return {
        extractedMeals: [],
        pendingMeal: null,
        messages: [
          new AIMessage(
            "I couldn't identify a meal to log. Please describe the foods and approximate amounts."
          ),
        ],
      };
    if (analysis.outcome === 'clarify' || !analysis.items.length)
      return this.clarify(
        analysis,
        analysis.question ||
          'What foods and approximate amounts would you like to log?'
      );
    try {
      const result = await this.nutrition.resolve(
        analysis.items,
        this.context(state)
      );
      if (result.outcome === 'clarify')
        return this.clarify(analysis, result.question);
      return { extractedMeals: result.meals, pendingMeal: null };
    } catch (error) {
      if (!(error instanceof UsdaError)) throw error;
      console.warn(error.message);
      return this.clarify(
        analysis,
        "I couldn't look up nutrition information right now, so I haven't logged this meal. Please try again shortly."
      );
    }
  }

  private clarify(analysis: MealAnalysis, question: string) {
    return {
      extractedMeals: [],
      pendingMeal: { items: analysis.items, question },
      messages: [new AIMessage(question)],
    };
  }

  private mealLogNode = async (state: State) => {
    const saved = await this.actions.logMeals(
      state.runId,
      state.userId,
      state.extractedMeals
    );
    return {
      extractedMeals: [],
      pendingMeal: null,
      messages: [new AIMessage(this.mealConfirmation(saved.meals))],
    };
  };

  private exerciseNode = async (state: State) => {
    const exercise = await this.models.structured(
      'exercise',
      ExerciseSchema,
      [
        new SystemMessage(EXERCISE_EXTRACTION_PROMPT),
        ...state.messages.slice(-6),
      ],
      this.context(state)
    );
    const saved = await this.actions.logExercise(
      state.runId,
      state.userId,
      exercise
    );
    return { messages: [new AIMessage(this.exerciseConfirmation(saved))] };
  };

  private preferencesNode = async (state: State) => {
    const change = await this.models.structured(
      'preferences',
      PreferenceChangeSchema,
      [
        new SystemMessage(PREFERENCE_EXTRACTION_PROMPT),
        this.lastHumanMessage(state.messages),
      ],
      this.context(state)
    );
    if (!change.name?.trim() && !change.likes && !change.dislikes)
      return this.adviceNode(state);
    const saved = await this.actions.updatePreferences(
      state.runId,
      state.userId,
      {
        name: change.name ?? undefined,
        likes: change.likes ?? undefined,
        dislikes: change.dislikes ?? undefined,
      }
    );
    return {
      profile: { ...state.profile, ...saved },
      messages: [new AIMessage(this.preferenceConfirmation(saved))],
    };
  };

  private recoverNode = async (state: State) => {
    const run = await this.runs.get(state.runId);
    const operation = run?.operations?.find(
      item => item.status === 'completed'
    );
    if (!operation)
      throw new Error('The completed AI operation could not be recovered');
    const result = operation.result as Record<string, unknown> | undefined;
    let content = 'Your previous request was saved successfully.';
    if (operation.key === 'log-meals')
      content = Array.isArray(result?.meals)
        ? this.mealConfirmation(result.meals as AiFoodLogPayload[])
        : 'Meal logged successfully.';
    if (operation.key === 'log-weight' && typeof result?.weight === 'number')
      content = `Weight logged successfully. (logged ${result.weight.toFixed(
        1
      )} kg)`;
    if (operation.key === 'log-exercise' && result)
      content = this.exerciseConfirmation(
        result as unknown as {
          exerciseName: string;
          duration: number;
          caloriesBurned: number;
        }
      );
    if (operation.key === 'update-preferences' && result)
      content = this.preferenceConfirmation(result);
    return {
      extractedMeals: [],
      pendingMeal: null,
      ...(operation.key === 'update-preferences'
        ? { profile: { ...state.profile, ...result } }
        : {}),
      messages: [new AIMessage(content)],
    };
  };

  private summarizeNode = async (state: State) => {
    if (
      state.messages.length <= 24 &&
      state.messages.reduce(
        (size, message) => size + messageText(message).length,
        0
      ) <= 24000
    )
      return {};
    const chunk = summaryChunk(state.messages.slice(0, -16));
    const oldMessages = chunk.messages;
    if (!oldMessages.length) return {};
    // Persistent failures must not grow checkpoint documents indefinitely.
    // The full transcript stays in aiMessages; durable personal notes are separate.
    const overflow = state.messages.slice(0, -64);
    const remove = (messages: BaseMessage[]) =>
      [
        ...new Map(
          messages
            .filter(message => message.id)
            .map(message => [message.id!, message])
        ).keys(),
      ].map(id => new RemoveMessage({ id }));
    const marker = INCOMPLETE_CONTEXT;
    const incomplete =
      overflow.length > oldMessages.length || state.summary.startsWith(marker);
    try {
      const response = await this.models.text(
        'summary',
        [
          new SystemMessage(SUMMARY_PROMPT),
          new HumanMessage(
            `Existing summary:\n${
              clipText(state.summary, 2400) || 'none'
            }\n\nMessages to summarize:\n${chunk.text}`
          ),
        ],
        this.context(state)
      );
      return {
        summary: clipText((incomplete ? marker : '') + response, 2400),
        messages: remove([...oldMessages, ...overflow]),
      };
    } catch {
      console.warn(
        'AI summary deferred; conversation and saved results retained'
      );
      return overflow.length
        ? {
            summary: clipText(
              state.summary.startsWith(marker)
                ? state.summary
                : marker + state.summary,
              2400
            ),
            messages: remove(overflow),
          }
        : {};
    }
  };

  private context(state: State) {
    const context = this.contexts.get(state.runId);
    if (!context) throw new Error('AI call context is missing');
    return context;
  }

  private lastHumanMessage(messages: BaseMessage[]) {
    const message = [...messages]
      .reverse()
      .find(item => item.getType() === 'human');
    if (!message) throw new Error('No user message was provided');
    return message;
  }

  private mealConfirmation(meals: AiFoodLogPayload[]) {
    const calories = meals.reduce((total, meal) => total + meal.calories, 0);
    const estimated = meals.some(
      meal => meal.nutrition?.quantitySource === 'ai_estimate'
    );
    return `Meal logged successfully. — Logged: ${meals
      .map(meal => meal.name)
      .join(', ')} (≈${Math.round(calories)} kcal).${
      estimated ? ' Portions are estimated.' : ''
    }`;
  }

  private exerciseConfirmation(exercise: {
    exerciseName: string;
    duration: number;
    caloriesBurned: number;
  }) {
    return `Exercise logged successfully. — ${exercise.exerciseName} for ${exercise.duration} min (~${exercise.caloriesBurned} kcal).`;
  }

  private preferenceConfirmation(updated: Record<string, unknown>) {
    return `Preferences updated. ${Object.entries(updated)
      .map(
        ([key, value]) =>
          `${key}: ${
            Array.isArray(value) ? value.join(', ') || 'none' : String(value)
          }`
      )
      .join('; ')}.`;
  }
}
