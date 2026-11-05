# Coach memory

The coach uses Haiku 5.5 for personal memory as well as the other tasks. No new
provider, API key, dependency, or database migration is required. Restart the
backend and reload the app JavaScript to use the new Settings > Coach memory
screen. No native build or iOS simulator is needed for these code changes.

## Personal notes

`users.coachMemory` has four bounded, editable text sections: `goals`,
`relationships`, `preferences`, and `context` (2,000 characters each). It also has
`revision`, `updatedAt`, and `contextResetAt`. Existing users default to empty
notes until a relevant disclosure or a manual edit. Old transcripts are not
automatically mined for facts. The existing onboarding profile remains available
alongside these notes; notes do not rewrite onboarding health constraints or
nutrition targets. Explicit name/food preference changes retain their existing
profile update flow.

Before responding, the memory task considers the latest user message, six recent
messages for reference resolution, the current profile and existing notes.
It extracts clear goals and motivations, event dates, important people, tastes,
routines, obstacles and support preferences. Ordinary disclosures do not require
the word "remember". Meals alone do not imply likes. Questions, assistant
suggestions, hypothetical statements and inferred psychological traits are not
sources of new personal facts. Corrections replace stale facts; a forgotten fact
is removed rather than retained as history. Date wording is preserved when the
year is unknown. A local guard rejects newly generated calendar years that do
not occur in the user-supplied context or existing notes.

Explicit usual meals are saved as structured routines in coach memory, with a
meal type, applicable weekdays and a description of the foods, portions and
preparation. The app's Coach memory screen lets users review, change and remove
these routines. A user can define a routine without logging a
meal, then say “my usual lunch” to log it. A day-specific routine stays distinct
from an everyday one. If the routine or a material detail is unclear, the coach
asks; a reply can both clarify the current meal and update the routine. A change
for one occasion does not change the saved routine. The model may misunderstand,
so users can inspect and correct its notes in Settings > Coach memory.

An explicit reference to a recently confirmed meal can also define a usual
meal; a request for another one can start a new food log. These references use
recent conversation, not a query over historical food records. Existing food
logs do not identify meal type or reliably group independently logged items,
and conversation messages do not supply reliable local dates to the model.
The coach must ask if it cannot establish which meal is meant, including for
references such as yesterday's breakfast. New coach meal logs now carry a shared
`mealGroupId` and, when available, the local logging time and time zone supplied
by the device. Notification settings are used as a fallback. This is when the
entry was created, not necessarily when the food was eaten, and notification
settings may not reflect travel. Manual logs and older records do not have this
new metadata. Historical
lookup and confirmation using these fields are not implemented yet.

`AI_MEMORY_MODEL` can override the default. A memory update has an eight-second
inference budget within the existing turn deadline/call budget. Failure leaves
the reply/logging flow usable, with existing notes. Bare image uploads skip this
step; photo captions can contain disclosures. This adds a model call to ordinary
text turns and therefore some latency and cost. No semantic search or embeddings
are needed for this small, always-available profile.

## User control and concurrency

Authenticated `GET /profile/memory` reads only the signed-in user's notes.
`PUT /profile/memory` requires all four text sections and their current revision:

```json
{
  "goals": "Build stamina for a 10K on March 15, 2027.",
  "relationships": "Ana is my sister and training partner.",
  "preferences": "Likes tomatoes; dislikes ketchup.",
  "context": "Works nights; prefers small, manageable steps.",
  "revision": 0
}
```

The response contains the saved notes and updated metadata. Invalid bodies
return 400. Concurrent edits return 409 instead of overwriting newer content.
The app preserves the draft and offers reload. Automatic updates also use
compare-and-swap; stale extraction is discarded and fresh notes are reloaded.
Updates never accept a caller-supplied user ID. Profile updates cannot bypass
this revision check by supplying a `coachMemory` property.

Manual edits and explicit forget requests set a new context boundary. The next
turn clears the previous checkpoint summary, pending meal and older working
messages, using only transcript entries after that boundary. This intentionally
trades some recent continuity for respect of user corrections. A request that
causes forgetting is itself still a current message; the coach may acknowledge
it. Clearing these notes does not erase the full chat transcript, profile fields,
onboarding answers, logs or old database checkpoints. Previously learned
onboarding preferences remain editable through their existing flows.

## Recent conversation and tone

Advice receives up to sixteen recent messages plus a bounded working summary.
Routing and text meal/weight/exercise extraction receive six recent messages to
understand short follow-ups. Prompts explicitly prohibit replaying earlier logs
or treating assistant suggestions as completed actions. Preference writes still
require an explicit change in the latest message.

Working-summary compaction starts above 24 messages or 24,000 characters,
processing at most twelve older messages and approximately 6,000 UTF-8 bytes per
turn. Unprocessed messages remain queued within a capped working history. The
summary is limited to 2,400 UTF-8 bytes and 600 output tokens. Every graph entry,
including retries and externally appended messages, caps working history at 64
messages; oversized historical text is shortened to 6,000 bytes per message.
This also protects checkpoints when routing fails before summarization.

If an extended outage or a legacy backlog exceeds that working limit,
unsummarized overflow remains in the full transcript but leaves the AI's working
context. The summary is marked incomplete so the coach asks about missing details.
Personal notes remain separate and available. Canonical recent transcript entries
can restore context if a checkpoint is missing. Native MongoDB checkpoints
preserve working memory across restarts; personal notes survive conversation resets.

