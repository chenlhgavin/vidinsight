from __future__ import annotations

import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.api.factory import create_app
from app.core.config import Settings
from app.providers import BaseTextProvider, ModelDescriptor, TextProviderRegistry
from app.schemas import TextModelType


class FakeProvider(BaseTextProvider):
    def __init__(self, descriptor: ModelDescriptor, response_text: str) -> None:
        self.descriptor = descriptor
        self.response_text = response_text

    async def generate(self, messages: list[dict]) -> str:
        system_content = messages[0].get("content", "") if messages else ""
        if "Return strict JSON with 4-6 objects" in system_content:
            return "[]"
        if "Generate 5 thought-provoking follow-up questions" in system_content:
            return "[]"
        if "analyzing a YouTube video transcript for content related to a specific theme" in system_content:
            return '{"theme":"AI","segments":[],"summary":"Theme summary"}'
        return self.response_text

    async def close(self) -> None:
        return None


def _stream_events(response: TestClient) -> list[dict]:
    events: list[dict] = []
    for chunk in response.iter_text():
        for line in chunk.splitlines():
            if not line.startswith("data: "):
                continue
            events.append(json.loads(line[6:]))
    return events


@pytest.fixture(autouse=True)
def patch_video_pipeline(monkeypatch: pytest.MonkeyPatch):
    class TopicResultStub:
        def __init__(self) -> None:
            self.topics = [
                {
                    "title": "Intro",
                    "description": "Opening summary",
                    "start_time": "00:00",
                    "end_time": "00:10",
                    "tags": ["intro"],
                }
            ]

    async def fake_generate_topics(*args, **kwargs):
        _ = args, kwargs
        return TopicResultStub()

    monkeypatch.setattr("app.services.video.generate_topics_from_transcript", fake_generate_topics)


@pytest.fixture
def client(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    settings = Settings(
        anthropic_base_url="https://example.com",
        anthropic_api_key="",
        anthropic_auth_token="",
        claude_sonnet_model="claude-test",
        dashscope_api_key="",
        dashscope_base_url="https://example.com",
        qwen_model="qwen-test",
        deepseek_api_key="",
        deepseek_base_url="https://example.com",
        deepseek_model="deepseek-test",
        conversation_database_url=f"sqlite+aiosqlite:///{(tmp_path / 'video.db').as_posix()}",
        max_retries=1,
        retry_delays=(0,),
        max_context_messages=20,
        cors_allow_origins="*",
        cors_allow_credentials=True,
    )

    providers = TextProviderRegistry(
        {
            TextModelType.claude_sonnet: FakeProvider(
                ModelDescriptor(
                    id=TextModelType.claude_sonnet,
                    name="Claude",
                    description="claude-test",
                ),
                "hello from claude",
            ),
            TextModelType.qwen: FakeProvider(
                ModelDescriptor(
                    id=TextModelType.qwen,
                    name="Qwen",
                    description="qwen-test",
                ),
                "hello from qwen",
            ),
            TextModelType.deepseek: FakeProvider(
                ModelDescriptor(
                    id=TextModelType.deepseek,
                    name="DeepSeek",
                    description="deepseek-test",
                ),
                "hello from deepseek",
            ),
        }
    )

    async def fake_fetch_video_info(video_id: str, _settings: Settings | None = None) -> dict:
        return {
            "video_id": video_id,
            "title": "Test Video",
            "author": "Author",
            "thumbnail_url": "https://img.example.com/test.jpg",
        }

    async def fake_fetch_transcript(video_id: str, _settings: Settings) -> tuple[list[dict], str]:
        _ = video_id
        return ([{"text": "line", "start": 0, "duration": 1}], "en")

    monkeypatch.setattr("app.services.video.extract_video_id", lambda _url: "dQw4w9WgXcQ")
    monkeypatch.setattr("app.services.video.fetch_video_info", fake_fetch_video_info)
    monkeypatch.setattr("app.services.video.fetch_transcript", fake_fetch_transcript)
    monkeypatch.setattr("app.services.video.format_transcript_for_llm", lambda _entries: "[00:00] line")

    app = create_app(
        settings=settings,
        text_provider_registry=providers,
    )

    with TestClient(app) as test_client:
        yield test_client


def test_models_endpoint_comes_from_provider_registry(client: TestClient):
    res = client.get("/api/models")
    assert res.status_code == 200
    assert {item["id"] for item in res.json()} == {"claude-sonnet", "qwen", "deepseek"}


def test_health_endpoint_reports_ready(client: TestClient):
    res = client.get("/healthz")
    assert res.status_code == 200
    assert res.json() == {"status": "ok"}


def test_openapi_metadata_uses_vidinsight_brand(client: TestClient):
    res = client.get("/openapi.json")
    assert res.status_code == 200

    body = res.json()
    assert body["info"]["title"] == "VidInsight"
    assert body["info"]["description"] == "Video Insight - AI驱动的YouTube视频分析工具"


def test_video_analyze_roundtrip_and_cache(client: TestClient):
    with client.stream(
        "POST",
        "/api/video/analyze",
        json={
            "url": "https://youtu.be/dQw4w9WgXcQ",
            "text_model": "deepseek",
        },
    ) as stream_res:
        assert stream_res.status_code == 200
        events = _stream_events(stream_res)

    analysis_start = next(event for event in events if event["type"] == "analysis_start")
    detail = client.get(f"/api/video/conversations/{analysis_start['conversation_id']}")
    assert detail.status_code == 200
    body = detail.json()
    assert body["model"] == "deepseek"
    assert body["video_metadata"]["video_id"] == "dQw4w9WgXcQ"

    cached = client.post(
        "/api/video/check-cache",
        json={
            "url": "https://youtu.be/dQw4w9WgXcQ",
            "text_model": "deepseek",
        },
    )
    assert cached.status_code == 200
    assert cached.json()["cached"] is True


def test_video_notes_crud(client: TestClient):
    created = client.post(
        "/api/video/conversations",
        json={"title": "Video", "model": "qwen"},
    )
    assert created.status_code == 200
    conversation = created.json()

    note = client.post(
        "/api/video/notes",
        json={
            "conversation_id": conversation["id"],
            "source": "custom",
            "text": "Save this",
        },
    )
    assert note.status_code == 200
    note_body = note.json()

    listed = client.get(f"/api/video/notes?conversation_id={conversation['id']}")
    assert listed.status_code == 200
    assert len(listed.json()) == 1
    assert listed.json()[0]["text"] == "Save this"

    deleted = client.delete(f"/api/video/notes/{note_body['id']}")
    assert deleted.status_code == 200
    assert deleted.json() == {"ok": True}
