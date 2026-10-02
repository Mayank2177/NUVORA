"""Validated request models for the frontend's project journey contract."""
import base64
import binascii
from io import BytesIO
from typing import Annotated, Literal
from urllib.parse import urlparse

from pydantic import BaseModel, ConfigDict, Field, field_validator

Stage = Literal[
    "Idea", "Problem solving", "Research", "Learn", "Practice", "Prototype", "Build",
    "Validate", "Document", "Publish", "Portfolio", "Demonstrate", "Opportunity", "Contribution",
]
EvidenceType = Literal[
    "Commit", "Pull request", "Test", "Screenshot", "Decision", "Learning",
    "AI session", "Blocker resolved",
]
Provenance = Literal["Human", "AI-assisted", "Collaborator", "External"]
Nonblank = Annotated[str, Field(min_length=1, max_length=2000)]


class JourneyRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class BlockerCreate(JourneyRequest):
    title: str = Field(min_length=1, max_length=140)


class BlockerAttempt(JourneyRequest):
    attempt: Nonblank


class BlockerResolve(JourneyRequest):
    solution: Nonblank


class TaskCreate(JourneyRequest):
    title: str = Field(min_length=1, max_length=300)
    stage: Stage


class DecisionCreate(JourneyRequest):
    decision: str = Field(min_length=1, max_length=120)
    reason: str = Field(min_length=1, max_length=300)
    stage: Stage


class DesignCreate(JourneyRequest):
    title: str = Field(min_length=1, max_length=80)
    kind: Literal["Wireframe", "Mockup", "Flow", "Diagram", "Other"]
    tool: Literal[
        "Figma", "Excalidraw", "tldraw", "Balsamiq", "Penpot", "draw.io", "Mermaid", "Other",
    ]
    url: str = Field(min_length=1, max_length=2048)
    image: str | None = Field(default=None, max_length=1_000_000)
    note: str = Field(default="", max_length=300)
    stage: Stage

    @field_validator("url")
    @classmethod
    def validate_url(cls, value: str) -> str:
        parsed = urlparse(value)
        try:
            parsed.port
        except ValueError as exc:
            raise ValueError("Invalid URL port") from exc
        if (
            parsed.scheme not in {"http", "https"} or not parsed.hostname
            or parsed.username is not None or parsed.password is not None
            or any(char.isspace() or ord(char) < 32 for char in value)
        ):
            raise ValueError("URL must be an HTTP(S) URL without embedded credentials")
        return value

    @field_validator("image")
    @classmethod
    def validate_image(cls, value: str | None) -> str | None:
        if value is None:
            return None
        prefix = "data:image/jpeg;base64,"
        if not value.startswith(prefix):
            raise ValueError("Image must be a base64 JPEG data URL")
        return value


def normalize_design_image(value: str | None) -> str | None:
    """Decode/normalize only from the offloaded handler, not an ASGI validator."""
    if value is None:
        return None
    prefix = "data:image/jpeg;base64,"
    from PIL import Image, UnidentifiedImageError
    try:
        raw = base64.b64decode(value[len(prefix):], validate=True)
        # Inspect dimensions before decoding pixels to bound memory use.
        with Image.open(BytesIO(raw)) as image:
            if image.format != "JPEG" or not (1 <= image.width <= 1200 and 1 <= image.height <= 1200):
                raise ValueError("JPEG dimensions must not exceed 1200 pixels")
            image.load()
            output = BytesIO()
            image.convert("RGB").save(output, format="JPEG", quality=80)
        return prefix + base64.b64encode(output.getvalue()).decode("ascii")
    except (binascii.Error, OSError, UnidentifiedImageError, Image.DecompressionBombError) as exc:
        raise ValueError("Invalid JPEG data") from exc