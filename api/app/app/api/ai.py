from fastapi import APIRouter, Depends, HTTPException, status
from typing import Optional, List
from app.schemas import ChatRequest, ChatResponse, EmergencyAnalysisResponse
from app.services.gemini_service import process_dispatcher_chat
from app.services.ai_service import analyze_emergency_description

router = APIRouter(prefix="/ai", tags=["Gemini Dispatcher AI"])

@router.post("/chat", response_model=ChatResponse, summary="Conversational dispatcher intake with Gemini AI")
async def chat_with_dispatcher(payload: ChatRequest):
    """
    Interactive conversational intake dispatcher powered by Google Gemini.
    Asks minimum required questions, extracts structured emergency state,
    and signals when sufficient data is available for routing.
    """
    return await process_dispatcher_chat(
        message=payload.message,
        conversation_id=payload.conversation_id,
        history=payload.history,
        latitude=payload.latitude,
        longitude=payload.longitude,
        location_source=payload.location_source,
        accuracy_meters=payload.accuracy_meters
    )

@router.post("/analyze", response_model=EmergencyAnalysisResponse, summary="Direct structured emergency extraction")
async def analyze_emergency_text(description: str):
    """
    One-shot structured emergency extraction from natural language text.
    """
    return await analyze_emergency_description(description)
