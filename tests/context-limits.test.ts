import assert from 'node:assert/strict';
import test from 'node:test';
import {
  AIMessage,
  HumanMessage,
  SystemMessage,
} from '@langchain/core/messages';
import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { z } from 'zod';
import {
  bytes,
  clipText,
  compactProfile,
  contextUnits,
  ContextBudgetError,
  fitContext,
  summaryChunk,
} from '../src/services/ai/ai-context';
import { AiModelService } from '../src/services/ai/ai-model.service';
import { AiMessageModel } from '../src/models/ai-message.model';
import { CheckpointRetentionModel } from '../src/models/checkpoint-retention.model';
import { mongoInstance } from '../src/connection';
import { Db, ObjectId } from 'mongodb';
import { decodeCursor, encodeCursor } from '../src/services/ai/chat-pagination';

test('context budgets remove old dialogue while preserving health instructions and the complete latest input', () => {
  const system = new SystemMessage('Peanut allergy. Never suggest peanuts.');
  const latest = new HumanMessage('Please suggest lunch with tomatoes.');
  const messages = [
    system,
    ...Array.from(
      { length: 1000 },
      () => new AIMessage('old discussion '.repeat(100))
    ),
    latest,
  ];
  const selected = fitContext(messages, 4096);
  assert.ok(contextUnits(selected) <= 4096);
  assert.equal(selected[0], system);
  assert.equal(selected.at(-1), latest);
  assert.ok(selected.length < messages.length);
  assert.throws(
    () => fitContext([system, new HumanMessage('x'.repeat(5000))], 4096),
    ContextBudgetError
  );
});

test('UTF-8 limits handle emoji/CJK correctly and count images without counting base64 as text tokens', () => {
  assert.equal(bytes(clipText('🍅你好', 5)), 4);
  assert.equal(clipText('🍅你好', 3), '');
  const image = new HumanMessage({
    content: [
      {
        type: 'image_url',
        image_url: { url: 'data:image/jpeg;base64,' + 'x'.repeat(100000) },
      },
    ],
  });
  assert.ok(contextUnits([image]) < 7000);
  assert.ok(contextUnits([image]) > 5000);
});

test('profile context preserves health constraints and removes oversized optional onboarding data', () => {
  const profile = compactProfile({
    allergies: ['peanuts'],
    dietaryRestrictions: ['no gluten'],
    name: 'Alex',
    likes: Array(10000).fill('tomatoes'),
    custom: 'unrelated'.repeat(10000),
  });
  assert.deepEqual(profile.allergies, ['peanuts']);
  assert.deepEqual(profile.dietaryRestrictions, ['no gluten']);
  assert.ok(bytes(JSON.stringify(profile)) <= 4096);
  assert.equal(profile.custom, undefined);
  assert.throws(
    () => compactProfile({ allergies: ['x'.repeat(5000)] }),
    ContextBudgetError
  );
});

test('oversized mandatory inputs and schemas make zero provider calls, retries or fallbacks', async () => {
  let calls = 0;
  const service = new AiModelService(
    undefined,
    { AI_FALLBACK_MODEL: 'openai:test' },
    () => {
      calls++;
      throw new Error('Must not call');
    }
  );
  await assert.rejects(
    service.text(
      'router',
      [new HumanMessage('🍅'.repeat(20000))],
      service.context('large')
    ),
    ContextBudgetError
  );
  const schema = z.object(
    Object.fromEntries(
      Array.from({ length: 1000 }, (_, i) => [`field${i}`, z.string()])
    )
  );
  await assert.rejects(
    service.structured(
      'router',
      schema,
      [new HumanMessage('Hi')],
      service.context('schema')
    ),
    ContextBudgetError
  );
  assert.equal(calls, 0);
});

test('older OpenAI image accounting cannot silently bypass the vision budget', async () => {
  let calls = 0;
  const service = new AiModelService(
    undefined,
    { AI_DEFAULT_MODEL: 'openai:gpt-4o-mini' },
    () => {
      calls++;
      throw new Error('Must not call');
    }
  );
  const image = new HumanMessage({
    content: [
      {
        type: 'image_url',
        image_url: { url: 'data:image/jpeg;base64,fixture' },
      },
    ],
  });
  await assert.rejects(
    service.text('vision', [image], service.context('legacy-image')),
    ContextBudgetError
  );
  assert.equal(calls, 0);
});

test('the actual model dispatch receives fitted context, including schema overhead', async () => {
  let received = 0;
  const schema = z.object({ weight: z.number() });
  const service = new AiModelService(
    undefined,
    {},
    () =>
      ({
        withStructuredOutput: () => ({
          invoke: async (messages: HumanMessage[]) => {
            received = contextUnits(
              messages,
              bytes(JSON.stringify(z.toJSONSchema(schema)))
            );
            assert.equal(messages.at(-1)?.content, '80 kg');
            return { parsed: { weight: 80 }, raw: new AIMessage('') };
          },
        }),
      } as unknown as BaseChatModel)
  );
  const result = await service.structured(
    'weight',
    schema,
    [
      ...Array.from(
        { length: 100 },
        () => new HumanMessage('old'.repeat(1000))
      ),
      new HumanMessage('80 kg'),
    ],
    service.context('dispatch')
  );
  assert.equal(result.weight, 80);
  assert.ok(received <= 12288);
});

