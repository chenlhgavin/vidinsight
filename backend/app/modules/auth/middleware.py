from __future__ import annotations

import logging

from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.requests import Request
from starlette.responses import JSONResponse, Response

from app.core.config import Settings
from app.core.errors import error_payload

from .service import decode_access_token, verify_csrf_token

logger = logging.getLogger(__name__)

PUBLIC_PATHS = frozenset({"/healthz", "/api/auth/login"})
MUTATING_METHODS = frozenset({"POST", "PUT", "DELETE", "PATCH"})


class AuthMiddleware(BaseHTTPMiddleware):
    def __init__(self, app, settings: Settings) -> None:  # noqa: ANN001
        super().__init__(app)
        self.settings = settings

    async def dispatch(
        self, request: Request, call_next: RequestResponseEndpoint
    ) -> Response:
        path = request.url.path
        method = request.method.upper()

        if method == "OPTIONS":
            return await call_next(request)

        if path in PUBLIC_PATHS:
            return await call_next(request)

        if not path.startswith("/api/"):
            return await call_next(request)

        access_token = request.cookies.get("access_token")
        if not access_token:
            return self._unauthorized("Authentication required")

        claims = decode_access_token(access_token, self.settings)
        if claims is None:
            return self._unauthorized("Invalid or expired token")

        request.state.username = claims.get("sub", "")

        if method in MUTATING_METHODS:
            csrf_header = request.headers.get("x-csrf-token", "")
            csrf_cookie = request.cookies.get("csrf_token", "")
            if not verify_csrf_token(csrf_header, csrf_cookie):
                return self._unauthorized("CSRF token validation failed")

        return await call_next(request)

    @staticmethod
    def _unauthorized(message: str) -> JSONResponse:
        return JSONResponse(
            status_code=401,
            content=error_payload("unauthorized", message),
        )
