# CLAUDE.md

## Purpose
This document defines execution rules for coding agents working in this repository.

## Project Overview
VidInsight is an AI-driven YouTube video analysis tool, focusing on video content analysis with AI models.

## Tech Stack
- Frontend: React 19 + Vite 7 (JavaScript)
- Backend: FastAPI (Python 3.12+)
- Database: MySQL (via `aiomysql`) / SQLite (via `aiosqlite`)
- Package Management: `npm` (frontend), `uv` (backend)

## Development Commands

### Backend (`backend/`)
```bash
cd backend
uv sync
uv run uvicorn main:app --reload --port 8001
```

### Frontend (`frontend/`)
```bash
cd frontend
npm install
npm run dev
npm run build
npm run lint
npm run test
```

## Environment
- Backend config is loaded from `backend/.env` (template: `backend/.env.example`).
- Frontend dev server proxies `/api` to `http://127.0.0.1:8001`.

## Language Policy
Use English consistently in:
- Code
- Comments
- Commit messages
- UI strings

## Backend Architecture
`backend/app` layout:
- `api/`: app factory, router registration, middleware wiring
- `core/`: config and global error handling
- `integrations/`: external integrations (e.g., YouTube)
- `lib/`: shared utilities
- `modules/`: domain modules (video analysis)
- `prompts/`: prompt templates and parsing helpers
- `providers/`: text and image model providers
- `repositories/`: persistence and data access
- `services/`: cross-module orchestration and shared business services
- `schemas/`: shared enums and schema definitions

## API Endpoints
- `POST /api/auth/login`: Authenticate user, returns JWT cookie + CSRF token
- `POST /api/auth/logout`: Clear auth cookies
- `GET /api/auth/me`: Check authentication status
- `GET /api/models`: List available models
- `/api/video/*`: Video analysis endpoints
- SSE events for streaming responses

## Authentication
- Controlled by `AUTH_ENABLED` env var (disabled by default for local dev)
- JWT stored in httpOnly cookie, CSRF protection via double-submit cookie pattern
- Default user `admin/vidinsight` is seeded on first startup when auth is enabled
- Auth middleware protects all `/api/*` routes except `/api/auth/login` and `/healthz`
- Rate limiting: 5 login attempts per 60 seconds per IP

## Non-Negotiables
- Prefer behavior-preserving refactors unless behavior change is explicitly requested.
- Do not change API contracts unless explicitly required.
- Do not revert unrelated user changes.
- Keep changes minimal, cohesive, and easy to review.

## Design Principles
- Follow SOLID and DRY.
- Keep responsibilities clear and scoped to one layer.
- Prefer extension over modification in stable core paths.
- Keep providers interchangeable behind shared abstractions.
- Avoid oversized schemas; keep interfaces focused.
- Depend on abstractions at business boundaries.
- Extract duplicated logic into shared utilities.

## Layering Rules
- `router`: validation, HTTP mapping, SSE wrapping only
- `use_cases`: request orchestration and flow composition
- `service`: business logic and provider/repository coordination
- `repository`: persistence only
- `provider`: external model API calls only

## API Clarity
- Keep stable explicit names (`conversation_id`, `text_model`, `image_model`).
- Error payloads must include machine-readable `code` and readable `message`.
- SSE events must keep stable `type` values and predictable payload keys.

## Python Best Practices
- Add type hints on public and cross-layer interfaces.
- Follow PEP 8 naming and avoid ambiguous abbreviations.
- Prefer small composable functions over long branching blocks.
- Raise domain-specific errors (`AppError`) for expected failure paths.
- Use structured logs with contextual fields (`request_id`, model, `conversation_id`).
- Keep I/O boundaries explicit and avoid hidden side effects.

## Refactor Triggers
- Duplicated logic across modules/providers
- Files mixing HTTP, business, and persistence concerns
- Repeated schema transformation patterns
- Repeated retry/error wrapping that can be centralized

## Git Commit Conventions
Use Conventional Commits:
```text
<type>(<scope>): <short description>
```

Allowed types:
- `feat`, `fix`, `refactor`, `chore`, `docs`, `style`, `perf`, `test`, `ci`, `build`

Recommended scopes:
- `backend`, `frontend`

Rules:
- Subject in imperative mood, lowercase, no trailing period, max 72 chars
- One logical change per commit
- Do not amend or rewrite history unless explicitly requested
- Avoid destructive git commands unless explicitly requested

## Completion Checklist
- Run relevant tests before claiming completion.
- If work changes API routes, directory structure, env vars, or architecture:
  - update `README.md`
  - update `CLAUDE.md`
  - update `backend/.env.example`
