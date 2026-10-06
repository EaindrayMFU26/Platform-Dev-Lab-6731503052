# Test Evidence

- **Base API URL:** `https://equipment-booking-api.medcard-api.workers.dev/api`
- **Result:** 32 passed, 0 failed (32 cases)
- **Run at:** 2026-10-06T08:26:24.532Z (local time: Tue Oct 06 2026 15:26:24 GMT+0700 (Indochina Time))
- **HTTP client:** curl 8.4.0 (x86_64-w64-mingw32) libcurl/8.4.0 Schannel zlib/1.3 brotli/1.1.0 zstd/1.5.5 libidn2/2.3.4 libpsl/0.21.2 (+libidn2/2.3.3) libssh2/1.11.0
- **How it was run:** `npm test -- https://equipment-booking-api.medcard-api.workers.dev/api` (`tests/run-tests.mjs` starts one real `curl` process per request and records what it printed)
- **Server under test:** the deployed Cloudflare Worker with its remote D1 database

Each curl command below is shown exactly as it was run, except that `-s -S --max-time 20` was added to every
command (no progress meter, 20 second limit). The commands are written for a bash-style shell such as Git Bash.
The one exception is the race-condition case, which needs many requests in flight at once and therefore uses
Node.js `fetch` instead of curl; its section says so.

For every case that expects an error, the runner also checked that the response is JSON of the form
`{ "error": "<message>" }` with no other properties.

Test data: every booking is dated 2030 and marked `[api-test]` in `purpose`. 0 leftover booking(s) from an earlier run were removed before the run, and the 44 booking(s) still present at the end were deleted afterwards.

## Summary

| # | Case | Request | Expected | Actual | Result |
|--:|------|---------|----------|--------|--------|
| 1 | List equipment | `GET /equipment` | 200 | 200 | PASS |
| 2 | Create a booking | `POST /bookings` | 201 | 201 | PASS |
| 3 | List bookings | `GET /bookings` | 200 | 200 | PASS |
| 4 | Get one booking | `GET /bookings/9b5614a6-099b-4e8c-8f0f-babbf682535b` | 200 | 200 | PASS |
| 5 | Update a booking (partial) | `PATCH /bookings/9b5614a6-099b-4e8c-8f0f-babbf682535b` | 200 | 200 | PASS |
| 6 | Missing required fields | `POST /bookings` | 400 | 400 | PASS |
| 7 | Start time not before end time | `POST /bookings` | 400 | 400 | PASS |
| 8 | Value that is not a date-time | `POST /bookings` | 400 | 400 | PASS |
| 9 | Impossible calendar date (30 February) | `POST /bookings` | 400 | 400 | PASS |
| 10 | Malformed JSON body | `POST /bookings` | 400 | 400 | PASS |
| 11 | Update that makes the time range invalid | `PATCH /bookings/9b5614a6-099b-4e8c-8f0f-babbf682535b` | 400 | 400 | PASS |
| 12 | Update with nothing to change | `PATCH /bookings/9b5614a6-099b-4e8c-8f0f-babbf682535b` | 400 | 400 | PASS |
| 13 | Unknown equipment | `POST /bookings` | 404 | 404 | PASS |
| 14 | Unknown booking id | `GET /bookings/does-not-exist` | 404 | 404 | PASS |
| 15 | Update an unknown booking | `PATCH /bookings/does-not-exist` | 404 | 404 | PASS |
| 16 | Unknown route | `GET /rooms` | 404 | 404 | PASS |
| 17 | Overlapping booking (create) | `POST /bookings` | 409 | 409 | PASS |
| 18 | Same time, different equipment | `POST /bookings` | 201 | 201 | PASS |
| 19 | Back-to-back booking | `POST /bookings` | 201 | 201 | PASS |
| 20 | Overlapping booking (update the time) | `PATCH /bookings/fa55d278-974c-4a72-b2b2-286ac2ebd8a8` | 409 | 409 | PASS |
| 21 | Overlapping booking (update the equipment) | `PATCH /bookings/7968d6c4-143a-4c62-8be4-7a66301c3cb6` | 409 | 409 | PASS |
| 22 | Update to unknown equipment | `PATCH /bookings/7968d6c4-143a-4c62-8be4-7a66301c3cb6` | 404 | 404 | PASS |
| 23 | Simultaneous requests for the same slot | `40 rounds x 20 simultaneous POST /bookings` | 40 x 201 (one per round), 760 x 409 | 40 x 201, 760 x 409 | PASS |
| 24 | SQL injection attempt in a field | `POST /bookings` | 201 | 201 | PASS |
| 25 | SQL injection attempt in the URL | `GET /bookings/x' OR '1'='1` | 404 | 404 | PASS |
| 26 | Table intact after the injection attempts | `GET /bookings/4907bd96-4bad-4274-ad2a-67845f8d32d5` | 200 | 200 | PASS |
| 27 | Time zone offset is normalised to UTC | `POST /bookings` | 201 | 201 | PASS |
| 28 | CORS preflight | `OPTIONS /bookings` | 204 | 204 | PASS |
| 29 | CORS headers on an error response | `GET /bookings/does-not-exist` | 404 | 404 | PASS |
| 30 | Delete a booking | `DELETE /bookings/9b5614a6-099b-4e8c-8f0f-babbf682535b` | 204 | 204 | PASS |
| 31 | Deleted booking is gone | `GET /bookings/9b5614a6-099b-4e8c-8f0f-babbf682535b` | 404 | 404 | PASS |
| 32 | Delete the same booking again | `DELETE /bookings/9b5614a6-099b-4e8c-8f0f-babbf682535b` | 404 | 404 | PASS |

