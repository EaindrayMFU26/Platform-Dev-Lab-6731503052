# Quality Gate Review

Review of the Campus Equipment Booking API against the instructor's Quality Gate
(`quality_gate.md`) and cURL Quick Test Guide (`curl_test_guide.md`), 6 October 2026.

**Who did what.** The checks below were run by the AI assistant (Claude Code) at the student's
request, and everything in this file that is marked *Verified* was produced by a command or test
on the student's machine. The items marked *Student* are statements about the student's own
understanding. No tool can confirm those, so they are left open here for the student to complete.
The same split is recorded in [AI_LOG.md](AI_LOG.md).

## Improvements: finding, action taken, evidence

Times are local time on 6 October 2026. The first source file was created at 14:28.

| # | Quality Gate area | Finding | Action taken | Evidence |
|--:|---|---|---|---|
| 1 | **Reliability** (data is saved and retrieved consistently) | In the first runnable version no booking could be saved: every `POST /bookings` returned 500. The schema checked the time format with a `GLOB` pattern, and D1 rejects LIKE/GLOB patterns longer than 50 bytes when they run. The first test run (about 14:33) failed 15 of 32 cases. | Replaced the pattern with a `CHECK` that compares the value with SQLite's own rendering of it (`strftime`), which is also stricter, and rebuilt the database from the migration (14:37). | Guide step 3 returns 201 in [CURL_GUIDE_EVIDENCE.md](CURL_GUIDE_EVIDENCE.md). 32 of 32 cases pass in [TEST_EVIDENCE.md](TEST_EVIDENCE.md). The limit was confirmed locally: a 50-byte pattern runs, a 51-byte pattern fails. |
| 2 | **Reliability** (creating or updating cannot create an overlap) | The test for two people booking the same slot at the same moment could not detect a double booking. It started five separate curl processes, and it still passed when the code was temporarily replaced by a naive "check, then insert". | Measured both versions with 20 requests in flight at once, 40 times, and rewrote test case 23 to work that way (14:45). The naive version was a temporary experiment and was reverted. | Naive version: double bookings in 4 of 40 rounds, up to 17 bookings stored for one slot. Code in this repository: 0 of 40. Case 23 on the final run: 40 x 201, 760 x 409, 40 bookings stored. |
| 3 | **Accuracy** (test results contain the correct values) | After finding 1, several test cases "passed" by accident: they requested `/bookings/undefined` and received the 404 they expected. A passing result did not prove what it claimed. | Cases that depend on an earlier booking now fail explicitly when it is missing, and the unknown-equipment update case also checks the error message (14:37). | `need()` in [tests/run-tests.mjs](tests/run-tests.mjs). Case 22 expects the message to name `eq-999`. |
| 4 | **Reasoning** (required behaviour versus optional design choices) | The contract listed assumptions, but nothing separated what the brief requires from what was chosen freely, for example the 404 for unknown equipment, the length limits, UTC storage and the extra response fields. | Added "Required behaviour and optional choices" to the contract (15:09). | [API_CONTRACT.md](API_CONTRACT.md#required-behaviour-and-optional-choices) |
| 5 | **Execution Value** and **Delivery Quality** (tested with curl, evidence recorded) | There was evidence from the project's own tests, but none for the instructor's guide, which is what a marker is most likely to run. | Ran the nine guide commands exactly as written and saved the output (15:04). Added [tests/curl-guide.sh](tests/curl-guide.sh) so the run can be repeated. | [CURL_GUIDE_EVIDENCE.md](CURL_GUIDE_EVIDENCE.md): 9 of 9 expected status codes. |
| 6 | **Delivery Quality** (CORS only if a browser-based client is used; usable by a browser client) | CORS was enabled, but the README did not say why. CORS headers were also only sent under `/api/*`, so a browser client with a wrong Base URL would have shown a CORS error instead of the real cause, a 404. | The README now states that CORS is included because a browser-based client is used. CORS is applied to every route (14:51). | `curl -i -H "Origin: http://localhost:5173" http://localhost:8787/bookings` returns a JSON 404 with `Access-Control-Allow-Origin: *`. [tools/browser-check.html](tools/browser-check.html) passes 7 of 7 in Chrome and Edge. |
| 7 | **Purpose** (required deliverables) and **You Own It** (truthful AI log) | `QUALITY_GATE_REVIEW.md` did not exist, and `AI_LOG.md` did not yet record the third prompt or this review. | Created this file and updated the log (15:11 to 15:13). | This file. [AI_LOG.md](AI_LOG.md), sections 2 and 6. |
| 8 | **Purpose** (submission instructions) and **Execution Value** | The updated submission requirements ask for a link to the source code and a link to the API on Cloudflare. Nothing was committed, and the API had only ever run locally. | Committed and pushed to GitHub (15:18). Created the D1 database, applied the migrations and deployed the Worker (15:25). Regenerated both evidence files against the deployed API. | Source: <https://github.com/EaindrayMFU26/Platform-Dev-Lab-6731503052>. API: <https://equipment-booking-api.medcard-api.workers.dev/api>. [CURL_GUIDE_EVIDENCE.md](CURL_GUIDE_EVIDENCE.md): 9 of 9. [TEST_EVIDENCE.md](TEST_EVIDENCE.md): 32 of 32, both against the deployed URL. |
| 9 | **Reliability** (invalid requests do not crash the API) | An independent review of the deployed API (about 200 further requests by separate AI agents, 15:28 to 15:33) found no contract or business-rule violation, but one crash: a `borrowerName` or `purpose` beginning with a NUL character returned 500 instead of 400. JavaScript's `trim()` keeps a NUL, so validation accepted the text, while SQLite treats a NUL as the end of the text, so the database's "not blank" `CHECK` rejected it. | Text fields containing a NUL character are now rejected with 400 in [src/validation.ts](src/validation.ts), and the API was redeployed (15:35). | On the deployed API, `POST /bookings` with `"borrowerName":"\u0000"`, with a `purpose` starting with `\u0000`, and `PATCH` with `"borrowerName":"\u0000Bob"` each return `400 {"error":"... must not contain NUL characters"}`. |
| 10 | **Execution Value** (the submitted link works) | Opening the submitted API link itself, `/api`, showed `{"error":"Route not found: GET /api"}`, because only `/api/equipment` and `/api/bookings` were routes. The API worked, but the link looked broken. The same review also found three small errors in the documents. | The base URL now answers with a short index (name and endpoints), with or without a trailing slash and with query parameters (15:35 to 15:37). The documents were corrected. | `GET https://equipment-booking-api.medcard-api.workers.dev/api?classId=x` returns 200 with the index. |

## Checks that found nothing to fix

These were run because of the Quality Gate. They changed nothing, and are recorded as evidence.

| Quality Gate item | Check | Result |
|---|---|---|
| Routes, bodies, responses and status codes match the common contract | The nine guide commands, run as written | 9 of 9 |
| The API handles invalid requests without crashing | 44 unusual requests, most of them malformed or hostile: wrong JSON types, a 2 MB body, 5,000 levels of nesting, 20,000 unknown properties, NUL characters, invalid percent-encoding, methods and routes outside the contract | No 5xx response. Every error body is exactly `{ "error": "..." }`. Thai and emoji text came back unchanged. |
| Every error response uses the required JSON format, including unexpected failures | Renamed the `bookings` table while the server was running, called the API, then renamed it back | `500 {"error":"Internal server error"}` as JSON. The database message appeared only in the server log. The equipment endpoint kept working, and bookings worked again without a restart. |
| Data is saved and retrieved consistently | Created a booking, stopped the server completely, started it again, read the booking | Still there, with identical values |
| The API can be run by following the README | Copied only the files that would be committed into an empty folder, then `npm install`, `npm run db:migrate`, `npm run dev`, `npm test`, `npm run typecheck` | Server started; 32 of 32 cases; no type errors |
| No request data is concatenated into SQL | Read every database call in `src/` | All ten `prepare()` calls use a fixed statement from the `SQL` object, and values are passed only with `.bind()` |
| No unrelated features | Compared the routes with the contract | Only the six contract routes exist, plus a short index at the base URL (improvement 10). The extras are tests, documentation and one optional browser check page. |

## Checklist status

*Verified* means a test or command showed it. *Student* means only the student can confirm it.

| Area | Item | Status |
|---|---|---|
| 1. Purpose | API solves the booking problem | Verified: guide 9 of 9, suite 32 of 32 |
| | Routes, bodies, responses and status codes match the contract | Verified: guide run as written |
| | Required deliverables and submission instructions | Files are complete, pushed to GitHub and the API is deployed (improvement 8). **Open:** see "Open items" |
| | No unrelated features | Verified (table above) |
| 2. Reliability | Data saved and retrieved consistently | Verified: restart check |
| | Create and update cannot create an overlap | Verified: cases 17, 20, 21, 23 and guide step 7 |
| | `equipmentId` is checked | Verified: cases 13 and 22 |
| | Invalid requests do not crash the API | Verified: cases 6 to 12 and the 44 unusual requests |
| 3. Course Context | Task, contract and permitted stack (TypeScript, Hono, local D1 / SQLite) | Verified for the stack. **Student:** whether an instructor starter repository was meant to be used; none was available during the build |
| | I understand which parts were AI-assisted | **Student.** Fact: all code and documents were generated by AI (AI_LOG.md) |
| | Only permitted sources; AI assistance recorded | AI use is recorded in full. **Student:** confirm no other sources |
| | I can identify the important files, routes, schema and commands | **Student.** Listed in the README |
| 4. Reasoning | I can explain 400, 404 and 409 | **Student.** Written down in API_CONTRACT.md, "Why 400, 404 and 409" |
| | I can explain the overlap check for create and update | **Student.** Written down in SCHEMA.md, "The overlap rule" |
| | I can distinguish required behaviour from optional choices | **Student.** Written down in API_CONTRACT.md (improvement 4) |
| | I can explain limitations and assumptions | **Student.** Written down in API_CONTRACT.md and SCHEMA.md, "Known limit" |
| 5. Execution Value | Runs by following the README | Verified: clean-copy run |
| | Equipment endpoint and all booking CRUD endpoints work | Verified: guide steps 1 to 5 and 9 |
| | Tested with curl, results recorded | Verified: two evidence files |
| | Effort focused on the required work | Verified (table above) |
| 6. Accuracy | Fields, dates, ids and responses hold correct values | Verified: cases 2, 5, 26 and 27 compare the returned values |
| | `startAt` before `endAt` is validated | Verified: guide step 6, cases 7 and 11 |
| | Every error is `{ "error": "..." }` | Verified: checked automatically for every error case, plus the forced 500 |
| | Parameter binding, no concatenation | Verified: cases 24 to 26 and the code read-through |
| 7. Delivery Quality | Runnable source and clear run instructions | Verified: clean-copy run |
| | API contract and schema / ERD included | Verified: API_CONTRACT.md, SCHEMA.md |
| | CORS only because a browser-based client is used | Verified: stated in the README; the client is tools/browser-check.html |
| | Evidence for at least five cases, success and error | Verified: 9 + 32 cases |
| | Files named clearly and complete | Verified against the list in the brief |
| 8. You Own It | I can explain every important route, rule, query and test result | **Student** |
| | AI_LOG.md is truthful | The AI's part is recorded in full. **Student:** complete section 7 |
| | I can explain what changed after this review and why | **Student.** The changes are the ten rows at the top of this file |
| | I am ready for follow-up questions | **Student** |

## Open items

1. **No snapshot of a first version at minute 30.** The first commit (13:48) contains only the
   brief and the rubric. The first source file was written at 14:28, and no commit or screenshot
   was made before the Quality Gate was applied. A snapshot cannot be created afterwards. The
   first commit of the project was made at 15:18, after this review. What exists instead is the
   record of the first test run in improvement 1.
2. **The student's own verification is not done.** Section 7 of AI_LOG.md and every *Student* row
   above are still open.
3. **Not tested:** the instructor's frontend tester and starter repository, which were not
   available. CORS was tested with the project's own page instead.

Closed since the first version of this review: the project is committed, pushed and deployed
(improvement 8).

## Submission decision

The decision is the student's. On the technical side there is no known defect, and every check
that a tool can run has passed, locally and against the deployed API. Under the Quality Gate's
own rule ("if you cannot explain a key part of your solution, stop and resolve it before
submitting"), the decision should be READY only once open item 2 is closed.
