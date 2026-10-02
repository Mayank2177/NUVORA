"""Helpers for keeping blocking storage work off the ASGI event loop."""
from __future__ import annotations

from functools import wraps
from typing import Any, Awaitable, Callable, ParamSpec, TypeVar

from starlette.concurrency import run_in_threadpool

from config import settings

T = TypeVar("T")
P = ParamSpec("P")


async def run_blocking(func: Callable[..., T], *args: Any, **kwargs: Any) -> T:
    """Run one blocking operation in Starlette's bounded worker pool."""
    if settings.environment.lower() == "test":
        return func(*args, **kwargs)
    return await run_in_threadpool(func, *args, **kwargs)


def offload_database(func: Callable[P, T]) -> Callable[P, Awaitable[T]]:
    """Keep synchronous database handlers off the production event loop."""

    @wraps(func)
    async def wrapper(*args: P.args, **kwargs: P.kwargs) -> T:
        if settings.environment.lower() == "test":
            return func(*args, **kwargs)
        return await run_in_threadpool(func, *args, **kwargs)

    return wrapper