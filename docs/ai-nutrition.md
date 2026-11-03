# Coach models and USDA nutrition

The coach uses direct Anthropic and OpenAI APIs. There is no gateway or automatic
model selection. Each graph task resolves its model through
`src/services/ai/ai-model-policy.ts`. The default is Claude Haiku 5.5; model
choices can be overridden without changing graph nodes.

## Local setup

The backend requires Node 24.18.0 (`nvm use`). Existing Anthropic/OpenAI keys stay
in the backend `.env`; only providers selected as primaries are required at
startup. A configured fallback needs its provider key when used.

Get a free USDA key at <https://fdc.nal.usda.gov/api-key-signup/> (linked from
<https://fdc.nal.usda.gov/api-guide/>). Add:

```dotenv
USDA_API_KEY=your_key_here
AI_DEFAULT_MODEL=anthropic:claude-haiku-5-5
```

Then restart `yarn dev`. Keys belong only in the backend. Do not put them in the
iOS app or commit `.env`. The API remains on `HOST=0.0.0.0`, port 3000 by default.
For a physical iPhone, the app must use the development computer's LAN IP rather
than the phone's own `localhost`. Existing client networking/HTTP settings still
apply; this change does not modify the iOS project.

USDA access is free. The default limit is 1,000 requests/hour/IP; the public
`DEMO_KEY` has much lower limits. Production code never silently substitutes that
demo key. USDA data are CC0, allowing historical snapshots and caching. See the
[USDA API guide](https://fdc.nal.usda.gov/api-guide/) for the current terms/limits.

## Task settings

All model values use `anthropic:model-id` or `openai:model-id`:

| Setting                | Purpose                                                      |
| ---------------------- | ------------------------------------------------------------ |
| `AI_DEFAULT_MODEL`     | Default for every task                                       |
| `AI_ROUTER_MODEL`      | Intent classification                                        |
| `AI_MEAL_MODEL`        | Food/quantity extraction from text and clarification replies |
| `AI_FOOD_MATCH_MODEL`  | Choose among supplied USDA food candidates                   |
| `AI_WEIGHT_MODEL`      | Weight extraction/conversion                                 |
| `AI_EXERCISE_MODEL`    | Exercise extraction                                          |
| `AI_PREFERENCES_MODEL` | Explicit name/like/dislike changes                           |
| `AI_ADVICE_MODEL`      | General wellness conversation                                |
| `AI_SUMMARY_MODEL`     | Durable conversation summaries                               |
| `AI_VISION_MODEL`      | Structured photo observations                                |
| `AI_MEMORY_MODEL`      | Maintain user-editable personal notes                        |

`AI_FALLBACK_MODEL` supplies an optional backup. Every task also supports
`AI_<TASK>_FALLBACK_MODEL`; set it to an empty string to disable a global backup
for that task. There is no backup enabled by default. `AI_MODEL_TIMEOUT_MS`
defaults to 25000 (allowed range 1000–60000). Restart after changing settings.

`AI_TEXT_MODEL` has been replaced. The old unprefixed `AI_VISION_MODEL` format
must be removed or changed to a provider-prefixed value.

The model service owns retries: at most two attempts per task, ten model calls
per execution, and a shared 90-second inference/lookup deadline. SDK retries are
disabled. Structured results are validated locally. Refusals, invalid credentials,
exhausted credit balances, and invalid configuration do not trigger model
fallback. Transient failures or invalid outputs can retry or use the explicitly
configured backup. A more expensive model is never selected automatically.

OpenAI uses the Responses API with `store: false`. That setting does not enable
an account-level ZDR agreement. Current reasoning models omit sampling settings;
the GPT-6 reasoning setting is passed explicitly because the installed LangChain
version's model detection predates GPT-6. Haiku 5.5 uses disabled thinking for
these focused tasks and omits unsupported sampling parameters.

## Meal processing

1. The router selects meal logging, or image presence selects vision directly.
2. AI returns food identities, preparation, brand when provided, and quantities.
   It does not provide calorie/macro values. Images produce these observations
   directly, without an intermediate free-text description call.
3. USDA search supplies up to eight candidates per item, separating generic
   foods from explicitly branded products. AI may select only a supplied ID or
   ask for clarification. Local guards also reject raw/cooked conflicts,
   unintended breading, and brand mismatches.
4. Food details provide nutrients per 100 g and household portion weights. Code
   converts explicit mass units, prefers unambiguous USDA portions, and otherwise
   uses a labeled AI weight estimate. It never equates milliliters to grams.
5. Code scales calories/protein/carbs/fat to consumed weight. Missing required
   nutrients invalidate a food record; they are never treated as zero. USDA kcal
   energy fields are preferred, with kJ conversion when necessary.
6. Every item must resolve before the meal write. Food records and their operation
   completion record commit in one MongoDB transaction.

Meal clarification observations persist in graph state, allowing a later reply
such as “150 grams” to complete the original food entry. Cancellation clears the
pending meal. Image bytes remain in process memory only and are cleared after
the request. If inference fails before observations are saved, the client must
resend the image on retry. Multipart image requests optionally accept `message`
as a caption; existing uploads work without it.

USDA errors leave the meal unsaved and tell the user to retry. There is no silent
fallback to invented nutrients. Mixed dishes need a comparable USDA dish or
clarification of ingredients/preparation. Coverage of local brands and recipes
needs ongoing testing; database grounding does not remove image portion error.

The bounded process cache holds up to 500 combined search/detail entries. Searches
expire after one hour and normalized details after 24 hours. Concurrent identical
lookups share a request. USDA throttling is not retried immediately; temporary
transport/server failures get at most one retry. Restarts clear the cache.

## Stored data and recovery

Existing `foodObj` fields and coach response shapes remain compatible. New AI
food logs add a top-level `nutrition` object containing USDA source ID,
description/data type, consumed grams, quantity source, original amount/unit,
per-100-g nutrient values, retrieval date, optional portion ID, and assumptions.
No existing records are rewritten. Nutrients in `foodObj` are consumed totals;
`servings` retains a count, with explicit weight-based inputs treated as one
consumed portion. Precise weight is retained in `nutrition.grams`.

New completed meal operations retain the saved payload. Retrying an interrupted
run recovers its confirmation from that payload without another inference or
write. Legacy completed meal operations containing only a count get a generic
success confirmation. Summary failures defer compaction and preserve the saved
response and complete transcript. New checkpoint fields have defaults, allowing
existing conversations to continue without reset.

`aiRuns.modelCalls` retains up to the most recent 100 call records per run:
requested/actual model, task/policy version, attempt/status, duration, input/output,
cache-read/reasoning tokens where reported, estimated cost for known models, and
request ID. Telemetry does not copy prompts, images, or reasoning. The cost table
is dated 2026-10-25 and uses uncached list rates (with known long-context tiers).
Treat costs as estimates; caching, image accounting, future pricing, and invoices
can differ. Telemetry persistence failure does not repeat a successful inference.

## Verification and evaluations

Offline backend checks (no external API calls):

```sh
yarn build
yarn test
git diff --check
```

The live evaluation runner uses synthetic inputs only and makes paid model calls;
it never connects to MongoDB:

```sh
yarn ai:eval --output=/private/tmp/coach-evaluation.json
yarn ai:eval --models=anthropic:claude-haiku-5-5,openai:gpt-6-luna --trials=3 --output=/private/tmp/coach-comparison.json
yarn ai:eval --case=preferences:question --trials=3
```

It checks routing (including requests that must not write), unit extraction,
preference operations, food matching, clarification context, summary preservation,
basic advice constraints, and rejection of a blank photo. `--image=/path/photo.jpg`
adds a banana-identification case: use a known single-banana fixture. That case
does not grade portion accuracy. Multiple trials help expose output variability;
this small initial suite cannot establish production-wide reliability.

The live nutrition smoke runner uses real model and USDA calls, an in-memory
checkpointer, and simulated business writes. It verifies a multi-item text meal,
recovery on repeated run, and clarification followed by successful logging:

```sh
yarn ai:smoke --output=/private/tmp/coach-nutrition-smoke.json
# For a small test before getting a USDA key:
yarn ai:smoke --demo --output=/private/tmp/coach-nutrition-smoke.json
# Optional single-banana photo:
yarn ai:smoke --demo --image=/path/banana.jpg --output=/private/tmp/coach-nutrition-smoke.json
```

The default application still requires a real USDA key for meal logging. No iOS
simulator or Docker/VPS deployment is part of these checks.