## Details

### 1. List equipment: PASS

At least two equipment records exist and are returned as an array of { id, name, location }.

Expected: 200. Actual: 200.

```bash
curl -i https://equipment-booking-api.medcard-api.workers.dev/api/equipment
```

```http
HTTP/1.1 200 OK
content-type: application/json
access-control-allow-origin: *

[{"id":"eq-1","name":"Projector A","location":"Building 1"},{"id":"eq-2","name":"Camera B","location":"Media Lab"},{"id":"eq-3","name":"Meeting Room C","location":"Building 2"}]
```

### 2. Create a booking: PASS

A valid payload is stored and returned with a server-generated id.

Expected: 201. Actual: 201.

```bash
curl -i -X POST https://equipment-booking-api.medcard-api.workers.dev/api/bookings \
  -H 'Content-Type: application/json' \
  -d '{"equipmentId":"eq-1","borrowerName":"Somchai Jaidee","startAt":"2030-01-15T09:00:00.000Z","endAt":"2030-01-15T11:00:00.000Z","purpose":"[api-test] Class presentation"}'
```

```http
HTTP/1.1 201 Created
content-type: application/json
access-control-allow-origin: *

{"id":"9b5614a6-099b-4e8c-8f0f-babbf682535b","equipmentId":"eq-1","borrowerName":"Somchai Jaidee","startAt":"2030-01-15T09:00:00.000Z","endAt":"2030-01-15T11:00:00.000Z","purpose":"[api-test] Class presentation","createdAt":"2026-10-06T08:26:25.840Z","updatedAt":"2026-10-06T08:26:25.840Z"}
```

### 3. List bookings: PASS

The new booking appears in the list.

Expected: 200. Actual: 200.

```bash
curl -i https://equipment-booking-api.medcard-api.workers.dev/api/bookings
```

```http
HTTP/1.1 200 OK
content-type: application/json
access-control-allow-origin: *

[{"id":"9b5614a6-099b-4e8c-8f0f-babbf682535b","equipmentId":"eq-1","borrowerName":"Somchai Jaidee","startAt":"2030-01-15T09:00:00.000Z","endAt":"2030-01-15T11:00:00.000Z","purpose":"[api-test] Class presentation","createdAt":"2026-10-06T08:26:25.840Z","updatedAt":"2026-10-06T08:26:25.840Z"}]
```

### 4. Get one booking: PASS

A booking can be fetched by id.

Expected: 200. Actual: 200.

```bash
curl -i https://equipment-booking-api.medcard-api.workers.dev/api/bookings/9b5614a6-099b-4e8c-8f0f-babbf682535b
```

