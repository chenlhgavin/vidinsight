from __future__ import annotations

import app.providers as providers
import app.providers.text as text_providers
from app.core.config import Settings


def test_settings_ignore_legacy_claude_model_env(monkeypatch):
    monkeypatch.setenv(
        "CONVERSATION_DATABASE_URL",
        "mysql+aiomysql://user:pass@localhost:3306/video",
    )
    monkeypatch.delenv("CLAUDE_SONNET_MODEL", raising=False)
    monkeypatch.setenv("CLAUDE_MODEL", "legacy-claude-model")

    settings = Settings.from_env()

    assert settings.claude_sonnet_model == "claude-sonnet-4-6"


def test_provider_modules_expose_only_canonical_claude_names():
    assert hasattr(providers, "ClaudeSonnetProvider")
    assert hasattr(text_providers, "ClaudeSonnetProvider")
    assert not hasattr(providers, "ClaudeProvider")
    assert not hasattr(text_providers, "ClaudeProvider")
