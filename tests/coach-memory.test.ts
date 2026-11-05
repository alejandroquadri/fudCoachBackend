import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { AIMessage, BaseMessage, HumanMessage } from '@langchain/core/messages';
import { MemorySaver } from '@langchain/langgraph';
import { AiGraphService } from '../src/services/ai/ai-graph.service';
import { AiModelService } from '../src/services/ai/ai-model.service';
import { AiRunModel } from '../src/models/ai-run.model';
import { CoachMemoryModel } from '../src/models/coach-memory.model';
import { CoachMemoryService } from '../src/services/ai/coach-memory.service';
import {
  applyMemoryUpdate,
  CoachMemory,
  emptyMemory,
  MemoryEditSchema,
  MemoryUpdateSchema,
} from '../src/services/ai/coach-memory';
import { mongoInstance } from '../src/connection';
import { getModelPolicies } from '../src/services/ai/ai-model-policy';

test('personal notes preserve untouched sections, allow corrections/removal, and skip identical updates', () => {
  const current = {
    ...emptyMemory(),
    goals: 'Run on March 15 (year unknown)',
    preferences: 'Likes tomatoes; dislikes ketchup',
    relationships: 'Ana is my sister',
  };
  const update = {
    goals: 'Race was canceled',
    preferences: null,
    relationships: null,
    context: null,
  };
  const changed = applyMemoryUpdate(current, update)!;
  assert.equal(changed.goals, 'Race was canceled');
  assert.equal(changed.relationships, current.relationships);
  assert.equal(changed.preferences, current.preferences);
  assert.equal(applyMemoryUpdate(changed, update), null);
  assert.equal(applyMemoryUpdate(changed, { ...update, goals: '' })!.goals, '');
  assert.equal(getModelPolicies({}).memory.primary.model, 'claude-haiku-5-5');
});

test('explicit habitual disclosures can save routines but one-time changes cannot', async () => {
  let stored = emptyMemory();
  const proposed = { id: 'lunch', meal: 'lunch', weekdays: [1, 2, 3, 4, 5], description: 'chicken and salad' };
  const service = new CoachMemoryService({
    structured: async (_task, schema) => schema.parse({ goals: null, relationships: null, preferences: null, context: null, routines: [proposed], forgetRequested: false }),
  } as Pick<AiModelService, 'structured'>, {
    get: async () => stored,
    save: async (_user, notes, revision) => {
      stored = { ...stored, ...notes, revision: revision + 1 };
      return stored;
    },
  });
  const context = { runId: 'run', calls: 0, deadline: Date.now() + 10000 };
  await service.observe('user', stored, {}, [], new HumanMessage('My usual lunch is chicken and salad Monday to Friday.'), context);
  assert.deepEqual(stored.routines, [proposed]);
  const revision = stored.revision;
  await service.observe('user', stored, {}, [], new HumanMessage('My usual lunch without salad today.'), context);
  assert.equal(stored.revision, revision);
  assert.deepEqual(stored.routines, [proposed]);
});

test('manual edits are bounded and cannot set revision metadata or another user ID', () => {
  const edit = {
    goals: '',
    relationships: '',
    preferences: '',
    context: '',
    revision: 0,
  };
  assert.ok(MemoryEditSchema.safeParse(edit).success);
  assert.equal(
    MemoryEditSchema.safeParse({ ...edit, userId: 'another-user' }).success,
    false
  );
  assert.equal(
    MemoryEditSchema.safeParse({ ...edit, goals: 'x'.repeat(2001) }).success,
    false
  );
  assert.equal(
    MemoryEditSchema.safeParse({ ...edit, revision: -1 }).success,
    false
  );
  assert.equal(
    MemoryEditSchema.safeParse({ ...edit, updatedAt: 'yesterday' }).success,
    false
  );
});