test('summary chunks have a fixed byte ceiling even for years of history or one giant message', () => {
  const many = Array.from(
    { length: 7300 },
    () => new HumanMessage('Earlier meal and training discussion.')
  );
  const chunk = summaryChunk(many);
  assert.ok(chunk.messages.length <= 12);
  assert.ok(bytes(chunk.text) < 6100);
  const huge = summaryChunk([new HumanMessage('🍅'.repeat(100000))]);
  assert.equal(huge.messages.length, 1);
  assert.ok(bytes(huge.text) <= 6000);
});

test('chat pagination handles equal timestamps, new arrivals and conversation isolation without duplicates', async () => {
  const previous = Object.getOwnPropertyDescriptor(mongoInstance, 'db');
  const own = new ObjectId();
  const other = new ObjectId();
  const rows = Array.from({ length: 100 }, (_, i) => ({
    _id: new ObjectId(),
    conversationId: own,
    createdAt: new Date(Date.UTC(2024, 0, 1) + Math.floor(i / 5) * 1000),
    content: `Message ${i}`,
  }));
  const originalIds = new Set(rows.map(row => row._id.toHexString()));
  const all = [
    ...rows,
    {
      _id: new ObjectId(),
      conversationId: other,
      createdAt: new Date(),
      content: 'Other user private message',
    },
  ];
  const queries: any[] = [];
  Object.defineProperty(mongoInstance, 'db', {
    configurable: true,
    value: {
      collection: () => ({
        find: (filter: any) => {
          queries.push(filter);
          let limit = 0;
          const cursor = {
            sort: () => cursor,
            limit: (value: number) => {
              limit = value;
              return cursor;
            },
            toArray: async () => {
              assert.ok(limit > 0 && limit <= 101);
              return all
                .filter(
                  row =>
                    row.conversationId.equals(filter.conversationId) &&
                    (!filter.$or ||
                      row.createdAt < filter.$or[0].createdAt.$lt ||
                      (row.createdAt.getTime() ===
                        filter.$or[1].createdAt.getTime() &&
                        row._id.toHexString() <
                          filter.$or[1]._id.$lt.toHexString()))
                )
                .sort(
                  (a, b) =>
                    b.createdAt.getTime() - a.createdAt.getTime() ||
                    b._id.toHexString().localeCompare(a._id.toHexString())
                )
                .slice(0, limit);
            },
          };
          return cursor;
        },
      }),
    },
  });
  try {
    const model = new AiMessageModel();
    let page = await model.page(own);
    assert.equal(page.messages.length, 40);
    const seen = page.messages.map(row => row._id!.toHexString());
    all.push({
      _id: new ObjectId(),
      conversationId: own,
      createdAt: new Date(),
      content: 'New arrival',
    });
    while (page.nextCursor) {
      page = await model.page(own, { before: page.nextCursor });
      seen.push(...page.messages.map(row => row._id!.toHexString()));
    }
    assert.equal(seen.length, 100);
    assert.deepEqual(new Set(seen), originalIds);
    assert.ok(queries.every(query => query.conversationId.equals(own)));
    assert.throws(() => model.list(own, 0));
    await assert.rejects(model.page(own, { limit: 100000 }));
    assert.throws(() => decodeCursor('not-a-cursor'));
    const id = new ObjectId();
    const date = new Date('2024-01-01T00:00:00.000Z');
    assert.ok(decodeCursor(encodeCursor(id, date)).id.equals(id));
  } finally {
    if (previous) Object.defineProperty(mongoInstance, 'db', previous);
    else delete (mongoInstance as unknown as Record<string, unknown>).db;
  }
});

test('checkpoint expiry protects the latest two states and writes, stays thread-scoped and never extends old expiry', async () => {
  const updates: any[] = [];
  const indexes: any[] = [];
  let latest = [{ checkpoint_id: '004' }, { checkpoint_id: '003' }];
  const database = {
    collection: (name: string) => ({
      createIndex: async (...args: any[]) => {
        indexes.push([name, ...args]);
      },
      find: (filter: any) => {
        assert.deepEqual(filter, {
          thread_id: 'owned-thread',
          checkpoint_ns: '',
        });
        return {
          sort: () => ({ limit: () => ({ toArray: async () => latest }) }),
        };
      },
      updateMany: async (...args: any[]) => {
        updates.push([name, ...args]);
      },
    }),
  } as unknown as Db;
  const retention = new CheckpointRetentionModel(() => database);
  await retention.ensureIndexes();
  const now = Date.UTC(2026, 9, 29);
  await retention.schedule('owned-thread', now);
  assert.equal(updates.length, 2);
  for (const [name, filter, update] of updates) {
    assert.ok(['aiCheckpoints', 'aiCheckpointWrites'].includes(name));
    assert.equal(filter.thread_id, 'owned-thread');
    assert.equal(filter.checkpoint_id.$lt, '003');
    assert.equal(filter.expiresAt.$exists, false);
    assert.equal(update.$set.expiresAt.getTime(), now + 30 * 86400000);
  }
  assert.ok(indexes.every(row => row[2].expireAfterSeconds === 0));
  await retention.schedule('owned-thread', now + 1000);
  assert.equal(updates.length, 2);
  latest = [{ checkpoint_id: '006' }, { checkpoint_id: '005' }];
  await retention.schedule('owned-thread', now + 3600001);
  assert.equal(updates[2][1].checkpoint_id.$lt, '005');
});
