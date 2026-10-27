# A7 Evaluation Evidence: baseline

- **Variant:** baseline, the A6 capability unchanged (`ROUTER_GROUNDING` off)
- **Result:** accuracy 5 of 10 cases = 50% (queue 9/10, urgency 5/10, needs-a-person 10/10); every repetition gave the same decision: yes
- **Response time (curl, all 50 requests):** p50 626.3 ms, p95 937.8 ms, max 1604.5 ms
- **Response time of the 40 requests the model answered:** p50 645.3 ms, p95 937.8 ms; time inside the Worker for the decision: p50 420 ms, p95 724 ms
- **Input tokens per task the model answered (measured, reported by the model):** mean 509.1, min 495, max 521
- **Estimated cost per task the model answered:** $0.0001222 (11.11 neurons) = measured tokens × $0.24 per million input tokens, Cloudflare's published price; output tokens are free
- **Run at:** 2026-10-26T15:11:55.476Z; 5 repetitions of every case, sent one at a time in rounds (T01 to T10, then again), after one unmeasured warm-up request per server
- **Servers:** model `http://localhost:8787/api`, model_error `http://localhost:8789/api`, model_timeout `http://localhost:8790/api`
- **Dataset:** `eval/eval-cases.json` (SHA-256 6d512372deb78b453897e35abcb374dfb3830a0ffad2476d5c5c97c4e22045b5); knowledge base `src/knowledge-base.json` (SHA-256 fc202fe529f2d447c7122155de9068423133e7a71438d04299b70890be52355b)
- **How it was run:** `npm run eval -- --variant baseline` (`eval/run-eval.mjs`); HTTP client: curl 8.4.0 (x86_64-w64-mingw32) libcurl/8.4.0 Schannel zlib/1.3 brotli/1.1.0 zstd/1.5.5 libidn2/2.3.4 libpsl/0.21.2 (+libidn2/2.3.3) libssh2/1.11.0

A case is correct when queue, urgency and needsHuman all equal the expected values; for a fallback case the decision must also come from the
fallback with the expected fallbackReason. A case counts as correct only if every repetition is correct. The response time is curl's
`time_total` for the request, so starting the curl process is not included. The cost is an estimate (measured tokens × list price); on the
free plan these requests are not billed within the daily allowance.

## Results per case

| ID | Type | Expected (queue / urgency / who) | Actual (queue / urgency / who) | Pass/Fail | Median ms | Tokens | Context records |
|----|------|----------------------------------|--------------------------------|-----------|----------:|-------:|-----------------|
| T01 | normal | booking_change / normal / auto | booking_change / normal / auto | PASS | 639.8 | 520 | (none) |
| T02 | normal | access_or_account / normal / auto | access_or_account / high / auto | **FAIL** (urgency: expected normal, got high) | 645.3 | 505 | (none) |
| T03 | normal | general_question / low / auto | general_question / low / auto | PASS | 662.8 | 501 | (none) |
| T04 | edge | booking_change / normal / auto | booking_change / normal / auto | PASS | 701.2 | 512 | (none) |
| T05 | edge | equipment_fault / normal / auto | equipment_fault / low / auto | **FAIL** (urgency: expected normal, got low) | 626.3 | 495 | (none) |
| T06 | edge | equipment_fault / normal / auto | equipment_fault / high / auto | **FAIL** (urgency: expected normal, got high) | 661.7 | 512 | (none) |
| T07 | fallback | equipment_fault / high / person (fallback: model_error) | equipment_fault / high / person (fallback: model_error) | PASS | 362.3 | n/a | (none) |
| T08 | fallback | access_or_account / normal / person (fallback: model_timeout) | access_or_account / normal / person (fallback: model_timeout) | PASS | 223.6 | n/a | (none) |
| T09 | difficult | booking_change / normal / person | general_question / low / person | **FAIL** (queue: expected booking_change, got general_question; urgency: expected normal, got low) | 618.9 | 521 | (none) |
| T10 | difficult | general_question / low / person | general_question / normal / person | **FAIL** (urgency: expected low, got normal) | 611.3 | 507 | (none) |

## Every measured request

Response time in ms, as measured by curl. Warm-up requests (not counted): model 1343.1 ms, model_error 919.5 ms, model_timeout 247.8 ms.

