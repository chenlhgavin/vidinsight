from __future__ import annotations

from fastapi import APIRouter, Request, Response

from app.core.errors import AppError
from app.repositories.user import UserRepository

from .rate_limiter import LoginRateLimiter
from .schemas import AuthStatusResponse, ChangePasswordRequest, LoginRequest, LoginResponse
from .service import (
    create_access_token,
    generate_csrf_token,
    hash_password,
    verify_credentials,
    verify_password,
)

router = APIRouter(prefix="/api/auth", tags=["auth"])

_rate_limiter = LoginRateLimiter()


def _get_user_repo(request: Request) -> UserRepository:
    return request.app.state.user_repo


def _get_client_ip(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def _is_loopback_host(host: str) -> bool:
    normalized = host.strip().strip("[]").lower()
    return normalized in {"localhost", "127.0.0.1", "::1"}


def _resolve_cookie_secure(request: Request) -> bool:
    setting = request.app.state.settings.auth_cookie_secure
    if setting in {"true", "1", "yes"}:
        return True
    if setting in {"false", "0", "no"}:
        return False

    host = request.url.hostname or request.headers.get("host", "")
    if _is_loopback_host(host):
        return False

    # auto: detect from request scheme or X-Forwarded-Proto
    proto = request.headers.get("x-forwarded-proto", request.url.scheme)
    return proto == "https"


def _set_auth_cookies(
    response: Response, access_token: str, csrf_token: str, request: Request
) -> None:
    settings = request.app.state.settings
    max_age = settings.auth_token_expiry_hours * 3600
    secure = _resolve_cookie_secure(request)
    domain = settings.auth_cookie_domain or None

    response.set_cookie(
        key="access_token",
        value=access_token,
        httponly=True,
        secure=secure,
        samesite="lax",
        path="/",
        max_age=max_age,
        domain=domain,
    )
    response.set_cookie(
        key="csrf_token",
        value=csrf_token,
        httponly=False,
        secure=secure,
        samesite="lax",
        path="/",
        max_age=max_age,
        domain=domain,
    )


def _clear_auth_cookies(response: Response, request: Request) -> None:
    settings = request.app.state.settings
    domain = settings.auth_cookie_domain or None

    response.delete_cookie(key="access_token", path="/", domain=domain)
    response.delete_cookie(key="csrf_token", path="/", domain=domain)


@router.post("/login", response_model=LoginResponse)
async def login(body: LoginRequest, request: Request, response: Response):
    client_ip = _get_client_ip(request)
    _rate_limiter.check(client_ip)

    user_repo = _get_user_repo(request)
    user = await verify_credentials(body.username, body.password, user_repo)

    if user is None:
        _rate_limiter.record(client_ip)
        raise AppError(
            code="invalid_credentials",
            message="Invalid username or password",
            status_code=401,
        )

    settings = request.app.state.settings
    access_token = create_access_token(user["username"], settings)
    csrf_token = generate_csrf_token()

    _set_auth_cookies(response, access_token, csrf_token, request)

    return LoginResponse(username=user["username"], csrf_token=csrf_token)


@router.post("/logout")
async def logout(request: Request, response: Response):
    _clear_auth_cookies(response, request)
    return {"message": "Logged out"}


@router.post("/change-password")
async def change_password(body: ChangePasswordRequest, request: Request):
    username = getattr(request.state, "username", None)
    if not username:
        raise AppError(
            code="unauthorized",
            message="Not authenticated",
            status_code=401,
        )

    user_repo = _get_user_repo(request)
    user = await user_repo.get_by_username(username)
    if user is None:
        raise AppError(
            code="unauthorized",
            message="User not found",
            status_code=401,
        )

    if not verify_password(body.current_password, user["password_hash"]):
        raise AppError(
            code="invalid_credentials",
            message="Current password is incorrect",
            status_code=401,
        )

    new_hash = hash_password(body.new_password)
    await user_repo.update_password(user["id"], new_hash)
    return {"message": "Password changed"}


@router.get("/me", response_model=AuthStatusResponse)
async def me(request: Request):
    username = getattr(request.state, "username", None)
    if not username:
        raise AppError(
            code="unauthorized",
            message="Not authenticated",
            status_code=401,
        )
    return AuthStatusResponse(authenticated=True, username=username)
