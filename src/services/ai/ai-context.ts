import { AIMessage, BaseMessage, HumanMessage } from '@langchain/core/messages';

export const MAX_USER_MESSAGE_BYTES = 6000;
export const INCOMPLETE_CONTEXT =
  'Some older conversation could not be summarized. Ask for clarification instead of assuming missing details.\n';
export class ContextBudgetError extends Error {
  constructor() {
    super(
      'This message or saved context is too large. Please shorten the message or your Coach memory notes.'
    );
  }
}
export const bytes = (value: string) => Buffer.byteLength(value, 'utf8');
export function clipText(value: string, limit: number) {
  if (bytes(value) <= limit) return value;
  let result = '';
  let size = 0;
  for (const character of value) {
    const length = bytes(character);
    if (size + length > limit) break;
    result += character;
    size += length;
  }
  return result;
}

export function clipHistoricalMessage(message: BaseMessage) {
  if (typeof message.content !== 'string' || bytes(message.content) <= 6000)
    return message;
  const fields = {
    id: message.id,
    content:
      clipText(message.content, 5900) +
      '\n[Earlier text shortened; the full message remains in chat history.]',
  };
  return message.getType() === 'human'
    ? new HumanMessage(fields)
    : new AIMessage(fields);
}

// Conservative input units: one per UTF-8 byte (not characters/4), plus
// framing/schema reserves. This is deliberately above normal text token counts.
// Images come from the 1600px upload pipeline; reserve 5000 units per image.
export function contextUnits(
  messages: BaseMessage[],
  schemaBytes = 0,
  imageUnits = 5000
) {
  return (
    1024 +
    schemaBytes +
    messages.reduce((total, message) => {
      const content =
        typeof message.content === 'string'
          ? bytes(message.content)
          : message.content.reduce(
              (sum, part) =>
                sum +
                (typeof part === 'string'
                  ? bytes(part)
                  : part.type === 'image_url'
                  ? imageUnits
                  : bytes(JSON.stringify(part))),
              0
            );
      return total + content + 128;
    }, 0)
  );
}

export function fitContext(
  messages: BaseMessage[],
  limit: number,
  schemaBytes = 0,
  imageUnits = 5000
) {
  const selected: BaseMessage[] = [];
  const latest = [...messages]
    .reverse()
    .find(message => message.getType() === 'human');
  // Preserve system instructions/health constraints and the complete current input.
  let units = contextUnits(messages, schemaBytes, imageUnits);
  for (const message of messages) {
    if (units > limit && message.getType() !== 'system' && message !== latest) {
      units -= contextUnits([message], 0, imageUnits) - 1024;
    } else selected.push(message);
  }
  if (units > limit) throw new ContextBudgetError();
  return selected;
}

export function compactProfile(profile: Record<string, unknown>, limit = 4096) {
  const result: Record<string, unknown> = {};
  const essential = [
    'allergies',
    'dietaryRestrictions',
    'dietType',
    'nutritionGoals',
  ];
  for (const key of essential)
    if (profile[key] != null) result[key] = profile[key];
  // Never silently truncate allergies or therapeutic constraints.
  if (bytes(JSON.stringify(result)) > limit) throw new ContextBudgetError();
  for (const key of [
    'name',
    'goal',
    'weightGoal',
    'goalVelocity',
    'outcome',
    'goalObstacle',
    'likes',
    'dislikes',
    'unitType',
    'activityLevel',
    'lifeStyle',
    'meal_times',
    'height',
    'initWeight',
    'birthdate',
  ]) {
    if (profile[key] == null) continue;
    const next = { ...result, [key]: profile[key] };
    if (bytes(JSON.stringify(next)) <= limit) result[key] = profile[key];
  }
  return result;
}

export function summaryChunk(
  messages: BaseMessage[],
  maxBytes = 6000,
  maxMessages = 12
) {
  const selected: BaseMessage[] = [];
  const lines: string[] = [];
  let remaining = maxBytes;
  for (const message of messages.slice(0, maxMessages)) {
    const content =
      typeof message.content === 'string'
        ? message.content
        : JSON.stringify(message.content);
    const line = `${message.getType()}: ${content}`;
    if (bytes(line) > remaining && selected.length) break;
    selected.push(message);
    lines.push(clipText(line, remaining));
    remaining -= bytes(lines.at(-1)!);
    if (remaining < 128) break;
  }
  return { messages: selected, text: lines.join('\n') };
}