| Repetition | T01 | T02 | T03 | T04 | T05 | T06 | T07 | T08 | T09 | T10 |
|-----------:|-----:|-----:|-----:|-----:|-----:|-----:|-----:|-----:|-----:|-----:|
| 1 | 1604.5 | 728.7 | 525.5 | 656.1 | 617.2 | 661.7 | 376.7 | 213.9 | 526.3 | 902.2 |
| 2 | 809.5 | 556.1 | 662.8 | 797.2 | 638.1 | 716.2 | 350.3 | 218.4 | 901.8 | 578.5 |
| 3 | 461.4 | 645.3 | 828.2 | 611.1 | 552.6 | 698.5 | 336.1 | 236.5 | 672.0 | 611.3 |
| 4 | 600.1 | 566.4 | 649.1 | 937.8 | 626.3 | 637.5 | 362.3 | 232.7 | 546.9 | 1105.0 |
| 5 | 639.8 | 661.0 | 855.8 | 701.2 | 775.4 | 632.5 | 394.0 | 223.6 | 618.9 | 492.2 |

## Details (first repetition of each case)

Each curl command is shown as it was run, except that `-s -S --max-time 20` was added to every command.

### T01 (normal, scenario model): PASS

Expected: booking_change / normal / auto. Actual: booking_change / normal / auto.

```bash
curl -i -X POST http://localhost:8787/api/support/route \
  -H 'Content-Type: application/json' \
  -d '{"message":"Please move my Projector A booking from Thursday 10:00 to Friday at the same time.","context":{"equipmentId":"eq-1"}}' -w '
@@time_total=%{time_total}'
```

```http
HTTP/1.1 200 OK
content-type: application/json
access-control-allow-origin: *

{"queue":"booking_change","urgency":"normal","needsHuman":false,"confidence":0.9809,"source":"model","model":"@cf/cloudflare/clef","fallbackReason":null,"details":{"queueProbabilities":{"booking_change":0.9928,"equipment_fault":0.0019,"access_or_account":0.0025,"general_question":0.0028},"urgencyScore":0.6857,"urgencyProbabilities":{"low":0.3464,"normal":0.6214,"high":0.0322},"needsHumanProbability":0.0569,"reasons":[],"latencyMs":1385,"inputTokens":520,"reportedModel":"clef","contextRecords":[]}}
```

### T02 (normal, scenario model): FAIL

Expected: access_or_account / normal / auto. Actual: access_or_account / high / auto. Differences: urgency: expected normal, got high.

```bash
curl -i -X POST http://localhost:8787/api/support/route \
  -H 'Content-Type: application/json' \
  -d '{"message":"I forgot my password and can'\''t sign in to the booking system."}' -w '
@@time_total=%{time_total}'
```

```http
HTTP/1.1 200 OK
content-type: application/json
access-control-allow-origin: *

{"queue":"access_or_account","urgency":"high","needsHuman":false,"confidence":0.9436,"source":"model","model":"@cf/cloudflare/clef","fallbackReason":null,"details":{"queueProbabilities":{"booking_change":0.0074,"equipment_fault":0.0056,"access_or_account":0.9785,"general_question":0.0085},"urgencyScore":1.1355,"urgencyProbabilities":{"low":0.2447,"normal":0.3751,"high":0.3802},"needsHumanProbability":0.2369,"reasons":[],"latencyMs":521,"inputTokens":505,"reportedModel":"clef","contextRecords":[]}}
```

### T03 (normal, scenario model): PASS

Expected: general_question / low / auto. Actual: general_question / low / auto.

```bash
curl -i -X POST http://localhost:8787/api/support/route \
  -H 'Content-Type: application/json' \
  -d '{"message":"How many people can Meeting Room C hold?"}' -w '
@@time_total=%{time_total}'
```

```http
HTTP/1.1 200 OK
content-type: application/json
access-control-allow-origin: *

{"queue":"general_question","urgency":"low","needsHuman":false,"confidence":0.86,"source":"model","model":"@cf/cloudflare/clef","fallbackReason":null,"details":{"queueProbabilities":{"booking_change":0.0311,"equipment_fault":0.014,"access_or_account":0.0095,"general_question":0.9454},"urgencyScore":0.0804,"urgencyProbabilities":{"low":0.9312,"normal":0.0572,"high":0.0116},"needsHumanProbability":0.0353,"reasons":[],"latencyMs":316,"inputTokens":501,"reportedModel":"clef","contextRecords":[]}}
```

