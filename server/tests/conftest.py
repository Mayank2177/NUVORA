import os
import tempfile


_db = tempfile.NamedTemporaryFile(prefix="nuvora-tests-", suffix=".sqlite3", delete=False)
_db.close()

os.environ.update({
    "NUVORA_ENVIRONMENT": "test",
    "NUVORA_SECRET_KEY": "0123456789abcdef0123456789abcdef",
    "NUVORA_ENCRYPTION_KEY": "abcdef0123456789abcdef0123456789",
    "NUVORA_PUBLIC_BASE_URL": "http://localhost:3000",
    "NUVORA_CORS_ORIGINS": "http://localhost:3000",
    "NUVORA_DATABASE_PATH": _db.name,
    "NUVORA_RATE_LIMIT_ENABLED": "false",
    "NUVORA_GITHUB_WEBHOOK_SECRET": "test-webhook-secret",
})