```http
HTTP/1.1 200 OK
content-type: application/json
access-control-allow-origin: *

{"id":"9b5614a6-099b-4e8c-8f0f-babbf682535b","equipmentId":"eq-1","borrowerName":"Somchai Jaidee","startAt":"2030-01-15T09:00:00.000Z","endAt":"2030-01-15T11:00:00.000Z","purpose":"[api-test] Class presentation","createdAt":"2026-10-06T08:26:25.840Z","updatedAt":"2026-10-06T08:26:25.840Z"}
```

### 5. Update a booking (partial): PASS

PATCH changes only the fields sent. Extending the end time overlaps the booking's own old slot, which must not count as a conflict.

Expected: 200. Actual: 200.

```bash
curl -i -X PATCH https://equipment-booking-api.medcard-api.workers.dev/api/bookings/9b5614a6-099b-4e8c-8f0f-babbf682535b \
  -H 'Content-Type: application/json' \
  -d '{"endAt":"2030-01-15T12:00:00.000Z","purpose":"[api-test] Rescheduled presentation"}'
```

```http
HTTP/1.1 200 OK
content-type: application/json
access-control-allow-origin: *

{"id":"9b5614a6-099b-4e8c-8f0f-babbf682535b","equipmentId":"eq-1","borrowerName":"Somchai Jaidee","startAt":"2030-01-15T09:00:00.000Z","endAt":"2030-01-15T12:00:00.000Z","purpose":"[api-test] Rescheduled presentation","createdAt":"2026-10-06T08:26:25.840Z","updatedAt":"2026-10-06T08:26:27.886Z"}
```

### 6. Missing required fields: PASS

Missing data is a client error: 400, and the message names every missing field.

Expected: 400. Actual: 400.

```bash
curl -i -X POST https://equipment-booking-api.medcard-api.workers.dev/api/bookings \
  -H 'Content-Type: application/json' \
  -d '{"equipmentId":"eq-1"}'
```

```http
HTTP/1.1 400 Bad Request
content-type: application/json
access-control-allow-origin: *

{"error":"borrowerName is required; startAt is required; endAt is required; purpose is required"}
```

### 7. Start time not before end time: PASS

startAt must be before endAt.

Expected: 400. Actual: 400.

```bash
curl -i -X POST https://equipment-booking-api.medcard-api.workers.dev/api/bookings \
  -H 'Content-Type: application/json' \
  -d '{"equipmentId":"eq-1","borrowerName":"Somchai Jaidee","startAt":"2030-01-15T15:00:00.000Z","endAt":"2030-01-15T14:00:00.000Z","purpose":"[api-test] Class presentation"}'
```

```http
HTTP/1.1 400 Bad Request
content-type: application/json
access-control-allow-origin: *

{"error":"startAt must be before endAt"}
```

### 8. Value that is not a date-time: PASS

startAt and endAt must be ISO 8601 date-times with a time zone.

Expected: 400. Actual: 400.

```bash
curl -i -X POST https://equipment-booking-api.medcard-api.workers.dev/api/bookings \
  -H 'Content-Type: application/json' \
  -d '{"equipmentId":"eq-1","borrowerName":"Somchai Jaidee","startAt":"tomorrow 9am","endAt":"2030-01-15T11:00:00.000Z","purpose":"[api-test] Class presentation"}'
```

```http
HTTP/1.1 400 Bad Request
content-type: application/json
access-control-allow-origin: *

{"error":"startAt must be an ISO 8601 date-time with a time zone, e.g. 2026-10-20T09:00:00.000Z"}
```

### 9. Impossible calendar date (30 February): PASS

JavaScript would silently turn 30 February into 2 March. The API rejects it instead of booking the wrong day.

Expected: 400. Actual: 400.

```bash
curl -i -X POST https://equipment-booking-api.medcard-api.workers.dev/api/bookings \
  -H 'Content-Type: application/json' \
  -d '{"equipmentId":"eq-1","borrowerName":"Somchai Jaidee","startAt":"2030-02-30T09:00:00.000Z","endAt":"2030-03-05T09:00:00.000Z","purpose":"[api-test] Class presentation"}'
```

```http
HTTP/1.1 400 Bad Request
content-type: application/json
access-control-allow-origin: *

{"error":"startAt must be an ISO 8601 date-time with a time zone, e.g. 2026-10-20T09:00:00.000Z"}
```

