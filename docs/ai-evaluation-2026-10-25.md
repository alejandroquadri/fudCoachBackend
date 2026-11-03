# AI nutrition evaluation — 2026-10-25

This is an initial regression suite using synthetic requests, a blank image, and a public single-banana photo. It does not establish population-level nutrition accuracy or calibrated photo portion estimates. No production database records were created.

## Model comparison

After the preference-prompt correction, both candidates passed all 24 cases. The question/no-preference-change case also passed three additional trials per candidate.

| Model                                 | Passed | Critical failures | Estimated cost for suite (USD) | p95 task latency |
| ------------------------------------- | -----: | ----------------: | -----------------------------: | ---------------: |
| `anthropic:claude-haiku-5-5`          |  24/24 |                 0 |                      $0.004123 |          1989 ms |
| `anthropic:claude-haiku-4-5-20251001` |  24/24 |                 0 |                      $0.036950 |          1899 ms |

Estimates use provider token usage and uncached short-context list prices checked on 2026-10-25. Actual billing can differ. These are per-task latencies measured locally, not full conversation-turn latency guarantees.

Claude Haiku 5.5 is the initial default because it met the checks at lower estimated cost. Every task remains independently configurable. No premium fallback is enabled by default.

OpenAI preflight returned HTTP 429 with `credit_balance_exhausted` / `insufficient_quota`. Its live quality/cost comparison could not be completed. The OpenAI adapter is covered by a transport test checking native JSON Schema, disabled response storage, and the GPT-6 reasoning setting.

## Live USDA flow

The full graph used real Anthropic/USDA calls, an in-memory checkpointer, and simulated business writes:

| Input                  | Result                                                                         |
| ---------------------- | ------------------------------------------------------------------------------ |
| `text-meal`            | White rice: 150 g, 195 kcal, USDA 168878; Carrots: 100 g, 41 kcal, USDA 170393 |
| `clarification-answer` | White rice: 150 g, 195 kcal, USDA 168878                                       |
| `photo-meal`           | Banana: 118 g, 105 kcal, USDA 173944                                           |

The repeated text run recovered the saved payload without another model call or business write. The clarification case waited for the food/quantity before logging. Image portions were labeled estimates. These checks passed with both the public USDA demo key and the developer-provided key. The latter run made ten model calls, with an estimated model cost of $0.002397, and created no database records.

Final offline checks passed: TypeScript build, 25 tests, and `git diff --check`.

Photo fixture: [Banana-Single.jpg on Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Banana-Single.jpg). The downloaded image stays outside the repository.

## Reproduce

See [AI nutrition setup and verification](ai-nutrition.md). `yarn ai:eval` makes paid model calls; `yarn ai:smoke` uses real model/USDA calls with simulated writes. `yarn test` is offline. No iOS simulator or deployment was used.
