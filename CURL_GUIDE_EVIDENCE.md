# cURL Guide Evidence

The nine commands of the instructor's cURL Quick Test Guide (`curl_test_guide.md`), run exactly as
written in the guide.

- **Base API URL:** `https://equipment-booking-api.medcard-api.workers.dev/api`
- **Result:** 9 of 9 steps returned the expected status code
- **Run at:** 2026-10-06T08:37:16Z (local time: 2026-10-06 15:37:16 +0700)
- **Shell and client:** Git Bash, curl 8.4.0 (x86_64-w64-mingw32)
- **Server under test:** the deployed Cloudflare Worker with its remote D1 database
- **`BOOKING_ID`:** `fe2744a5-5378-4b16-a282-536dc71fa099`, copied from the response of step 3

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
Date: Tue, 06 Oct 2026 08:37:09 GMT
Content-Type: application/json
Content-Length: 177
Connection: keep-alive
Access-Control-Allow-Origin: *
Report-To: {"group":"cf-nel","max_age":604800,"endpoints":[{"url":"https://a.nel.cloudflare.com/report/v4?s=mAeTOXoq9fldYL2sbxf3QyTtdfXEbtDEuJWugSfKer7d0XK25acaf4CeXSoXvHxBd6NfzETCM9GS1ySQ5NYmseDkJS%2FB7kZbz5h%2FKAd%2FUw2F8%2BXtQr0LoOKE6fDrXYhCbom%2BQQwjFEVfdNS3xZpHTpjKxHuBJY370xJKBl0X9EM%3D"}]}
Nel: {"report_to":"cf-nel","success_fraction":0.0,"max_age":604800}
Server: cloudflare
CF-RAY: a46357b07b65cdfa-SIN
alt-svc: h3=":443"; ma=86400

[{"id":"eq-1","name":"Projector A","location":"Building 1"},{"id":"eq-2","name":"Camera B","location":"Media Lab"},{"id":"eq-3","name":"Meeting Room C","location":"Building 2"}]
```

### 2. List bookings: expected 200, got 200 (PASS)

```bash
curl -i "$BASE_URL/bookings"
```

```http
HTTP/1.1 200 OK
Date: Tue, 06 Oct 2026 08:37:10 GMT
Content-Type: application/json
Content-Length: 2
Connection: keep-alive
Access-Control-Allow-Origin: *
Report-To: {"group":"cf-nel","max_age":604800,"endpoints":[{"url":"https://a.nel.cloudflare.com/report/v4?s=6yjMXDh63yPpoIXwDirtI64XjiHiCmd96bXCpePiN98IDR%2BaAO7nM%2BMC3iR5R%2BoYczNpoRkLAQVVjzQATDh0hTnEX8j1Ifc1zFBRKVExovUefnozab0z7H4rAwdzvsUIvU71n1eB4Af5vNfbYCb5upuscTFcdj42J8PWGQ2d8CQ%3D"}]}
Nel: {"report_to":"cf-nel","success_fraction":0.0,"max_age":604800}
Server: cloudflare
CF-RAY: a46357b36f3909ef-HKG
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
Date: Tue, 06 Oct 2026 08:37:10 GMT
Content-Type: application/json
Content-Length: 279
Connection: keep-alive
Access-Control-Allow-Origin: *
Report-To: {"group":"cf-nel","max_age":604800,"endpoints":[{"url":"https://a.nel.cloudflare.com/report/v4?s=tIEva3YEmrO%2BxFumHxjVQaoptNFAABkQ%2BeMPH7YcZfjIzDdT7Ng7zFVPAmvbiBF7H4T%2FxHAJ6NngIXrRaqHqCvuKzBaWHA%2BLd9Ny82CgB7YHH9cucXG7VUstwZ%2Bfq6Xwq5ZGmfytT9EMoAx1kYYMNzeozuiPAbYJAnYBGueJFV8%3D"}]}
Nel: {"report_to":"cf-nel","success_fraction":0.0,"max_age":604800}
Server: cloudflare
CF-RAY: a46357b639838de9-SIN
alt-svc: h3=":443"; ma=86400

