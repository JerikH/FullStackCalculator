# Testing details

Benchmarks, browser tests, durations, image sizes and the CI entry point. The commands and the coverage table are in the [README](../README.md#testing--coverage). The figures here were measured at revision `5a00a5d` on one machine (4 CPUs, 14 GB RAM, WSL2, Go 1.27.3, Node 24.22.1); the commands and raw results are in [verification.md](verification.md).

## Benchmarks

Median of three samples, in ns/op. Every `BenchmarkCalculate` case must stay under 1,000,000 ns/op and every `BenchmarkCalculateWorstCase` case (powers with operands at the edges of the range) under 50,000,000 ns/op; `make bench` fails otherwise.

| Case | Median ns/op | Budget ns/op |
|---|---|---|
| `BenchmarkCalculate/add` | 1,536 | 1,000,000 |
| `BenchmarkCalculate/divide_repeating` | 1,697 | 1,000,000 |
| `BenchmarkCalculate/sqrt_irrational` | 8,590 | 1,000,000 |
| `BenchmarkCalculate/power_overflow` | 20,821 | 1,000,000 |
| `BenchmarkCalculate/power_large_integer` | 65,379 | 1,000,000 |
| `BenchmarkCalculate/power_fractional` | 290,082 | 1,000,000 |
| `BenchmarkCalculateWorstCase/max^0.5` | 3,945,532 | 50,000,000 |
| `BenchmarkCalculateWorstCase/(-1)^1e6144` | 4,332,797 | 50,000,000 |
| `BenchmarkCalculateWorstCase/min^0.5` | 4,513,705 | 50,000,000 |
| `BenchmarkCalculateWorstCase/min^0.99…9` | 9,349,798 | 50,000,000 |
| `BenchmarkCalculateWorstCase/1.5e-6143^-0.99…9` | 11,037,900 | 50,000,000 |
| `BenchmarkCalculateWorstCase/max^0.99…9` | 12,889,222 | 50,000,000 |
| `BenchmarkCalculateWorstCase/max^-0.99…9` | 12,956,672 | 50,000,000 |

## Browser tests, fuzzing and the composed stack

The Playwright suite runs against the real composed stack in two projects, `chromium` (desktop) and `mobile-chromium` (Pixel 7). It covers the seven operations through the UI with the real request asserted, chaining, errors with their `Ref`, editing, history, themes and the theme bootstrap under the real CSP, keyboard input, accessibility (axe, zero violations in both themes), layout at 320, 393, 768 and 1280 px, the security headers and the edge against the real service. The recorded run: 186 passed and 1 skipped (a touch-only test) on `chromium`, 187 passed on `mobile-chromium`, and 6 passed in the specs that disturb the stack (held connections, rate bursts, the drain window, replacing `api`). `make fuzz` ran both targets for 30 s each with no panics. The all-in-one smoke ran 58 checks with no failures.

## Durations

Measured wall-clock times on the same machine (warm caches unless stated); every local command stays under ten minutes.

| Command | Duration |
|---|---|
| `make coverage-backend` | 7.2 s warm (51.8 s cold) |
| `make coverage-frontend` | 53.2 s |
| `make fuzz` | 1 min 5 s |
| `make bench` | 54.3 s |
| `make lint` | 47.3 s |
| `make up` (images cached) | 16.8 s |
| `make e2e` on `chromium` | 4 min 8 s |
| `make e2e` on `mobile-chromium` | 4 min 9 s |
| `make e2e`, specs that disturb the stack | 1 min 10 s |
| `make image-aio` | 6.3 s |
| `make smoke-aio` | 9.5 s |
| `make docs-api` | 1.1 s |

## Image sizes

The API image is expected to stay under 20 MB. The size has three readings, and each is named:

| Image | Layer sum | Compressed content | `docker images` listing |
|---|---|---|---|
| `calculator-api` | 16.5 MB | 5.3 MB | 21.8 MB |
| `calculator` (all-in-one) | 18.0 MB | 5.6 MB | 23.7 MB |
| `calculator-web` | 66.1 MB | 25.9 MB | 92 MB |

The reading against the 20 MB expectation is the sum of the image layers (16.5 MB for the API image). The compressed content is what a registry transfers; the `docker images` listing includes the snapshot accounting of Docker's containerd image store.

## Running the CI checks locally

`scripts/ci/t3.sh` runs the CI checks, whole or one job at a time (`--job <name>`), or exactly the stages you name (`--stage <name>`, repeatable); `--list` prints the jobs and stages without running anything. It prints every command with its duration and stops at the first failure unless `--keep-going` is given.
