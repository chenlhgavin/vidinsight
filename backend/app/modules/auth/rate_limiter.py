from __future__ import annotations

import time
from collections import defaultdict

from app.core.errors import AppError

MAX_ATTEMPTS = 5
WINDOW_SECONDS = 60


class LoginRateLimiter:
    def __init__(
        self,
        max_attempts: int = MAX_ATTEMPTS,
        window_seconds: int = WINDOW_SECONDS,
    ) -> None:
        self._max_attempts = max_attempts
        self._window_seconds = window_seconds
        self._attempts: dict[str, list[float]] = defaultdict(list)

    def check(self, client_ip: str) -> None:
        now = time.monotonic()
        cutoff = now - self._window_seconds

        attempts = self._attempts[client_ip]
        self._attempts[client_ip] = [t for t in attempts if t > cutoff]

        if len(self._attempts[client_ip]) >= self._max_attempts:
            raise AppError(
                code="rate_limited",
                message="Too many login attempts. Please try again later.",
                status_code=429,
            )

    def record(self, client_ip: str) -> None:
        self._attempts[client_ip].append(time.monotonic())
