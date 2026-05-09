from fastapi import APIRouter, Depends, HTTPException
from typing import List

from models import User
from schemas import UserOut, UserUpdate, UserPublic
from auth import get_current_user

router = APIRouter(prefix="/users", tags=["users"])


@router.get("/me", response_model=UserOut)
async def get_me(current_user: User = Depends(get_current_user)):
    return current_user


@router.patch("/me", response_model=UserOut)
async def update_me(
    body: UserUpdate,
    current_user: User = Depends(get_current_user),
):
    if body.username is not None:
        # Check uniqueness
        existing = await User.find_one(
            {"username": body.username, "_id": {"$ne": current_user.id}}
        )
        if existing:
            raise HTTPException(status_code=400, detail="Username already taken")
        current_user.username = body.username
    if body.avatar_url is not None:
        current_user.avatar_url = body.avatar_url

    await current_user.save()
    return current_user


@router.get("/search", response_model=List[UserPublic])
async def search_users(
    q: str,
    current_user: User = Depends(get_current_user),
):
    if not q or len(q) < 2:
        return []
        
    users = await User.find(
        {"username": {"$regex": q, "$options": "i"}, "_id": {"$ne": current_user.id}}
    ).limit(20).to_list()
    
    return users
