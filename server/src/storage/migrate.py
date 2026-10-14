"""Database migration utilities for NUVORA."""
import logging
from pathlib import Path
from typing import Optional

from src.config import settings
from src.storage.instance import get_storage

logger = logging.getLogger(__name__)

MIGRATIONS_DIR = Path(__file__).parent / "migrations"


def get_current_version() -> int:
    """Get the current schema version from the database."""
    storage = get_storage()
    try:
        result = storage.fetchone(
            "SELECT MAX(version) as version FROM schema_migrations"
        )
        return result["version"] if result and result["version"] else 0
    except Exception:
        # schema_migrations table doesn't exist yet
        return 0


def get_pending_migrations() -> list[tuple[int, Path]]:
    """Get list of pending migration files."""
    if not MIGRATIONS_DIR.exists():
        return []
    
    current_version = get_current_version()
    migrations = []
    
    for file in sorted(MIGRATIONS_DIR.glob("*.sql")):
        # Extract version from filename like "002_marketplace_extensions.sql"
        try:
            version = int(file.stem.split("_")[0])
            if version > current_version:
                migrations.append((version, file))
        except (ValueError, IndexError):
            logger.warning(f"Skipping invalid migration filename: {file.name}")
            continue
    
    return sorted(migrations, key=lambda x: x[0])


def apply_migration(version: int, sql_file: Path) -> bool:
    """Apply a single migration file."""
    logger.info(f"Applying migration {version}: {sql_file.name}")
    
    try:
        sql_content = sql_file.read_text(encoding="utf-8")
        storage = get_storage()
        
        # Split on semicolons but be careful with PostgreSQL dollar-quoted strings
        # For now, we'll execute the whole file as one transaction
        statements = [s.strip() for s in sql_content.split(";") if s.strip()]
        
        def transaction(conn):
            for statement in statements:
                # Skip comments and empty statements
                if not statement or statement.startswith("--"):
                    continue
                    
                # Skip PostgreSQL-specific DO blocks for SQLite
                if statement.strip().startswith("DO $$") and not settings.database_url:
                    continue
                
                # Handle ALTER TABLE ADD COLUMN for SQLite
                if "ALTER TABLE" in statement and not settings.database_url:
                    # SQLite has limited ALTER TABLE support
                    # Skip constraint modifications
                    if "DROP CONSTRAINT" in statement or "ADD CONSTRAINT" in statement:
                        continue
                
                try:
                    conn.execute(statement)
                except Exception as e:
                    # Log but continue for certain expected errors
                    if "already exists" in str(e).lower() or "duplicate" in str(e).lower():
                        logger.warning(f"Skipping duplicate object: {e}")
                        continue
                    raise
        
        storage.executemany_tx(transaction)
        logger.info(f"Successfully applied migration {version}")
        return True
        
    except Exception as e:
        logger.error(f"Failed to apply migration {version}: {e}", exc_info=True)
        return False


def run_migrations() -> tuple[int, int]:
    """
    Run all pending migrations.
    
    Returns:
        Tuple of (applied_count, failed_count)
    """
    pending = get_pending_migrations()
    
    if not pending:
        logger.info("No pending migrations")
        return (0, 0)
    
    logger.info(f"Found {len(pending)} pending migration(s)")
    
    applied = 0
    failed = 0
    
    for version, sql_file in pending:
        if apply_migration(version, sql_file):
            applied += 1
        else:
            failed += 1
            # Stop on first failure
            break
    
    logger.info(f"Migration complete: {applied} applied, {failed} failed")
    return (applied, failed)


def create_migration(name: str, sql: str) -> Optional[Path]:
    """
    Create a new migration file.
    
    Args:
        name: Migration name (e.g., "add_user_roles")
        sql: SQL content
    
    Returns:
        Path to created migration file, or None on failure
    """
    try:
        MIGRATIONS_DIR.mkdir(parents=True, exist_ok=True)
        
        # Get next version number
        current_version = get_current_version()
        existing_files = list(MIGRATIONS_DIR.glob("*.sql"))
        max_file_version = 0
        
        for file in existing_files:
            try:
                file_version = int(file.stem.split("_")[0])
                max_file_version = max(max_file_version, file_version)
            except (ValueError, IndexError):
                continue
        
        next_version = max(current_version, max_file_version) + 1
        
        # Create filename
        clean_name = name.replace(" ", "_").replace("-", "_").lower()
        filename = f"{next_version:03d}_{clean_name}.sql"
        filepath = MIGRATIONS_DIR / filename
        
        # Write migration
        content = f"""-- Migration {next_version:03d}: {name}
-- Created: {__import__('datetime').datetime.utcnow().strftime('%Y-%m-%d')}

-- Track migration
INSERT INTO schema_migrations (version, applied_at)
VALUES ({next_version}, datetime('now'))
ON CONFLICT(version) DO NOTHING;

{sql}
"""
        filepath.write_text(content, encoding="utf-8")
        logger.info(f"Created migration: {filepath}")
        return filepath
        
    except Exception as e:
        logger.error(f"Failed to create migration: {e}", exc_info=True)
        return None


if __name__ == "__main__":
    # Run migrations when executed directly
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s :: %(message)s",
    )
    
    logger.info("Starting database migration")
    logger.info(f"Database: {'PostgreSQL' if settings.database_url else settings.database_path}")
    
    applied, failed = run_migrations()
    
    if failed > 0:
        logger.error("Migration failed!")
        exit(1)
    elif applied == 0:
        logger.info("Database is up to date")
    else:
        logger.info(f"Successfully applied {applied} migration(s)")