### T04 (edge, scenario model): PASS

Expected: booking_change / normal / auto. Actual: booking_change / normal / auto.

```bash
printf '%s' '{"message":"ขอยกเลิกการจองห้องประชุม C วันศุกร์นี้ค่ะ"}' | curl -i -X POST http://localhost:8787/api/support/route \
  -H 'Content-Type: application/json' \
  --data-binary @- -w '
@@time_total=%{time_total}'
```

```http
HTTP/1.1 200 OK
content-type: application/json
access-control-allow-origin: *

{"queue":"booking_change","urgency":"normal","needsHuman":false,"confidence":0.9763,"source":"model","model":"@cf/cloudflare/clef","fallbackReason":null,"details":{"queueProbabilities":{"booking_change":0.991,"equipment_fault":0.0025,"access_or_account":0.0029,"general_question":0.0036},"urgencyScore":1.0103,"urgencyProbabilities":{"low":0.1069,"normal":0.7759,"high":0.1172},"needsHumanProbability":0.0522,"reasons":[],"latencyMs":420,"inputTokens":512,"reportedModel":"clef","contextRecords":[]}}
```

### T05 (edge, scenario model): FAIL

Expected: equipment_fault / normal / auto. Actual: equipment_fault / low / auto. Differences: urgency: expected normal, got low.

```bash
curl -i -X POST http://localhost:8787/api/support/route \
  -H 'Content-Type: application/json' \
  -d '{"message":"projector broken"}' -w '
@@time_total=%{time_total}'
```

```http
HTTP/1.1 200 OK
content-type: application/json
access-control-allow-origin: *

{"queue":"equipment_fault","urgency":"low","needsHuman":false,"confidence":0.9706,"source":"model","model":"@cf/cloudflare/clef","fallbackReason":null,"details":{"queueProbabilities":{"booking_change":0.0036,"equipment_fault":0.9889,"access_or_account":0.0028,"general_question":0.0047},"urgencyScore":0.7678,"urgencyProbabilities":{"low":0.4259,"normal":0.3805,"high":0.1936},"needsHumanProbability":0.1518,"reasons":[],"latencyMs":389,"inputTokens":495,"reportedModel":"clef","contextRecords":[]}}
```

### T06 (edge, scenario model): FAIL

Expected: equipment_fault / normal / auto. Actual: equipment_fault / high / auto. Differences: urgency: expected normal, got high.

```bash
curl -i -X POST http://localhost:8787/api/support/route \
  -H 'Content-Type: application/json' \
  -d '{"message":"the camra in medai lab wont turn on, i need it tmrw morning for a shoot"}' -w '
@@time_total=%{time_total}'
```

```http
HTTP/1.1 200 OK
content-type: application/json
access-control-allow-origin: *

{"queue":"equipment_fault","urgency":"high","needsHuman":false,"confidence":0.9521,"source":"model","model":"@cf/cloudflare/clef","fallbackReason":null,"details":{"queueProbabilities":{"booking_change":0.0074,"equipment_fault":0.9818,"access_or_account":0.0052,"general_question":0.0056},"urgencyScore":1.7194,"urgencyProbabilities":{"low":0.0323,"normal":0.216,"high":0.7517},"needsHumanProbability":0.3844,"reasons":[],"latencyMs":437,"inputTokens":512,"reportedModel":"clef","contextRecords":[]}}
```

### T07 (fallback, scenario model_error): PASS

Expected: equipment_fault / high / person (fallback: model_error). Actual: equipment_fault / high / person (fallback: model_error).

```bash
curl -i -X POST http://localhost:8789/api/support/route \
  -H 'Content-Type: application/json' \
  -d '{"message":"The projector in Building 1 doesn'\''t work and my lecture starts in 20 minutes.","context":{"equipmentId":"eq-1"}}' -w '
@@time_total=%{time_total}'
```