## Input budgets, storage retention and browsing history

The shared model service fits every request before dispatch, including retries
and different-provider fallbacks. It removes oldest optional dialogue first and
preserves system instructions, essential health constraints and the complete
latest input. If required content cannot fit, it rejects the request without a
provider call; the chat API returns a readable 413 response. New messages and photo
captions have a 6,000-byte UTF-8 limit before database writes or inference.

| Task                                            | Maximum conservative input units |
| ----------------------------------------------- | -------------------------------: |
| Routing, weight, exercise, preferences, summary |                           12,288 |
| Meal extraction, food matching, vision          |                           24,576 |
| Coaching advice, personal memory                |                           49,152 |

Units are a deliberately conservative local estimate: UTF-8 text bytes, JSON
schema bytes, message/framing reserves and image reserves. They are not the
provider's exact tokenizer or invoice count. The 1600px image pipeline reserves
5,000 units for Claude/current GPT-6-family models; older/unknown OpenAI image
models use 50,000 and therefore cannot bypass a cheaper vision budget. Health
constraints are never silently cut. Other onboarding context is selected within
4,096 bytes; the full profile remains stored. Personal note sections stay bounded
at 2,000 characters each. Actual input/output tokens and estimated costs still
come from provider telemetry; calls additionally record budget units and the
number of dropped context messages.

`aiCheckpoints` and `aiCheckpointWrites` get an `expiresAt` TTL index at backend
initialization. Following activity on a thread, snapshots and pending-write rows
strictly older than its latest two checkpoints are marked to expire in 30 days.
The latest state and immediate parent are retained indefinitely, including for
inactive users. Expiry is not extended on repeated scheduling. Scheduling is
throttled to once per thread/hour with a bounded process cache. Legacy snapshots
are scheduled when that thread is next used; no global historical-data backfill
is run. This relies on ordinary MongoDB TTL processing, which is asynchronous.
See [MongoDB TTL documentation](https://www.mongodb.com/docs/manual/tutorial/expire-data/).

The chat transcript, personal notes and business logs have no new expiry. The app
loads the newest forty messages and offers **Load earlier messages**. Authenticated
`POST /coach/get-messages-page` accepts `{limit: 40, before?: cursor}` and returns
`{messages, nextCursor}` newest first. Limits are 1–100, cursors are validated,
and queries remain scoped to the signed-in user's active conversation. Pagination
uses `(createdAt, _id)` so equal timestamps or new arrivals do not shift older
pages. Message IDs stay stable in the app for deduplication. The legacy
`/coach/get-messages` endpoint keeps its array shape but now returns at most forty
messages. Update the backend and app JavaScript together for paginated browsing.

Coaching prompts favor a brief, warm acknowledgement, manageable suggestions and
one useful question. They avoid repeated name use, guilt, exaggerated praise,
invented familiarity, medical diagnoses and unnecessary explanations of memory
internals. Personal information should be used only when relevant.

## Verification

```sh
yarn build
yarn test
# Paid model calls with synthetic data and no database writes:
yarn ai:eval --models=anthropic:claude-haiku-5-5 --case=memory: --trials=3 --output=/private/tmp/coach-memory-evaluation.json
yarn ai:smoke:memory --output=/private/tmp/coach-memory-smoke.json
yarn ai:eval --models=anthropic:claude-haiku-5-5 --case=usual: --trials=3 --output=/private/tmp/coach-usual-meals-evaluation.json
yarn ai:smoke:usual-meals --output=/private/tmp/coach-usual-meals-smoke.json
```

The initial final extraction evaluation passed all nine cases across three
trials (27/27), with estimated uncached list cost $0.006392 and p95 call latency
1.84 seconds. An earlier prompt failed ambiguous-year checks; the revised prompt
and local guard address this. These synthetic checks do not establish perfect
real-world recall or emotional appropriateness. The full conversation smoke uses
real Haiku inference, an in-memory checkpointer and simulated note/profile writes.

The six-turn conversation smoke passed disclosure, preference storage, recall in
a new thread, a settings correction and a forget request (18 model calls;
estimated list cost $0.003281). Routing passed 14/14 live cases, including short
follow-up answers and avoiding replay of an old meal. The cost-protection update
has 52 offline tests, including 7,300-message legacy history with repeated router
and summary failures, input rejection before provider calls, checkpoint expiry
recovery, and pagination during concurrent arrivals. A live memory smoke with the
bounded context passed six turns and eighteen calls (estimated $0.003284).
Backend build and mobile TypeScript checks pass. Scoped mobile lint has no errors;
two existing `any` warnings remain in the chat files.

On a physical device, disclose a goal, a family relationship and a food preference;
then inspect Settings > Coach memory. Correct a note, save it, and ask about it in
chat. Clear a note and verify the coach no longer relies on it. Check that simple
follow-ups remain coherent and no food/weight logs are duplicated. Mobile
verification is TypeScript/lint only; device layout and behavior are tested by the
developer. No iPhone builds, native regeneration, simulator or deployment runs.

Architecture reference: [LangChain memory overview](https://docs.langchain.com/oss/javascript/concepts/memory).
