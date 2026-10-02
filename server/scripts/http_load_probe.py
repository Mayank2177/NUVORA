"""Read-only latency gate for a deployed NUVORA API."""
from __future__ import annotations

import asyncio
import os
import statistics
import time
from urllib.parse import urlparse

import httpx


def _percentile(samples: list[float], percentile: float) -> float:
    index = max(0, min(len(samples) - 1, int(len(samples) * percentile) - 1))
    return samples[index]


async def main() -> None:
    base_url = os.environ.get("NUVORA_LOAD_BASE_URL", "").rstrip("/")
    token = os.environ.get("NUVORA_LOAD_TOKEN", "")
    allow_http = os.environ.get("NUVORA_LOAD_ALLOW_HTTP", "").lower() == "true"
    concurrency = int(os.environ.get("NUVORA_LOAD_CONCURRENCY", "20"))
    request_count = int(os.environ.get("NUVORA_LOAD_REQUESTS", "200"))
    p95_budget = float(os.environ.get("NUVORA_LOAD_P95_MS", "250"))
    p99_budget = float(os.environ.get("NUVORA_LOAD_P99_MS", "500"))
    paths = [
        path.strip()
        for path in os.environ.get(
            "NUVORA_LOAD_PATHS", "/api/auth/me,/api/projects?limit=20"
        ).split(",")
        if path.strip()
    ]

    parsed = urlparse(base_url)
    if not base_url or not token:
        raise SystemExit("NUVORA_LOAD_BASE_URL and NUVORA_LOAD_TOKEN are required")
    if parsed.scheme != "https" and not allow_http:
        raise SystemExit("The deployed load probe requires HTTPS")
    if concurrency < 1 or request_count < concurrency:
        raise SystemExit("Invalid load concurrency/request count")

    limits = httpx.Limits(
        max_connections=concurrency,
        max_keepalive_connections=concurrency,
    )
    timeout = httpx.Timeout(10.0, connect=5.0, pool=5.0)
    headers = {"Authorization": f"Bearer {token}"}
    semaphore = asyncio.Semaphore(concurrency)

    async with httpx.AsyncClient(
        base_url=base_url,
        headers=headers,
        timeout=timeout,
        limits=limits,
    ) as client:
        for path in paths:
            async def request_once() -> float:
                async with semaphore:
                    started = time.perf_counter()
                    response = await client.get(path)
                    response.raise_for_status()
                    return (time.perf_counter() - started) * 1000

            await asyncio.gather(*(request_once() for _ in range(concurrency)))
            samples = sorted(
                await asyncio.gather(*(request_once() for _ in range(request_count)))
            )
            p50 = statistics.median(samples)
            p95 = _percentile(samples, 0.95)
            p99 = _percentile(samples, 0.99)
            maximum = max(samples)
            print(
                f"{path}: p50={p50:.1f}ms p95={p95:.1f}ms "
                f"p99={p99:.1f}ms max={maximum:.1f}ms"
            )
            if p95 >= p95_budget or p99 >= p99_budget:
                raise SystemExit(
                    f"Latency budget exceeded for {path}: "
                    f"p95={p95:.1f}ms p99={p99:.1f}ms"
                )


if __name__ == "__main__":
    asyncio.run(main())