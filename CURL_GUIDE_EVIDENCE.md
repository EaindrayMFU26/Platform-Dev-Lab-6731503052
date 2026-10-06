# cURL Guide Evidence

The nine commands of the instructor's cURL Quick Test Guide (`curl_test_guide.md`), run exactly as
written in the guide.

- **Base API URL:** `https://equipment-booking-api.medcard-api.workers.dev/api`
- **Result:** 9 of 9 steps returned the expected status code
- **Run at:** 2026-10-06T08:26:23Z (local time: 2026-10-06 15:26:23 +0700)
- **Shell and client:** Git Bash, curl 8.4.0 (x86_64-w64-mingw32)
- **Server under test:** the deployed Cloudflare Worker with its remote D1 database
- **`BOOKING_ID`:** `96834096-2101-4078-b48a-6d871efbe648`, copied from the response of step 3

The commands print curl's progress meter to the terminal as well; it is left out here. Nothing else
was changed. The list of bookings was `[]` before step 1 and `[]` after step 9.

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
Date: Tue, 06 Oct 2026 08:26:15 GMT
Content-Type: application/json
Content-Length: 177
Connection: keep-alive
Access-Control-Allow-Origin: *
Report-To: {"group":"cf-nel","max_age":604800,"endpoints":[{"url":"https://a.nel.cloudflare.com/report/v4?s=D33fQzmK9IXkY6Mwjr0eeg%2BQ1yB8Kapant6rrpdUGdqxF6%2FSdURZn%2BoOME2F2eKwEuvEJLZwVONeIsN6QhO2EJ%2B3W7Q71NoTO9t7ydfssKfFPWG50bv8PN1c%2BAMfqG%2BqkNbc%2BKwT4z7u578WjRjxE9TjiWgzl0J3zO8Q%2BxSZnZg%3D"}]}
Nel: {"report_to":"cf-nel","success_fraction":0.0,"max_age":604800}
Server: cloudflare
CF-RAY: a46347b91960fc2e-SIN
alt-svc: h3=":443"; ma=86400

[{"id":"eq-1","name":"Projector A","location":"Building 1"},{"id":"eq-2","name":"Camera B","location":"Media Lab"},{"id":"eq-3","name":"Meeting Room C","location":"Building 2"}]
```

### 2. List bookings: expected 200, got 200 (PASS)

```bash
curl -i "$BASE_URL/bookings"
```

```http
HTTP/1.1 200 OK
Date: Tue, 06 Oct 2026 08:26:16 GMT
Content-Type: application/json
Content-Length: 2
Connection: keep-alive
Access-Control-Allow-Origin: *
Report-To: {"group":"cf-nel","max_age":604800,"endpoints":[{"url":"https://a.nel.cloudflare.com/report/v4?s=qEEVky9kkvwvmLFB6fmXOzqBZLyCkcQx3Qzj0pWxJepObK7a0Hmsiu8dStbARsZ6dA0p%2BCL%2Bc4l0MpjH%2BA43GfkZa3b8vShwRAh%2FCZUBidV7OWLjgUgYi2G%2F5bPZzlcbjpvT8L1Pgwd1TLSF12W90fKK49AjrffUKjEaOzS6lOc%3D"}]}
Nel: {"report_to":"cf-nel","success_fraction":0.0,"max_age":604800}
Server: cloudflare
CF-RAY: a46347bca88cb006-NRT
alt-svc: h3=":443"; ma=86400

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
Date: Tue, 06 Oct 2026 08:26:17 GMT
Content-Type: application/json
Content-Length: 279
Connection: keep-alive
Access-Control-Allow-Origin: *
Report-To: {"group":"cf-nel","max_age":604800,"endpoints":[{"url":"https://a.nel.cloudflare.com/report/v4?s=7F4sZsY154jAuyM0wFMWZ63iSRRUZMsMKxHB7D5Q3Yy7ivAq5GodhLn%2FQ4BCy2gkRedmOl%2B%2B0gy3IERp%2F07mOc6CvHIdaEMVD8r4rbnU%2B7Hb77RO36i5KKwMufhOctFLjl7hv3SUli%2F0IK%2BuWNM%2BRx1TuGSanRawtCSW5Gcwsi0%3D"}]}
Nel: {"report_to":"cf-nel","success_fraction":0.0,"max_age":604800}
Server: cloudflare
CF-RAY: a46347c05a505168-HKG
alt-svc: h3=":443"; ma=86400

