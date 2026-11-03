import dotenv from 'dotenv';
import { readFile, writeFile } from 'node:fs/promises';
import sharp from 'sharp';
import {
  AIMessage,
  BaseMessage,
  HumanMessage,
  SystemMessage,
} from '@langchain/core/messages';
import { z } from 'zod';
import { AiModelService } from '../src/services/ai/ai-model.service';
import {
  AiTask,
  parseModelReference,
} from '../src/services/ai/ai-model-policy';
import {
  ExerciseSchema,
  FoodMatchesSchema,
  MealAnalysisSchema,
  PreferenceChangeSchema,
  RouteSchema,
  WeightSchema,
} from '../src/services/ai/ai-schemas';
import {
  ADVICE_PROMPT,
  EXERCISE_EXTRACTION_PROMPT,
  FOOD_MATCH_PROMPT,
  MEAL_EXTRACTION_PROMPT,
  PREFERENCE_EXTRACTION_PROMPT,
  ROUTER_PROMPT,
  SUMMARY_PROMPT,
  WEIGHT_EXTRACTION_PROMPT,
} from '../src/services/ai/ai-prompts';
import { AiModelCall } from '../src/types';
import {
  emptyMemory,
  MEMORY_PROMPT,
  MemoryUpdateSchema,
} from '../src/services/ai/coach-memory';

dotenv.config();
const args = process.argv.slice(2);
const option = (name: string) =>
  args.find(arg => arg.startsWith(`--${name}=`))?.slice(name.length + 3);
const references = (
  option('models') ||
  'anthropic:claude-haiku-5-5,anthropic:claude-haiku-4-5-20251001'
).split(',');
const outputPath = option('output');
const imagePath = option('image');
const trials = Number(option('trials') || 1);
if (
  !Number.isInteger(trials) ||
  trials < 1 ||
  trials > 3 ||
  references.length > 4
)
  throw new Error('Use 1–3 trials and at most 4 models');
references.forEach(parseModelReference);

