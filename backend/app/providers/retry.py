from __future__ import annotations

import asyncio
import logging

import httpx

from app.core.errors import AppError

logger = logging.getLogger(__name__)


async def _request_with_retries(
    *,
    client: httpx.AsyncClient,
    url: str,
    payload: dict,
    headers: dict,
    max_retries: int,
    retry_delays: tuple[int, ...],
    label: str,
) -> dict:
    last_error: Exception | None = None

    for attempt in range(max_retries):
        if attempt > 0:
            delay = retry_delays[min(attempt - 1, len(retry_delays) - 1)]
            logger.info("%s retry %s/%s after %ss", label, attempt + 1, max_retries, delay)
            await asyncio.sleep(delay)

        try:
            resp = await client.post(url, json=payload, headers=headers)

            if resp.status_code == 200:
                return resp.json()

            error_body = resp.text[:200]
            logger.warning(
                "%s attempt %s: HTTP %s - %s",
                label,
                attempt + 1,
                resp.status_code,
                error_body,
            )

            if resp.status_code in (502, 503, 529):
                last_error = AppError(
                    "upstream_unavailable",
                    f"{label} temporary error: {resp.status_code}",
                    status_code=502,
                )
                continue

            raise AppError(
                "upstream_error",
                f"{label} API error {resp.status_code}: {error_body}",
                status_code=502,
            )

        except (httpx.TimeoutException, httpx.ConnectError) as exc:
            logger.warning("%s attempt %s failed: %s", label, attempt + 1, exc)
            last_error = AppError(
                "upstream_timeout",
                f"{label} request timeout/connection error",
                status_code=504,
            )

    if last_error is None:
        last_error = AppError(
            "upstream_error",
            f"{label} request failed",
            status_code=502,
        )
    raise last_error