{"id":"96834096-2101-4078-b48a-6d871efbe648","equipmentId":"eq-1","borrowerName":"Somchai Jaidee","startAt":"2026-10-20T09:00:00.000Z","endAt":"2026-10-20T11:00:00.000Z","purpose":"Class presentation","createdAt":"2026-10-06T08:26:17.110Z","updatedAt":"2026-10-06T08:26:17.110Z"}
```

### 4. Get one booking: expected 200, got 200 (PASS)

```bash
curl -i "$BASE_URL/bookings/$BOOKING_ID"
```

```http
HTTP/1.1 200 OK
Date: Tue, 06 Oct 2026 08:26:17 GMT
Content-Type: application/json
Content-Length: 279
Connection: keep-alive
Access-Control-Allow-Origin: *
Report-To: {"group":"cf-nel","max_age":604800,"endpoints":[{"url":"https://a.nel.cloudflare.com/report/v4?s=E6p2n5C4sx7tSWkvGDf1xiSF97YYRrdtgRcGpU5%2Bp3YrpJ5hQiL%2Bbe%2FtnCzhODdYx1pZBqfdpusMjwvdrQFbmK7iJIrnC7byTkGG4eyej0XGuJsa1o8UOkPGt7f5xuacOczU2Gg2xzMd9jXWPr49kPFmwOWeaaM2q8Vbz2lpGUw%3D"}]}
Nel: {"report_to":"cf-nel","success_fraction":0.0,"max_age":604800}
Server: cloudflare
CF-RAY: a46347c4dac102be-HKG
alt-svc: h3=":443"; ma=86400

{"id":"96834096-2101-4078-b48a-6d871efbe648","equipmentId":"eq-1","borrowerName":"Somchai Jaidee","startAt":"2026-10-20T09:00:00.000Z","endAt":"2026-10-20T11:00:00.000Z","purpose":"Class presentation","createdAt":"2026-10-06T08:26:17.110Z","updatedAt":"2026-10-06T08:26:17.110Z"}
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
Date: Tue, 06 Oct 2026 08:26:18 GMT
Content-Type: application/json
Content-Length: 287
Connection: keep-alive
Access-Control-Allow-Origin: *
Report-To: {"group":"cf-nel","max_age":604800,"endpoints":[{"url":"https://a.nel.cloudflare.com/report/v4?s=Q5MWbiIoiNgUrXupEIg4ovK20o7HQyaGbzkGOTRx2GBv9yrAe%2BVhxLaPNCG%2BZ2ZqYn3LP%2FlaxcuhyOBS0ApRt1hkW8HQZqYGSB37TtdQII24oQKRFm5BI%2F8tbRIwZl%2FvqEPM8W4Shl%2BLc2R9r4pz23xEkmCDDDm3CLZGeX%2BDj9k%3D"}]}
Nel: {"report_to":"cf-nel","success_fraction":0.0,"max_age":604800}
Server: cloudflare
CF-RAY: a46347c7dd049fc7-SIN
alt-svc: h3=":443"; ma=86400