```http
HTTP/1.1 200 OK
content-type: application/json
access-control-allow-origin: *

{"queue":"equipment_fault","urgency":"high","needsHuman":true,"confidence":0,"source":"fallback","model":null,"fallbackReason":"model_error","details":{"queueProbabilities":{"booking_change":0,"equipment_fault":0,"access_or_account":0,"general_question":0},"urgencyScore":2,"urgencyProbabilities":{"low":0,"normal":0,"high":0},"needsHumanProbability":1,"reasons":["the model call failed: AiError: 5007: No such model @cf/cloudflare/no-such-model or task","keyword rules matched: equipment_fault <- \"doesn't work\"; high urgency <- \"minutes\"","a fallback decision is always checked by a person"],"latencyMs":149,"inputTokens":null,"reportedModel":null,"contextRecords":[]}}
```

### T08 (fallback, scenario model_timeout): PASS

Expected: access_or_account / normal / person (fallback: model_timeout). Actual: access_or_account / normal / person (fallback: model_timeout).

```bash
curl -i -X POST http://localhost:8790/api/support/route \
  -H 'Content-Type: application/json' \
  -d '{"message":"My account is locked and I can'\''t log in."}' -w '
@@time_total=%{time_total}'
```

```http
HTTP/1.1 200 OK
content-type: application/json
access-control-allow-origin: *

{"queue":"access_or_account","urgency":"normal","needsHuman":true,"confidence":0,"source":"fallback","model":null,"fallbackReason":"model_timeout","details":{"queueProbabilities":{"booking_change":0,"equipment_fault":0,"access_or_account":0,"general_question":0},"urgencyScore":1,"urgencyProbabilities":{"low":0,"normal":0,"high":0},"needsHumanProbability":1,"reasons":["the model gave no answer within 1 ms","keyword rules matched: access_or_account <- \"log in\"; access_or_account <- \"account\"","a fallback decision is always checked by a person"],"latencyMs":2,"inputTokens":null,"reportedModel":null,"contextRecords":[]}}
```

### T09 (difficult, scenario model): FAIL

Expected: booking_change / normal / person. Actual: general_question / low / person. Differences: queue: expected booking_change, got general_question; urgency: expected normal, got low.

```bash
curl -i -X POST http://localhost:8787/api/support/route \
  -H 'Content-Type: application/json' \
  -d '{"message":"I was charged a late-return fine for Camera B, but I returned it on time. Please remove the fine.","context":{"equipmentId":"eq-2"}}' -w '
@@time_total=%{time_total}'
```

```http
HTTP/1.1 200 OK
content-type: application/json
access-control-allow-origin: *

{"queue":"general_question","urgency":"low","needsHuman":true,"confidence":0.2634,"source":"model","model":"@cf/cloudflare/clef","fallbackReason":null,"details":{"queueProbabilities":{"booking_change":0.2552,"equipment_fault":0.0814,"access_or_account":0.0527,"general_question":0.6107},"urgencyScore":0.4797,"urgencyProbabilities":{"low":0.5357,"normal":0.449,"high":0.0153},"needsHumanProbability":0.7828,"reasons":["the model judged that a person should read this message (probability 0.7828)","confidence 0.2634 in the queue is below the threshold 0.6"],"latencyMs":308,"inputTokens":521,"reportedModel":"clef","contextRecords":[]}}
```

### T10 (difficult, scenario model): FAIL

Expected: general_question / low / person. Actual: general_question / normal / person. Differences: urgency: expected low, got normal.

```bash
curl -i -X POST http://localhost:8787/api/support/route \
  -H 'Content-Type: application/json' \
  -d '{"message":"Can you book a bus to take my class to the science museum tomorrow?"}' -w '
@@time_total=%{time_total}'
```

```http
HTTP/1.1 200 OK
content-type: application/json
access-control-allow-origin: *

{"queue":"general_question","urgency":"normal","needsHuman":true,"confidence":0.2382,"source":"model","model":"@cf/cloudflare/clef","fallbackReason":null,"details":{"queueProbabilities":{"booking_change":0.4387,"equipment_fault":0.0286,"access_or_account":0.0501,"general_question":0.4826},"urgencyScore":1.0798,"urgencyProbabilities":{"low":0.1742,"normal":0.5718,"high":0.254},"needsHumanProbability":0.5418,"reasons":["the model judged that a person should read this message (probability 0.5418)","confidence 0.2382 in the queue is below the threshold 0.6"],"latencyMs":679,"inputTokens":507,"reportedModel":"clef","contextRecords":[]}}
```
