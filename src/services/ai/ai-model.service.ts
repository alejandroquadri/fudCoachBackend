import { ChatAnthropic } from '@langchain/anthropic';
import { AIMessage, BaseMessage } from '@langchain/core/messages';
import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { ChatOpenAI } from '@langchain/openai';
import { z } from 'zod';
import { bytes, contextUnits, fitContext } from './ai-context';
import { AiModelCall } from '../../types/ai-agent.types';
import {
  AI_POLICY_VERSION,
  AiTask,
  AiTaskPolicy,
  estimateModelCost,
  getModelPolicies,
  ModelReference,
} from './ai-model-policy';

export class AiModelError extends Error {
  constructor(
    public readonly code:
      | 'invalid_output'
      | 'refusal'
      | 'unavailable'
      | 'configuration'
      | 'quota'
      | 'budget',
    public readonly status?: number
  ) {
    super(`AI request failed (${code}${status ? `, HTTP ${status}` : ''})`);
  }
}

export interface AiCallContext {
  runId: string;
  deadline: number;
  calls: number;
}

type Observer = (runId: string, call: AiModelCall) => Promise<void>;
type Factory = (
  reference: ModelReference,
  policy: AiTaskPolicy
) => BaseChatModel;

export class AiModelService {
  private readonly policies;
  private readonly clients = new Map<string, BaseChatModel>();

  constructor(
    private readonly observer: Observer = async () => {},
    env: NodeJS.ProcessEnv = process.env,
    private readonly factory?: Factory
  ) {
    this.policies = getModelPolicies(env);
    if (!factory) {
      for (const policy of Object.values(this.policies)) {
        // A missing optional fallback key does not prevent the primary from starting.
        this.requireKey(policy.primary.provider);
      }
    }
  }

  context(runId: string): AiCallContext {
    return { runId, deadline: Date.now() + 90000, calls: 0 };
  }

  structured<T extends Record<string, unknown>>(
    task: AiTask,
    schema: z.ZodType<T>,
    messages: BaseMessage[],
    context: AiCallContext
  ): Promise<T> {
    return this.execute(task, messages, context, schema) as Promise<T>;
  }

  async text(
    task: AiTask,
    messages: BaseMessage[],
    context: AiCallContext
  ): Promise<string> {
    return this.execute(task, messages, context) as Promise<string>;
  }

  private async execute<T extends Record<string, unknown>>(
    task: AiTask,
    messages: BaseMessage[],
    context: AiCallContext,
    schema?: z.ZodType<T>
  ): Promise<T | string> {
    const policy = this.policies[task];
    const originalMessageCount = messages.length;
    const schemaBytes = schema
      ? bytes(JSON.stringify(z.toJSONSchema(schema)))
      : 0;
    // Fit before any provider call, retry, or fallback. Complete schemas count too.
    const references = [policy.primary, policy.fallback].filter(
      (value): value is ModelReference => Boolean(value)
    );
    let lastError: AiModelError = new AiModelError('unavailable');
    // Two attempts total. SDK retries are disabled; all attempts share the turn budget.
    for (let attempt = 0; attempt < 2; attempt++) {
      const reference = references[Math.min(attempt, references.length - 1)];
      const imageUnits =
        reference.provider === 'anthropic' ||
        /^gpt-(6|5\.6)/.test(reference.model)
          ? 5000
          : 50000;
      const fittedMessages = fitContext(
        messages,
        policy.maxInputUnits,
        schemaBytes,
        imageUnits
      );
      const fittedUnits = contextUnits(fittedMessages, schemaBytes, imageUnits);
      if (Date.now() >= context.deadline || context.calls >= 10)
        throw new AiModelError('budget');
      context.calls++;
      const startedAt = Date.now();
      let raw: AIMessage | undefined;
      let failure: AiModelError | undefined;
      try {
        const client = this.client(reference, policy);
        const config = {
          signal: AbortSignal.timeout(
            Math.max(
              1,
              Math.min(policy.timeoutMs, context.deadline - Date.now())
            )
          ),
        };
        let output: T | string;
        if (schema) {
          const result = await client
            .withStructuredOutput(schema, {
              name: `fud_${task}`,
              includeRaw: true,
              ...(reference.provider === 'openai'
                ? { method: 'jsonSchema', strict: true }
                : {}),
            })
            .invoke(fittedMessages, config);
          raw = result.raw as AIMessage;
          this.checkResponse(raw);
          const parsed = schema.safeParse(result.parsed);
          if (!parsed.success) throw new AiModelError('invalid_output');
          output = parsed.data;
        } else {
          raw = (await client.invoke(fittedMessages, config)) as AIMessage;
          this.checkResponse(raw);
          output = messageText(raw);
          if (!output.trim()) throw new AiModelError('invalid_output');
        }
        return output;
      } catch (error) {
        failure = this.normalizeError(error);
        lastError = failure;
        if (
          !['invalid_output', 'unavailable'].includes(failure.code) ||
          attempt === 1
        )
          throw failure;
        // Retry throttling/temporary failures, never bypass refusals or bad credentials.
        if (failure.code === 'unavailable')
          await new Promise(resolve =>
            setTimeout(resolve, 250 + Math.random() * 150)
          );
      } finally {
        const usage = raw?.usage_metadata;
        const metadata = raw?.response_metadata ?? {};
        const call: AiModelCall = {
          task,
          policyVersion: AI_POLICY_VERSION,
          provider: reference.provider,
          requestedModel: reference.model,
          actualModel: String(
            metadata.model_name ?? metadata.model ?? reference.model
          ),
          attempt: attempt + 1,
          durationMs: Date.now() - startedAt,
          status: failure ? 'failed' : 'completed',
          errorCode: failure?.code,
          inputTokens: usage?.input_tokens,
          inputBudgetUnits: policy.maxInputUnits,
          estimatedInputUnits: fittedUnits,
          droppedContextMessages: originalMessageCount - fittedMessages.length,
          outputTokens: usage?.output_tokens,
          cacheReadTokens: usage?.input_token_details?.cache_read,
          reasoningTokens: usage?.output_token_details?.reasoning,
          estimatedCostUsd: estimateModelCost(
            reference,
            usage?.input_tokens,
            usage?.output_tokens
          ),
          requestId: typeof metadata.id === 'string' ? metadata.id : undefined,
          createdAt: new Date(),
        };
        // Telemetry must not invalidate a completed model call or business write.
        await this.observer(context.runId, call).catch(() =>
          console.warn('Unable to record AI model usage')
        );
      }
    }
    throw lastError;
  }

