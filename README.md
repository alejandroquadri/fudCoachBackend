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

Copy `.env.example` to `.env` and provide the required secrets. The AI service
requires both provider keys at startup:

- `ANTHROPIC_API_KEY` for routing, structured extraction, advice, preferences,
  and conversation summaries.
- `OPENAI_API_KEY` for food-image understanding.

The model IDs can be changed with `AI_TEXT_MODEL` and `AI_VISION_MODEL` without
changing the graph.

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
exercise logging, food-image analysis, and explicit preference changes.

## MongoDB memory

All agent memory is durable in MongoDB:

- `aiConversations` identifies the active conversation for a user.
- `aiMessages` is the complete application transcript.
- `aiCheckpoints` and `aiCheckpointWrites` hold native LangGraph state.
- `aiRuns` records turn status and idempotent business operations.

Food, weight, exercise, and user preferences continue to use the existing
application collections. AI business writes and their completion record use a
MongoDB transaction, so the configured MongoDB deployment must support
transactions (MongoDB Atlas and replica sets do).

Older context is summarized inside LangGraph state while the complete transcript
remains in `aiMessages`. Images are converted to JPEG for analysis; image bytes
are not stored in messages or checkpoints.

## Coach API compatibility

Existing `/coach` routes and response objects remain available. The authenticated
JWT user is now the source of truth for conversation ownership. A supplied
`userId` must match that authenticated user.

`POST /coach/get-answer` accepts an optional `clientRequestId`. Multipart image
requests can include the same field. Clients should reuse this ID when retrying a
turn so the backend can return the existing result rather than repeat a business
operation.

`POST /coach/reset-conversation` archives the active conversation and creates a
fresh one. It does not delete the user's profile or nutrition logs.
