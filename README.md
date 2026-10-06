# Campus Equipment Booking API

A REST API for reserving shared faculty equipment such as projectors, cameras and meeting rooms.
The same equipment cannot be booked for overlapping times.

Midterm practical lab test, 1305308 Platform Development. Student ID 6731503052.

- **Stack:** TypeScript, Hono, Cloudflare Workers runtime (`wrangler dev`), D1 / SQLite (local)
- **Base API URL:** `http://localhost:8787/api`

| Document | Contents |
|---|---|
| [API_CONTRACT.md](API_CONTRACT.md) | Endpoints, payloads, status codes and why, assumptions |
| [SCHEMA.md](SCHEMA.md) | ERD, tables, constraints, the overlap rule |
| [CURL_GUIDE_EVIDENCE.md](CURL_GUIDE_EVIDENCE.md) | The nine commands of the instructor's cURL guide, run as written, with their output |
| [TEST_EVIDENCE.md](TEST_EVIDENCE.md) | 32 further test cases with the commands and the responses they produced |
| [QUALITY_GATE_REVIEW.md](QUALITY_GATE_REVIEW.md) | Quality Gate review: findings, fixes and evidence |
| [AI_LOG.md](AI_LOG.md) | How AI was used and what was verified |

## Run it

Needs Node.js 22 or newer.

```bash
npm install
npm run db:migrate    # creates the tables and three equipment records; answer "y" if asked
npm run dev           # the API is now on http://localhost:8787
```

Quick check: open <http://localhost:8787/api/equipment> in a browser.

| Command | What it does |
|---|---|
| `npm run dev` | Start the API on port 8787 |
| `npm run db:migrate` | Apply the migrations to the local database |
| `npm run db:reset` | Delete all bookings (equipment stays) |
| `npm test` | Run the 32 API test cases and rewrite `TEST_EVIDENCE.md` (the API must be running) |
| `npm run typecheck` | Generate the Worker types and type-check the code |

## Endpoints

| Method | Path | Success | Errors |
|---|---|---:|---|
| `GET` | `/api/equipment` | 200 | |
| `GET` | `/api/bookings` | 200 | |
| `GET` | `/api/bookings/:id` | 200 | 404 |
| `POST` | `/api/bookings` | 201 | 400, 404, 409 |
| `PATCH` | `/api/bookings/:id` | 200 | 400, 404, 409 |
| `DELETE` | `/api/bookings/:id` | 204 | 404 |

Every error is JSON: `{ "error": "message" }`. Details are in [API_CONTRACT.md](API_CONTRACT.md).

## Try it with curl

These commands are for a bash-style shell (Git Bash on Windows, or macOS / Linux).

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

There are two sets of evidence, both produced with curl against `http://localhost:8787/api`.

**The instructor's cURL guide.** [CURL_GUIDE_EVIDENCE.md](CURL_GUIDE_EVIDENCE.md) holds the nine
commands of the guide, run exactly as written: create, read, update, delete, invalid input, not
found and conflict. All nine return the expected status. To repeat it, start from no bookings and
run this in Git Bash:

```bash
npm run db:reset
bash tests/curl-guide.sh > CURL_GUIDE_EVIDENCE.md
```

**The project's own test suite** goes further, with 32 cases:

```bash
npm run dev    # terminal 1
npm test       # terminal 2
```

`npm test` runs [tests/run-tests.mjs](tests/run-tests.mjs). It starts a real `curl` process for
each request, compares the status code and body with what the contract promises, and writes every
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

## Connect a frontend tester (CORS)

The brief requires CORS only when a browser-based client is used. This project uses one, the
check page in [tools/browser-check.html](tools/browser-check.html), and is meant to work with the
instructor's frontend tester, so CORS is enabled.

1. Start the API with `npm run dev`.
2. In the tester, set the Base API URL to `http://localhost:8787/api` (no slash at the end).

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

## Project layout

```text
src/index.ts          routes, SQL statements, CORS, error handling
src/validation.ts     validation of booking payloads (no database, no HTTP)
migrations/           D1 schema and seed data
tests/curl-guide.sh   the instructor's nine curl commands, writes CURL_GUIDE_EVIDENCE.md
tests/run-tests.mjs   32 curl-based API tests, writes TEST_EVIDENCE.md
tools/browser-check.html   one-page CORS check for a real browser
wrangler.jsonc        Worker and D1 configuration
```

## Limits and future work

- The overlap rule is enforced by the API, not by a database constraint. See
  [SCHEMA.md](SCHEMA.md#known-limit).
- `GET /bookings` returns everything. With many bookings it would need pagination and a filter by
  equipment.
- The project runs locally. Deploying needs a real D1 database id in
  [wrangler.jsonc](wrangler.jsonc) and `wrangler d1 migrations apply equipment-booking-db --remote`.
