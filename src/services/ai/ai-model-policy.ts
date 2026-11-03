export type AiProvider = 'openai' | 'anthropic';
export const AI_TASKS = [
  'router',
  'meal',
  'food_match',
  'weight',
  'exercise',
  'preferences',
  'advice',
  'summary',
  'vision',
  'memory',
] as const;
export type AiTask = (typeof AI_TASKS)[number];

export interface ModelReference {
  provider: AiProvider;
  model: string;
}

export interface AiTaskPolicy {
  primary: ModelReference;
  fallback?: ModelReference;
  maxTokens: number;
  maxInputUnits: number;
  timeoutMs: number;
}

export const AI_POLICY_VERSION = 'bounded-context-v1';

// Short-context, uncached USD / million tokens, checked 2026-10-25.
// Estimates are telemetry only; invoices remain authoritative.
const MODEL_RATES: Record<string, [number, number]> = {
  'anthropic:claude-haiku-5-5': [0.1, 0.5],
  'anthropic:claude-haiku-4-5-20251001': [1, 5],
  'openai:gpt-6-luna': [0.1, 0.5],
  'openai:gpt-4o-mini': [0.15, 0.6],
};

export function estimateModelCost(
  reference: ModelReference,
  inputTokens: number | undefined,
  outputTokens: number | undefined
): number | undefined {
  const rate = MODEL_RATES[`${reference.provider}:${reference.model}`];
  if (!rate || inputTokens === undefined || outputTokens === undefined)
    return undefined;
  const longContext =
    reference.model === 'claude-haiku-5-5' && inputTokens > 100000;
  const longOpenAiContext =
    reference.model === 'gpt-6-luna' && inputTokens > 272000;
  return (
    (inputTokens * rate[0] * (longContext ? 5 : longOpenAiContext ? 2 : 1) +
      outputTokens *
        rate[1] *
        (longContext ? 5 : longOpenAiContext ? 1.5 : 1)) /
    1e6
  );
}

export function parseModelReference(value: string): ModelReference {
  const separator = value.indexOf(':');
  const provider = value.slice(0, separator);
  const model = value.slice(separator + 1).trim();
  if (
    separator < 1 ||
    !['openai', 'anthropic'].includes(provider) ||
    !model ||
    model.includes('/')
  ) {
    throw new Error('AI models must use openai:model-id or anthropic:model-id');
  }
  return { provider: provider as AiProvider, model };
}

const tokenLimits: Record<AiTask, number> = {
  router: 256,
  meal: 2500,
  food_match: 1200,
  weight: 256,
  exercise: 384,
  preferences: 512,
  advice: 900,
  summary: 600,
  vision: 2500,
  memory: 2500,
};
const inputLimits: Record<AiTask, number> = {
  router: 12288,
  weight: 12288,
  exercise: 12288,
  preferences: 12288,
  meal: 24576,
  food_match: 24576,
  vision: 24576,
  advice: 49152,
  memory: 49152,
  summary: 12288,
};

export function getModelPolicies(
  env: NodeJS.ProcessEnv = process.env
): Record<AiTask, AiTaskPolicy> {
  // Explicit choices, never automatic selection or an unbounded premium escalation.
  const primary = env.AI_DEFAULT_MODEL || 'anthropic:claude-haiku-5-5';
  const fallback = env.AI_FALLBACK_MODEL || '';
  const timeoutMs = Number(env.AI_MODEL_TIMEOUT_MS || 25000);
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1000 || timeoutMs > 60000) {
    throw new Error('AI_MODEL_TIMEOUT_MS must be between 1000 and 60000');
  }
  return Object.fromEntries(
    AI_TASKS.map(task => {
      const prefix = `AI_${task.toUpperCase()}`;
      const backup = env[`${prefix}_FALLBACK_MODEL`] ?? fallback;
      return [
        task,
        {
          primary: parseModelReference(env[`${prefix}_MODEL`] || primary),
          fallback: backup ? parseModelReference(backup) : undefined,
          maxTokens: tokenLimits[task],
          maxInputUnits: inputLimits[task],
          timeoutMs,
        },
      ];
    })
  ) as Record<AiTask, AiTaskPolicy>;
}
