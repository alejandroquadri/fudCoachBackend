import {
  HumanMessage,
  SystemMessage,
  BaseMessage,
} from '@langchain/core/messages';
import { CoachMemoryModel } from '../../models/coach-memory.model';
import { compactProfile } from './ai-context';
import { AiCallContext, AiModelService } from './ai-model.service';
import {
  applyMemoryUpdate,
  CoachMemory,
  MEMORY_PROMPT,
  MemoryUpdateSchema,
  memoryText,
} from './coach-memory';

export class CoachMemoryService {
  constructor(
    private readonly models: Pick<AiModelService, 'structured'>,
    private readonly store: Pick<
      CoachMemoryModel,
      'save' | 'get'
    > = new CoachMemoryModel()
  ) {}

  async observe(
    userId: string,
    current: CoachMemory,
    profile: Record<string, unknown>,
    recent: BaseMessage[],
    latest: BaseMessage,
    context: AiCallContext
  ): Promise<CoachMemory> {
    const update = await this.models.structured(
      'memory',
      MemoryUpdateSchema,
      [
        new SystemMessage(MEMORY_PROMPT),
        ...recent.slice(-6),
        new HumanMessage(
          JSON.stringify({
            currentDate: new Date().toISOString().slice(0, 10),
            profile: compactProfile(profile),
            notes: current,
            latestUserMessage: latest.content,
          })
        ),
      ],
      context
    );
    // A calendar year must be grounded in a user statement or an existing note.
    // A current timestamp cannot supply an unknown event year.
    const source = JSON.stringify({
      current: memoryText(current),
      latest: latest.content,
      recent: recent
        .filter(message => message.getType() === 'human')
        .map(message => message.content),
    });
    const years = new Set(source.match(/\b(?:19|20|21)\d{2}\b/g) ?? []);
    for (const key of [
      'goals',
      'relationships',
      'preferences',
      'context',
    ] as const) {
      if (
        (update[key]?.match(/\b(?:19|20|21)\d{2}\b/g) ?? []).some(
          year => !years.has(year)
        )
      )
        update[key] = null;
    }
    const next = applyMemoryUpdate(current, update);
    if (!next && !update.forgetRequested) return this.store.get(userId);
    // Never overwrite an edit made while extraction was running. Do not replay it.
    return (
      (await this.store.save(
        userId,
        next ?? current,
        current.revision,
        update.forgetRequested ? 'user' : 'agent'
      )) ?? (await this.store.get(userId))
    );
  }
}
