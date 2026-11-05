import dotenv from 'dotenv';
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { HumanMessage } from '@langchain/core/messages';
import { MemorySaver } from '@langchain/langgraph';
import { AiGraphService } from '../src/services/ai/ai-graph.service';
import { AiModelService } from '../src/services/ai/ai-model.service';
import { CoachMemoryService } from '../src/services/ai/coach-memory.service';
import { emptyMemory } from '../src/services/ai/coach-memory';
import { MealNutritionService } from '../src/services/ai/meal-nutrition.service';
import { AiActionsService } from '../src/services/ai/ai-actions.service';
import {
  AiFoodLogPayload,
  AiModelCall,
  AiRun,
  AiRunOperation,
} from '../src/types';

dotenv.config();
async function main() {
  if (!process.env.USDA_API_KEY) throw new Error('USDA_API_KEY is required.');
  let memory = emptyMemory();
  const calls: AiModelCall[] = [];
  const writes: Array<{ runId: string; meals: AiFoodLogPayload[] }> = [];
  const operations = new Map<string, AiRunOperation[]>();
  const models = new AiModelService(async (_id, call) => {
    calls.push(call);
  });
  const memoryService = new CoachMemoryService(models, {
    get: async () => memory,
    save: async (_id, next, revision, source) => {
      if (revision !== memory.revision) return null;
      memory = {
        ...next,
        revision: revision + 1,
        updatedAt: new Date().toISOString(),
        contextResetAt:
          source === 'user' ? new Date().toISOString() : memory.contextResetAt,
      };
      return memory;
    },
  });
  const actions = {
    logMeals: async (
      runId: string,
      _userId: string,
      meals: AiFoodLogPayload[]
    ) => {
      const saved = { count: meals.length, meals };
      writes.push({ runId, meals });
      operations.set(runId, [
        {
          key: 'log-meals',
          status: 'completed',
          completedAt: new Date(),
          result: saved,
        },
      ]);
      return saved;
    },
  } as unknown as Pick<
    AiActionsService,
    'logMeals' | 'logWeight' | 'logExercise' | 'updatePreferences'
  >;
  const graph = new AiGraphService(new MemorySaver(), {
    models,
    memory: memoryService,
    actions,
    nutrition: new MealNutritionService(models),
    runs: {
      get: async runId =>
        ({ operations: operations.get(runId) ?? [] } as AiRun),
      setRoute: async () => {},
      recordModelCall: async () => {},
    },
  });
  const results: Array<Record<string, unknown>> = [];
  const invoke = async (
    runId: string,
    content: string,
    threadId = 'usual-meals'
  ) => {
    const state = await graph.invoke(
      {
        runId,
        userId: 'synthetic-user',
        profile: {},
        memory,
        recentMessages: [],
        message: new HumanMessage({ id: runId, content }),
      },
      threadId
    );
    const response = String(state.messages.at(-1)?.content);
    results.push({
      runId,
      route: state.route,
      response,
      pending: state.pendingMeal,
      memory: { ...memory },
    });
    console.log(
      JSON.stringify({
        runId,
        route: state.route,
        response,
        pending: Boolean(state.pendingMeal),
      })
    );
    return state;
  };
  await invoke(
    'define-lunch',
    'My usual lunch is 150 g of roasted chicken breast and 100 g of raw carrots.'
  );
  assert.ok(
    memory.routines.some(
      routine =>
        routine.meal === 'lunch' &&
        /chicken/i.test(routine.description) &&
        /carrot/i.test(routine.description)
    )
  );
  assert.equal(writes.length, 0, 'Defining a routine must not log a meal.');
  const lunch = await invoke('log-lunch', 'my usual lunch');
  assert.equal(lunch.pendingMeal, null);
  assert.equal(writes.length, 1);
  assert.equal(writes[0].meals.length, 2);
  assert.ok(
    writes[0].meals.some(
      meal => /chicken/i.test(meal.name) && meal.nutrition?.grams === 150
    )
  );
  assert.ok(
    writes[0].meals.some(
      meal => /carrot/i.test(meal.name) && meal.nutrition?.grams === 100
    )
  );
  assert.match(String(lunch.messages.at(-1)?.content), /150 g/);
  assert.match(String(lunch.messages.at(-1)?.content), /100 g/);
  const countBeforeRetry = calls.length;
  await invoke('log-lunch', 'my usual lunch');
  assert.equal(
    calls.length,
    countBeforeRetry,
    'Retry must not call models again.'
  );
  assert.equal(writes.length, 1, 'Retry must not repeat a meal write.');
  const question = await invoke(
    'unknown-sunday',
    'I had my usual Sunday breakfast.'
  );
  assert.ok(question.pendingMeal, 'Unknown usual meal must ask a question.');
  assert.equal(writes.length, 1);
  const eggs = await invoke('define-sunday', 'Two boiled eggs.');
  assert.equal(eggs.pendingMeal, null);
  assert.equal(writes.length, 2);
  assert.ok(writes[1].meals.some(meal => /egg/i.test(meal.name)));
  assert.ok(
    memory.routines.some(
      routine =>
        routine.meal === 'breakfast' &&
        routine.weekdays.includes(7) &&
        /egg/i.test(routine.description)
    )
  );
  const repeated = await invoke(
    'repeat-sunday',
    'my Sunday breakfast',
    'new-conversation'
  );
  assert.equal(repeated.pendingMeal, null);
  assert.equal(writes.length, 3);
  assert.ok(writes[2].meals.some(meal => /egg/i.test(meal.name)));
  await invoke(
    'one-time-change',
    'I had my usual lunch without carrots today.'
  );
  assert.equal(writes.length, 4);
  assert.equal(writes[3].meals.length, 1);
  assert.match(writes[3].meals[0].name, /chicken/i);
  assert.ok(
    memory.routines.some(
      routine => routine.meal === 'lunch' && /carrot/i.test(routine.description)
    ),
    'A one-time change must not change the routine.'
  );
  await invoke('recall-question', 'What is my usual lunch?');
  assert.equal(writes.length, 4, 'A recall question must not log a meal.');
  await invoke('log-snack', 'For a snack I ate one banana.', 'snack-thread');
  assert.equal(writes.length, 5);
  await invoke(
    'remember-snack',
    'That last snack is my usual Monday to Friday snack.',
    'snack-thread'
  );
  assert.equal(
    writes.length,
    5,
    'Defining a routine must not log another meal.'
  );
  assert.ok(
    memory.routines.some(
      routine =>
        routine.meal === 'snack' &&
        /banana/i.test(routine.description) &&
        JSON.stringify([...routine.weekdays].sort()) === '[1,2,3,4,5]'
    )
  );
  await invoke(
    'repeat-snack',
    'Another snack like the last one.',
    'snack-thread'
  );
  assert.equal(writes.length, 6, 'An explicit repeat must create a new meal.');
  assert.match(writes[5].meals[0].name, /banana/i);
  const report = {
    createdAt: new Date().toISOString(),
    noDatabaseWrites: true,
    results,
    simulatedWrites: writes,
    calls,
    estimatedModelCostUsd: calls.reduce(
      (sum, call) => sum + (call.estimatedCostUsd ?? 0),
      0
    ),
  };
  const output = process.argv
    .find(arg => arg.startsWith('--output='))
    ?.slice(9);
  if (output) await writeFile(output, JSON.stringify(report, null, 2) + '\n');
  console.log(
    JSON.stringify({
      passed: true,
      turns: results.length,
      modelCalls: calls.length,
      estimatedModelCostUsd: report.estimatedModelCostUsd,
    })
  );
}
main().catch(error => {
  console.error(
    error instanceof Error ? error.message : 'Usual-meal smoke failed'
  );
  process.exitCode = 1;
});