{"id":"fe2744a5-5378-4b16-a282-536dc71fa099","equipmentId":"eq-1","borrowerName":"Somchai Jaidee","startAt":"2026-10-20T09:00:00.000Z","endAt":"2026-10-20T11:00:00.000Z","purpose":"Class presentation","createdAt":"2026-10-06T08:37:10.782Z","updatedAt":"2026-10-06T08:37:10.782Z"}
```

### 4. Get one booking: expected 200, got 200 (PASS)

```bash
curl -i "$BASE_URL/bookings/$BOOKING_ID"
```

```http
HTTP/1.1 200 OK
Date: Tue, 06 Oct 2026 08:37:11 GMT
Content-Type: application/json
Content-Length: 279
Connection: keep-alive
Access-Control-Allow-Origin: *
Report-To: {"group":"cf-nel","max_age":604800,"endpoints":[{"url":"https://a.nel.cloudflare.com/report/v4?s=r438Qhc0WQnqCfZ4wimYqMR6ewmA4T9Ef6g1lvXz0ic8V8EvU02NGVSKk92B4oayGsjgU%2Fdmp8LZyyarK1CXZzcKgXQmQgjTBfydwTHSvGIDoaxzs54MqOhYp3lSiwnnACDTTG63C1EB1DVRXIbw7elmCIicGzCq27dVDLSkBTo%3D"}]}
Nel: {"report_to":"cf-nel","success_fraction":0.0,"max_age":604800}
Server: cloudflare
CF-RAY: a46357b959cba439-SIN
alt-svc: h3=":443"; ma=86400

{"id":"fe2744a5-5378-4b16-a282-536dc71fa099","equipmentId":"eq-1","borrowerName":"Somchai Jaidee","startAt":"2026-10-20T09:00:00.000Z","endAt":"2026-10-20T11:00:00.000Z","purpose":"Class presentation","createdAt":"2026-10-06T08:37:10.782Z","updatedAt":"2026-10-06T08:37:10.782Z"}
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
Date: Tue, 06 Oct 2026 08:37:14 GMT
Content-Type: application/json
Content-Length: 287
Connection: keep-alive
Access-Control-Allow-Origin: *
Report-To: {"group":"cf-nel","max_age":604800,"endpoints":[{"url":"https://a.nel.cloudflare.com/report/v4?s=0RCZdg7YLDc%2FzzT%2Fo6Ob7Y7pcyjLYpxQIxb4a0Ht6vLoMCoomfH8UfpDRlx1VVusNZYZQOjwQi5A5M%2F7KHHzK%2Ff%2B%2FxJe988S6ZstsWStPbgt8DBkEY2HJ%2Bfdx2zo7WIfL6zWGPaenEq8Ccs2YvshIcCbD78ghwVQQhMQNshZXtg%3D"}]}
Nel: {"report_to":"cf-nel","success_fraction":0.0,"max_age":604800}
Server: cloudflare
CF-RAY: a46357cf887c0540-HKG
alt-svc: h3=":443"; ma=86400

