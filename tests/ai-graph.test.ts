import assert from 'node:assert/strict';
import test from 'node:test';
import { AIMessage, HumanMessage } from '@langchain/core/messages';
import {
  MemorySaver,
  MessagesValue,
  START,
  END,
  StateGraph,
  StateSchema,
} from '@langchain/langgraph';
import { z } from 'zod';
import { AiGraphService } from '../src/services/ai/ai-graph.service';
import { AiModelService } from '../src/services/ai/ai-model.service';
import { AiActionsService } from '../src/services/ai/ai-actions.service';
import { AiRunModel } from '../src/models/ai-run.model';
import { AiFoodLogPayload, AiRun, AiRunOperation } from '../src/types';
import { MealNutritionService } from '../src/services/ai/meal-nutrition.service';
import { UsdaError } from '../src/services/usda.service';

const meal: AiFoodLogPayload = {
  name: 'Rice',
  quantity: 1,
  serving_size: 'medium',
  calories: 195,
  protein: 4,
  carbs: 42,
  fat: 0.4,
};
const item = {
  name: 'Rice',
  searchQuery: 'rice white cooked',
  brand: null,
  preparation: 'cooked',
  amount: 150,
  unit: 'g',
  portionDescription: '150 g',
  estimatedGrams: 150,
  quantityEstimated: false,
  serving_size: 'medium',
};

test('confirmed barcode meal bypasses AI matching and is not logged twice on recovery', async () => {
  const h = harness();
  h.graph.setBarcodeMeal('barcode-run', meal);
  await h.invoke('barcode-run', 'Log scanned food');
  assert.equal(h.writes(), 1);
  assert.equal(h.modelTasks.includes('router'), false);
  assert.equal(h.modelTasks.includes('meal'), false);
  await h.invoke('barcode-run', 'Log scanned food');
  assert.equal(h.writes(), 1);
});

function harness(checkpointer = new MemorySaver()) {
  const operations: AiRunOperation[] = [];
  const modelTasks: string[] = [];
  let question = true;
  let writes = 0;
  let failAfterWrite = false;
  let lookupFails = false;
  let summaryFails = false;
  let routerFails = false;
  const summaryInputs: string[] = [];
  const models = {
    context: (runId: string) => ({
      runId,
      calls: 0,
      deadline: Date.now() + 10000,
    }),
    structured: async (
      task: string,
      schema: z.ZodType,
      messages: unknown[]
    ) => {
      modelTasks.push(task);
      if (task === 'router' && routerFails)
        throw new Error('Router unavailable');
      if (task === 'router')
        return schema.parse({
          route: 'LOG_MEAL',
          confidence: 1,
          reason: 'meal',
        });
      if (task === 'meal' || task === 'vision') {
        const analysis = question
          ? { outcome: 'clarify', items: [item], question: 'How much rice?' }
          : { outcome: 'meal', items: [item], question: null };
        if (!question && task === 'meal')
          assert.match(JSON.stringify(messages), /Pending meal/);
        return schema.parse(analysis);
      }
      throw new Error(`Unexpected task: ${task}`);
    },
    text: async (task: string, messages: unknown[]) => {
      if (task === 'summary') summaryInputs.push(JSON.stringify(messages));
      if (summaryFails) throw new Error('Summary unavailable');
      return 'Earlier conversation summary.';
    },
  } as unknown as Pick<AiModelService, 'context' | 'structured' | 'text'>;
  const runs = {
    get: async () => ({ operations }) as AiRun,
    setRoute: async () => {},
    recordModelCall: async () => {},
  } as Pick<AiRunModel, 'get' | 'setRoute' | 'recordModelCall'>;
  const actions = {
    logMeals: async (
      _runId: string,
      _userId: string,
      meals: AiFoodLogPayload[]
    ) => {
      writes++;
      const result = { count: meals.length, meals };
      operations.push({
        key: 'log-meals',
        status: 'completed',
        result,
        completedAt: new Date(),
      });
      if (failAfterWrite) throw new Error('Response interrupted after commit');
      return result;
    },
  } as unknown as Pick<
    AiActionsService,
    'logMeals' | 'logWeight' | 'logExercise' | 'updatePreferences'
  >;
  const nutrition = {
    resolve: async () => {
      if (lookupFails) throw new UsdaError('unavailable');
      return { outcome: 'ready', meals: [meal] };
    },
  } as Pick<MealNutritionService, 'resolve'>;
  const graph = new AiGraphService(checkpointer, {
    models,
    runs,
    actions,
    nutrition,
  });
  const invoke = (runId: string, content: string) =>
    graph.invoke(
      {
        runId,
        userId: 'user',
        profile: {},
        message: new HumanMessage({ id: runId, content }),
      },
      'thread'
    );
  return {
    graph,
    invoke,
    modelTasks,
    summaryInputs,
    operations,
    writes: () => writes,
    answer: () => {
      question = false;
    },
    failAfterWrite: () => {
      failAfterWrite = true;
    },
    lookupFails: () => {
      lookupFails = true;
    },
    summaryFails: () => {
      summaryFails = true;
    },
    routerFails: () => {
      routerFails = true;
    },
  };
}

test('persists a clarification and merges the next answer before saving the meal', async () => {
  const h = harness();
  const initial = await h.invoke('one', 'I ate rice');
  assert.equal(initial.pendingMeal?.question, 'How much rice?');
  assert.equal(h.writes(), 0);
  h.answer();
  const followup = await h.invoke('two', '150 grams');
  assert.equal(h.writes(), 1);
  assert.equal(followup.pendingMeal, null);
  assert.match(String(followup.messages.at(-1)?.content), /195 kcal/);
});

