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
    // Routine changes require an explicit habitual statement or an answer to a
    // question about a habitual meal. A casual repeat is never an edit.
    const latestText = typeof latest.content === 'string' ? latest.content : '';
    const habitual =
      /\b(usual|usually|regular|regularly|always|every|habitual|habitualmente|normalmente|siempre|cada)\b/i;
    const declaration =
      /\b(is|are|was|were|eat|have|has|becomes|make|save|remember|es|son|era|com[oe]|desayuno|almuerzo|ceno|guard[ae]|record[aá]|olvid[aá]|forget|remove|delete|change|cambi[ao])\b/i;
    const prior = recent
      .slice(-4)
      .map(message =>
        typeof message.content === 'string' ? message.content : ''
      )
      .join('\n');
    const answering =
      recent.at(-1)?.getType() === 'ai' &&
      /\?/.test(prior) &&
      habitual.test(prior);
    const temporary =
      /\b(today|tonight|this time|just this once|hoy|esta vez|solo por hoy)\b/i.test(
        latestText
      ) &&
      !/\b(from now on|every day|siempre|a partir de ahora)\b/i.test(
        latestText
      );
    if (
      update.routines &&
      (temporary ||
        !(
          (habitual.test(latestText) && declaration.test(latestText)) ||
          answering ||
          /\b(forget|remove|delete|olvid[aá]|elimin[aá])\b/i.test(latestText)
        ))
    )
      update.routines = null;
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
    let next = applyMemoryUpdate(current, update);
    if (
      update.routines &&
      JSON.stringify(update.routines) !== JSON.stringify(current.routines ?? [])
    ) {
      next = { ...(next ?? current), routines: update.routines };
    }
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
