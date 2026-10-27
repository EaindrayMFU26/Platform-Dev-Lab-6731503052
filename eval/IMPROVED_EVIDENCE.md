# A7 Evaluation Evidence: improved

- **Variant:** improved: retrieved guidelines from the knowledge base are sent to the model (`ROUTER_GROUNDING` on)
- **Result:** accuracy 10 of 10 cases = 100% (queue 10/10, urgency 10/10, needs-a-person 10/10); every repetition gave the same decision: yes
- **Response time (curl, all 50 requests):** p50 780.6 ms, p95 1962.6 ms, max 2930.8 ms
- **Response time of the 40 requests the model answered:** p50 818.1 ms, p95 1962.6 ms; time inside the Worker for the decision: p50 599 ms, p95 1742 ms
- **Input tokens per task the model answered (measured, reported by the model):** mean 836.8, min 771, max 866
- **Estimated cost per task the model answered:** $0.0002008 (18.26 neurons) = measured tokens × $0.24 per million input tokens, Cloudflare's published price; output tokens are free
- **Run at:** 2026-10-26T15:14:05.552Z; 5 repetitions of every case, sent one at a time in rounds (T01 to T10, then again), after one unmeasured warm-up request per server
- **Servers:** model `http://localhost:8787/api`, model_error `http://localhost:8789/api`, model_timeout `http://localhost:8790/api`
- **Dataset:** `eval/eval-cases.json` (SHA-256 6d512372deb78b453897e35abcb374dfb3830a0ffad2476d5c5c97c4e22045b5); knowledge base `src/knowledge-base.json` (SHA-256 fc202fe529f2d447c7122155de9068423133e7a71438d04299b70890be52355b)
- **How it was run:** `npm run eval -- --variant improved` (`eval/run-eval.mjs`); HTTP client: curl 8.4.0 (x86_64-w64-mingw32) libcurl/8.4.0 Schannel zlib/1.3 brotli/1.1.0 zstd/1.5.5 libidn2/2.3.4 libpsl/0.21.2 (+libidn2/2.3.3) libssh2/1.11.0

A case is correct when queue, urgency and needsHuman all equal the expected values; for a fallback case the decision must also come from the
fallback with the expected fallbackReason. A case counts as correct only if every repetition is correct. The response time is curl's
`time_total` for the request, so starting the curl process is not included. The cost is an estimate (measured tokens × list price); on the
free plan these requests are not billed within the daily allowance.

## Results per case

| ID | Type | Expected (queue / urgency / who) | Actual (queue / urgency / who) | Pass/Fail | Median ms | Tokens | Context records |
|----|------|----------------------------------|--------------------------------|-----------|----------:|-------:|-----------------|
| T01 | normal | booking_change / normal / auto | booking_change / normal / auto | PASS | 881.4 | 866 | KB01, KB05, KB07, KB10 |
| T02 | normal | access_or_account / normal / auto | access_or_account / normal / auto | PASS | 997.3 | 847 | KB01, KB03, KB05, KB07 |
| T03 | normal | general_question / low / auto | general_question / low / auto | PASS | 1335.7 | 864 | KB04, KB05, KB07, KB10 |
| T04 | edge | booking_change / normal / auto | booking_change / normal / auto | PASS | 1086.4 | 858 | KB01, KB05, KB07, KB10 |
| T05 | edge | equipment_fault / normal / auto | equipment_fault / normal / auto | PASS | 648.2 | 825 | KB02, KB05, KB07, KB10 |
| T06 | edge | equipment_fault / normal / auto | equipment_fault / normal / auto | PASS | 780.6 | 771 | KB02, KB05, KB07 |
| T07 | fallback | equipment_fault / high / person (fallback: model_error) | equipment_fault / high / person (fallback: model_error) | PASS | 370.2 | n/a | KB02, KB05, KB07, KB10 |
| T08 | fallback | access_or_account / normal / person (fallback: model_timeout) | access_or_account / normal / person (fallback: model_timeout) | PASS | 233.6 | n/a | KB03, KB05, KB07 |
| T09 | difficult | booking_change / normal / person | booking_change / normal / person | PASS | 818.1 | 864 | KB05, KB07, KB09, KB10 |
| T10 | difficult | general_question / low / person | general_question / low / person | PASS | 800.9 | 799 | KB04, KB05, KB07 |

## Every measured request

