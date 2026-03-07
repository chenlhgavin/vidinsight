from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parents[2]
load_dotenv(BASE_DIR / ".env")


@dataclass(slots=True)
class Settings:
    anthropic_base_url: str
    anthropic_api_key: str
    anthropic_auth_token: str
    claude_sonnet_model: str

    dashscope_api_key: str
    dashscope_base_url: str
    qwen_model: str

    deepseek_api_key: str
    deepseek_base_url: str
    deepseek_model: str

    conversation_database_url: str = ""
    max_retries: int = 3
    retry_delays: tuple[int, ...] = (2, 5, 10)
    max_context_messages: int = 20
    slide_image_max_parallel: int = 3

    cors_allow_origins: str = "*"
    cors_allow_credentials: bool = True

    gemini_api_key: str = ""
    gemini_base_url: str = ""
    gemini_image_model: str = "gemini-3.1-flash-image-preview"
    nano_api_key: str = ""
    nano_base_url: str = "https://api.mmw.ink"
    nano_model: str = "[A]gemini-3-pro-image-preview"
    nano_image_size: str = "2K"
    ark_api_key: str = ""
    ark_base_url: str = "https://ark.cn-beijing.volces.com/api/v3"
    doubao_seedream_model: str = "doubao-seedream-4-0-250828"
    doubao_seedream_v45_model: str = "doubao-seedream-4-5-251128"
    claude_opus_model: str = "claude-opus-4-6"
    supadata_api_key: str = ""
    minio_endpoint: str = ""
    minio_access_key: str = ""
    minio_secret_key: str = ""
    minio_bucket: str = "slides-assets"
    minio_secure: bool = False
    minio_region: str = ""
    minio_public_endpoint: str = ""
    minio_presigned_url_expiry: int = 3600

    auth_enabled: bool = False
    auth_jwt_secret: str = ""
    auth_token_expiry_hours: int = 72
    auth_cookie_secure: str = "auto"
    auth_cookie_domain: str = ""
    auth_default_username: str = "admin"
    auth_default_password: str = "vidinsight"

    @property
    def cors_origins(self) -> list[str]:
        raw = self.cors_allow_origins.strip()
        if raw == "*":
            return ["*"]
        return [item.strip() for item in raw.split(",") if item.strip()]

    @property
    def database_url(self) -> str:
        return self.conversation_database_url.strip()

    @property
    def resolved_conversation_database_url(self) -> str:
        # Backward-compatible alias. Prefer database_url.
        return self.database_url

    @classmethod
    def from_env(cls) -> "Settings":
        database_url = os.environ.get("CONVERSATION_DATABASE_URL", "").strip()
        if not database_url:
            raise ValueError("CONVERSATION_DATABASE_URL is required")
        if not database_url.startswith("mysql+aiomysql://"):
            raise ValueError("CONVERSATION_DATABASE_URL must use mysql+aiomysql scheme")

        retry_delays = tuple(
            int(part.strip())
            for part in os.environ.get("RETRY_DELAYS", "2,5,10").split(",")
            if part.strip()
        )

        auth_enabled = os.environ.get("AUTH_ENABLED", "false").lower() in {
            "1",
            "true",
            "yes",
        }
        auth_jwt_secret = os.environ.get("AUTH_JWT_SECRET", "")
        if auth_enabled:
            if not auth_jwt_secret or len(auth_jwt_secret) < 32:
                raise ValueError(
                    "AUTH_JWT_SECRET must be at least 32 characters when AUTH_ENABLED=true"
                )

        return cls(
            anthropic_base_url=os.environ.get(
                "ANTHROPIC_BASE_URL", "https://api.anthropic.com"
            ),
            anthropic_api_key=os.environ.get("ANTHROPIC_API_KEY", ""),
            anthropic_auth_token=os.environ.get("ANTHROPIC_AUTH_TOKEN", ""),
            claude_sonnet_model=os.environ.get(
                "CLAUDE_SONNET_MODEL", "claude-sonnet-4-6"
            ),
            dashscope_api_key=os.environ.get("DASHSCOPE_API_KEY", ""),
            dashscope_base_url=os.environ.get(
                "DASHSCOPE_BASE_URL",
                "https://dashscope.aliyuncs.com/compatible-mode/v1",
            ),
            qwen_model=os.environ.get("QWEN_MODEL", "qwen-plus"),
            deepseek_api_key=os.environ.get("DEEPSEEK_API_KEY", ""),
            deepseek_base_url=os.environ.get("DEEPSEEK_BASE_URL", "https://api.deepseek.com"),
            deepseek_model=os.environ.get("DEEPSEEK_MODEL", "deepseek-chat"),
            conversation_database_url=database_url,
            max_retries=int(os.environ.get("MAX_RETRIES", "3")),
            retry_delays=retry_delays or (2, 5, 10),
            max_context_messages=int(os.environ.get("MAX_CONTEXT_MESSAGES", "20")),
            slide_image_max_parallel=int(os.environ.get("SLIDE_IMAGE_MAX_PARALLEL", "3")),
            cors_allow_origins=os.environ.get("CORS_ALLOW_ORIGINS", "*"),
            cors_allow_credentials=os.environ.get(
                "CORS_ALLOW_CREDENTIALS", "true"
            ).lower()
            in {"1", "true", "yes"},
            gemini_api_key=os.environ.get("GEMINI_API_KEY", ""),
            gemini_base_url=os.environ.get("GEMINI_BASE_URL", ""),
            gemini_image_model=os.environ.get(
                "GEMINI_IMAGE_MODEL", "gemini-3.1-flash-image-preview"
            ),
            nano_api_key=os.environ.get("NANO_API_KEY", ""),
            nano_base_url=os.environ.get("NANO_BASE_URL", "https://api.mmw.ink"),
            nano_model=os.environ.get("NANO_MODEL", "[A]gemini-3-pro-image-preview"),
            nano_image_size=os.environ.get("NANO_IMAGE_SIZE", "2K"),
            ark_api_key=os.environ.get("ARK_API_KEY", ""),
            ark_base_url=os.environ.get(
                "ARK_BASE_URL", "https://ark.cn-beijing.volces.com/api/v3"
            ),
            doubao_seedream_model=os.environ.get(
                "DOUBAO_SEEDREAM_MODEL", "doubao-seedream-4-0-250828"
            ),
            doubao_seedream_v45_model=os.environ.get(
                "DOUBAO_SEEDREAM_V45_MODEL", "doubao-seedream-4-5-251128"
            ),
            claude_opus_model=os.environ.get(
                "CLAUDE_OPUS_MODEL", "claude-opus-4-6"
            ),
            supadata_api_key=os.environ.get("SUPADATA_API_KEY", ""),
            minio_endpoint=os.environ.get("MINIO_ENDPOINT", ""),
            minio_access_key=os.environ.get("MINIO_ACCESS_KEY", ""),
            minio_secret_key=os.environ.get("MINIO_SECRET_KEY", ""),
            minio_bucket=os.environ.get("MINIO_BUCKET", "slides-assets"),
            minio_secure=os.environ.get("MINIO_SECURE", "false").lower()
            in {"1", "true", "yes"},
            minio_region=os.environ.get("MINIO_REGION", ""),
            minio_public_endpoint=os.environ.get("MINIO_PUBLIC_ENDPOINT", ""),
            minio_presigned_url_expiry=int(os.environ.get("MINIO_PRESIGNED_URL_EXPIRY", "3600")),
            auth_enabled=auth_enabled,
            auth_jwt_secret=auth_jwt_secret,
            auth_token_expiry_hours=int(os.environ.get("AUTH_TOKEN_EXPIRY_HOURS", "72")),
            auth_cookie_secure=os.environ.get("AUTH_COOKIE_SECURE", "auto").strip().lower(),
            auth_cookie_domain=os.environ.get("AUTH_COOKIE_DOMAIN", ""),
            auth_default_username=os.environ.get("AUTH_DEFAULT_USERNAME", "admin"),
            auth_default_password=os.environ.get("AUTH_DEFAULT_PASSWORD", "vidinsight"),
        )