test('two years of backlog cannot grow summary requests or checkpoints during repeated failures', async () => {
  const h = harness();
  await h.invoke('setup-long', 'rice');
  await h.graph.updateState('thread', {
    messages: Array.from(
      { length: 7300 },
      (_, index) =>
        new AIMessage({
          id: `old-${index}`,
          content: 'Earlier meal and training discussion.',
        })
    ),
  });
  h.answer();
  h.summaryFails();
  const result = await h.invoke('long-save', '150 g');
  assert.equal(h.writes(), 1);
  assert.ok(result.messages.length <= 64);
  assert.match(result.summary, /could not be summarized/);
  assert.ok(
    h.summaryInputs.every(input => Buffer.byteLength(input, 'utf8') < 12000)
  );
  const retry = await h.invoke('long-save', '150 g');
  assert.equal(h.writes(), 1);
  assert.ok(retry.messages.length <= 64);
  assert.ok(
    h.summaryInputs.every(input => Buffer.byteLength(input, 'utf8') < 12000)
  );
});

test('legacy multi-year checkpoints stay bounded even when routing fails before summarization', async () => {
  const saver = new MemorySaver();
  const seed = new StateGraph(new StateSchema({ messages: MessagesValue }))
    .addNode('SEED', () => ({}))
    .addEdge(START, 'SEED')
    .addEdge('SEED', END)
    .compile({ checkpointer: saver });
  await seed.invoke(
    {
      messages: Array.from(
        { length: 7300 },
        (_, index) =>
          new AIMessage({
            id: `legacy-${index}`,
            content: index === 7299 ? 'x'.repeat(200000) : 'Old conversation',
          })
      ),
    },
    { configurable: { thread_id: 'thread' } }
  );
  const h = harness(saver);
  h.routerFails();
  for (let index = 0; index < 3; index++) {
    await assert.rejects(
      h.invoke(`failed-${index}`, 'I ate rice'),
      /Router unavailable/
    );
    const snapshot = await h.graph.getState('thread');
    const messages = snapshot.values.messages as AIMessage[];
    assert.ok(messages.length <= 64);
    assert.ok(
      messages.every(
        message => Buffer.byteLength(String(message.content), 'utf8') <= 6000
      )
    );
    assert.match(String(messages.at(-1)?.content), /I ate rice/);
  }
  assert.equal(h.summaryInputs.length, 0);
  assert.equal(h.writes(), 0);
});

test('recovers the committed payload after a response failure without rerunning models or writes', async () => {
  const h = harness();
  await h.invoke('setup', 'rice');
  h.answer();
  h.failAfterWrite();
  await assert.rejects(h.invoke('saved-run', '150 g'), /after commit/);
  const calls = h.modelTasks.length;
  const retry = await h.invoke('saved-run', '150 g');
  assert.equal(h.writes(), 1);
  assert.equal(h.modelTasks.length, calls);
  assert.match(String(retry.messages.at(-1)?.content), /195 kcal/);
});

test('USDA outages do not produce a successful meal confirmation or any write', async () => {
  const h = harness();
  await h.invoke('one', 'rice');
  h.answer();
  h.lookupFails();
  const result = await h.invoke('two', '150 g');
  assert.equal(h.writes(), 0);
  assert.match(String(result.messages.at(-1)?.content), /haven't logged/);
  assert.ok(result.pendingMeal);
});

test('photo clarification checkpoints contain observations and never the image bytes', async () => {
  const h = harness();
  const image = Buffer.from('private-image-content');
  h.graph.setImage('image-run', { buffer: image, mimeType: 'image/jpeg' });
  const result = await h.invoke('image-run', '[User uploaded an image]');
  assert.ok(result.pendingMeal);
  assert.deepEqual(h.modelTasks, ['vision']);
  const snapshot = await h.graph.getState('thread');
  assert.ok(
    !JSON.stringify(snapshot.values).includes(image.toString('base64'))
  );
  h.graph.clearImage('image-run');
});

test('existing checkpoints without pendingMeal remain usable', async () => {
  const saver = new MemorySaver();
  const OldState = new StateSchema({
    messages: MessagesValue,
    route: z.string(),
    extractedMeals: z.array(z.unknown()),
    summary: z.string(),
    runId: z.string(),
    userId: z.string(),
    profile: z.record(z.string(), z.unknown()),
  });
  const oldGraph = new StateGraph(OldState)
    .addNode('OLD', () => ({}))
    .addEdge(START, 'OLD')
    .addEdge('OLD', END)
    .compile({ checkpointer: saver });
  await oldGraph.invoke(
    {
      messages: [new HumanMessage('Earlier message')],
      route: 'ADVICE',
      extractedMeals: [],
      summary: 'Earlier goals',
      runId: 'old',
      userId: 'user',
      profile: {},
    },
    { configurable: { thread_id: 'thread' } }
  );
  const h = harness(saver);
  const result = await h.invoke('new', 'I ate rice');
  assert.equal(result.summary, 'Earlier goals');
  assert.equal(result.pendingMeal?.question, 'How much rice?');
});

test('summary failure preserves the saved result and the complete messages', async () => {
  const h = harness();
  await h.invoke('setup', 'rice');
  const previous = Array.from(
    { length: 22 },
    (_, index) =>
      new AIMessage({ id: `history-${index}`, content: 'Earlier advice.' })
  );
  await h.graph.updateState('thread', { messages: previous });
  h.answer();
  h.summaryFails();
  const result = await h.invoke('save', '150 g');
  assert.equal(h.writes(), 1);
  assert.match(
    String(result.messages.at(-1)?.content),
    /Meal logged successfully/
  );
  assert.ok(result.messages.length > 20);
});