type Case = {
  name: string;
  task: AiTask;
  prompt: string;
  input: string;
  schema?: z.ZodType<Record<string, unknown>>;
  check: (value: any) => boolean;
  critical?: boolean;
  image?: Buffer;
  history?: BaseMessage[];
};
const routeCase = (input: string, expected: string): Case => ({
  name: `route:${expected}:${input}`,
  task: 'router',
  prompt: ROUTER_PROMPT,
  input,
  schema: RouteSchema,
  check: value => value.route === expected,
  critical: expected === 'ADVICE',
});
const cases: Case[] = [
  {
    ...routeCase('80 kg.', 'LOG_WEIGHT'),
    name: 'route:followup-weight',
    history: [
      new HumanMessage('Please log my weight.'),
      new AIMessage('What is your current weight?'),
    ],
  },
  {
    ...routeCase('150 grams.', 'LOG_MEAL'),
    name: 'route:followup-meal',
    prompt: `${ROUTER_PROMPT}\nA meal is awaiting clarification: cooked rice, quantity unknown. If the message answers that pending meal, select LOG_MEAL.`,
    history: [
      new HumanMessage('I ate cooked rice.'),
      new AIMessage('How much rice?'),
    ],
  },
  {
    ...routeCase('What should I eat tomorrow?', 'ADVICE'),
    name: 'route:do-not-repeat-old-meal',
    history: [
      new HumanMessage('I ate 150 g of rice.'),
      new AIMessage('Meal logged successfully.'),
    ],
    critical: true,
  },
  {
    ...routeCase('Forget my running friend Luis.', 'ADVICE'),
    name: 'route:forget-person-is-not-food-preference',
    critical: true,
  },
  {
    name: 'memory:goals-family-tastes',
    task: 'memory',
    prompt: MEMORY_PROMPT,
    input: JSON.stringify({
      currentDate: '2026-10-29',
      profile: {},
      notes: emptyMemory(),
      recent: [],
      latestUserMessage:
        'My sister Ana is running a 10K with me on March 15, 2027. I want to build stamina for it. I love tomatoes and hate ketchup.',
    }),
    schema: MemoryUpdateSchema,
    check: value =>
      /2027/.test(value.goals ?? '') &&
      /Ana/.test(value.relationships ?? '') &&
      /sister/i.test(value.relationships ?? '') &&
      /tomato/i.test(value.preferences ?? '') &&
      /ketchup/i.test(value.preferences ?? ''),
    critical: true,
  },
  {
    name: 'memory:spanish-support',
    task: 'memory',
    prompt: MEMORY_PROMPT,
    input: JSON.stringify({
      currentDate: '2026-10-29',
      profile: {},
      notes: emptyMemory(),
      recent: [],
      latestUserMessage:
        'Mi pareja se llama Pedro. Trabajo de noche y me cuesta cocinar. Me ayuda que me propongas pasos pequeños, sin presionarme.',
    }),
    schema: MemoryUpdateSchema,
    check: value =>
      /Pedro/.test(value.relationships ?? '') &&
      /noche|night/i.test(value.context ?? '') &&
      /peque|small|presi|pressur/i.test(
        `${value.context} ${value.preferences}`
      ),
  },
  {
    name: 'memory:question-no-write',
    task: 'memory',
    prompt: MEMORY_PROMPT,
    input: JSON.stringify({
      currentDate: '2026-10-29',
      profile: {},
      notes: emptyMemory(),
      recent: [],
      latestUserMessage:
        'Do I like ketchup? Could running a race be a good goal?',
    }),
    schema: MemoryUpdateSchema,
    check: value =>
      ['goals', 'relationships', 'preferences', 'context'].every(
        key => value[key] === null
      ) && !value.forgetRequested,
    critical: true,
  },
  {
    name: 'memory:meal-not-taste',
    task: 'memory',
    prompt: MEMORY_PROMPT,
    input: JSON.stringify({
      currentDate: '2026-10-29',
      profile: {},
      notes: emptyMemory(),
      recent: [],
      latestUserMessage: 'I ate 150 g of rice and two tomatoes.',
    }),
    schema: MemoryUpdateSchema,
    check: value =>
      ['goals', 'relationships', 'preferences', 'context'].every(
        key => value[key] === null
      ) && !value.forgetRequested,
    critical: true,
  },
  {
    name: 'memory:unknown-year',
    task: 'memory',
    prompt: MEMORY_PROMPT,
    input: JSON.stringify({
      currentDate: '2026-10-29',
      profile: {},
      notes: emptyMemory(),
      recent: [],
      latestUserMessage:
        'I want to feel fitter for my birthday party on March 15.',
    }),
    schema: MemoryUpdateSchema,
    check: value =>
      /March|marzo/i.test(value.goals ?? '') &&
      !/2026|2027/.test(value.goals ?? ''),
    critical: true,
  },
  {
    name: 'memory:forget-one-fact',
    task: 'memory',
    prompt: MEMORY_PROMPT,
    input: JSON.stringify({
      currentDate: '2026-10-29',
      profile: {},
      notes: {
        ...emptyMemory(),
        relationships: 'Ana is my sister. Luis is my running friend.',
        goals: 'Run a 10K in 2027.',
      },
      recent: [],
      latestUserMessage: 'Forget everything about Ana. Keep the rest.',
    }),
    schema: MemoryUpdateSchema,
    check: value =>
      value.relationships !== null &&
      !/Ana/.test(value.relationships) &&
      /Luis/.test(value.relationships) &&
      (value.goals === null || value.goals === 'Run a 10K in 2027.') &&
      value.forgetRequested,
    critical: true,
  },
  {
    name: 'memory:correct-preference',
    task: 'memory',
    prompt: MEMORY_PROMPT,
    input: JSON.stringify({
      currentDate: '2026-10-29',
      profile: {},
      notes: {
        ...emptyMemory(),
        preferences: 'Likes tomatoes. Dislikes ketchup.',
      },
      recent: [],
      latestUserMessage:
        'Actually I like ketchup now, but I still love tomatoes.',
    }),
    schema: MemoryUpdateSchema,
    check: value =>
      /tomato/i.test(value.preferences ?? '') &&
      /ketchup/i.test(value.preferences ?? '') &&
      !/dislike|hate/i.test(value.preferences ?? ''),
    critical: true,
  },
  {
    name: 'memory:assistant-not-source',
    task: 'memory',
    prompt: MEMORY_PROMPT,
    input: JSON.stringify({
      currentDate: '2026-10-29',
      profile: {},
      notes: emptyMemory(),
      recent: [
        {
          role: 'ai',
          content:
            'Perhaps your wife Maria could train with you for a marathon.',
        },
      ],
      latestUserMessage: 'What is a marathon?',
    }),
    schema: MemoryUpdateSchema,
    check: value =>
      ['goals', 'relationships', 'preferences', 'context'].every(
        key => value[key] === null
      ) && !value.forgetRequested,
    critical: true,
  },
  {
    name: 'memory:resolve-followup',
    task: 'memory',
    prompt: MEMORY_PROMPT,
    input: JSON.stringify({
      currentDate: '2026-10-29',
      profile: {},
      notes: { ...emptyMemory(), goals: 'Run a 10K. Date unknown.' },
      recent: [
        { role: 'human', content: 'I am training for a 10K.' },
        { role: 'ai', content: 'When is the race?' },
      ],
      latestUserMessage: 'March 15, 2027.',
    }),
    schema: MemoryUpdateSchema,
    check: value =>
      /2027/.test(value.goals ?? '') && /10/.test(value.goals ?? ''),
    critical: true,
  },
  routeCase('I ate 150 g of chicken and 200 g cooked rice.', 'LOG_MEAL'),
  routeCase('How many calories are in rice?', 'ADVICE'),
  routeCase('I weigh 176.37 pounds today.', 'LOG_WEIGHT'),
  routeCase('Please log my weight: 80 kg.', 'LOG_WEIGHT'),
  routeCase('Log my run: 30 minutes.', 'EXERCISE_LOG'),
  routeCase('Is running in the morning better?', 'ADVICE'),
  routeCase('Remember that I like broccoli.', 'PREFERENCES'),
  routeCase('Do you remember which foods I like?', 'ADVICE'),
  routeCase('Remove olives from my dislikes.', 'PREFERENCES'),
  routeCase(
    'I bought chicken for tomorrow. What can I make with it?',
    'ADVICE'
  ),
  {
    name: 'weight:lb-to-kg',
    task: 'weight',
    prompt: WEIGHT_EXTRACTION_PROMPT,
    input: 'I weigh 176.37 pounds today.',
    schema: WeightSchema,
    check: value => Math.abs(value.weight - 80) < 0.02,
  },
  {
    name: 'weight:current-not-historical',
    task: 'weight',
    prompt: WEIGHT_EXTRACTION_PROMPT,
    input: 'I was 75 kg last month. Today I weigh 74.2 kg.',
    schema: WeightSchema,
    check: value => value.weight === 74.2,
  },
  {
    name: 'exercise:duration',
    task: 'exercise',
    prompt: EXERCISE_EXTRACTION_PROMPT,
    input: 'Log my 30 minute walk.',
    schema: ExerciseSchema,
    check: value => value.duration === 30 && /walk/i.test(value.exerciseName),
  },
  {
    name: 'preferences:remove',
    task: 'preferences',
    prompt: PREFERENCE_EXTRACTION_PROMPT,
    input: 'Remove olives from my dislikes.',
    schema: PreferenceChangeSchema,
    check: value =>
      value.dislikes?.operation === 'remove' &&
      value.dislikes.values.some((v: string) => /olives/i.test(v)) &&
      value.name === null &&
      value.likes === null,
    critical: true,
  },
  {
    name: 'preferences:question-does-not-change',
    task: 'preferences',
    prompt: PREFERENCE_EXTRACTION_PROMPT,
    input: 'Do you remember my favorite foods?',
    schema: PreferenceChangeSchema,
    check: value =>
      value.name === null && value.likes === null && value.dislikes === null,
    critical: true,
  },
  {
    name: 'meal:explicit-weights',
    task: 'meal',
    prompt: MEAL_EXTRACTION_PROMPT,
    input: 'I ate 150 g cooked white rice and 100 g raw carrots.',
    schema: MealAnalysisSchema,
    check: value =>
      value.outcome === 'meal' &&
      value.items.length === 2 &&
      value.items.some(
        (item: any) =>
          /rice/i.test(item.searchQuery) &&
          item.amount === 150 &&
          item.unit === 'g'
      ) &&
      value.items.some(
        (item: any) =>
          /carrot/i.test(item.searchQuery) &&
          item.amount === 100 &&
          item.unit === 'g'
      ),
  },
  {
    name: 'meal:household-portion',
    task: 'meal',
    prompt: MEAL_EXTRACTION_PROMPT,
    input: 'I ate 2 medium bananas.',
    schema: MealAnalysisSchema,
    check: value =>
      value.outcome === 'meal' &&
      value.items.length === 1 &&
      /banana/i.test(value.items[0].searchQuery) &&
      value.items[0].amount === 2 &&
      /medium/i.test(value.items[0].portionDescription),
  },
  {
    name: 'meal:pending-clarification',
    task: 'meal',
    prompt: `${MEAL_EXTRACTION_PROMPT}\nPending meal: cooked white rice, quantity unknown. Question: How much rice did you have?`,
    input: '150 grams.',
    schema: MealAnalysisSchema,
    check: value =>
      value.outcome === 'meal' &&
      value.items.length === 1 &&
      /rice/i.test(value.items[0].searchQuery) &&
      value.items[0].amount === 150 &&
      value.items[0].unit === 'g',
  },
  {
    name: 'match:plain-not-breaded',
    task: 'food_match',
    prompt: FOOD_MATCH_PROMPT,
    input: JSON.stringify([
      {
        itemIndex: 0,
        item: {
          name: 'Chicken breast',
          preparation: 'cooked, skinless',
          searchQuery: 'chicken breast meat only cooked',
          brand: null,
        },
        candidates: [
          {
            fdcId: 1,
            description: 'Chicken breast tenders, breaded, cooked',
            dataType: 'SR Legacy',
          },
          {
            fdcId: 2,
            description: 'Chicken breast, meat only, cooked, roasted',
            dataType: 'SR Legacy',
          },
          {
            fdcId: 3,
            description: 'Chicken breast, raw',
            dataType: 'SR Legacy',
          },
        ],
      },
    ]),
    schema: FoodMatchesSchema,
    check: value => value.matches.length === 1 && value.matches[0].fdcId === 2,
    critical: true,
  },
  {
    name: 'match:refuse-wrong-brand',
    task: 'food_match',
    prompt: FOOD_MATCH_PROMPT,
    input: JSON.stringify([
      {
        itemIndex: 0,
        item: {
          name: 'Acme chocolate cereal',
          brand: 'Acme',
          preparation: null,
        },
        candidates: [
          {
            fdcId: 4,
            description: 'Chocolate cereal',
            brand: 'Another Company',
            dataType: 'Branded',
          },
        ],
      },
    ]),
    schema: FoodMatchesSchema,
    check: value =>
      value.matches.length === 1 && value.matches[0].fdcId === null,
    critical: true,
  },
  {
    name: 'summary:preserve-constraint',
    task: 'summary',
    prompt: SUMMARY_PROMPT,
    input:
      'Existing summary: none. Messages: user: I have a peanut allergy and want to maintain my weight. assistant: We will avoid peanuts and focus on maintenance.',
    check: value =>
      /peanut/i.test(value) &&
      /allerg/i.test(value) &&
      /maintain|maintenance/i.test(value),
    critical: true,
  },
  {
    name: 'advice:food-ideas',
    task: 'advice',
    prompt: ADVICE_PROMPT,
    input: 'Suggest two quick lunches with beans. Keep it under 100 words.',
    check: value => /bean/i.test(value) && value.split(/\s+/).length < 120,
  },
];

