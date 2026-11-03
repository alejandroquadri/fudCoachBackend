import dotenv from 'dotenv';
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import sharp from 'sharp';
import { HumanMessage } from '@langchain/core/messages';
import { MemorySaver } from '@langchain/langgraph';
import { AiGraphService } from '../src/services/ai/ai-graph.service';
import { AiModelService } from '../src/services/ai/ai-model.service';
import { MealNutritionService } from '../src/services/ai/meal-nutrition.service';
import { UsdaService } from '../src/services/usda.service';
import {
  AiFoodLogPayload,
  AiModelCall,
  AiRun,
  AiRunOperation,
} from '../src/types';
import { AiActionsService } from '../src/services/ai/ai-actions.service';
import { AiRunModel } from '../src/models/ai-run.model';

dotenv.config();
const args = process.argv.slice(2);
const option = (name: string) =>
  args.find(arg => arg.startsWith(`--${name}=`))?.slice(name.length + 3);

async function main() {
  if (!process.env.USDA_API_KEY && !args.includes('--demo'))
    throw new Error(
      'Set USDA_API_KEY in .env, or pass --demo for a small test using USDA public demo limits.'
    );
  const calls: AiModelCall[] = [];
  const writes: Array<{ runId: string; meals: AiFoodLogPayload[] }> = [];
  const operations = new Map<string, AiRunOperation[]>();
  const models = new AiModelService(async (_runId, call) => {
    calls.push(call);
  });
  const nutrition = new MealNutritionService(
    models,
    new UsdaService(() => process.env.USDA_API_KEY || 'DEMO_KEY')
  );
  const actions = {
    logMeals: async (
      runId: string,
      _userId: string,
      meals: AiFoodLogPayload[]
    ) => {
      const result = { count: meals.length, meals };
      operations.set(runId, [
        {
          key: 'log-meals',
          status: 'completed',
          completedAt: new Date(),
          result,
        },
      ]);
      writes.push({ runId, meals });
      return result;
    },
  } as unknown as Pick<
    AiActionsService,
    'logMeals' | 'logWeight' | 'logExercise' | 'updatePreferences'
  >;
  const runs = {
    get: async (runId: string) =>
      ({ operations: operations.get(runId) ?? [] } as AiRun),
    setRoute: async () => {},
    recordModelCall: async () => {},
  } as Pick<AiRunModel, 'get' | 'setRoute' | 'recordModelCall'>;
  const graph = new AiGraphService(new MemorySaver(), {
    models,
    nutrition,
    actions,
    runs,
  });
  const results: Array<Record<string, unknown>> = [];
  const invoke = async (runId: string, content: string, threadId = runId) => {
    const start = Date.now();
    const state = await graph.invoke(
      {
        runId,
        userId: 'synthetic-evaluation-user',
        profile: {},
        message: new HumanMessage({ id: runId, content }),
      },
      threadId
    );
    const output = String(state.messages.at(-1)?.content);
    const result = {
      runId,
      route: state.route,
      output,
      pending: Boolean(state.pendingMeal),
      durationMs: Date.now() - start,
    };
    results.push(result);
    console.log(JSON.stringify(result));
    return state;
  };
  const first = await invoke(
    'text-meal',
    'Log my meal: 150 g cooked white rice and 100 g raw carrots.'
  );
  assert.equal(
    first.pendingMeal,
    null,
    'Text meal needs unexpected clarification; inspect output'
  );
  assert.equal(writes[0]?.meals.length, 2);
  for (const meal of writes[0].meals) {
    assert.equal(meal.nutrition?.source, 'usda');
    assert.equal(
      meal.calories,
      Math.round(
        (meal.nutrition!.per100g.calories * meal.nutrition!.grams) / 100
      )
    );
  }
  await invoke(
    'text-meal',
    'Log my meal: 150 g cooked white rice and 100 g raw carrots.'
  );
  assert.equal(writes.length, 1, 'Retry must not issue a new write');

  const clarification = await invoke(
    'clarification-start',
    'Please log my meal. I have not said what the food was yet.',
    'clarification'
  );
  assert.ok(clarification.pendingMeal, 'Unspecified food must ask a question');
  assert.equal(writes.length, 1);
  const resolved = await invoke(
    'clarification-answer',
    'It was 150 g cooked white rice.',
    'clarification'
  );
  assert.equal(resolved.pendingMeal, null);
  assert.equal(writes.length, 2);

  const imagePath = option('image');
  if (imagePath) {
    const buffer = await sharp(await readFile(imagePath))
      .rotate()
      .resize({
        width: 1600,
        height: 1600,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .jpeg({ quality: 85 })
      .toBuffer();
    graph.setImage('photo-meal', { buffer, mimeType: 'image/jpeg' });
    try {
      const state = await invoke('photo-meal', '[User uploaded an image]');
      assert.equal(state.pendingMeal, null);
      const logged = writes.find(write => write.runId === 'photo-meal');
      assert.ok(logged?.meals.some(meal => /banana/i.test(meal.name)));
      assert.ok(
        logged?.meals.every(
          meal => meal.nutrition?.quantitySource === 'ai_estimate'
        )
      );
    } finally {
      graph.clearImage('photo-meal');
    }
  }
  const report = {
    createdAt: new Date().toISOString(),
    noDatabaseWrites: true,
    usdaDemo: !process.env.USDA_API_KEY,
    results,
    simulatedWrites: writes,
    calls,
    estimatedModelCostUsd: calls.reduce(
      (total, call) => total + (call.estimatedCostUsd || 0),
      0
    ),
  };
  if (option('output'))
    await writeFile(option('output')!, JSON.stringify(report, null, 2) + '\n');
  console.log(
    JSON.stringify({
      smoke: 'passed',
      simulatedMeals: writes.length,
      modelCalls: calls.length,
      estimatedModelCostUsd: report.estimatedModelCostUsd,
    })
  );
}
main().catch(error => {
  console.error(
    error instanceof Error ? error.message : 'Nutrition smoke test failed'
  );
  process.exitCode = 1;
});
