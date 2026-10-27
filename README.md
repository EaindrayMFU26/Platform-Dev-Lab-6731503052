# Campus Equipment Booking API

A REST API for reserving shared faculty equipment such as projectors, cameras and meeting rooms.
The same equipment cannot be booked for overlapping times.

Midterm practical lab test, 1305308 Platform Development. Student ID 6731503052. Since assignment
A6 (week 8) the same API also routes support messages with an AI decision model: see
[Support request router](#support-request-router-ai-decision-capability).

- **Stack:** TypeScript, Hono, Cloudflare Workers, Cloudflare D1 (SQLite), Cloudflare Workers AI
- **Live API (Cloudflare):** <https://equipment-booking-api.medcard-api.workers.dev/api>, for
  example [/api/equipment](https://equipment-booking-api.medcard-api.workers.dev/api/equipment)
- **Base API URL used for testing:** `https://equipment-booking-api.medcard-api.workers.dev/api`
  (deployed) and `http://localhost:8787/api` (local)
- **Source code:** <https://github.com/EaindrayMFU26/Platform-Dev-Lab-6731503052>

| Document | Contents |
|---|---|
| [API_CONTRACT.md](API_CONTRACT.md) | Endpoints, payloads, status codes and why, assumptions |
| [SCHEMA.md](SCHEMA.md) | ERD, tables, constraints, the overlap rule |
| [CURL_GUIDE_EVIDENCE.md](CURL_GUIDE_EVIDENCE.md) | The nine commands of the instructor's cURL guide, run as written, with their output |
| [TEST_EVIDENCE.md](TEST_EVIDENCE.md) | 32 further test cases with the commands and the responses they produced |
| [QUALITY_GATE_REVIEW.md](QUALITY_GATE_REVIEW.md) | Quality Gate review: findings, fixes and evidence |
| [AI_LOG.md](AI_LOG.md) | How AI was used and what was verified (midterm, and assignment A6) |
| [docs/A6/A6_6731503052.md](docs/A6/A6_6731503052.md) | Assignment A6 report: the AI support-request router ([PDF](docs/A6/A6_6731503052.pdf)) |
| [SUPPORT_ROUTER_EVIDENCE.md](SUPPORT_ROUTER_EVIDENCE.md) | A6: 13 support messages routed by the real model, plus the ticket flow and validation; 30 cases |
| [SUPPORT_ROUTER_FALLBACK_EVIDENCE.md](SUPPORT_ROUTER_FALLBACK_EVIDENCE.md), [SUPPORT_ROUTER_TIMEOUT_EVIDENCE.md](SUPPORT_ROUTER_TIMEOUT_EVIDENCE.md) | A6: the same 30 cases with the model failing, and with the model too slow: every decision from the fallback |
| [SUPPORT_ROUTER_UNIT_EVIDENCE.md](SUPPORT_ROUTER_UNIT_EVIDENCE.md) | A6: 78 unit checks of validation, timeouts, invalid answers, settings and the keyword rules |

## Run it

The deployed API needs no setup: use the live URL above. To run it on your own machine you need
Node.js 22 or newer.

```bash
npm install
npm run db:migrate    # creates the tables and three equipment records; answer "y" if asked
npm run dev           # the API is now on http://localhost:8787
```

Quick check: open <http://localhost:8787/api/equipment> in a browser.

Since assignment A6 the API also calls a Cloudflare Workers AI model. The model runs on Cloudflare
even during `npm run dev`, so wrangler asks you to log in to Cloudflare (`npx wrangler login`) the
first time. The router's unit tests (`npm run test:support:unit`) need Node.js 22.18 or newer,
because they load the TypeScript module directly.

| Command | What it does |
|---|---|
| `npm run dev` | Start the API on port 8787 |
| `npm run db:migrate` | Apply the migrations to the local database |
| `npm run db:reset` | Delete all bookings and support tickets (equipment stays) |
| `npm test` | Run the 32 booking API test cases against the local server and rewrite `TEST_EVIDENCE.md` |
| `npm test -- <base url>` | The same 32 cases against another server, for example the deployed one |
| `npm run test:support` | Run the 30 support-router cases against the local server (real model) and rewrite `SUPPORT_ROUTER_EVIDENCE.md` |
| `npm run dev:fallback`, `npm run test:support:fallback` | Start a server whose model id does not exist (port 8789) and run the 30 cases against it: every decision must come from the fallback, with reason `model_error` |
| `npm run dev:timeout`, `npm run test:support:timeout` | The same with a 1 ms model timeout (port 8790): reason `model_timeout` |
| `npm run test:support:unit` | 78 unit checks of the router with fake models, no server needed |
| `npm run typecheck` | Generate the Worker types and type-check the code |
| `npm run db:migrate:remote` | Apply the migrations to the deployed D1 database |
| `npm run deploy` | Deploy the Worker to Cloudflare |

## Endpoints

| Method | Path | Success | Errors |
|---|---|---:|---|
| `GET` | `/api/equipment` | 200 | |
| `GET` | `/api/bookings` | 200 | |
| `GET` | `/api/bookings/:id` | 200 | 404 |
| `POST` | `/api/bookings` | 201 | 400, 404, 409 |
| `PATCH` | `/api/bookings/:id` | 200 | 400, 404, 409 |
| `DELETE` | `/api/bookings/:id` | 204 | 404 |
| `POST` | `/api/support/route` | 200 | 400, 413 |
| `POST` | `/api/support/tickets` | 201 | 400, 404, 413 |
| `GET` | `/api/support/tickets`, `?queue=<name>` | 200 | 400 |
| `GET` | `/api/support/tickets/:id` | 200 | 404 |
| `DELETE` | `/api/support/tickets/:id` | 204 | 404 |

Every error is JSON: `{ "error": "message" }`. Details are in [API_CONTRACT.md](API_CONTRACT.md).
Opening the base URL itself (`/api`) returns a short index with the API's name and these routes.
The `/api/support/...` routes are the AI capability described
[below](#support-request-router-ai-decision-capability). They exist only on a local server for now:
the deployed API still runs the midterm version, so its index lists the six booking routes and it
answers the support routes with 404.

## Try it with curl

These commands are for a bash-style shell (Git Bash on Windows, or macOS / Linux). They work the
same against the deployed API: set `BASE_URL` to the live URL instead.

```bash
BASE_URL=http://localhost:8787/api

# List equipment
curl -i $BASE_URL/equipment

# Create a booking: 201. Copy the "id" from the response.
curl -i -X POST $BASE_URL/bookings \
  -H 'Content-Type: application/json' \
  -d '{"equipmentId":"eq-1","borrowerName":"Somchai Jaidee","startAt":"2026-10-20T09:00:00.000Z","endAt":"2026-10-20T11:00:00.000Z","purpose":"Class presentation"}'

ID=paste-the-id-here

# Read
curl -i $BASE_URL/bookings
curl -i $BASE_URL/bookings/$ID

# Update: 200
curl -i -X PATCH $BASE_URL/bookings/$ID \
  -H 'Content-Type: application/json' \
  -d '{"purpose":"Thesis defence"}'

# Errors
curl -i -X POST $BASE_URL/bookings -H 'Content-Type: application/json' -d '{"equipmentId":"eq-1"}'   # 400
curl -i $BASE_URL/bookings/does-not-exist                                                           # 404
# Run the "Create a booking" command a second time                                                  # 409

# Delete: 204
curl -i -X DELETE $BASE_URL/bookings/$ID
```

### Windows PowerShell

Two things differ in Windows PowerShell 5.1:

- `curl` is an alias for `Invoke-WebRequest`. Type `curl.exe`.
- JSON written inline after `-d` loses its double quotes on the way to curl, and the API answers
  `400 Request body must be a valid JSON object`. Pipe the JSON in instead:

```powershell
$body = '{"equipmentId":"eq-1","borrowerName":"Somchai Jaidee","startAt":"2026-10-20T09:00:00.000Z","endAt":"2026-10-20T11:00:00.000Z","purpose":"Class presentation"}'
$body | curl.exe -i -X POST http://localhost:8787/api/bookings -H "Content-Type: application/json" --data-binary "@-"
```

## Tests and evidence

For the booking API (the midterm) there are two sets of evidence, produced with curl. Both files
come from runs against the **deployed** API, `https://equipment-booking-api.medcard-api.workers.dev/api`,
on 6 October 2026, and both runs also passed against the local server, `http://localhost:8787/api`,
at that time. The evidence of the A6 support router is described under
[Support request router](#support-request-router-ai-decision-capability).

**The instructor's cURL guide.** [CURL_GUIDE_EVIDENCE.md](CURL_GUIDE_EVIDENCE.md) holds the nine
commands of the guide, run exactly as written: create, read, update, delete, invalid input, not
found and conflict. All nine return the expected status. To repeat it, run this in Git Bash while
`eq-1` has no booking on 2026-10-20:

```bash
# deployed API
bash tests/curl-guide.sh https://equipment-booking-api.medcard-api.workers.dev/api > CURL_GUIDE_EVIDENCE.md

# local server (npm run db:reset first gives a clean start)
bash tests/curl-guide.sh > CURL_GUIDE_EVIDENCE.md
```

**The project's own test suite** goes further, with 32 cases:

```bash
# deployed API
npm test -- https://equipment-booking-api.medcard-api.workers.dev/api

# local server
npm run dev    # terminal 1
npm test       # terminal 2
```

`npm test` runs [tests/run-tests.mjs](tests/run-tests.mjs). It starts a real `curl` process for
each request (the one exception is case 23, the race-condition test, which sends its simultaneous
requests with Node.js `fetch`), compares the status code and body with what the contract promises, and writes every
command and response to [TEST_EVIDENCE.md](TEST_EVIDENCE.md). It works from PowerShell and from
Git Bash. To test another URL: `npm test -- https://example.com/api`.

The tests only create bookings dated 2030, marked `[api-test]`, and delete them afterwards.

| Area | Cases |
|---|---|
| CRUD success: list, create, read, update, delete | 1 to 5, 30 |
| Validation, 400: missing fields, start after end, bad dates, malformed JSON, invalid updates | 6 to 12 |
| Not found, 404: equipment, booking, route | 13 to 16, 22, 31, 32 |
| Conflict, 409: overlap on create, on update, and what is correctly allowed | 17 to 21 |
| Race condition: 20 simultaneous requests for one slot, 40 times | 23 |
| SQL injection attempts in a field and in the URL | 24 to 26 |
| Time zone handling | 27 |
| CORS: preflight, and headers on error responses | 28, 29 |

## Support request router (AI decision capability)

Added for assignment A6 (week 8, AI-native capability design). Students and staff write free-text
messages about equipment and bookings. The router reads one message and decides three things, each
a typed question to a decision model:

| Decision | Question type | Values |
|---|---|---|
| `queue` | choice | `booking_change`, `equipment_fault`, `access_or_account`, `general_question` |
| `urgency` | score | `low`, `normal`, `high` |
| `needsHuman` | noul (yes/no probability) | `true` when a person must read the message before anything happens automatically |

The model is Cloudflare Workers AI `@cf/cloudflare/clef`, a System One decision model with the same
Choice / Score / Noul question types as TypeSafe's Jev. The questions are `DECISION_QUESTIONS` in
[src/support-router.ts](src/support-router.ts). Jev takes the same request with only the model name
changed: [docs/A6/jev-request.json](docs/A6/jev-request.json), which a unit check keeps identical
to what the code builds. It has not been sent to Jev, neither through the Jev API nor in the Jev
Playground. The model returns probabilities, never free text, and every answer is checked against
the schema before it is used. When the model is unavailable, fails, is too slow (8 s), or answers
with something that does not fit, deterministic keyword rules decide instead, the result says
`"source": "fallback"` with a reason, and the decision is flagged for a person
(`needsHuman: true`).

These routes run only on a local server until the A6 version is deployed, so use
`BASE_URL=http://localhost:8787/api` with `npm run dev`:

```bash
# The decision only
curl -i -X POST $BASE_URL/support/route -H 'Content-Type: application/json' \
  -d '{"message":"Camera B is not turning on and I need it for a shoot in 30 minutes!!","context":{"equipmentId":"eq-2"}}'

# Decision plus ticket (the downstream action), then the queue a staff member would read
curl -i -X POST $BASE_URL/support/tickets -H 'Content-Type: application/json' \
  -d '{"message":"I cannot log in to the booking page, it says my student ID is invalid."}'
curl -i "$BASE_URL/support/tickets?queue=access_or_account"
```

A decision looks like this (a real answer from [SUPPORT_ROUTER_EVIDENCE.md](SUPPORT_ROUTER_EVIDENCE.md)):

```json
{
  "queue": "equipment_fault", "urgency": "high", "needsHuman": true, "confidence": 0.9469,
  "source": "model", "model": "@cf/cloudflare/clef", "fallbackReason": null,
  "details": {
    "queueProbabilities": { "booking_change": 0.01, "equipment_fault": 0.9798, "access_or_account": 0.0048, "general_question": 0.0054 },
    "urgencyScore": 1.9461, "urgencyProbabilities": { "low": 0.0105, "normal": 0.033, "high": 0.9565 },
    "needsHumanProbability": 0.6099,
    "reasons": ["the model judged that a person should read this message (probability 0.6099)"],
    "latencyMs": 1294, "inputTokens": 518, "reportedModel": "clef"
  }
}
```

Settings are `vars` in [wrangler.jsonc](wrangler.jsonc) and can be overridden for one run with
`npx wrangler dev --var NAME:value`: `ROUTER_MODEL` (default `@cf/cloudflare/clef`),
`ROUTER_TIMEOUT_MS` (8000; whole milliseconds from 1 to 60000) and `ROUTER_MIN_CONFIDENCE` (0.6, a
decimal from 0 to 1; below it a person must look even when the model answered). A blank, malformed
or out-of-range value is ignored and the default is used.

The model always runs on Cloudflare, also during `npm run dev`, through the login made with
`npx wrangler login`. It counts against the account's free Workers AI allowance of 10,000 neurons
per day; one decision here is about 520 input tokens, about 11 neurons, so the free allowance
covers roughly 880 decisions a day. Cloudflare's documentation says that further requests then
fail with an error, which the router would turn into a fallback decision (`model_error`). That
case was not tested: the allowance was never used up.

Evidence of the model's actual answers for thirteen inputs, of the fallback under a forced outage
and a forced timeout, and of the unit checks is in the four `SUPPORT_ROUTER_*EVIDENCE.md` files
(see the table at the top). The three HTTP evidence files were produced against the local server
(`npm run dev`, `dev:fallback` and `dev:timeout`), because the A6 version is not deployed yet; the
unit evidence needs no server. The full write-up, with the architecture, the validation rules and
the engineering reflection, is the assignment report
[docs/A6/A6_6731503052.md](docs/A6/A6_6731503052.md).

| A6 requirement | Where |
|---|---|
| Task 1: problem, input, output, why AI | Report, section 1 |
| Task 2: decision configuration | `DECISION_QUESTIONS` in [src/support-router.ts](src/support-router.ts); the same request in Jev form in [docs/A6/jev-request.json](docs/A6/jev-request.json) |
| Task 2: output schema | Type `RoutingDecision` in [src/support-router.ts](src/support-router.ts); field table in [API_CONTRACT.md](API_CONTRACT.md#routing-decision-output) |
| Task 2: test inputs and actual outputs | 13 inputs in [tests/support-cases.mjs](tests/support-cases.mjs); responses in [SUPPORT_ROUTER_EVIDENCE.md](SUPPORT_ROUTER_EVIDENCE.md) |
| Task 3: architecture diagram | [docs/A6/architecture.svg](docs/A6/architecture.svg) |
| Task 3: example API request and response | [API_CONTRACT.md](API_CONTRACT.md#support-requests-assignment-a6) |
| Task 3: input and output validation | `validateSupportRequest()` and `parseModelAnswers()` in [src/support-router.ts](src/support-router.ts) |
| Task 3: deterministic fallback, demonstrated | `fallbackDecision()` and `keywordRoute()`; [SUPPORT_ROUTER_FALLBACK_EVIDENCE.md](SUPPORT_ROUTER_FALLBACK_EVIDENCE.md), [SUPPORT_ROUTER_TIMEOUT_EVIDENCE.md](SUPPORT_ROUTER_TIMEOUT_EVIDENCE.md), [SUPPORT_ROUTER_UNIT_EVIDENCE.md](SUPPORT_ROUTER_UNIT_EVIDENCE.md) |
| Task 4: engineering reflection | Report, section 4 |
| Use of AI | [AI_LOG.md](AI_LOG.md), part 2 |

## Connect a frontend tester (CORS)

The brief requires CORS only when a browser-based client is used. This project uses one, the
check page in [tools/browser-check.html](tools/browser-check.html), and is meant to work with the
instructor's frontend tester, so CORS is enabled.

1. Use the deployed API, or start a local one with `npm run dev`.
2. In the tester, set the Base API URL to
   `https://equipment-booking-api.medcard-api.workers.dev/api` or `http://localhost:8787/api`
   (no slash at the end).

Nothing else is needed. A page on another origin may call this API because every response,
including errors, carries `Access-Control-Allow-Origin: *`, and the browser's preflight `OPTIONS`
request is answered with 204 and the allowed methods (`GET, POST, PATCH, DELETE, OPTIONS`) and
headers. The setup is one line in [src/index.ts](src/index.ts): `app.use('*', cors({ ... }))`.

Allowing every origin is safe here because the API uses no cookies, logins or secrets: a web page
can do nothing that curl cannot already do. An API with authentication should list the allowed
origins instead of `*`.

**Check it in a real browser.** curl does not enforce CORS, so curl alone cannot prove it works.
Open [tools/browser-check.html](tools/browser-check.html) by double-clicking it while the API is
running. It performs a create, read, update, conflict and delete from the page and should report
"All checks passed: 7 of 7". This was verified with Chrome 154 and Edge 152, both from a `file://`
page and from a page served on `http://localhost:5173`.

| What you see in the tester or the browser console | Likely cause | Fix |
|---|---|---|
| `Failed to fetch`, `ERR_CONNECTION_REFUSED` | The API is not running, or the port is wrong | `npm run dev`, then check the URL |
| `404 Route not found: GET /bookings` | The Base URL is missing `/api` | Use `http://localhost:8787/api` |
| `404 Route not found: GET /api//bookings` | The Base URL ends with a slash | Remove the last slash |
| `400 ... must be an ISO 8601 date-time with a time zone` | The tester sends a time without `Z` or an offset | Send `2026-10-20T09:00:00.000Z` |
| "blocked by CORS policy" in the console | The response has no CORS headers | Run `curl -i -H "Origin: http://example.com" http://localhost:8787/api/equipment` and look for `access-control-allow-origin: *`. If it is missing, check that the `cors` line still comes before the routes. |
| The browser asks for permission to reach devices on the local network | The tester is hosted on a public `https://` site and is calling `localhost` | Allow it, or open the tester from your own machine |
| Every request takes about two seconds (seen with PowerShell's `Invoke-RestMethod`) | The tool tries IPv6 for `localhost` first; the dev server listens on IPv4 only | Use `http://127.0.0.1:8787/api`, which is the same server |

## How the requirements are met

| Requirement from the brief | Where |
|---|---|
| API contract and assumptions | [API_CONTRACT.md](API_CONTRACT.md) |
| Data model, at least two equipment records | [SCHEMA.md](SCHEMA.md), [migrations/](migrations/) |
| CRUD on `bookings`, `GET /equipment` | Routes in [src/index.ts](src/index.ts) |
| `equipmentId` must exist | `equipmentExists()` in [src/index.ts](src/index.ts), plus a foreign key |
| Start time before end time | `timeRangeError()` in [src/validation.ts](src/validation.ts), plus a `CHECK` |
| No overlapping bookings for the same equipment, on create and on update | `insertBooking` and `updateBooking` in [src/index.ts](src/index.ts) |
| Status codes and JSON errors | `jsonError()`, `app.notFound`, `app.onError` in [src/index.ts](src/index.ts) |
| SQL parameter binding | The `SQL` object in [src/index.ts](src/index.ts): fixed strings, values only through `.bind()` |
| Tested with curl, at least five cases | [CURL_GUIDE_EVIDENCE.md](CURL_GUIDE_EVIDENCE.md): 9 cases, [TEST_EVIDENCE.md](TEST_EVIDENCE.md): 32 cases |
| Quality Gate review, AI log | [QUALITY_GATE_REVIEW.md](QUALITY_GATE_REVIEW.md), [AI_LOG.md](AI_LOG.md) |

## Design decisions

The full list of assumptions, each with the test that verifies it, is in
[API_CONTRACT.md](API_CONTRACT.md#assumptions). The ones that shaped the code:

1. **The overlap check and the write are one SQL statement.** A separate "check, then insert" lets
   two simultaneous requests both pass the check and book the same slot. The numbers from testing
   both versions are in [SCHEMA.md](SCHEMA.md#why-one-statement).
2. **Times are normalised to UTC before they are stored.** Input may use any offset
   (`16:00+07:00`), but only one fixed UTC format is stored, so comparing times is reliable.
3. **Validation lives in pure functions** in [src/validation.ts](src/validation.ts), separate from
   routes and SQL, and reports all problems at once.
4. **Rules are enforced twice where SQLite allows it:** in the API for a clear message, and in the
   database (foreign key, `CHECK`, `NOT NULL`) as the last line of defence.
5. **An unknown `equipmentId` is 404.** The payload is valid; the thing it refers to is missing.

## Security

- **SQL injection:** every statement is a fixed string, and request data is passed only with
  `.bind()`. Cases 24 to 26 send SQL in a field and in the URL; it is stored or compared as plain
  text.
- **Input is never trusted:** type, presence, length and date format are checked on the server for
  every write. Only five named fields are read from a body, so a client cannot set `id` or the
  timestamps.
- **Errors do not leak internals:** an unexpected failure returns `500 Internal server error`; the
  stack trace goes to the server log only.
- **Not included: authentication.** The brief defines no users, so anyone who can reach the API can
  change any booking. A real deployment would add a login and check on every `/bookings/:id`
  request that the caller owns that booking.
- **Support router (A6).** The five `/api/support` routes have no authentication either: anyone
  who can reach the API can read and delete every ticket, and every routing request spends model
  tokens from the account's daily allowance. Message text is sent to Cloudflare Workers AI and kept
  in `support_tickets` with no retention limit. What is in place: bodies over 16 KB are refused
  with 413 (from the `Content-Length` header before anything is read; a body sent without a length
  is read only until it passes 16 KB), messages are limited to 2000 characters, control characters are
  refused, the error text of the AI service is cut to 200 characters, and a fallback is logged
  without the message text. A public deployment needs a staff login for the ticket routes, a rate
  limit and a retention rule (see the risks in the [A6 report](docs/A6/A6_6731503052.md)).

## Project layout

```text
src/index.ts              routes, SQL statements, CORS, error handling
src/validation.ts         validation of booking payloads (no database, no HTTP)
src/support-router.ts     A6: the AI support-request router: questions, model call, validation of the
                          answer, policy, keyword fallback, input validation (no database, no HTTP)
migrations/               D1 schema and seed data (0003 adds support_tickets)
tests/curl.mjs            curl helpers shared by the test runners
tests/curl-guide.sh       the instructor's nine curl commands, writes CURL_GUIDE_EVIDENCE.md
tests/run-tests.mjs       32 booking API tests (curl, plus fetch for the race case), writes TEST_EVIDENCE.md
tests/support-cases.mjs   A6: the 13 routing inputs and the decisions expected from them
tests/run-support-tests.mjs   A6: 30 HTTP cases, model mode or fallback mode, writes SUPPORT_ROUTER_*EVIDENCE.md
tests/support-router.unit.mjs A6: 78 unit checks with fake models, writes SUPPORT_ROUTER_UNIT_EVIDENCE.md
tests/fixtures/           A6: a recorded raw answer of the model, used by the unit tests
tools/browser-check.html  one-page CORS check for a real browser
docs/A6/                  A6 report (Markdown source, HTML, PDF), architecture.svg, jev-request.json
                          (the decision request in Jev form), build-report.mjs (Markdown to HTML;
                          its header gives the PDF step)
wrangler.jsonc            Worker, D1 and Workers AI configuration, router settings
```

## Limits and future work

- The overlap rule is enforced by the API, not by a database constraint. See
  [SCHEMA.md](SCHEMA.md#known-limit).
- `GET /bookings` returns everything. With many bookings it would need pagination and a filter by
  equipment.
- The deployed API is public and has no authentication, like the local one. Anyone with the URL
  can create, change or delete bookings.
- On Cloudflare, a URL that contains an encoded NUL byte (`%00`) is rejected by Cloudflare itself
  with an HTML 400 page before the request reaches the API. That one response is not JSON and
  cannot be changed from the API's code.
- Times are accepted with at most three decimals of a second. A value with more, such as
  `10:00:00.0001Z`, is rejected with 400.
- The support router has no authentication or rate limit (see Security above), and
  `GET /api/support/tickets` returns every ticket without pagination.

## Deployment

The API is deployed as the Cloudflare Worker `equipment-booking-api` with the D1 database
`equipment-booking-db`. These are the commands that were used:

```bash
npx wrangler login
npx wrangler d1 create equipment-booking-db    # the printed id goes into wrangler.jsonc
npm run db:migrate:remote                      # tables and seed data in the deployed database
npm run deploy
```

Local development is separate: `npm run dev` uses its own database in `.wrangler/` and never
touches the deployed one. The Workers AI model is the exception: it always runs on Cloudflare.

The version with the support router (A6) has not been deployed yet. To deploy it, run
`npm run db:migrate:remote` first (it creates `support_tickets` in the deployed database), then
`npm run deploy`.
