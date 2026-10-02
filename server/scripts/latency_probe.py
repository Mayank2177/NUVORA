"""Bounded authenticated-read latency gate for the supported Python runtime."""
from __future__ import annotations

import asyncio
import logging
import os
import statistics
import tempfile
import time
from pathlib import Path

import httpx


def _configure(database_path: Path) -> None:
    environment = os.getenv("NUVORA_LATENCY_ENVIRONMENT", "development")
    database_url = os.getenv("NUVORA_LATENCY_DATABASE_URL", "")
    os.environ.update(
        {
            "NUVORA_ENVIRONMENT": environment,
            "NUVORA_SECRET_KEY": "latency-signing-key-0123456789abcdef",
            "NUVORA_ENCRYPTION_KEY": "latency-encryption-key-fedcba987654",
            "NUVORA_PUBLIC_BASE_URL": "http://127.0.0.1:4117",
            "NUVORA_FRONTEND_BASE_URL": "http://localhost:3000",
            "NUVORA_CORS_ORIGINS": "http://localhost:3000",
            "NUVORA_DATABASE_PATH": str(database_path),
            "NUVORA_DATABASE_URL": database_url,
            "NUVORA_DATABASE_POOL_MIN_SIZE": "4",
            "NUVORA_DATABASE_POOL_SIZE": "20",
            "NUVORA_RATE_LIMIT_ENABLED": "false",
            "NUVORA_GITHUB_WEBHOOK_SECRET": "latency-webhook-secret",
        }
    )


async def _run() -> None:
    from api.app import app

    async with app.router.lifespan_context(app):
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app),
            base_url="http://test",
            timeout=10.0,
        ) as client:
            signup = await client.post(
                "/api/auth/signup",
                json={
                    "name": "Latency Probe",
                    "email": "latency-probe@example.com",
                    "password": "correct-horse-battery",
                },
            )
            signup.raise_for_status()
            headers = {"Authorization": f"Bearer {signup.json()['token']}"}
            project = await client.post(
                "/api/projects",
                headers=headers,
                json={"name": "Latency Probe Project"},
            )
            project.raise_for_status()

            async def timed_read(path: str) -> float:
                started = time.perf_counter()
                response = await client.get(path, headers=headers)
                response.raise_for_status()
                return (time.perf_counter() - started) * 1000

            async def measure(name: str, path: str) -> None:
                semaphore = asyncio.Semaphore(20)

                async def bounded_read() -> float:
                    async with semaphore:
                        return await timed_read(path)

                await asyncio.gather(*(bounded_read() for _ in range(10)))
                samples = sorted(
                    await asyncio.wait_for(
                        asyncio.gather(*(bounded_read() for _ in range(100))),
                        timeout=30,
                    )
                )
                p50 = statistics.median(samples)
                p95 = samples[94]
                p99 = samples[98]
                maximum = max(samples)
                print(
                    f"{name}: p50={p50:.1f}ms p95={p95:.1f}ms "
                    f"p99={p99:.1f}ms max={maximum:.1f}ms"
                )
                if p95 >= 250 or p99 >= 500:
                    raise SystemExit(
                        f"{name} latency budget exceeded: "
                        f"p95={p95:.1f}ms p99={p99:.1f}ms"
                    )

            await measure("authenticated profile reads", "/api/auth/me")
            await measure("project-list reads", "/api/projects?limit=20")


def main() -> None:
    logging.getLogger("httpx").setLevel(logging.WARNING)
    with tempfile.TemporaryDirectory(prefix="nuvora-latency-") as directory:
        _configure(Path(directory) / "nuvora.sqlite3")
        asyncio.run(_run())


if __name__ == "__main__":
    main()