test('a concurrent user edit wins over in-flight automatic memory extraction', async () => {
  const current = {
    ...emptyMemory(),
    revision: 2,
    preferences: 'Likes ketchup',
  };
  const edited = {
    ...emptyMemory(),
    revision: 3,
    contextResetAt: '2026-10-29T10:00:00.000Z',
  };
  let savedRevision: number | undefined;
  const service = new CoachMemoryService(
    {
      structured: async (_task, schema) =>
        schema.parse({
          goals: null,
          relationships: null,
          preferences: 'Likes ketchup and tomatoes',
          context: null,
        }),
    } as Pick<AiModelService, 'structured'>,
    {
      save: async (_user, _next, revision) => {
        savedRevision = revision;
        return null;
      },
      get: async () => edited,
    }
  );
  const result = await service.observe(
    'user',
    current,
    {},
    [],
    new HumanMessage('I like tomatoes'),
    { runId: 'run', calls: 0, deadline: Date.now() + 10000 }
  );
  assert.equal(savedRevision, 2);
  assert.equal(result, edited);
  assert.equal(result.preferences, '');
});

test('forget requests reset working context even when the fact was only in recent chat', async () => {
  let source: string | undefined;
  const service = new CoachMemoryService(
    {
      structured: async (_task, schema) =>
        schema.parse({
          goals: null,
          relationships: null,
          preferences: null,
          context: null,
          forgetRequested: true,
        }),
    } as Pick<AiModelService, 'structured'>,
    {
      save: async (_id, notes, revision, mode) => {
        source = mode;
        return {
          ...notes,
          revision: revision + 1,
          contextResetAt: new Date().toISOString(),
        };
      },
      get: async () => emptyMemory(),
    }
  );
  const result = await service.observe(
    'user',
    emptyMemory(),
    {},
    [],
    new HumanMessage('Forget what I told you about Ana'),
    { runId: 'run', calls: 0, deadline: Date.now() + 10000 }
  );
  assert.equal(source, 'user');
  assert.ok(result.contextResetAt);
});

test('unsupported calendar years are rejected and no-change extraction refreshes concurrent edits', async () => {
  const edited = { ...emptyMemory(), revision: 5, preferences: 'User edit' };
  const service = new CoachMemoryService(
    {
      structured: async (_task, schema) =>
        schema.parse({
          goals: 'Birthday on March 15, 2027',
          relationships: null,
          preferences: null,
          context: null,
        }),
    } as Pick<AiModelService, 'structured'>,
    {
      save: async () => {
        throw new Error('Unsupported date must not be written');
      },
      get: async () => edited,
    }
  );
  const result = await service.observe(
    'user',
    emptyMemory(),
    {},
    [],
    new HumanMessage('My birthday party is on March 15.'),
    { runId: 'run', calls: 0, deadline: Date.now() + 10000 }
  );
  assert.equal(result, edited);
});

test('memory persistence uses user-scoped compare-and-swap and only user edits reset chat context', async () => {
  const originalDb = Object.getOwnPropertyDescriptor(mongoInstance, 'db');
  const writes: any[] = [];
  try {
    Object.defineProperty(mongoInstance, 'db', {
      configurable: true,
      value: {
        collection: () => ({
          findOneAndUpdate: async (...args: any[]) => {
            writes.push(args);
            return { coachMemory: emptyMemory() };
          },
        }),
      },
    });
    const store = new CoachMemoryModel();
    const id = '507f1f77bcf86cd799439011';
    await store.save(id, emptyMemory(), 0, 'user');
    await store.save(id, emptyMemory(), 1, 'agent');
    assert.equal(writes[0][0]._id.toHexString(), id);
    assert.ok(
      writes[0][0].$or.some(
        (condition: any) => condition['coachMemory.revision']?.$exists === false
      )
    );
    assert.ok(writes[0][1].$set['coachMemory.contextResetAt']);
    assert.equal(writes[1][0]['coachMemory.revision'], 1);
    assert.equal(writes[1][1].$set['coachMemory.revision'], 2);
    assert.equal('coachMemory.contextResetAt' in writes[1][1].$set, false);
  } finally {
    if (originalDb) Object.defineProperty(mongoInstance, 'db', originalDb);
    else delete (mongoInstance as unknown as Record<string, unknown>).db;
  }
});

