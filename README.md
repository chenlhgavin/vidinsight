# VidInsight

AI-driven YouTube video analysis tool.

## Features

- **Multi-Phase AI Video Analysis** — Automatically extracts topics with timestamps, key takeaways, themes, and suggested follow-up questions from any YouTube video
- **Multi-Model Support** — Choose between Claude (Sonnet/Opus), Qwen, and DeepSeek models; plugin architecture makes adding new providers easy
- **Real-Time Streaming (SSE)** — Analysis results and chat responses stream in real-time via Server-Sent Events with keepalive to prevent proxy timeouts
- **Interactive AI Chat** — Continue exploring video content through follow-up conversations with context-aware AI, with suggested question chips
- **Theme Exploration** — Dive deeper into specific themes extracted from the video
- **Transcript & Translation** — View full transcripts with language translation support and export functionality
- **Visual Topic Timeline** — Color-coded topic cards with timestamps, durations, and a "Play All" playback feature synced to the embedded YouTube player
- **Notes** — Create and manage personal notes for each analysis session
- **Conversation History** — All analyses are persisted; revisit any previous session
- **Optional Authentication** — JWT + CSRF protection with rate limiting; disabled by default for local dev, one env var to enable
- **Flexible Storage** — MySQL for production, SQLite for zero-config local development
- **Docker Ready** — One-command deployment with health-check gated startup

## Structure

- `frontend/`: React + Vite frontend, default dev port `5173`
- `backend/`: FastAPI backend, default dev port `8001`

## Quick Start

### Local Development

#### Backend

```bash
cd backend
cp .env.example .env 2>/dev/null || true
uv sync
uv run uvicorn main:app --reload --port 8001
```

#### Frontend

```bash
cd frontend
npm install
npm run dev
```

The frontend proxies `/api` requests to `http://127.0.0.1:8001` by default.
Set `VITE_API_BASE_URL` when the backend is reachable at a different host, such as `http://backend:8001` in Docker Compose.

### Containerized Deployment

#### Prerequisites

- Docker
- Docker Compose

#### Environment Setup

```bash
cd backend
cp .env.example .env
```

Edit `backend/.env` and configure:

| Variable | Required | Description |
|----------|----------|-------------|
| `ANTHROPIC_API_KEY` | Yes | Anthropic Claude API key |
| `DASHSCOPE_API_KEY` | Yes | Alibaba DashScope API key (Qwen) |
| `DEEPSEEK_API_KEY` | No | DeepSeek API key |
| `SUPADATA_API_KEY` | No | Supadata API for YouTube transcripts |
| `CONVERSATION_DATABASE_URL` | No | MySQL connection string (defaults to SQLite in `data/video.db`) |

For Docker with MySQL, add MySQL service to docker-compose and update:
```
CONVERSATION_DATABASE_URL=mysql+aiomysql://video:video@mysql:3306/video
```

#### Deploy

```bash
# Build and start all services
make up

# Or build first, then start
make build
make up
```

Docker Compose now waits for the backend readiness endpoint at `/healthz` before starting the frontend service.
`make restart` recreates the stack so the same readiness-gated startup order is applied again.

#### Available Commands

| Command | Description |
|---------|-------------|
| `make help` | Show help message with all available commands |
| `make build` | Build Docker images |
| `make up` | Start services in detached mode and wait for readiness |
| `make down` | Stop services |
| `make restart` | Restart services (recreates with readiness-gated startup) |
| `make deploy` | Rebuild and start all services |
| `make logs` | View service logs (follow mode) |
| `make status` | Check service health and status |
| `make clean` | Stop services and remove volumes and local images |

All commands support an optional `SERVICE` parameter to target a single service, e.g. `make build SERVICE=backend`.

#### Access

- Frontend: http://localhost:5173
- Backend API: http://localhost:8001

## Environment

Backend config lives in `backend/.env`.
Use `backend/.env.example` as the template.