### 10. Malformed JSON body: PASS

A body that cannot be parsed is a client error, not a server crash.

Expected: 400. Actual: 400.

```bash
curl -i -X POST https://equipment-booking-api.medcard-api.workers.dev/api/bookings \
  -H 'Content-Type: application/json' \
  -d '{"equipmentId": "eq-1",'
```

```http
HTTP/1.1 400 Bad Request
content-type: application/json
access-control-allow-origin: *

{"error":"Request body must be a valid JSON object"}
```

### 11. Update that makes the time range invalid: PASS

The start/end rule is re-checked on update against the stored values (stored start is 09:00).

Expected: 400. Actual: 400.

```bash
curl -i -X PATCH https://equipment-booking-api.medcard-api.workers.dev/api/bookings/9b5614a6-099b-4e8c-8f0f-babbf682535b \
  -H 'Content-Type: application/json' \
  -d '{"endAt":"2030-01-15T08:00:00.000Z"}'
```

```http
HTTP/1.1 400 Bad Request
content-type: application/json
access-control-allow-origin: *

{"error":"startAt must be before endAt"}
```

### 12. Update with nothing to change: PASS

An empty PATCH is rejected instead of silently doing nothing.

Expected: 400. Actual: 400.

```bash
curl -i -X PATCH https://equipment-booking-api.medcard-api.workers.dev/api/bookings/9b5614a6-099b-4e8c-8f0f-babbf682535b \
  -H 'Content-Type: application/json' \
  -d '{}'
```

```http
HTTP/1.1 400 Bad Request
content-type: application/json
access-control-allow-origin: *

{"error":"Provide at least one field to update: equipmentId, borrowerName, startAt, endAt, purpose"}
```

### 13. Unknown equipment: PASS

equipmentId must refer to existing equipment. The payload is well formed but the resource it points to does not exist: 404.

Expected: 404. Actual: 404.

```bash
curl -i -X POST https://equipment-booking-api.medcard-api.workers.dev/api/bookings \
  -H 'Content-Type: application/json' \
  -d '{"equipmentId":"eq-999","borrowerName":"Somchai Jaidee","startAt":"2030-01-15T09:00:00.000Z","endAt":"2030-01-15T11:00:00.000Z","purpose":"[api-test] Class presentation"}'
```

```http
HTTP/1.1 404 Not Found
content-type: application/json
access-control-allow-origin: *

{"error":"Equipment 'eq-999' not found"}
```

### 14. Unknown booking id: PASS

Reading a booking that does not exist is 404.

Expected: 404. Actual: 404.

```bash
curl -i https://equipment-booking-api.medcard-api.workers.dev/api/bookings/does-not-exist
```

```http
HTTP/1.1 404 Not Found
content-type: application/json
access-control-allow-origin: *

{"error":"Booking not found"}
```

### 15. Update an unknown booking: PASS

Updating a booking that does not exist is 404.

Expected: 404. Actual: 404.

```bash
curl -i -X PATCH https://equipment-booking-api.medcard-api.workers.dev/api/bookings/does-not-exist \
  -H 'Content-Type: application/json' \
  -d '{"purpose":"[api-test] Nothing to update"}'
```

```http
HTTP/1.1 404 Not Found
content-type: application/json
access-control-allow-origin: *

{"error":"Booking not found"}
```

### 16. Unknown route: PASS

Even a wrong URL gets a JSON error, never an HTML or plain-text page.

Expected: 404. Actual: 404.

```bash
curl -i https://equipment-booking-api.medcard-api.workers.dev/api/rooms
```

```http
HTTP/1.1 404 Not Found
content-type: application/json
access-control-allow-origin: *

{"error":"Route not found: GET /api/rooms"}
```

### 17. Overlapping booking (create): PASS

eq-1 is booked 09:00-12:00, so 10:00-13:00 on the same equipment conflicts: 409.

Expected: 409. Actual: 409.