function harness(
  saver = new MemorySaver(),
  observe?: CoachMemoryService['observe'],
  route = 'ADVICE'
) {
  const inputs: Array<{ task: string; messages: BaseMessage[] }> = [];
  const models = {
    context: (runId: string) => ({
      runId,
      calls: 0,
      deadline: Date.now() + 10000,
    }),
    structured: async (task: string, schema: any, messages: BaseMessage[]) => {
      inputs.push({ task, messages });
      if (task === 'router')
        return schema.parse({
          route,
          confidence: 1,
          reason: 'conversation',
        });
      if (task === 'preferences')
        return schema.parse({ name: null, likes: null, dislikes: null });
      return schema.parse({
        goals: null,
        relationships: null,
        preferences: null,
        context: null,
      });
    },
    text: async (task: string, messages: BaseMessage[]) => {
      inputs.push({ task, messages });
      return task === 'summary'
        ? 'Discussed training and lunch options.'
        : 'Let us find something that fits your routine.';
    },
  } as unknown as Pick<AiModelService, 'context' | 'structured' | 'text'>;
  const graph = new AiGraphService(saver, {
    models,
    runs: {
      get: async () => null,
      setRoute: async () => {},
      recordModelCall: async () => {},
    } as Pick<AiRunModel, 'get' | 'setRoute' | 'recordModelCall'>,
    memory: { observe: observe ?? (async (_id, memory) => memory) },
  });
  let count = 0;
  const prefix = randomUUID();
  const invoke = (
    text: string,
    memory?: CoachMemory,
    thread = 'thread',
    recentMessages?: BaseMessage[]
  ) =>
    graph.invoke(
      {
        userId: 'user',
        runId: `run-${++count}`,
        profile: { allergies: ['peanuts'] },
        memory,
        recentMessages,
        message: new HumanMessage({ id: `${prefix}-${count}`, content: text }),
      },
      thread
    );
  return { graph, invoke, inputs, saver };
}

test('durable notes follow the user into a new thread and supplement onboarding', async () => {
  const h = harness();
  const memory = {
    ...emptyMemory(),
    goals: 'Run with sister Ana on March 15, year unknown',
    preferences: 'Dislikes ketchup',
  };
  await h.invoke('What could I eat before training?', memory, 'first');
  await h.invoke('Can you suggest lunch?', memory, 'new-thread');
  const input = h.inputs.filter(input => input.task === 'advice').at(-1)!;
  const serialized = JSON.stringify(input.messages);
  assert.match(serialized, /sister Ana/);
  assert.match(serialized, /Dislikes ketchup/);
  assert.match(serialized, /peanuts/);
});

test('recent replies survive graph recreation and reach routing and advice', async () => {
  const h = harness();
  await h.invoke('My sister Ana is helping me train.');
  const restored = harness(h.saver);
  await restored.invoke('What can I cook for her?');
  for (const task of ['router', 'advice']) {
    assert.match(
      JSON.stringify(
        restored.inputs.find(input => input.task === task)!.messages
      ),
      /sister Ana/
    );
  }
});

test('recent conversation resumes after all but the latest two checkpoints have expired', async () => {
  const h = harness();
  await h.invoke('My sister Ana is helping me train.');
  await h.invoke('We will run together on Sundays.');
  const checkpoints = h.saver.storage.thread[''];
  const retained = Object.keys(checkpoints).sort().reverse().slice(0, 2);
  for (const id of Object.keys(checkpoints))
    if (!retained.includes(id)) delete checkpoints[id];
  for (const key of Object.keys(h.saver.writes))
    if (!retained.some(id => key.includes(id))) delete h.saver.writes[key];
  const restored = harness(h.saver);
  await restored.invoke('Which day did we discuss?');
  const advice = restored.inputs.find(input => input.task === 'advice')!;
  assert.match(JSON.stringify(advice.messages), /Sundays/);
  assert.match(JSON.stringify(advice.messages), /sister Ana/);
});

