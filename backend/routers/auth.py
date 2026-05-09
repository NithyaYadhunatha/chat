from fastapi import APIRouter, Depends, HTTPException, status, Response, Cookie
from typing import Optional
from beanie.operators import Or
from beanie import PydanticObjectId
from google.oauth2 import id_token
from google.auth.transport import requests
import httpx

from models import User
from schemas import UserCreate, UserOut, LoginRequest, TokenResponse, TokenRefreshRequest, GoogleAuthRequest
from auth import (
    hash_password, verify_password,
    create_access_token, create_refresh_token, decode_token,
)
from config import settings

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/register", response_model=TokenResponse, status_code=201)
async def register(body: UserCreate, response: Response):
    # Check duplicates
    existing = await User.find_one(
        Or(User.email == body.email, User.username == body.username)
    )
    if existing:
        raise HTTPException(status_code=400, detail="Email or username already taken")

    user = User(
        username=body.username,
        email=body.email,
        password_hash=hash_password(body.password),
    )
    await user.insert()

    access_token = create_access_token({"sub": str(user.id)})
    refresh_token = create_refresh_token({"sub": str(user.id)})

    response.set_cookie(
        key="refresh_token",
        value=refresh_token,
        httponly=True,
        samesite="lax",
        max_age=7 * 24 * 3600,
    )
    return {"access_token": access_token}


@router.post("/login", response_model=TokenResponse)
async def login(body: LoginRequest, response: Response):
    user = await User.find_one(User.email == body.email)
    if not user or not verify_password(body.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid credentials")

    access_token = create_access_token({"sub": str(user.id)})
    refresh_token = create_refresh_token({"sub": str(user.id)})

    response.set_cookie(
        key="refresh_token",
        value=refresh_token,
        httponly=True,
        samesite="lax",
        max_age=7 * 24 * 3600,
    )
    return {"access_token": access_token}


@router.post("/google", response_model=TokenResponse)
async def google_login(body: GoogleAuthRequest, response: Response):
    try:
        id_token_jwt = body.credential
        
        if body.code:
            async with httpx.AsyncClient() as client:
                token_res = await client.post(
                    "https://oauth2.googleapis.com/token",
                    data={
                        "code": body.code,
                        "client_id": settings.GOOGLE_CLIENT_ID,
                        "client_secret": settings.GOOGLE_CLIENT_SECRET,
                        "redirect_uri": "postmessage",
                        "grant_type": "authorization_code",
                    }
                )
            token_data = token_res.json()
            if "error" in token_data:
                raise HTTPException(status_code=400, detail="Failed to exchange auth code")
            id_token_jwt = token_data.get("id_token")
            
        if not id_token_jwt:
            raise HTTPException(status_code=400, detail="No credential or code provided")

        idinfo = id_token.verify_oauth2_token(
            id_token_jwt, requests.Request(), settings.GOOGLE_CLIENT_ID
        )

        email = idinfo.get("email")
        google_id = idinfo.get("sub")
        name = idinfo.get("name", email.split("@")[0])
        avatar_url = idinfo.get("picture")

        if not email:
            raise HTTPException(status_code=400, detail="No email provided by Google")

        user = await User.find_one(User.email == email)
        if not user:
            user = User(
                username=name,
                email=email,
                auth_provider="google",
                google_id=google_id,
                avatar_url=avatar_url
            )
            existing_username = await User.find_one(User.username == user.username)
            if existing_username:
                base_username = user.username.replace(" ", "")
                user.username = f"{base_username}_{google_id[:5]}"
            
            await user.insert()
        else:
            if user.auth_provider != "google" or user.google_id != google_id:
                user.auth_provider = "google"
                user.google_id = google_id
                if avatar_url and not user.avatar_url:
                    user.avatar_url = avatar_url
                await user.save()

        access_token = create_access_token({"sub": str(user.id)})
        refresh_token = create_refresh_token({"sub": str(user.id)})

        response.set_cookie(
            key="refresh_token",
            value=refresh_token,
            httponly=True,
            samesite="lax",
            max_age=7 * 24 * 3600,
        )
        return {"access_token": access_token}
    except ValueError:
        raise HTTPException(status_code=401, detail="Invalid Google token")


@router.post("/refresh", response_model=TokenResponse)
async def refresh(
    response: Response,
    refresh_token: Optional[str] = Cookie(default=None),
):
    if not refresh_token:
        raise HTTPException(status_code=401, detail="No refresh token")

    payload = decode_token(refresh_token)
    if payload.get("type") != "refresh":
        raise HTTPException(status_code=401, detail="Invalid token type")

    user_id = payload.get("sub")
    
    try:
        user = await User.get(PydanticObjectId(user_id))
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid user ID format")
        
    if not user:
        raise HTTPException(status_code=401, detail="User not found")

    access_token = create_access_token({"sub": str(user.id)})
    new_refresh = create_refresh_token({"sub": str(user.id)})
    response.set_cookie(
        key="refresh_token",
        value=new_refresh,
        httponly=True,
        samesite="lax",
        max_age=7 * 24 * 3600,
    )
    return {"access_token": access_token}


@router.post("/logout")
async def logout(response: Response):
    response.delete_cookie("refresh_token")
    return {"detail": "Logged out"}