  private client(
    reference: ModelReference,
    policy: AiTaskPolicy
  ): BaseChatModel {
    const key = `${reference.provider}:${reference.model}:${policy.maxTokens}`;
    const existing = this.clients.get(key);
    if (existing) return existing;
    let client: BaseChatModel;
    if (this.factory) client = this.factory(reference, policy);
    else if (reference.provider === 'openai') {
      const reasoningModel = /^(gpt-[56]|o[134])/.test(reference.model);
      client = new ChatOpenAI({
        model: reference.model,
        apiKey: this.requireKey('openai'),
        maxRetries: 0,
        maxTokens: policy.maxTokens,
        timeout: policy.timeoutMs,
        useResponsesApi: true,
        zdrEnabled: true,
        // The installed LangChain version only recognizes GPT-5/o-series as reasoning
        // models. Explicit passthrough also preserves this setting for GPT-6.
        ...(reasoningModel
          ? {
              modelKwargs: {
                reasoning: {
                  effort: /luna/.test(reference.model) ? 'none' : 'low',
                },
              },
            }
          : { temperature: 0 }),
      });
    } else {
      const modern = /claude-(haiku|sonnet|opus|fable)-5/.test(reference.model);
      client = new ChatAnthropic({
        model: reference.model,
        apiKey: this.requireKey('anthropic'),
        maxRetries: 0,
        maxTokens: policy.maxTokens,
        ...(modern
          ? /claude-haiku/.test(reference.model)
            ? { thinking: { type: 'disabled' } }
            : {
                thinking: { type: 'adaptive' },
                outputConfig: { effort: 'low' },
              }
          : { temperature: 0 }),
      });
    }
    this.clients.set(key, client);
    return client;
  }

  private checkResponse(raw: AIMessage) {
    const metadata = raw.response_metadata;
    if (
      metadata?.stop_reason === 'refusal' ||
      metadata?.finish_reason === 'content_filter' ||
      raw.additional_kwargs?.refusal ||
      (Array.isArray(raw.content) &&
        raw.content.some(
          part => typeof part === 'object' && part.type === 'refusal'
        ))
    ) {
      throw new AiModelError('refusal');
    }
    if (
      metadata?.status === 'incomplete' ||
      ['length', 'max_tokens', 'model_context_window_exceeded'].includes(
        String(metadata?.finish_reason ?? metadata?.stop_reason)
      )
    )
      throw new AiModelError('invalid_output');
  }

  private normalizeError(error: unknown): AiModelError {
    if (error instanceof AiModelError) return error;
    const payload = error as {
      code?: string;
      type?: string;
      error?: { code?: string; type?: string };
    } | null;
    if (
      [
        payload?.code,
        payload?.type,
        payload?.error?.code,
        payload?.error?.type,
      ].some(value =>
        [
          'insufficient_quota',
          'credit_balance_exhausted',
          'billing_hard_limit_reached',
        ].includes(value ?? '')
      )
    )
      return new AiModelError('quota', 429);
    const rawStatus =
      typeof error === 'object' && error !== null && 'status' in error
        ? Number(error.status)
        : undefined;
    const status =
      rawStatus && Number.isFinite(rawStatus) ? rawStatus : undefined;
    if (status && status < 500 && ![408, 429].includes(status))
      return new AiModelError('configuration', status);
    return new AiModelError('unavailable', status);
  }

  private requireKey(provider: ModelReference['provider']) {
    const name = provider === 'openai' ? 'OPENAI_API_KEY' : 'ANTHROPIC_API_KEY';
    const value = process.env[name];
    if (!value) throw new AiModelError('configuration');
    return value;
  }
}

export function messageText(message: BaseMessage): string {
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
