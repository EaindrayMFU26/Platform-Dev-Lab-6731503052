# A7 Evaluation: before and after

- **Baseline:** 2026-10-26T15:11:55.476Z, ROUTER_GROUNDING off (the A6 capability). **Improved:** 2026-10-26T15:14:05.552Z, ROUTER_GROUNDING on.
- **Same dataset and knowledge base in both runs:** eval-cases.json SHA-256 6d512372deb78b453897e35abcb374dfb3830a0ffad2476d5c5c97c4e22045b5, knowledge-base.json SHA-256 fc202fe529f2d447c7122155de9068423133e7a71438d04299b70890be52355b.
- **Repetitions:** 5 (baseline) and 5 (improved) of every case; 50 and 50 measured requests.
- **Cases that improved:** T02, T05, T06, T09, T10. **Cases that became worse:** none.
- Latency and tokens are measured; the cost is an estimate from the measured tokens and the published price.
- Written by `npm run eval:compare` (`eval/compare.mjs`) from `eval/results/baseline.json` and `eval/results/improved.json`.

## Metrics

| Metric | Before | After | Change |
|---|---|---|---|
| Accuracy | 5/10 = 50% | 10/10 = 100% | +50 points |
| p95 latency, all requests (curl) | 937.8 ms | 1962.6 ms | +1024.8 ms (+109%) |
| p95 latency, requests the model answered (curl) | 937.8 ms | 1962.6 ms | +1024.8 ms (+109%) |
| p50 latency, all requests (curl) | 626.3 ms | 780.6 ms | +154.3 ms |
| Input tokens per task the model answered (measured) | 509.1 | 836.8 | +327.6 (+64%) |
| Cost per task, estimated (tokens × list price) | $0.0001222 | $0.0002008 | +64% |
| Neurons per task, estimated | 11.11 | 18.26 | +64% |
| Queue / urgency / who agreement | 9 / 5 / 10 | 10 / 10 / 10 |  |

## Time inside the Worker, per round

Median (p50, nearest-rank) of the decision time measured inside the Worker, over the requests the model answered in each round (the fallback cases are left out).

| Round | Before (ms) | After (ms) |
|---:|---:|---:|
| 1 | 420 | 776 |
| 2 | 443 | 655 |
| 3 | 389 | 448 |
| 4 | 413 | 599 |
| 5 | 420 | 575 |
| Range | 389 to 443 | 448 to 776 |

## Cases

| ID | Type | Expected | Before | After | Before | After | Change | Records sent (after) | Tokens before → after |
|----|------|----------|--------|-------|--------|-------|--------|----------------------|----------------------|
| T01 | normal | booking_change / normal / auto | booking_change / normal / auto | booking_change / normal / auto | PASS | PASS | same (pass) | KB01, KB05, KB07, KB10 | 520 → 866 |
| T02 | normal | access_or_account / normal / auto | access_or_account / high / auto | access_or_account / normal / auto | FAIL | PASS | **improved** | KB01, KB03, KB05, KB07 | 505 → 847 |
| T03 | normal | general_question / low / auto | general_question / low / auto | general_question / low / auto | PASS | PASS | same (pass) | KB04, KB05, KB07, KB10 | 501 → 864 |
| T04 | edge | booking_change / normal / auto | booking_change / normal / auto | booking_change / normal / auto | PASS | PASS | same (pass) | KB01, KB05, KB07, KB10 | 512 → 858 |
| T05 | edge | equipment_fault / normal / auto | equipment_fault / low / auto | equipment_fault / normal / auto | FAIL | PASS | **improved** | KB02, KB05, KB07, KB10 | 495 → 825 |
| T06 | edge | equipment_fault / normal / auto | equipment_fault / high / auto | equipment_fault / normal / auto | FAIL | PASS | **improved** | KB02, KB05, KB07 | 512 → 771 |
| T07 | fallback | equipment_fault / high / person (fallback) | equipment_fault / high / person (fallback) | equipment_fault / high / person (fallback) | PASS | PASS | same (pass) | KB02, KB05, KB07, KB10 | n/a → n/a |
| T08 | fallback | access_or_account / normal / person (fallback) | access_or_account / normal / person (fallback) | access_or_account / normal / person (fallback) | PASS | PASS | same (pass) | KB03, KB05, KB07 | n/a → n/a |
| T09 | difficult | booking_change / normal / person | general_question / low / person | booking_change / normal / person | FAIL | PASS | **improved** | KB05, KB07, KB09, KB10 | 521 → 864 |
| T10 | difficult | general_question / low / person | general_question / normal / person | general_question / low / person | FAIL | PASS | **improved** | KB04, KB05, KB07 | 507 → 799 |