```bash
curl -i -X POST https://equipment-booking-api.medcard-api.workers.dev/api/bookings \
  -H 'Content-Type: application/json' \
  -d '{"equipmentId":"eq-1","borrowerName":"Somchai Jaidee","startAt":"2030-01-15T10:00:00.000Z","endAt":"2030-01-15T13:00:00.000Z","purpose":"[api-test] Class presentation"}'
```

```http
HTTP/1.1 409 Conflict
content-type: application/json
access-control-allow-origin: *

{"error":"Equipment 'eq-1' is already booked from 2030-01-15T09:00:00.000Z to 2030-01-15T12:00:00.000Z"}
```

### 18. Same time, different equipment: PASS

The overlap rule is per equipment: eq-2 is free at a time when eq-1 is taken.

Expected: 201. Actual: 201.

```bash
curl -i -X POST https://equipment-booking-api.medcard-api.workers.dev/api/bookings \
  -H 'Content-Type: application/json' \
  -d '{"equipmentId":"eq-2","borrowerName":"Somchai Jaidee","startAt":"2030-01-15T09:00:00.000Z","endAt":"2030-01-15T11:00:00.000Z","purpose":"[api-test] Class presentation"}'
```

```http
HTTP/1.1 201 Created
content-type: application/json
access-control-allow-origin: *

{"id":"7968d6c4-143a-4c62-8be4-7a66301c3cb6","equipmentId":"eq-2","borrowerName":"Somchai Jaidee","startAt":"2030-01-15T09:00:00.000Z","endAt":"2030-01-15T11:00:00.000Z","purpose":"[api-test] Class presentation","createdAt":"2026-10-06T08:26:36.306Z","updatedAt":"2026-10-06T08:26:36.306Z"}
```

### 19. Back-to-back booking: PASS

A booking may start at the exact moment the previous one ends (12:00): the end time is exclusive.

Expected: 201. Actual: 201.

```bash
curl -i -X POST https://equipment-booking-api.medcard-api.workers.dev/api/bookings \
  -H 'Content-Type: application/json' \
  -d '{"equipmentId":"eq-1","borrowerName":"Somchai Jaidee","startAt":"2030-01-15T12:00:00.000Z","endAt":"2030-01-15T13:00:00.000Z","purpose":"[api-test] Class presentation"}'
```

```http
HTTP/1.1 201 Created
content-type: application/json
access-control-allow-origin: *

{"id":"fa55d278-974c-4a72-b2b2-286ac2ebd8a8","equipmentId":"eq-1","borrowerName":"Somchai Jaidee","startAt":"2030-01-15T12:00:00.000Z","endAt":"2030-01-15T13:00:00.000Z","purpose":"[api-test] Class presentation","createdAt":"2026-10-06T08:26:37.341Z","updatedAt":"2026-10-06T08:26:37.341Z"}
```

### 20. Overlapping booking (update the time): PASS

Overlap is also prevented on update: moving the 12:00 booking back to 11:30 runs into the 09:00-12:00 one.

Expected: 409. Actual: 409.

```bash
curl -i -X PATCH https://equipment-booking-api.medcard-api.workers.dev/api/bookings/fa55d278-974c-4a72-b2b2-286ac2ebd8a8 \
  -H 'Content-Type: application/json' \
  -d '{"startAt":"2030-01-15T11:30:00.000Z"}'
```

```http
HTTP/1.1 409 Conflict
content-type: application/json
access-control-allow-origin: *

{"error":"Equipment 'eq-1' is already booked from 2030-01-15T09:00:00.000Z to 2030-01-15T12:00:00.000Z"}
```

### 21. Overlapping booking (update the equipment): PASS

Moving the eq-2 booking (09:00-11:00) onto eq-1 would collide with the eq-1 booking.

Expected: 409. Actual: 409.

```bash
curl -i -X PATCH https://equipment-booking-api.medcard-api.workers.dev/api/bookings/7968d6c4-143a-4c62-8be4-7a66301c3cb6 \
  -H 'Content-Type: application/json' \
  -d '{"equipmentId":"eq-1"}'
```

```http
HTTP/1.1 409 Conflict
content-type: application/json
access-control-allow-origin: *

{"error":"Equipment 'eq-1' is already booked from 2030-01-15T09:00:00.000Z to 2030-01-15T12:00:00.000Z"}
```

### 22. Update to unknown equipment: PASS

