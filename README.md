# Fud Coach backend

Node, Express, TypeScript, MongoDB, LangChain, and LangGraph backend for Fud Coach.
The nutrition coach runs in this process; the former Python AI service is no
longer required.

## Runtime

The repository is configured for Node `23.1.0` in `.nvmrc` and Docker.

```sh
nvm use
yarn install
yarn build
yarn test
yarn start
```

## Configuration

Copy `.env.example` to `.env` and provide the required secrets. The AI service
requires both provider keys at startup:

- `ANTHROPIC_API_KEY` for routing, structured extraction, advice, preferences,
  and conversation summaries.
- `OPENAI_API_KEY` for food-image understanding.

The model IDs can be changed with `AI_TEXT_MODEL` and `AI_VISION_MODEL` without
changing the graph.

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
