# Fud Coach backend

Node, Express, TypeScript, MongoDB, LangChain, and LangGraph backend for Fud Coach.
The nutrition coach runs in this process; the former Python AI service is no
longer required.

## Local development

The repository is configured for Node `24.18.0` in `.nvmrc` and Docker.

```sh
nvm use
yarn install --frozen-lockfile
yarn build
yarn test
yarn dev
```

`yarn start` runs the compiled production entry point at `dist/index.js`.

## Configuration

Copy `.env.example` to `.env` and provide the required secrets. The coach uses
direct Anthropic/OpenAI APIs, with independently configurable tasks. The default
is `anthropic:claude-haiku-5-5` for all tasks, including vision. Only providers
selected as a primary model require a key at startup:

- `ANTHROPIC_API_KEY` for Anthropic models.
- `OPENAI_API_KEY` when selecting OpenAI models.
- `USDA_API_KEY` for meal nutrition lookups (text and photos).

Set `AI_DEFAULT_MODEL` and optional `AI_ROUTER_MODEL`, `AI_MEAL_MODEL`,
`AI_FOOD_MATCH_MODEL`, `AI_WEIGHT_MODEL`, `AI_EXERCISE_MODEL`,
`AI_PREFERENCES_MODEL`, `AI_ADVICE_MODEL`, `AI_SUMMARY_MODEL`, or
`AI_VISION_MODEL` or `AI_MEMORY_MODEL`. Values use `anthropic:model-id` or `openai:model-id`.
`AI_FALLBACK_MODEL` and task-specific `_FALLBACK_MODEL` overrides are optional;
no fallback model is enabled by default. Restart the backend after changing `.env`.

Migration: `AI_TEXT_MODEL` is obsolete. An existing `AI_VISION_MODEL` must now
include its provider prefix, or be removed to use the default.

### Get a free USDA key

1. Register at <https://fdc.nal.usda.gov/api-key-signup/> (also linked from the
   [USDA API guide](https://fdc.nal.usda.gov/api-guide/)).
2. Add `USDA_API_KEY=your_key_here` to the backend's local `.env`.
3. Restart `yarn dev`. Keep this key on the backend; do not put it in the iOS app.

FoodData Central is free and its CC0 data can be cached and retained in meal
history. The default API limit is 1,000 requests/hour/IP. Search results are
cached for an hour and normalized food details for a day, in a bounded in-memory
cache. Advice and other non-meal tasks can run before a USDA key is configured;
meal logging will ask the user to retry instead of inventing nutrient values.

See [AI nutrition implementation and checks](docs/ai-nutrition.md) for matching,
failure handling, configuration, and evaluation commands.

For local development, the App Store private key defaults to
`secrets/appstore_private_key.p8`. Set `APPSTORE_PRIVATE_KEY_PATH` only when the
key is stored elsewhere.

## Docker

Build the same `linux/amd64` image that will run on the DigitalOcean Droplet:

```sh
yarn docker:build
```

Run it locally with configuration and the App Store key mounted at runtime:

```sh
yarn docker:run
curl http://127.0.0.1:3000/
```

The image contains neither `.env` nor the private key. Use `yarn docker:logs`,
`yarn docker:stop`, and `yarn docker:remove` to manage the local container.

## Deploying on the Droplet

From `/home/ale/apps/fudCoachBackend` on the VPS, after pulling the new code:

```sh
git pull
yarn docker:vps:deploy
```

`docker:vps:deploy` builds `fud-node:prod`, replaces the `fud-node` container,
and starts it on the existing `fud-net` network using the server's `.env` and
read-only App Store key. Caddy keeps running and continues routing
`api.fud.coach` to the replacement container.

The VPS and the backend image both use Node 24.18.0.

To follow the application startup logs:

```sh
yarn docker:vps:logs
```

## AI architecture

The implementation follows the existing application layers:

- `src/routes/coach.routes.ts` owns authenticated HTTP and multipart requests.
- `src/controllers/coach.controller.ts` coordinates API behavior.
- `src/services/ai/` contains graph orchestration, prompts, durable turn logic,
  and database actions.
- `src/models/ai-*.model.ts` owns conversation, transcript, and run queries.
- `src/types/ai-agent.types.ts` defines the persistence contracts.

The graph supports nutrition advice, meal logging from text, weight logging,
exercise logging, food-image analysis, and explicit preference changes. For meals,
AI identifies foods and quantities; USDA supplies nutrient values and code scales
them to the consumed weight. Uncertain matches request clarification before any
food logs are written. Image portions remain labeled estimates.

## MongoDB memory

All agent memory is durable in MongoDB:

- `aiConversations` identifies the active conversation for a user.
- `aiMessages` is the complete application transcript.
- `aiCheckpoints` and `aiCheckpointWrites` hold native LangGraph state.
- `aiRuns` records turn status and idempotent business operations.
- `users.coachMemory` holds the editable personal notes shared across conversations.

Settings > Coach memory lets users edit goals/dates, important people, tastes,
and helpful personal context. Haiku updates these notes from clear disclosures
before replying. Existing onboarding/profile data remain available separately.
Manual edits and explicit forget requests reset older AI working context so
removed notes are not repopulated from old summaries. The visible transcript
is retained. See [Coach memory](docs/coach-memory.md) for behavior and testing.

`aiRuns.modelCalls` records model/task, policy version, duration, token usage,
known-model cost estimates, attempt outcomes, and provider request IDs. It does
not duplicate prompts, photos, or internal reasoning. Cost estimates use a dated
list-price snapshot and are not provider invoices.

All model requests have per-task input budgets. Summaries process bounded chunks;
working checkpoints retain at most 64 messages, even through outages. Superseded
checkpoints expire 30 days after scheduling, while the latest two states per
thread remain available. Full transcripts and personal notes are retained.

Food, weight, exercise, and user preferences continue to use the existing
application collections. AI business writes and their completion record use a
MongoDB transaction, so the configured MongoDB deployment must support
transactions (MongoDB Atlas and replica sets do).

Older context is summarized inside LangGraph state while the complete transcript
remains in `aiMessages`. Images are resized and converted to JPEG for analysis;
image bytes are not stored in messages or checkpoints. Pending meal observations
persist between clarification turns. New food logs include a USDA
source/quantity/nutrient snapshot; existing food logs remain unchanged.

## Coach API compatibility

Existing `/coach` routes and response objects remain available. The authenticated
JWT user is now the source of truth for conversation ownership. A supplied
`userId` must match that authenticated user.

`POST /coach/get-answer` accepts an optional `clientRequestId`. Multipart image
requests can include the same field. Clients should reuse this ID when retrying a
turn so the backend can return the existing result rather than repeat a business
operation.

Chat messages/captions are limited to 6,000 UTF-8 bytes. The app uses
`POST /coach/get-messages-page` with a limit of 40 and an optional `before` cursor
to load older history. The response is `{messages, nextCursor}`. The legacy
`/coach/get-messages` retains its array response, capped at 40 messages.

`POST /coach/reset-conversation` archives the active conversation and creates a
fresh one. It does not delete the user's profile or nutrition logs.
