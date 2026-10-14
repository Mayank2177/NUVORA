"""Application-wide storage instance.

Keeping one instance ensures all SQLite writes in this process share the same
lock and avoids repeatedly initializing the schema during route imports.
"""
from functools import lru_cache

from src.config import settings
from .db import Storage


@lru_cache(maxsize=1)
def get_storage() -> Storage:
    return Storage(
        settings.database_path,
        database_url=settings.database_url,
        database_pool_min_size=settings.database_pool_min_size,
        database_pool_size=settings.database_pool_size,
    )


class LazyStorage:
    """Delay opening the database until storage is first used."""

    def __getattr__(self, name):
        return getattr(get_storage(), name)


storage = LazyStorage()