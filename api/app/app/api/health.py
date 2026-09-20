from fastapi import APIRouter

router = APIRouter(tags=["Health"])

@router.get("/health", summary="Health check endpoint")
async def health_check():
    return {"status": "ok", "service": "LifeLine Emergency Response Platform"}