equipmentId is validated on update as well.

Expected: 404. Actual: 404.

```bash
curl -i -X PATCH https://equipment-booking-api.medcard-api.workers.dev/api/bookings/7968d6c4-143a-4c62-8be4-7a66301c3cb6 \
  -H 'Content-Type: application/json' \
  -d '{"equipmentId":"eq-999"}'
```

```http
HTTP/1.1 404 Not Found
content-type: application/json
access-control-allow-origin: *

{"error":"Equipment 'eq-999' not found"}
```

### 23. Simultaneous requests for the same slot: PASS

Race condition: when several people book the same free slot at the same moment, exactly one may succeed. The overlap check and the insert are a single SQL statement, so there is no gap between "is it free?" and "book it". Separate curl processes start too far apart to collide, so this one case uses Node.js fetch: 40 rounds, each sending 20 identical requests at once for a new slot.

Expected: 40 x 201 (one per round), 760 x 409. Actual: 40 x 201, 760 x 409.

```js
// Node.js, one process. Each round sends 20 of these at the same moment (Promise.all),
// and every round uses the next day (2030-02-01, 2030-02-02, ...). 800 requests in total.
fetch('https://equipment-booking-api.medcard-api.workers.dev/api/bookings', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: '{"equipmentId":"eq-3","borrowerName":"Somchai Jaidee","startAt":"2030-02-01T14:00:00.000Z","endAt":"2030-02-01T15:00:00.000Z","purpose":"[api-test] Race round"}',
})
```

```http
800 responses: 40 x 201, 760 x 409
Bookings stored for the 40 contested slots (GET /bookings afterwards): 40

Example of the one winner in a round:
HTTP 201  {"id":"60a6c93a-addf-431e-8052-26beb4bf5169","equipmentId":"eq-3","borrowerName":"Somchai Jaidee","startAt":"2030-02-01T14:00:00.000Z","endAt":"2030-02-01T15:00:00.000Z","purpose":"[api-test] Race round","createdAt":"2026-10-06T08:26:39.045Z","updatedAt":"2026-10-06T08:26:39.045Z"}

Example of a loser in the same round:
HTTP 409  {"error":"Equipment 'eq-3' is already booked from 2030-02-01T14:00:00.000Z to 2030-02-01T15:00:00.000Z"}
```

### 24. SQL injection attempt in a field: PASS

Values are bound as parameters, so SQL inside a value is stored as plain text and never executed.

Expected: 201. Actual: 201.

```bash
curl -i -X POST https://equipment-booking-api.medcard-api.workers.dev/api/bookings \
  -H 'Content-Type: application/json' \
  -d '{"equipmentId":"eq-2","borrowerName":"Robert'\''); DROP TABLE bookings;--","startAt":"2030-01-15T15:00:00.000Z","endAt":"2030-01-15T16:00:00.000Z","purpose":"[api-test] Class presentation"}'
```

```http
HTTP/1.1 201 Created
content-type: application/json
access-control-allow-origin: *

{"id":"4907bd96-4bad-4274-ad2a-67845f8d32d5","equipmentId":"eq-2","borrowerName":"Robert'); DROP TABLE bookings;--","startAt":"2030-01-15T15:00:00.000Z","endAt":"2030-01-15T16:00:00.000Z","purpose":"[api-test] Class presentation","createdAt":"2026-10-06T08:26:57.849Z","updatedAt":"2026-10-06T08:26:57.849Z"}
```

### 25. SQL injection attempt in the URL: PASS

The id x' OR '1'='1 is compared as a value: it matches no booking instead of matching all of them.

Expected: 404. Actual: 404.

```bash
curl -i https://equipment-booking-api.medcard-api.workers.dev/api/bookings/x%27%20OR%20%271%27%3D%271
```

```http
HTTP/1.1 404 Not Found
content-type: application/json
access-control-allow-origin: *

{"error":"Booking not found"}
```

### 26. Table intact after the injection attempts: PASS

The bookings table still exists and holds the injected text as an ordinary name.

Expected: 200. Actual: 200.

```bash
curl -i https://equipment-booking-api.medcard-api.workers.dev/api/bookings/4907bd96-4bad-4274-ad2a-67845f8d32d5
```

