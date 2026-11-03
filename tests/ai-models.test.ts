import assert from 'node:assert/strict';
import test from 'node:test';
import { AIMessage, HumanMessage } from '@langchain/core/messages';
import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import {
  AiModelError,
  AiModelService,
} from '../src/services/ai/ai-model.service';
import {
  getModelPolicies,
  parseModelReference,
} from '../src/services/ai/ai-model-policy';
import { WeightSchema } from '../src/services/ai/ai-schemas';
import { AiModelCall } from '../src/types';

test('task configuration accepts only direct OpenAI and Anthropic references', () => {
  const policies = getModelPolicies({
    AI_DEFAULT_MODEL: 'anthropic:claude-haiku-5-5',
    AI_VISION_MODEL: 'openai:gpt-6-luna',
    AI_WEIGHT_FALLBACK_MODEL: 'openai:gpt-4o-mini',
  });
  assert.equal(policies.meal.primary.provider, 'anthropic');
  assert.equal(policies.vision.primary.provider, 'openai');
  assert.equal(policies.weight.fallback?.model, 'gpt-4o-mini');
  assert.equal(policies.meal.fallback, undefined);
  assert.throws(() => parseModelReference('google:gemini'), /AI models/);
  assert.throws(() => parseModelReference('openrouter/auto'), /AI models/);
  assert.throws(
    () => getModelPolicies({ AI_MODEL_TIMEOUT_MS: '0' }),
    /TIMEOUT/
  );
});

test('validates output before accepting it, uses a bounded fallback, and records both attempts', async () => {
  const calls: AiModelCall[] = [];
  const providers: string[] = [];
  const service = new AiModelService(
    async (_runId, call) => {
      calls.push(call);
    },
    {
      AI_DEFAULT_MODEL: 'openai:test',
      AI_FALLBACK_MODEL: 'anthropic:test',
    },
    reference =>
      ({
        withStructuredOutput: () => ({
          invoke: async () => {
            providers.push(reference.provider);
            return {
              parsed: { weight: reference.provider === 'openai' ? -80 : 80 },
              raw: new AIMessage({
                content: '',
                usage_metadata: {
                  input_tokens: 20,
                  output_tokens: 5,
                  total_tokens: 25,
                },
              }),
            };
          },
        }),
      } as unknown as BaseChatModel)
  );
  assert.deepEqual(
    await service.structured(
      'weight',
      WeightSchema,
      [new HumanMessage('80 kg')],
      service.context('r')
    ),
    { weight: 80 }
  );
  assert.deepEqual(providers, ['openai', 'anthropic']);
  assert.deepEqual(
    calls.map(call => call.status),
    ['failed', 'completed']
  );
  assert.equal(calls[0].inputTokens, 20);
});

test('refusals and authentication failures never trigger a different model', async () => {
  for (const refusal of [true, false]) {
    let attempts = 0;
    const service = new AiModelService(
      undefined,
      { AI_DEFAULT_MODEL: 'openai:test', AI_FALLBACK_MODEL: 'anthropic:test' },
      () =>
        ({
          withStructuredOutput: () => ({
            invoke: async () => {
              attempts++;
              if (!refusal)
                throw { status: 401, message: 'secret credentials' };
              return {
                parsed: null,
                raw: new AIMessage({
                  content: '',
                  additional_kwargs: { refusal: 'declined' },
                }),
              };
            },
          }),
        } as unknown as BaseChatModel)
    );
    await assert.rejects(
      service.structured('weight', WeightSchema, [], service.context('r')),
      (error: AiModelError) =>
        error.code === (refusal ? 'refusal' : 'configuration') &&
        !error.message.includes('secret')
    );
    assert.equal(attempts, 1);
  }
});

test('enforces the shared turn budget before issuing another request', async () => {
  const service = new AiModelService(undefined, {}, () => {
    throw new Error('Must not run');
  });
  await assert.rejects(
    service.text('advice', [], {
      runId: 'r',
      calls: 10,
      deadline: Date.now() + 1000,
    }),
    (error: AiModelError) => error.code === 'budget'
  );
});

test('an exhausted provider balance is terminal rather than a throttling retry', async () => {
  let attempts = 0;
  const service = new AiModelService(
    undefined,
    { AI_DEFAULT_MODEL: 'openai:test' },
    () =>
      ({
        withStructuredOutput: () => ({
          invoke: async () => {
            attempts++;
            throw {
              status: 429,
              code: 'credit_balance_exhausted',
              error: { type: 'insufficient_quota' },
            };
          },
        }),
      } as unknown as BaseChatModel)
  );
  await assert.rejects(
    service.structured('weight', WeightSchema, [], service.context('r')),
    (error: AiModelError) => error.code === 'quota'
  );
  assert.equal(attempts, 1);
});

test('the actual OpenAI adapter sends private Responses requests and parses native JSON Schema output', async () => {
  const originalFetch = globalThis.fetch;
  const originalKey = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = 'synthetic-test-key';
  let requests = 0;
  let transportAssertion: unknown;
  globalThis.fetch = async (input, init) => {
    try {
      requests++;
      assert.match(
        input instanceof Request ? input.url : String(input),
        /\/v1\/responses$/
      );
      const body = JSON.parse(
        input instanceof Request
          ? await input.clone().text()
          : String(init?.body)
      );
      assert.equal(body.model, 'gpt-6-luna');
      assert.equal(body.store, false);
      assert.equal(body.reasoning.effort, 'none');
      assert.equal(body.temperature, undefined);
      assert.equal(body.text.format.type, 'json_schema');
      return new Response(
        JSON.stringify({
          id: 'resp_test',
          object: 'response',
          created_at: 1,
          status: 'completed',
          model: 'gpt-6-luna',
          output: [
            {
              id: 'msg_test',
              type: 'message',
              role: 'assistant',
              status: 'completed',
              content: [
                { type: 'output_text', text: '{"weight":80}', annotations: [] },
              ],
            },
          ],
          usage: { input_tokens: 20, output_tokens: 5, total_tokens: 25 },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    } catch (error) {
      transportAssertion = error;
      throw error;
    }
  };
  try {
    const service = new AiModelService(undefined, {
      AI_DEFAULT_MODEL: 'openai:gpt-6-luna',
    });
    const result = await service
      .structured(
        'weight',
        WeightSchema,
        [new HumanMessage('80 kg')],
        service.context('r')
      )
      .catch(error => {
        throw transportAssertion ?? error;
      });
    assert.equal(result.weight, 80);
    assert.equal(requests, 1);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = originalKey;
  }
});