{"id":"96834096-2101-4078-b48a-6d871efbe648","equipmentId":"eq-1","borrowerName":"Somchai Jaidee","startAt":"2026-10-20T12:00:00.000Z","endAt":"2026-10-20T14:00:00.000Z","purpose":"Updated class presentation","createdAt":"2026-10-06T08:26:17.110Z","updatedAt":"2026-10-06T08:26:18.271Z"}
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
Date: Tue, 06 Oct 2026 08:26:18 GMT
Content-Type: application/json
Content-Length: 40
Connection: keep-alive
Access-Control-Allow-Origin: *
Report-To: {"group":"cf-nel","max_age":604800,"endpoints":[{"url":"https://a.nel.cloudflare.com/report/v4?s=xRlaKU4zFyuTYwrxbHYsYtB9gZuKcsFdaTZhCBmu5Sv%2F2OA5uClL0IW3LBswDBiP%2BqSYVecymdpfjbwQKDO3scs6myUz3JmtxOaiNHBNdUQJoIKxl%2FmNLeIBYelRM%2Fo571C8%2BmgdIcW6EMvgwWKCj6x2X5Jwowu339F8hBg2LxY%3D"}]}
Nel: {"report_to":"cf-nel","success_fraction":0.0,"max_age":604800}
Server: cloudflare
CF-RAY: a46347cb5b2e2105-HKG
alt-svc: h3=":443"; ma=86400

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
Date: Tue, 06 Oct 2026 08:26:19 GMT
Content-Type: application/json
Content-Length: 104
Connection: keep-alive
Access-Control-Allow-Origin: *
Report-To: {"group":"cf-nel","max_age":604800,"endpoints":[{"url":"https://a.nel.cloudflare.com/report/v4?s=dUn0PQlV5XNOunBombbxomB5Eq2R6R%2F%2FbhpnYgT2dW0nBenTp3UgHzOHg8TU%2BTgUuCylSvQ%2FEH7DCsfIJTJ3MkSlMcFWe%2B02ZGmrZTCHURG4X2n129yOoUhvRxDsLyYDdbp7BiSPPnDrDmpHYte1ss07CLN8GCXGzDlava2Y6%2BY%3D"}]}
Nel: {"report_to":"cf-nel","success_fraction":0.0,"max_age":604800}
Server: cloudflare
CF-RAY: a46347cecb6b9b47-HKG
alt-svc: h3=":443"; ma=86400

{"error":"Equipment 'eq-1' is already booked from 2026-10-20T12:00:00.000Z to 2026-10-20T14:00:00.000Z"}
```

### 8. Missing booking: expected 404, got 404 (PASS)

```bash
curl -i "$BASE_URL/bookings/not-found"
```

```http
HTTP/1.1 404 Not Found
Date: Tue, 06 Oct 2026 08:26:19 GMT
Content-Type: application/json
Content-Length: 29
Connection: keep-alive
Access-Control-Allow-Origin: *
Report-To: {"group":"cf-nel","max_age":604800,"endpoints":[{"url":"https://a.nel.cloudflare.com/report/v4?s=OSb7Av%2B80Et0r35i5VxXGuj6j%2FQSPc1TFhbNcWwhlUzKRxU3zZA3onLwPE4CsPJTGvHXqYjvDMBAftOUrRb%2Bv%2FirJJYtqhyz6B3k6FYvzhzOA8Wo5rz2D7TzQzrdjIoOTvOYBvaStNkveR9%2FGiC1VNyZL%2FKW%2FYH3VuAHiDvTxp0%3D"}]}
Nel: {"report_to":"cf-nel","success_fraction":0.0,"max_age":604800}
Server: cloudflare
CF-RAY: a46347d2be99fdec-SIN
alt-svc: h3=":443"; ma=86400

{"error":"Booking not found"}
```

### 9. Delete a booking: expected 204, got 204 (PASS)

```bash
curl -i -X DELETE "$BASE_URL/bookings/$BOOKING_ID"
```

```http
HTTP/1.1 204 No Content
Date: Tue, 06 Oct 2026 08:26:23 GMT
Connection: keep-alive
Access-Control-Allow-Origin: *
Report-To: {"group":"cf-nel","max_age":604800,"endpoints":[{"url":"https://a.nel.cloudflare.com/report/v4?s=3iK%2BICXtm9f9PIsw545L4knYpDVUgBQIYAPyd5c64YSrNP0AShULyghJJGKIKokWNgbkE6S%2FNZj7cFIsA5r14bILWfgC3virsKMtco91DpOj9l348kbA5JSHO8nb64b%2FUuCAL%2BhLGkjwdg2oorSBduR2seTXXJUxPucvyEeVEDs%3D"}]}
Nel: {"report_to":"cf-nel","success_fraction":0.0,"max_age":604800}
Server: cloudflare
CF-RAY: a46347e8cbc01063-HKG
alt-svc: h3=":443"; ma=86400
```