{"id":"fe2744a5-5378-4b16-a282-536dc71fa099","equipmentId":"eq-1","borrowerName":"Somchai Jaidee","startAt":"2026-10-20T12:00:00.000Z","endAt":"2026-10-20T14:00:00.000Z","purpose":"Updated class presentation","createdAt":"2026-10-06T08:37:10.782Z","updatedAt":"2026-10-06T08:37:14.880Z"}
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
Date: Tue, 06 Oct 2026 08:37:15 GMT
Content-Type: application/json
Content-Length: 40
Connection: keep-alive
Access-Control-Allow-Origin: *
Report-To: {"group":"cf-nel","max_age":604800,"endpoints":[{"url":"https://a.nel.cloudflare.com/report/v4?s=fMOgRsB4x7rg9dot4arHL%2FDglky%2FdgDTLZ4j1mqe9LgJPNGXaRde3SrQFMvBpWo5Ifn2HUjSdjy7OOtcF3rZdTV%2Feg65EZslGZs7nn3R7lFcxh8WAVootpPVinD4W0SzhgVYP0NwLGe7tQf8MgOnpEfVV7v4zp9TTcbbMUwKOxU%3D"}]}
Nel: {"report_to":"cf-nel","success_fraction":0.0,"max_age":604800}
Server: cloudflare
CF-RAY: a46357d299cd527e-SIN
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
Date: Tue, 06 Oct 2026 08:37:15 GMT
Content-Type: application/json
Content-Length: 104
Connection: keep-alive
Access-Control-Allow-Origin: *
Report-To: {"group":"cf-nel","max_age":604800,"endpoints":[{"url":"https://a.nel.cloudflare.com/report/v4?s=79enSSU%2B9%2BQcdFiyy%2BJqcaxrh8yUyiyjuHvaZGBVvgwA5QpnbixU%2B88UH%2BqXiNHRoCIDnvte%2FEQmIr8mQcDy8DAzLkS7wOs7aMjCGyQP8Z9%2FNB%2FfPffbwdR7OIpp%2BsoKuMJQeFXpo49rnE4O3XZQHpEqFjmHpmAaI3UruWXnMf4%3D"}]}
Nel: {"report_to":"cf-nel","success_fraction":0.0,"max_age":604800}
Server: cloudflare
CF-RAY: a46357d518e7fda4-SIN
alt-svc: h3=":443"; ma=86400

{"error":"Equipment 'eq-1' is already booked from 2026-10-20T12:00:00.000Z to 2026-10-20T14:00:00.000Z"}
```

### 8. Missing booking: expected 404, got 404 (PASS)

```bash
curl -i "$BASE_URL/bookings/not-found"
```

```http
HTTP/1.1 404 Not Found
Date: Tue, 06 Oct 2026 08:37:16 GMT
Content-Type: application/json
Content-Length: 29
Connection: keep-alive
Access-Control-Allow-Origin: *
Report-To: {"group":"cf-nel","max_age":604800,"endpoints":[{"url":"https://a.nel.cloudflare.com/report/v4?s=DyTctouZ7RzjU87Wrot%2B5Utym4OyAOF%2FhpnC%2FcCEeNQWlRuYgbmGAtKST6cwKpILfQPElf2CMVxEOnCx%2FVOr5nWXscypuDKOi6XnogJz51%2FNZTRZZcLEON57FBSpymjWzxKG2D%2B07jbURgr%2BlgmNr1van07iWJndIV05dp4LZHE%3D"}]}
Nel: {"report_to":"cf-nel","success_fraction":0.0,"max_age":604800}
Server: cloudflare
CF-RAY: a46357d86991080f-HKG
alt-svc: h3=":443"; ma=86400

{"error":"Booking not found"}
```

### 9. Delete a booking: expected 204, got 204 (PASS)

```bash
curl -i -X DELETE "$BASE_URL/bookings/$BOOKING_ID"
```

```http
HTTP/1.1 204 No Content
Date: Tue, 06 Oct 2026 08:37:16 GMT
Connection: keep-alive
Access-Control-Allow-Origin: *
Report-To: {"group":"cf-nel","max_age":604800,"endpoints":[{"url":"https://a.nel.cloudflare.com/report/v4?s=hE99KzPZtlosnYtyg882YyUTivqTHWou9NfGSnNSa5qQwDTahrfnYvgCqwVH25yyRL7LN8WMGQKxepwXKGyqd29bPpKd6aku5Vcvrhh79eaUlutTjhol%2BcZAwqA0tu%2FB8fivbiy3mVxQyFTjJ5OiGtVBaHTnZsSBCAQJGR8WY7o%3D"}]}
Nel: {"report_to":"cf-nel","success_fraction":0.0,"max_age":604800}
Server: cloudflare
CF-RAY: a46357dc4f5bf93e-SIN
alt-svc: h3=":443"; ma=86400
```