test('editing notes invalidates an old summary, recent context and pending meal without changing visible history', async () => {
  const h = harness();
  await h.invoke('Old secret about my family', emptyMemory());
  // Simulate a working summary from the old context.
  await h.graph.updateState('thread', {
    messages: [new AIMessage('Remember old secret')],
  });
  const edited = {
    ...emptyMemory(),
    revision: 1,
    preferences: 'Likes tomatoes',
    contextResetAt: '2026-10-29T12:00:00.000Z',
  };
  const result = await h.invoke('Suggest lunch', edited, 'thread', []);
  assert.equal(result.summary, '');
  assert.equal(result.pendingMeal, null);
  assert.doesNotMatch(
    JSON.stringify(
      h.inputs.filter(input => input.task === 'advice').at(-1)!.messages
    ),
    /Old secret|old secret/
  );
  assert.equal(result.messages.length, 2);
  assert.match(JSON.stringify(result.memory), /tomatoes/);
});

test('a memory edit during extraction discards stale working context before advice', async () => {
  const edited = {
    ...emptyMemory(),
    revision: 4,
    contextResetAt: '2026-10-29T12:00:00.000Z',
  };
  const h = harness(undefined, async () => edited);
  await h.invoke('Old detail');
  const result = await h.invoke('Hello', { ...emptyMemory(), revision: 3 });
  assert.equal(result.memory.revision, 4);
  assert.doesNotMatch(
    JSON.stringify(
      h.inputs.filter(input => input.task === 'advice').at(-1)!.messages
    ),
    /Old detail/
  );
});

test('memory failure does not fail the user reply', async () => {
  const h = harness(undefined, async () => {
    throw new Error('memory unavailable');
  });
  const result = await h.invoke('I hate ketchup', emptyMemory());
  assert.match(String(result.messages.at(-1)?.content), /fits your routine/);
});

test('a personal-memory request misrouted as a preference still gets a conversational reply', async () => {
  const h = harness(undefined, undefined, 'PREFERENCES');
  const result = await h.invoke('Forget my running friend.');
  assert.match(String(result.messages.at(-1)?.content), /fits your routine/);
  assert.ok(h.inputs.some(input => input.task === 'advice'));
});

test('retries of a turn predating an edit do not repopulate personal notes', async () => {
  const h = harness(undefined, async () => {
    throw new Error('Old turn must not be re-extracted');
  });
  const result = await h.graph.invoke(
    {
      userId: 'user',
      runId: 'old-retry',
      profile: {},
      memory: {
        ...emptyMemory(),
        revision: 3,
        contextResetAt: '2026-10-29T12:00:00.000Z',
      },
      observeMemory: false,
      recentMessages: [],
      message: new HumanMessage({ id: 'old-input', content: 'Old disclosure' }),
    },
    'old-thread'
  );
  assert.equal(result.memory.revision, 3);
  assert.equal(result.memory.relationships, '');
});

test('retrying an unfinished response removes the old assistant answer from inference context', async () => {
  const h = harness();
  const input = {
    userId: 'user',
    runId: 'retry',
    profile: {},
    message: new HumanMessage({ id: 'same-input', content: 'Hello again' }),
  };
  await h.graph.invoke(input, 'retry-thread');
  await h.graph.invoke(input, 'retry-thread');
  const routing = h.inputs.filter(input => input.task === 'router').at(-1)!;
  assert.equal(routing.messages.at(-1)?.getType(), 'human');
  assert.doesNotMatch(JSON.stringify(routing.messages), /fits your routine/);
});

test('working-summary compaction retains the latest sixteen messages and unresolved conversation', async () => {
  const h = harness();
  await h.invoke('Start');
  await h.graph.updateState('thread', {
    messages: Array.from({ length: 24 }, (_, index) =>
      index % 2
        ? new AIMessage({ id: `history-${index}`, content: `Reply ${index}` })
        : new HumanMessage({
            id: `history-${index}`,
            content: `Question ${index}`,
          })
    ),
  });
  const result = await h.invoke('What about the last option?');
  assert.equal(result.messages.length, 16);
  assert.match(result.summary, /training/);
  assert.match(String(result.messages.at(-2)?.content), /last option/);
});
