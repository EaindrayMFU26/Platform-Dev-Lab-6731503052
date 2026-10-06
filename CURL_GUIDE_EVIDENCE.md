# cURL Guide Evidence

The nine commands of the instructor's cURL Quick Test Guide (`curl_test_guide.md`), run exactly as
written in the guide.

- **Base API URL:** `http://localhost:8787/api`
- **Result:** 9 of 9 steps returned the expected status code
- **Run at:** 2026-10-06T08:12:59Z (local time: 2026-10-06 15:12:59 +0700)
- **Shell and client:** Git Bash, curl 8.4.0 (x86_64-w64-mingw32)
- **Server under test:** `npm run dev` (wrangler dev with the local D1 / SQLite database), started with no bookings stored
- **`BOOKING_ID`:** `cdadf165-c44b-4808-b33b-f2ab4d540e2e`, copied from the response of step 3

The commands print curl's progress meter to the terminal as well; it is left out here. Nothing else
was changed. After step 9 the list of bookings is `[]`.

| Step | Case | Expected | Actual | Result |
|--:|---|---:|---:|---|
| 1 | List equipment | 200 | 200 | PASS |
| 2 | List bookings | 200 | 200 | PASS |
| 3 | Create a booking | 201 | 201 | PASS |
| 4 | Get one booking | 200 | 200 | PASS |
| 5 | Update a booking | 200 | 200 | PASS |
| 6 | Invalid time range | 400 | 400 | PASS |
| 7 | Overlapping booking | 409 | 409 | PASS |
| 8 | Missing booking | 404 | 404 | PASS |
| 9 | Delete a booking | 204 | 204 | PASS |

## Commands and responses

### 1. List equipment: expected 200, got 200 (PASS)

```bash
curl -i "$BASE_URL/equipment"
```

```http
HTTP/1.1 200 OK
Content-Length: 177
Content-Type: application/json
Access-Control-Allow-Origin: *

[{"id":"eq-1","name":"Projector A","location":"Building 1"},{"id":"eq-2","name":"Camera B","location":"Media Lab"},{"id":"eq-3","name":"Meeting Room C","location":"Building 2"}]
```

### 2. List bookings: expected 200, got 200 (PASS)

```bash
curl -i "$BASE_URL/bookings"
```

```http
HTTP/1.1 200 OK
Content-Length: 2
Content-Type: application/json
Access-Control-Allow-Origin: *

[]
```

### 3. Create a booking: expected 201, got 201 (PASS)

```bash
curl -i -X POST "$BASE_URL/bookings" \
  -H "Content-Type: application/json" \
  -d '{
    "equipmentId": "eq-1",
    "borrowerName": "Somchai Jaidee",
    "startAt": "2026-10-20T09:00:00.000Z",
    "endAt": "2026-10-20T11:00:00.000Z",
    "purpose": "Class presentation"
  }'
```

```http
HTTP/1.1 201 Created
Content-Length: 279
Content-Type: application/json
Access-Control-Allow-Origin: *

{"id":"cdadf165-c44b-4808-b33b-f2ab4d540e2e","equipmentId":"eq-1","borrowerName":"Somchai Jaidee","startAt":"2026-10-20T09:00:00.000Z","endAt":"2026-10-20T11:00:00.000Z","purpose":"Class presentation","createdAt":"2026-10-06T08:12:56.229Z","updatedAt":"2026-10-06T08:12:56.229Z"}
```

### 4. Get one booking: expected 200, got 200 (PASS)

```bash
curl -i "$BASE_URL/bookings/$BOOKING_ID"
```

```http
HTTP/1.1 200 OK
Content-Length: 279
Content-Type: application/json
Access-Control-Allow-Origin: *

{"id":"cdadf165-c44b-4808-b33b-f2ab4d540e2e","equipmentId":"eq-1","borrowerName":"Somchai Jaidee","startAt":"2026-10-20T09:00:00.000Z","endAt":"2026-10-20T11:00:00.000Z","purpose":"Class presentation","createdAt":"2026-10-06T08:12:56.229Z","updatedAt":"2026-10-06T08:12:56.229Z"}
```

### 5. Update a booking: expected 200, got 200 (PASS)

```bash
curl -i -X PATCH "$BASE_URL/bookings/$BOOKING_ID" \
  -H "Content-Type: application/json" \
  -d '{
    "equipmentId": "eq-1",
    "borrowerName": "Somchai Jaidee",
    "startAt": "2026-10-20T12:00:00.000Z",
    "endAt": "2026-10-20T14:00:00.000Z",
    "purpose": "Updated class presentation"
  }'
```

```http
HTTP/1.1 200 OK
Content-Length: 287
Content-Type: application/json
Access-Control-Allow-Origin: *

{"id":"cdadf165-c44b-4808-b33b-f2ab4d540e2e","equipmentId":"eq-1","borrowerName":"Somchai Jaidee","startAt":"2026-10-20T12:00:00.000Z","endAt":"2026-10-20T14:00:00.000Z","purpose":"Updated class presentation","createdAt":"2026-10-06T08:12:56.229Z","updatedAt":"2026-10-06T08:12:57.096Z"}
```

### 6. Invalid time range: expected 400, got 400 (PASS)

```bash
curl -i -X POST "$BASE_URL/bookings" \
  -H "Content-Type: application/json" \
  -d '{
    "equipmentId": "eq-1",
    "borrowerName": "Somchai Jaidee",
    "startAt": "2026-10-21T11:00:00.000Z",
    "endAt": "2026-10-21T09:00:00.000Z",
    "purpose": "Invalid time range test"
  }'
```

```http
HTTP/1.1 400 Bad Request
Content-Length: 40
Content-Type: application/json
Access-Control-Allow-Origin: *

{"error":"startAt must be before endAt"}
```

### 7. Overlapping booking: expected 409, got 409 (PASS)

```bash
curl -i -X POST "$BASE_URL/bookings" \
  -H "Content-Type: application/json" \
  -d '{
    "equipmentId": "eq-1",
    "borrowerName": "Suda Dee",
    "startAt": "2026-10-20T12:30:00.000Z",
    "endAt": "2026-10-20T13:30:00.000Z",
    "purpose": "Conflict test"
  }'
```

```http
HTTP/1.1 409 Conflict
Content-Length: 104
Content-Type: application/json
Access-Control-Allow-Origin: *

{"error":"Equipment 'eq-1' is already booked from 2026-10-20T12:00:00.000Z to 2026-10-20T14:00:00.000Z"}
```

### 8. Missing booking: expected 404, got 404 (PASS)

```bash
curl -i "$BASE_URL/bookings/not-found"
```

```http
HTTP/1.1 404 Not Found
Content-Length: 29
Content-Type: application/json
Access-Control-Allow-Origin: *

{"error":"Booking not found"}
```

### 9. Delete a booking: expected 204, got 204 (PASS)

```bash
curl -i -X DELETE "$BASE_URL/bookings/$BOOKING_ID"
```

```http
HTTP/1.1 204 No Content
Access-Control-Allow-Origin: *
```