Response time in ms, as measured by curl. Warm-up requests (not counted): model 2763.6 ms, model_error 771.5 ms, model_timeout 247.9 ms.

| Repetition | T01 | T02 | T03 | T04 | T05 | T06 | T07 | T08 | T09 | T10 |
|-----------:|-----:|-----:|-----:|-----:|-----:|-----:|-----:|-----:|-----:|-----:|
| 1 | 1355.5 | 997.3 | 2262.1 | 645.4 | 598.7 | 2930.8 | 389.8 | 233.6 | 1270.9 | 646.0 |
| 2 | 881.4 | 1362.3 | 597.3 | 1492.0 | 1336.1 | 721.3 | 370.2 | 237.1 | 652.3 | 1935.7 |
| 3 | 668.4 | 608.9 | 1962.6 | 1217.4 | 481.6 | 653.3 | 350.5 | 221.4 | 816.3 | 741.9 |
| 4 | 1552.1 | 1134.4 | 934.7 | 1086.4 | 648.2 | 807.7 | 408.6 | 229.1 | 818.1 | 800.9 |
| 5 | 585.6 | 605.9 | 1335.7 | 801.2 | 876.2 | 780.6 | 370.1 | 236.5 | 1497.4 | 1033.0 |

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

{"queue":"booking_change","urgency":"normal","needsHuman":false,"confidence":0.9809,"source":"model","model":"@cf/cloudflare/clef","fallbackReason":null,"details":{"queueProbabilities":{"booking_change":0.9928,"equipment_fault":0.0017,"access_or_account":0.0022,"general_question":0.0033},"urgencyScore":0.746,"urgencyProbabilities":{"low":0.2971,"normal":0.6599,"high":0.043},"needsHumanProbability":0.0133,"reasons":[],"latencyMs":1141,"inputTokens":866,"reportedModel":"clef","contextRecords":["KB01","KB05","KB07","KB10"]}}
```

### T02 (normal, scenario model): PASS

Expected: access_or_account / normal / auto. Actual: access_or_account / normal / auto.

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

{"queue":"access_or_account","urgency":"normal","needsHuman":false,"confidence":0.9644,"source":"model","model":"@cf/cloudflare/clef","fallbackReason":null,"details":{"queueProbabilities":{"booking_change":0.0035,"equipment_fault":0.0038,"access_or_account":0.9865,"general_question":0.0062},"urgencyScore":0.9284,"urgencyProbabilities":{"low":0.1518,"normal":0.768,"high":0.0802},"needsHumanProbability":0.0119,"reasons":[],"latencyMs":776,"inputTokens":847,"reportedModel":"clef","contextRecords":["KB01","KB03","KB05","KB07"]}}
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

{"queue":"general_question","urgency":"low","needsHuman":false,"confidence":0.9532,"source":"model","model":"@cf/cloudflare/clef","fallbackReason":null,"details":{"queueProbabilities":{"booking_change":0.0075,"equipment_fault":0.0048,"access_or_account":0.0055,"general_question":0.9822},"urgencyScore":0.033,"urgencyProbabilities":{"low":0.9747,"normal":0.0176,"high":0.0077},"needsHumanProbability":0.0174,"reasons":[],"latencyMs":2034,"inputTokens":864,"reportedModel":"clef","contextRecords":["KB04","KB05","KB07","KB10"]}}
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

{"queue":"booking_change","urgency":"normal","needsHuman":false,"confidence":0.9856,"source":"model","model":"@cf/cloudflare/clef","fallbackReason":null,"details":{"queueProbabilities":{"booking_change":0.9946,"equipment_fault":0.0014,"access_or_account":0.0016,"general_question":0.0024},"urgencyScore":1.313,"urgencyProbabilities":{"low":0.0455,"normal":0.5961,"high":0.3584},"needsHumanProbability":0.0356,"reasons":[],"latencyMs":412,"inputTokens":858,"reportedModel":"clef","contextRecords":["KB01","KB05","KB07","KB10"]}}
```

### T05 (edge, scenario model): PASS

Expected: equipment_fault / normal / auto. Actual: equipment_fault / normal / auto.

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

