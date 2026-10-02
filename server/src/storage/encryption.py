"""Authenticated encryption utilities for sensitive data storage."""
import base64
import hashlib
import secrets
from typing import Optional


def derive_key(secret: str, salt: bytes) -> bytes:
    """Derive a 256-bit key from a dedicated encryption secret."""
    return hashlib.pbkdf2_hmac("sha256", secret.encode(), salt, iterations=600_000, dklen=32)


def _direct_key(secret: str) -> bytes:
    """Derive a fixed AES-256 key from the required high-entropy secret."""
    return hashlib.sha256(secret.encode("utf-8")).digest()


def encrypt_token(token: str, secret_key: str) -> str:
    """
    Encrypt a token using AES-256-GCM and a fresh nonce.

    Format: base64(version:salt:nonce:ciphertext-and-tag)
    """
    if not token:
        return ""
    
    try:
        from cryptography.hazmat.primitives.ciphers.aead import AESGCM
    except ImportError as exc:  # pragma: no cover - deployment dependency guard
        raise RuntimeError("cryptography is required for token encryption") from exc

    nonce = secrets.token_bytes(12)
    key = _direct_key(secret_key)
    ciphertext = AESGCM(key).encrypt(nonce, token.encode("utf-8"), b"nuvora-github-token-v1")
    encrypted = b"\x02" + nonce + ciphertext
    return base64.urlsafe_b64encode(encrypted).decode('ascii')


def decrypt_token(encrypted: str, secret_key: str) -> Optional[str]:
    """
    Decrypt a token encrypted with encrypt_token.
    
    Returns None if decryption fails or token is invalid.
    """
    if not encrypted:
        return None
    
    try:
        from cryptography.hazmat.primitives.ciphers.aead import AESGCM

        encrypted_bytes = base64.urlsafe_b64decode(encrypted.encode('ascii'))
        if len(encrypted_bytes) < 30:
            return None
        version = encrypted_bytes[0]
        if version == 1:
            if len(encrypted_bytes) < 46:
                return None
            salt = encrypted_bytes[1:17]
            nonce = encrypted_bytes[17:29]
            ciphertext = encrypted_bytes[29:]
            key = derive_key(secret_key, salt)
        elif version == 2:
            nonce = encrypted_bytes[1:13]
            ciphertext = encrypted_bytes[13:]
            key = _direct_key(secret_key)
        else:
            return None
        plaintext_bytes = AESGCM(key).decrypt(nonce, ciphertext, b"nuvora-github-token-v1")
        return plaintext_bytes.decode('utf-8')
    
    except Exception:
        return None


def encrypt_sensitive_field(value: Optional[str], secret_key: str) -> Optional[str]:
    """Encrypt a sensitive field if it's not empty, otherwise return None."""
    if not value:
        return None
    return encrypt_token(value, secret_key)


def decrypt_sensitive_field(encrypted: Optional[str], secret_key: str) -> Optional[str]:
    """Decrypt a sensitive field if it's not None/empty."""
    if not encrypted:
        return None
    return decrypt_token(encrypted, secret_key)