const prices: Record<string, [number, number]> = {
  'anthropic:claude-haiku-5-5': [0.1, 0.5],
  'anthropic:claude-haiku-4-5-20251001': [1, 5],
  'openai:gpt-6-luna': [0.1, 0.5],
  'openai:gpt-4o-mini': [0.15, 0.6],
};

async function main() {
  const blank = await sharp({
    create: { width: 320, height: 240, channels: 3, background: '#ffffff' },
  })
    .jpeg()
    .toBuffer();
  cases.push({
    name: 'vision:non-food',
    task: 'vision',
    prompt: MEAL_EXTRACTION_PROMPT,
    input: 'Identify the foods in this image.',
    schema: MealAnalysisSchema,
    image: blank,
    check: value =>
      ['no_food', 'clarify'].includes(value.outcome) &&
      value.items.length === 0,
    critical: true,
  });
  if (imagePath) {
    const photo = await sharp(await readFile(imagePath))
      .rotate()
      .resize({
        width: 1600,
        height: 1600,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .jpeg({ quality: 85 })
      .toBuffer();
    cases.push({
      name: 'vision:banana-identification',
      task: 'vision',
      prompt: MEAL_EXTRACTION_PROMPT,
      input:
        'Identify the food and estimate its portion. Do not calculate nutrients.',
      schema: MealAnalysisSchema,
      image: photo,
      check: value =>
        value.outcome === 'meal' &&
        value.items.length === 1 &&
        /banana/i.test(value.items[0].searchQuery),
    });
  }
  const selectedCases = option('case')
    ? cases.filter(fixture => fixture.name.includes(option('case')!))
    : cases;
  if (!selectedCases.length) throw new Error('No matching evaluation cases');
  const report = {
    createdAt: new Date().toISOString(),
    pricingDate: '2026-10-25',
    trials,
    notes: [
      'Synthetic evaluation inputs; no MongoDB or user data.',
      'Cost estimates use uncached short-context list rates; actual billing can differ.',
      'Photo test checks identity only; portion accuracy requires weighed meal fixtures.',
    ],
    models: [] as any[],
  };
  for (const reference of references) {
    const calls: AiModelCall[] = [];
    const service = new AiModelService(
      async (_runId, call) => {
        calls.push(call);
      },
      {
        AI_DEFAULT_MODEL: reference,
        AI_FALLBACK_MODEL: '',
        AI_MODEL_TIMEOUT_MS: '20000',
      }
    );
    const results: any[] = [];
    let stop = false;
    for (let trial = 0; trial < trials && !stop; trial++) {
      for (const fixture of selectedCases) {
        const start = Date.now();
        try {
          const human = fixture.image
            ? new HumanMessage({
                content: [
                  { type: 'text', text: fixture.input },
                  {
                    type: 'image_url',
                    image_url: {
                      url: `data:image/jpeg;base64,${fixture.image.toString(
                        'base64'
                      )}`,
                    },
                  },
                ],
              })
            : new HumanMessage(fixture.input);
          const messages = [
            new SystemMessage(fixture.prompt),
            ...(fixture.history ?? []),
            human,
          ];
          const context = service.context(`eval-${fixture.name}-${trial}`);
          const output = fixture.schema
            ? await service.structured(
                fixture.task,
                fixture.schema,
                messages,
                context
              )
            : await service.text(fixture.task, messages, context);
          const passed = fixture.check(output);
          results.push({
            name: fixture.name,
            trial,
            critical: Boolean(fixture.critical),
            passed,
            durationMs: Date.now() - start,
            output,
          });
          console.log(
            JSON.stringify({
              model: reference,
              name: fixture.name,
              trial,
              passed,
              durationMs: Date.now() - start,
            })
          );
        } catch (error) {
          const message =
            error instanceof Error ? error.message : 'Evaluation failed';
          results.push({
            name: fixture.name,
            trial,
            critical: Boolean(fixture.critical),
            passed: false,
            error: message,
          });
          console.log(
            JSON.stringify({
              model: reference,
              name: fixture.name,
              error: message,
            })
          );
          // Do not hammer invalid credentials, exhausted quota, or unavailable model IDs.
          if (/configuration|quota/.test(message)) {
            stop = true;
            break;
          }
        }
      }
    }
    const inputTokens = calls.reduce(
      (sum, call) => sum + (call.inputTokens || 0),
      0
    );
    const outputTokens = calls.reduce(
      (sum, call) => sum + (call.outputTokens || 0),
      0
    );
    const price = prices[reference];
    const durations = results
      .flatMap(result =>
        typeof result.durationMs === 'number' ? [result.durationMs] : []
      )
      .sort((a, b) => a - b);
    const model = {
      reference,
      passed: results.filter(result => result.passed).length,
      total: results.length,
      criticalFailures: results.filter(
        result => result.critical && !result.passed
      ).length,
      inputTokens,
      outputTokens,
      estimatedCostUsd: price
        ? (inputTokens * price[0] + outputTokens * price[1]) / 1e6
        : null,
      p95Ms:
        durations[Math.max(0, Math.ceil(durations.length * 0.95) - 1)] ?? null,
      results,
      calls,
    };
    report.models.push(model);
    console.log(
      JSON.stringify({
        summary: { ...model, results: undefined, calls: undefined },
      })
    );
  }
  if (outputPath)
    await writeFile(outputPath, JSON.stringify(report, null, 2) + '\n');
  if (report.models.some(model => model.passed !== model.total))
    process.exitCode = 1;
}
main().catch(() => {
  console.error('Evaluation could not finish. Check provider configuration.');
  process.exitCode = 1;
});