{"queue":"equipment_fault","urgency":"normal","needsHuman":false,"confidence":0.9861,"source":"model","model":"@cf/cloudflare/clef","fallbackReason":null,"details":{"queueProbabilities":{"booking_change":0.0014,"equipment_fault":0.9948,"access_or_account":0.0016,"general_question":0.0022},"urgencyScore":0.8233,"urgencyProbabilities":{"low":0.2255,"normal":0.7257,"high":0.0488},"needsHumanProbability":0.022,"reasons":[],"latencyMs":375,"inputTokens":825,"reportedModel":"clef","contextRecords":["KB02","KB05","KB07","KB10"]}}
```

### T06 (edge, scenario model): PASS

Expected: equipment_fault / normal / auto. Actual: equipment_fault / normal / auto.

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

{"queue":"equipment_fault","urgency":"normal","needsHuman":false,"confidence":0.978,"source":"model","model":"@cf/cloudflare/clef","fallbackReason":null,"details":{"queueProbabilities":{"booking_change":0.003,"equipment_fault":0.9917,"access_or_account":0.002,"general_question":0.0033},"urgencyScore":1.019,"urgencyProbabilities":{"low":0.0342,"normal":0.9127,"high":0.0531},"needsHumanProbability":0.0162,"reasons":[],"latencyMs":2716,"inputTokens":771,"reportedModel":"clef","contextRecords":["KB02","KB05","KB07"]}}
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

{"queue":"equipment_fault","urgency":"high","needsHuman":true,"confidence":0,"source":"fallback","model":null,"fallbackReason":"model_error","details":{"queueProbabilities":{"booking_change":0,"equipment_fault":0,"access_or_account":0,"general_question":0},"urgencyScore":2,"urgencyProbabilities":{"low":0,"normal":0,"high":0},"needsHumanProbability":1,"reasons":["the model call failed: AiError: 5007: No such model @cf/cloudflare/no-such-model or task","keyword rules matched: equipment_fault <- \"doesn't work\"; high urgency <- \"minutes\"","a fallback decision is always checked by a person"],"latencyMs":160,"inputTokens":null,"reportedModel":null,"contextRecords":["KB02","KB05","KB07","KB10"]}}
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

{"queue":"access_or_account","urgency":"normal","needsHuman":true,"confidence":0,"source":"fallback","model":null,"fallbackReason":"model_timeout","details":{"queueProbabilities":{"booking_change":0,"equipment_fault":0,"access_or_account":0,"general_question":0},"urgencyScore":1,"urgencyProbabilities":{"low":0,"normal":0,"high":0},"needsHumanProbability":1,"reasons":["the model gave no answer within 1 ms","keyword rules matched: access_or_account <- \"log in\"; access_or_account <- \"account\"","a fallback decision is always checked by a person"],"latencyMs":6,"inputTokens":null,"reportedModel":null,"contextRecords":["KB03","KB05","KB07"]}}
```

### T09 (difficult, scenario model): PASS

Expected: booking_change / normal / person. Actual: booking_change / normal / person.

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

{"queue":"booking_change","urgency":"normal","needsHuman":true,"confidence":0.5578,"source":"model","model":"@cf/cloudflare/clef","fallbackReason":null,"details":{"queueProbabilities":{"booking_change":0.8079,"equipment_fault":0.0477,"access_or_account":0.0339,"general_question":0.1105},"urgencyScore":0.9649,"urgencyProbabilities":{"low":0.0561,"normal":0.9229,"high":0.021},"needsHumanProbability":0.9603,"reasons":["the model judged that a person should read this message (probability 0.9603)","confidence 0.5578 in the queue is below the threshold 0.6"],"latencyMs":1049,"inputTokens":864,"reportedModel":"clef","contextRecords":["KB05","KB07","KB09","KB10"]}}
```

### T10 (difficult, scenario model): PASS

Expected: general_question / low / person. Actual: general_question / low / person.

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

{"queue":"general_question","urgency":"low","needsHuman":true,"confidence":0.9452,"source":"model","model":"@cf/cloudflare/clef","fallbackReason":null,"details":{"queueProbabilities":{"booking_change":0.012,"equipment_fault":0.0035,"access_or_account":0.0054,"general_question":0.9791},"urgencyScore":0.2667,"urgencyProbabilities":{"low":0.7876,"normal":0.1581,"high":0.0543},"needsHumanProbability":0.7639,"reasons":["the model judged that a person should read this message (probability 0.7639)"],"latencyMs":410,"inputTokens":799,"reportedModel":"clef","contextRecords":["KB04","KB05","KB07"]}}
```
