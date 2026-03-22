from fastapi import APIRouter

router = APIRouter(tags=["Root routes"])


@router.get("/status")
async def root():
    return {
        "status": "online",
        "output": "Welcome to the Wolf-Eye API Service! 🏔️",
        "message": (
            "Or perhaps you're looking for the answer to the ultimate question of life, "
            "the universe, and everything? 🌌"
        ),
    }
