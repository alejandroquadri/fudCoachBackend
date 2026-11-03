import dotenv from 'dotenv';
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { HumanMessage } from '@langchain/core/messages';
import { MemorySaver } from '@langchain/langgraph';
import { AiGraphService } from '../src/services/ai/ai-graph.service';
import { AiModelService } from '../src/services/ai/ai-model.service';
import { CoachMemoryService } from '../src/services/ai/coach-memory.service';
import { emptyMemory } from '../src/services/ai/coach-memory';
import { AiModelCall } from '../src/types';
import { AiActionsService } from '../src/services/ai/ai-actions.service';
import { applyPreferenceListChange } from '../src/services/ai/ai-utils';

dotenv.config();
async function main() {
  const calls: AiModelCall[] = [];
  const models = new AiModelService(async (_run, call) => {
    calls.push(call);
  });
  let memory = emptyMemory();
  let profile: Record<string, unknown> = { allergies: ['peanuts'] };
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
    updatePreferences: async (
      _run: string,
      _user: string,
      change: Parameters<AiActionsService['updatePreferences']>[2]
    ) => {
      const result: Record<string, unknown> = {};
      if (change.name) result.name = change.name;
      if (change.likes)
        result.likes = applyPreferenceListChange(profile.likes, change.likes);
      if (change.dislikes)
        result.dislikes = applyPreferenceListChange(
          profile.dislikes,
          change.dislikes
        );
      profile = { ...profile, ...result };
      return result;
    },
  } as Pick<
    AiActionsService,
    'logMeals' | 'logWeight' | 'logExercise' | 'updatePreferences'
  >;
  const graph = new AiGraphService(new MemorySaver(), {
    models,
    memory: memoryService,
    actions,
    runs: {
      get: async () => null,
      setRoute: async () => {},
      recordModelCall: async () => {},
    },
  });
  const results: Record<string, unknown>[] = [];
  let count = 0;
  const invoke = async (content: string, thread = 'first') => {
    const id = `memory-smoke-${++count}`;
    const state = await graph.invoke(
      {
        userId: 'synthetic-user',
        runId: id,
        profile,
        memory,
        recentMessages: [],
        message: new HumanMessage({ id, content }),
      },
      thread
    );
    const response = String(state.messages.at(-1)?.content);
    results.push({
      input: content,
      response,
      notes: { ...memory },
      route: state.route,
    });
    console.log(JSON.stringify({ turn: count, route: state.route, response }));
    return response;
  };
  await invoke(
    'My sister Ana and I are training for a 10K on March 15, 2027. I want to build stamina.'
  );
  assert.match(memory.goals, /2027/);
  assert.match(memory.relationships, /Ana/);
  await invoke('Please remember that I love tomatoes and hate ketchup.');
  assert.match(memory.preferences, /tomato/i);
  assert.match(memory.preferences, /ketchup/i);
  const recall = await invoke(
    'What is my training goal, and who is doing it with me?',
    'new-thread'
  );
  assert.match(recall, /Ana/);
  assert.match(recall, /10/);
  // Simulate an authenticated settings edit; the next turn must discard old context.
  memory = {
    ...memory,
    relationships: 'Luis is my running friend.',
    revision: memory.revision + 1,
    contextResetAt: new Date().toISOString(),
  };
  const edited = await invoke('Which running friend do you remember?', 'first');
  assert.match(edited, /Luis/);
  assert.doesNotMatch(edited, /Ana/);
  await invoke('Forget my running friend Luis.');
  assert.doesNotMatch(memory.relationships, /Luis/);
  const cleared = await invoke(
    'Which running friend do you remember?',
    'first'
  );
  assert.match(cleared, /don't|do not|haven't|not |no |isn't|is not/i);
  assert.doesNotMatch(memory.relationships, /Luis|Ana/);
  const report = {
    createdAt: new Date().toISOString(),
    noDatabaseWrites: true,
    results,
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
      calls: calls.length,
      estimatedModelCostUsd: report.estimatedModelCostUsd,
    })
  );
}
main().catch(error => {
  console.error(error instanceof Error ? error.message : 'Memory smoke failed');
  process.exitCode = 1;
});