```http
HTTP/1.1 200 OK
content-type: application/json
access-control-allow-origin: *

{"id":"4907bd96-4bad-4274-ad2a-67845f8d32d5","equipmentId":"eq-2","borrowerName":"Robert'); DROP TABLE bookings;--","startAt":"2030-01-15T15:00:00.000Z","endAt":"2030-01-15T16:00:00.000Z","purpose":"[api-test] Class presentation","createdAt":"2026-10-06T08:26:57.849Z","updatedAt":"2026-10-06T08:26:57.849Z"}
```

### 27. Time zone offset is normalised to UTC: PASS

16:00+07:00 (Thailand) is the same instant as 09:00Z. Times are stored and returned in UTC so they compare correctly.

Expected: 201. Actual: 201.

```bash
curl -i -X POST https://equipment-booking-api.medcard-api.workers.dev/api/bookings \
  -H 'Content-Type: application/json' \
  -d '{"equipmentId":"eq-3","borrowerName":"Somchai Jaidee","startAt":"2030-01-15T16:00:00+07:00","endAt":"2030-01-15T18:00:00+07:00","purpose":"[api-test] Class presentation"}'
```

```http
HTTP/1.1 201 Created
content-type: application/json
access-control-allow-origin: *

{"id":"4d149cd7-4eea-43ff-b752-a6b1a6b48550","equipmentId":"eq-3","borrowerName":"Somchai Jaidee","startAt":"2030-01-15T09:00:00.000Z","endAt":"2030-01-15T11:00:00.000Z","purpose":"[api-test] Class presentation","createdAt":"2026-10-06T08:26:58.613Z","updatedAt":"2026-10-06T08:26:58.613Z"}
```

### 28. CORS preflight: PASS

Before a JSON POST from another origin, a browser sends OPTIONS. The API must answer with the Access-Control-Allow-* headers.

Expected: 204. Actual: 204.

```bash
curl -i -X OPTIONS https://equipment-booking-api.medcard-api.workers.dev/api/bookings \
  -H 'Origin: http://localhost:5173' \
  -H 'Access-Control-Request-Method: POST' \
  -H 'Access-Control-Request-Headers: content-type'
```

```http
HTTP/1.1 204 No Content
access-control-allow-origin: *
access-control-allow-headers: content-type
access-control-allow-methods: GET,POST,PATCH,DELETE,OPTIONS
access-control-max-age: 600

(empty body)
```

### 29. CORS headers on an error response: PASS

Without CORS headers on errors, a browser client would see a generic network error instead of the API's message.

Expected: 404. Actual: 404.

```bash
curl -i https://equipment-booking-api.medcard-api.workers.dev/api/bookings/does-not-exist \
  -H 'Origin: http://localhost:5173'
```

```http
HTTP/1.1 404 Not Found
content-type: application/json
access-control-allow-origin: *

{"error":"Booking not found"}
```

### 30. Delete a booking: PASS

DELETE returns 204 with an empty body.

Expected: 204. Actual: 204.

```bash
curl -i -X DELETE https://equipment-booking-api.medcard-api.workers.dev/api/bookings/9b5614a6-099b-4e8c-8f0f-babbf682535b
```

```http
HTTP/1.1 204 No Content
access-control-allow-origin: *

(empty body)
```

### 31. Deleted booking is gone: PASS

The booking really was removed.

Expected: 404. Actual: 404.

```bash
curl -i https://equipment-booking-api.medcard-api.workers.dev/api/bookings/9b5614a6-099b-4e8c-8f0f-babbf682535b
```

```http
HTTP/1.1 404 Not Found
content-type: application/json
access-control-allow-origin: *

{"error":"Booking not found"}
```

### 32. Delete the same booking again: PASS

Repeating a DELETE changes nothing further; the booking no longer exists, so the answer is 404.

Expected: 404. Actual: 404.

```bash
curl -i -X DELETE https://equipment-booking-api.medcard-api.workers.dev/api/bookings/9b5614a6-099b-4e8c-8f0f-babbf682535b
```

```http
HTTP/1.1 404 Not Found
content-type: application/json
access-control-allow-origin: *

{"error":"Booking not found"}
```
