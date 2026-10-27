# A7 Interleaved Latency Check

- **Run at:** 2026-10-26T15:21:49.651Z; 5 rounds; in each round every case the model answers (T01, T02, T03, T04, T05, T06, T09, T10) was sent to both variants, one right after the other, alternating which went first.
- **Servers:** baseline `http://localhost:8787/api` (ROUTER_GROUNDING off), improved `http://localhost:8791/api` (ROUTER_GROUNDING on); one unmeasured warm-up request each.
- **How it was run:** `npm run eval:latency` (`eval/latency-check.mjs`); HTTP client: curl 8.4.0 (x86_64-w64-mingw32) libcurl/8.4.0 Schannel zlib/1.3 brotli/1.1.0 zstd/1.5.5 libidn2/2.3.4 libpsl/0.21.2 (+libidn2/2.3.3) libssh2/1.11.0
- **Decisions:** every decision was the same as in the evaluation run of its variant: yes.

## Result

| Measure (ms) | Baseline | Improved |
|---|---:|---:|
| Response time p50 (curl) | 870.6 | 749.9 |
| Response time p95 (curl) | 1924.8 | 2133.0 |
| Response time max (curl) | 2775.7 | 2506.6 |
| Decision time in the Worker p50 | 648.0 | 528.0 |
| Decision time in the Worker p95 | 1702.0 | 1901.0 |

Per pair (same case, same round): the improved variant was slower in 23 of 40 pairs; the median difference was 7.8 ms.

## Every pair

| Round | Case | First | Baseline ms | Improved ms | Difference ms | Baseline tokens | Improved tokens |
|------:|------|-------|------------:|------------:|--------------:|----------------:|----------------:|
| 1 | T01 | baseline | 878.3 | 650.9 | -227.4 | 520 | 866 |
| 1 | T02 | baseline | 1402.1 | 1493.1 | 91.0 | 505 | 847 |
| 1 | T03 | baseline | 1163.0 | 1584.2 | 421.2 | 501 | 864 |
| 1 | T04 | baseline | 640.5 | 747.4 | 106.9 | 512 | 858 |
| 1 | T05 | baseline | 584.1 | 590.6 | 6.5 | 495 | 825 |
| 1 | T06 | baseline | 1362.8 | 812.1 | -550.7 | 512 | 771 |
| 1 | T09 | baseline | 924.7 | 854.5 | -70.2 | 521 | 864 |
| 1 | T10 | baseline | 530.9 | 563.9 | 33.0 | 507 | 799 |
| 2 | T01 | improved | 528.4 | 740.9 | 212.5 | 520 | 866 |
| 2 | T02 | improved | 1105.8 | 937.0 | -168.8 | 505 | 847 |
| 2 | T03 | improved | 2438.4 | 666.7 | -1771.7 | 501 | 864 |
| 2 | T04 | improved | 389.0 | 677.1 | 288.1 | 512 | 858 |
| 2 | T05 | improved | 1924.8 | 1648.9 | -275.9 | 495 | 825 |
| 2 | T06 | improved | 2775.7 | 739.7 | -2036.0 | 512 | 771 |
| 2 | T09 | improved | 584.1 | 689.1 | 105.0 | 521 | 864 |
| 2 | T10 | improved | 1032.2 | 682.5 | -349.7 | 507 | 799 |
| 3 | T01 | baseline | 1556.6 | 1482.9 | -73.7 | 520 | 866 |
| 3 | T02 | baseline | 646.0 | 749.9 | 103.9 | 505 | 847 |
| 3 | T03 | baseline | 1348.3 | 651.5 | -696.8 | 501 | 864 |
| 3 | T04 | baseline | 596.7 | 862.3 | 265.6 | 512 | 858 |
| 3 | T05 | baseline | 624.3 | 625.6 | 1.3 | 495 | 825 |
| 3 | T06 | baseline | 438.8 | 603.0 | 164.2 | 512 | 771 |
| 3 | T09 | baseline | 883.3 | 476.8 | -406.5 | 521 | 864 |
| 3 | T10 | baseline | 782.7 | 630.7 | -152.0 | 507 | 799 |
| 4 | T01 | improved | 558.1 | 750.3 | 192.2 | 520 | 866 |
| 4 | T02 | improved | 870.6 | 931.4 | 60.8 | 505 | 847 |
| 4 | T03 | improved | 909.4 | 804.3 | -105.1 | 501 | 864 |
| 4 | T04 | improved | 1646.6 | 2409.7 | 763.1 | 512 | 858 |
| 4 | T05 | improved | 561.1 | 778.0 | 216.9 | 495 | 825 |
| 4 | T06 | improved | 1799.5 | 1580.9 | -218.6 | 512 | 771 |
| 4 | T09 | improved | 647.2 | 623.1 | -24.1 | 521 | 864 |
| 4 | T10 | improved | 581.7 | 589.5 | 7.8 | 507 | 799 |
| 5 | T01 | baseline | 1126.4 | 2133.0 | 1006.6 | 520 | 866 |
| 5 | T02 | baseline | 717.4 | 709.9 | -7.5 | 505 | 847 |
| 5 | T03 | baseline | 963.2 | 1707.1 | 743.9 | 501 | 864 |
| 5 | T04 | baseline | 1794.9 | 2506.6 | 711.7 | 512 | 858 |
| 5 | T05 | baseline | 1011.1 | 650.2 | -360.9 | 495 | 825 |
| 5 | T06 | baseline | 703.1 | 895.5 | 192.4 | 512 | 771 |
| 5 | T09 | baseline | 727.0 | 1335.5 | 608.5 | 521 | 864 |
| 5 | T10 | baseline | 699.7 | 939.0 | 239.3 | 507 | 799 |
