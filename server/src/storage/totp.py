"""Minimal RFC 6238 TOTP and one-time recovery codes."""
import base64
import hashlib
import hmac
import secrets
import struct
import time
from urllib.parse import quote


def new_secret() -> str:
    return base64.b32encode(secrets.token_bytes(20)).decode("ascii").rstrip("=")


def code_at(secret: str, counter: int) -> str:
    key = base64.b32decode(secret + "=" * (-len(secret) % 8), casefold=True)
    digest = hmac.new(key, struct.pack(">Q", counter), hashlib.sha1).digest()
    offset = digest[-1] & 0x0F
    value = struct.unpack(">I", digest[offset:offset + 4])[0] & 0x7FFFFFFF
    return f"{value % 1_000_000:06d}"


def verify_code(secret: str, code: str, now: int | None = None) -> bool:
    if len(code) != 6 or not code.isascii() or not code.isdigit():
        return False
    counter = int((now if now is not None else time.time()) // 30)
    return any(hmac.compare_digest(code_at(secret, counter + step), code) for step in (-1, 0, 1))


def provisioning_uri(secret: str, email: str) -> str:
    label = quote(f"Nuvora:{email}", safe="")
    return f"otpauth://totp/{label}?secret={secret}&issuer=Nuvora&digits=6&period=30"


def new_backup_codes(count: int = 10) -> list[str]:
    # 64 bits of entropy per single-use recovery code.
    return [secrets.token_hex(8).upper() for _ in range(count)]


def backup_code_hash(code: str) -> str:
    return hashlib.sha256(code.replace("-", "").upper().encode("ascii")).hexdigest()
