"""Configuration settings for NUVORA."""
from pathlib import Path
from typing import Annotated, Any
from ipaddress import ip_network
from urllib.parse import urlparse

from pydantic import Field, field_validator, model_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict


def _is_placeholder(value: str) -> bool:
    normalized = value.strip().lower()
    return normalized.startswith(
        (
            "replace-with",
            "change-me",
            "your-",
            "example-",
            "placeholder",
        )
    )


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_prefix="NUVORA_",
        env_file=Path(__file__).resolve().parents[2] / ".env",
        extra="ignore",
    )

    host: str = "0.0.0.0"
    port: int = Field(default=4117, ge=1, le=65535)
    database_path: Path = Path.home() / ".nuvora" / "nuvora.sqlite3"
    database_url: str = ""
    database_pool_min_size: int = Field(default=4, ge=1, le=100)
    database_pool_size: int = Field(default=20, ge=1, le=100)
    log_level: str = "INFO"
    environment: str = "development"
    
    # Security
    secret_key: str = ""  # REQUIRED: Set via NUVORA_SECRET_KEY environment variable
    encryption_key: str = ""  # REQUIRED in production; separate from token signing
    token_ttl_hours: int = Field(default=24 * 7, ge=1, le=24 * 90)
    password_reset_ttl_minutes: int = Field(default=60, ge=5, le=1440)
    password_reset_min_interval_seconds: int = Field(default=300, ge=30, le=86_400)
    login_max_failures: int = Field(default=10, ge=3, le=100)
    login_lock_minutes: int = Field(default=15, ge=1, le=1440)
    request_body_max_bytes: int = Field(default=1_048_576, ge=16_384, le=10_485_760)
    
    # CORS
    enable_cors: bool = True
    cors_origins: Annotated[list[str], NoDecode] = []
    
    # Publishing
    public_base_url: str = ""  # REQUIRED for publishing: Set via NUVORA_PUBLIC_BASE_URL
    frontend_base_url: str = "http://localhost:3000"
    
    # GitHub OAuth
    github_client_id: str = ""
    github_client_secret: str = ""
    github_redirect_uri: str = ""
    github_webhook_secret: str = ""  # Required in production
    github_webhook_max_bytes: int = Field(default=1_000_000, ge=1024, le=10_000_000)
    
    # Reverse proxy addresses allowed to supply X-Forwarded-For.
    trusted_proxy_ips: Annotated[list[str], NoDecode] = ["127.0.0.1", "::1"]
    
    # Rate Limiting (requests per window)
    rate_limit_enabled: bool = True
    rate_limit_auth_max: int = Field(default=10, ge=1, le=10_000)
    rate_limit_auth_window: int = Field(default=300, ge=1, le=86_400)
    rate_limit_api_max: int = Field(default=100, ge=1, le=100_000)
    rate_limit_api_window: int = Field(default=60, ge=1, le=86_400)
    rate_limit_read_max: int = Field(default=600, ge=1, le=100_000)
    rate_limit_redis_url: str = ""
    
    # Email Configuration (optional, for password reset emails)
    smtp_host: str = ""
    smtp_port: int = Field(default=587, ge=1, le=65535)
    smtp_user: str = ""
    smtp_password: str = ""
    smtp_from_email: str = ""
    smtp_from_name: str = "NUVORA"

    @field_validator("database_path", mode="before")
    @classmethod
    def _expand_db_path(cls, value: Any) -> Path:
        return Path(str(value)).expanduser()

    @field_validator("secret_key", mode="after")
    @classmethod
    def _validate_secret_key(cls, value: str) -> str:
        if not value or value == "":
            raise ValueError(
                "secret_key is required. Set NUVORA_SECRET_KEY environment variable to a strong random string (min 32 characters)."
            )
        if len(value) < 32:
            raise ValueError(
                f"secret_key must be at least 32 characters long (got {len(value)}). Use a cryptographically secure random string."
            )
        return value

    @field_validator("encryption_key", mode="after")
    @classmethod
    def _validate_encryption_key(cls, value: str) -> str:
        if value and len(value) < 32:
            raise ValueError("encryption_key must be at least 32 characters long")
        return value

    @field_validator("public_base_url", mode="after")
    @classmethod
    def _validate_public_base_url(cls, value: str) -> str:
        if not value or value == "":
            raise ValueError(
                "public_base_url is required for publishing features. Set NUVORA_PUBLIC_BASE_URL environment variable (e.g., https://nuvora.example.com)."
            )
        parsed = urlparse(value)
        if (
            parsed.scheme not in {"http", "https"}
            or not parsed.netloc
            or parsed.username
            or parsed.password
            or parsed.query
            or parsed.fragment
        ):
            raise ValueError(
                f"public_base_url must start with http:// or https:// (got: {value})."
            )
        if value.endswith("/"):
            raise ValueError(
                f"public_base_url should not end with a trailing slash (got: {value})."
            )
        return value

    @field_validator("cors_origins", mode="before")
    @classmethod
    def _split_csv(cls, value: Any) -> Any:
        if isinstance(value, str):
            return [item.strip() for item in value.split(",") if item.strip()]
        return value

    @field_validator("cors_origins", mode="after")
    @classmethod
    def _validate_cors_origins(cls, value: list[str]) -> list[str]:
        for origin in value:
            parsed = urlparse(origin)
            if (
                parsed.scheme not in {"http", "https"}
                or not parsed.netloc
                or parsed.path not in {"", "/"}
                or parsed.username
                or parsed.password
                or parsed.query
                or parsed.fragment
            ):
                raise ValueError(
                    f"Each CORS origin must be an origin without a path (got: {origin})."
                )
        return [origin.rstrip("/") for origin in value]

    @field_validator("trusted_proxy_ips", mode="before")
    @classmethod
    def _split_trusted_proxies(cls, value: Any) -> Any:
        if isinstance(value, str):
            return [item.strip() for item in value.split(",") if item.strip()]
        return value

    @field_validator("trusted_proxy_ips", mode="after")
    @classmethod
    def _validate_trusted_proxies(cls, value: list[str]) -> list[str]:
        for network in value:
            try:
                ip_network(network, strict=False)
            except ValueError as exc:
                raise ValueError(f"Invalid trusted proxy IP or network: {network}") from exc
        return value

    @model_validator(mode="after")
    def _validate_deployment(self) -> "Settings":
        environment = self.environment.lower()
        if environment not in {"development", "test", "production"}:
            raise ValueError("environment must be development, test, or production")
        if self.enable_cors and not self.cors_origins:
            raise ValueError("cors_origins is required when CORS is enabled")
        if self.database_pool_min_size > self.database_pool_size:
            raise ValueError("database_pool_min_size cannot exceed database_pool_size")
        if "*" in self.cors_origins:
            raise ValueError("wildcard CORS origins are not allowed with credentials")
        if environment == "production":
            for name, secret in (
                ("secret_key", self.secret_key),
                ("encryption_key", self.encryption_key),
                ("github_webhook_secret", self.github_webhook_secret),
            ):
                if (
                    len(secret) < 32
                    or len(set(secret)) < 8
                    or secret.lower().startswith(("replace-with", "change-me"))
                ):
                    raise ValueError(f"{name} must be a strong production secret")
            if self.secret_key == self.encryption_key:
                raise ValueError("secret_key and encryption_key must be different")
            if not self.database_url.startswith(("postgresql://", "postgresql+psycopg://")):
                raise ValueError("database_url must be a PostgreSQL URL in production")
            database = urlparse(self.database_url.replace("postgresql+psycopg://", "postgresql://", 1))
            if not database.hostname or database.path in {"", "/"}:
                raise ValueError("database_url must include a host and database name")
            if not self.rate_limit_redis_url.startswith(("redis://", "rediss://")):
                raise ValueError("rate_limit_redis_url must be a Redis URL in production")
            if not urlparse(self.rate_limit_redis_url).hostname:
                raise ValueError("rate_limit_redis_url must include a host")
            if not self.encryption_key:
                raise ValueError("encryption_key is required in production")
            if not self.github_webhook_secret:
                raise ValueError("github_webhook_secret is required in production")
            if not self.github_client_id or not self.github_client_secret:
                raise ValueError("GitHub OAuth client credentials are required in production")
            if (
                len(self.github_client_id) < 8
                or len(self.github_client_secret) < 20
                or _is_placeholder(self.github_client_id)
                or _is_placeholder(self.github_client_secret)
            ):
                raise ValueError("GitHub OAuth client credentials are invalid")
            if not self.public_base_url.startswith("https://"):
                raise ValueError("public_base_url must use HTTPS in production")
            if any(not origin.startswith("https://") for origin in self.cors_origins):
                raise ValueError("all CORS origins must use HTTPS in production")
            frontend = urlparse(self.frontend_base_url)
            if (
                frontend.scheme != "https"
                or not frontend.netloc
                or frontend.username
                or frontend.password
                or frontend.query
                or frontend.fragment
            ):
                raise ValueError("frontend_base_url must use HTTPS in production")
            redirect = urlparse(self.github_redirect_uri)
            if (
                redirect.scheme != "https"
                or not redirect.netloc
                or redirect.username
                or redirect.password
                or redirect.fragment
            ):
                raise ValueError("github_redirect_uri must use HTTPS in production")
            if not all(
                (
                    self.smtp_host,
                    self.smtp_user,
                    self.smtp_password,
                    self.smtp_from_email,
                )
            ):
                raise ValueError(
                    "SMTP host, credentials, and from address are required in production"
                )
            if _is_placeholder(self.smtp_user) or _is_placeholder(self.smtp_password):
                raise ValueError("SMTP credentials cannot be placeholder values")
            if "\r" in self.smtp_from_name or "\n" in self.smtp_from_name:
                raise ValueError("smtp_from_name cannot contain newlines")
            if "@" not in self.smtp_from_email or any(
                char in self.smtp_from_email for char in "\r\n"
            ):
                raise ValueError("smtp_from_email is invalid")
        return self


settings = Settings()

