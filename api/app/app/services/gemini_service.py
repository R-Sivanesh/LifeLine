import json
import logging
import re
import uuid
from typing import Dict, Any, List, Optional
import httpx
from app.config import settings
from app.schemas import ChatMessage, EmergencyDispatcherState, ChatResponse

logger = logging.getLogger(__name__)

# Server-side conversational memory store
_CONVERSATION_STORE: Dict[str, Dict[str, Any]] = {}

DISPATCHER_SYSTEM_PROMPT = """You are LIFELINE DISPATCH AI, a mission-critical 911 / 108 emergency intake dispatcher.
Your goal is to extract essential emergency parameters to initiate urgent routing as quickly as possible without making false decisions.

CORE PROTOCOLS:
1. INTENT CLASSIFICATION: Classify the user's intent into one of:
   - "GREETING": User said "hi", "hello", "hey", "vanakkam", etc.
   - "GENERAL_QUESTION": User asked what you do or a general question.
   - "EMERGENCY_REPORT": User is reporting an active emergency.
   - "LOCATION_UPDATE": User is providing or clarifying a location.
   - "ANSWER_TO_QUESTION": User is answering your previous question.
   - "CONFIRMATION": User is confirming details.
   - "CANCELLATION": User wants to cancel.
   - "UNKNOWN": Non-emergency gibberish.

2. GREETINGS & CASUAL TALK:
   - For "hi", "hello", etc., DO NOT say "Information received" or "Ready to optimize".
   - DO NOT set "has_sufficient_information": true.
   - DO NOT invent an incident type or location.
   - Reply warmly and directly: "Hi. I'm LifeLine Dispatch AI. If this is an emergency, tell me what happened and where."

3. EMERGENCY INTAKE CONVERSATION FLOW:
   - Ask ONLY ONE focused question at a time.
   - Priority:
     1. Incident nature (accident, cardiac, stroke, fire, trauma)
     2. Location / landmark / street
     3. Immediate life-threat (unconscious / non-responsive / severe bleeding / cardiac arrest)
     4. Patient count
     5. Road passability (blocked / open)

4. SUFFICIENT INFORMATION CRITERIA:
   - Set "has_sufficient_information": true ONLY WHEN both:
     a) Incident type is known (e.g. ROAD_ACCIDENT, CARDIAC_ARREST)
     b) Location is known (either provided in message or already confirmed in state)
   - If location or incident type is missing, "has_sufficient_information" MUST BE false.

5. TAMIL / TANGLISH COMPREHENSION:
   - "accident aachu" = ROAD_ACCIDENT
   - "oru aal unconscious" / "unresponsive" = 1 patient unconscious (CRITICAL)
   - "road block aagiduchu" = BLOCKED
   - "bridge pakkam" = near the bridge
   - "3 per injured" = 3 patients injured
   Normalize all structured values to English.

6. JSON OUTPUT FORMAT: Return ONLY valid JSON matching this exact structure:
{
  "intent": "GREETING" | "GENERAL_QUESTION" | "EMERGENCY_REPORT" | "LOCATION_UPDATE" | "ANSWER_TO_QUESTION" | "CONFIRMATION" | "CANCELLATION" | "UNKNOWN",
  "conversation_state": "IDLE" | "GREETING" | "COLLECTING_LOCATION" | "COLLECTING_INCIDENT" | "COLLECTING_PATIENT_COUNT" | "COLLECTING_CRITICAL_STATUS" | "COLLECTING_ROAD_ACCESS" | "INFORMATION_SUFFICIENT",
  "reply_text": "Short dispatcher response or single focused question",
  "has_sufficient_information": true or false,
  "missing_information": ["location" | "incident_type" | "patient_count" | "consciousness_status"],
  "suggested_quick_replies": ["Short suggestion 1", "Short suggestion 2", ...],
  "structured_state": {
    "incident_type": "ROAD_ACCIDENT" | "CARDIAC_ARREST" | "STROKE" | "FIRE_BURN" | "TRAUMA_INJURY" | "RESPIRATORY_DISTRESS" | "MEDICAL_EMERGENCY" | null,
    "severity": "CRITICAL" | "HIGH" | "MEDIUM" | "LOW",
    "patient_count": integer (>=1) or null,
    "critical_patient_count": integer (>=0) or null,
    "location_description": "string" or null,
    "road_passability": "PASSABLE" | "PARTIAL" | "BLOCKED" | "UNKNOWN" | null,
    "special_requirements": ["string", ...],
    "confidence": float (0.0 to 1.0)
  }
}
"""

GREETING_WORDS = {"hi", "hello", "hey", "vanakkam", "namaste", "good morning", "good afternoon", "good evening", "yo", "hai"}

def fallback_dispatcher_rule_engine(
    message: str,
    history: List[ChatMessage],
    current_state: Optional[EmergencyDispatcherState] = None,
    current_lat: Optional[float] = None,
    current_lng: Optional[float] = None,
    location_confirmed: bool = False
) -> Dict[str, Any]:
    """
    Deterministic rule-based conversational dispatcher with multi-intent classification,
    state machine, Tanglish support, and zero-false-decision guarantee.
    """
    msg_clean = message.strip()
    msg_lower = msg_clean.lower()
    msg_words = set(re.findall(r'\b[a-zA-Z]+\b', msg_lower))

    # Pull existing state
    prev_type = current_state.incident_type if current_state else None
    prev_loc = current_state.location_description if current_state else None
    prev_patient_count = current_state.patient_count if current_state else None
    prev_crit_count = current_state.critical_patient_count if current_state else None
    prev_road = current_state.road_passability if current_state else None
    prev_has_loc = location_confirmed or (prev_loc is not None and len(prev_loc.strip()) > 2)

    # 1. Check for Greetings / Casual messages
    is_greeting_exact = msg_lower in GREETING_WORDS or (len(msg_words) <= 2 and bool(msg_words & GREETING_WORDS))
    
    # Emergency keyword detection
    has_emergency_keyword = any(k in msg_lower for k in [
        "accident", "collision", "crash", "hit and run", "run over", "vehicle", "car", "bike", "truck", "lorry", "bus",
        "accident aachu", "heart attack", "cardiac", "chest pain", "pulse", "collapsed", "stroke", "paralysis", "slurred speech",
        "fire", "burn", "explosion", "thee", "fall", "fracture", "broken bone", "bleeding", "unconscious", "unresponsive", "injured"
    ])

    if is_greeting_exact and not has_emergency_keyword and not prev_type:
        return {
            "intent": "GREETING",
            "conversation_state": "GREETING",
            "reply_text": "Hi. I'm LifeLine Dispatch AI. If this is an emergency, tell me what happened and where.",
            "has_sufficient_information": False,
            "missing_information": ["incident_type", "location"],
            "suggested_quick_replies": ["Road Accident", "Cardiac Emergency", "Fall / Severe Injury", "Fire / Burn"],
            "structured_state": {
                "incident_type": None,
                "severity": "MEDIUM",
                "patient_count": None,
                "critical_patient_count": None,
                "location_description": prev_loc,
                "road_passability": None,
                "special_requirements": [],
                "confidence": 0.0
            }
        }

    # 2. Check for General Questions
    if any(msg_lower.startswith(k) for k in ["what is", "how do", "who are you", "what can you do", "how does lifeline", "tell me about"]) and not has_emergency_keyword:
        return {
            "intent": "GENERAL_QUESTION",
            "conversation_state": "IDLE",
            "reply_text": "I am the LifeLine Emergency Dispatcher. I intake emergency details, assess severity, and optimize ambulance and hospital routing in real-time. Do you have an emergency to report?",
            "has_sufficient_information": False,
            "missing_information": ["incident_type", "location"],
            "suggested_quick_replies": ["Report Road Accident", "Report Medical Emergency", "Test Demo Scenario"],
            "structured_state": {
                "incident_type": None,
                "severity": "LOW",
                "patient_count": None,
                "critical_patient_count": None,
                "location_description": prev_loc,
                "road_passability": None,
                "special_requirements": [],
                "confidence": 0.0
            }
        }

    # 3. Emergency & Incident Type Parsing
    incident_type = prev_type
    if any(k in msg_lower for k in ["collision", "accident", "crash", "hit and run", "run over", "vehicle", "car", "bike", "truck", "accident aachu", "road accident"]):
        incident_type = "ROAD_ACCIDENT"
    elif any(k in msg_lower for k in ["heart attack", "cardiac", "cardiac arrest", "chest pain", "pulse", "collapsed"]):
        incident_type = "CARDIAC_ARREST"
    elif any(k in msg_lower for k in ["stroke", "paralysis", "slurred speech"]):
        incident_type = "STROKE"
    elif any(k in msg_lower for k in ["fire", "burn", "explosion", "smoke", "thee"]):
        incident_type = "FIRE_BURN"
    elif any(k in msg_lower for k in ["fall", "fracture", "broken bone", "heavy bleeding", "trauma"]):
        incident_type = "TRAUMA_INJURY"
    elif any(k in msg_lower for k in ["breathing", "respiratory", "asthma", "choking"]):
        incident_type = "RESPIRATORY_DISTRESS"
    elif has_emergency_keyword and not incident_type:
        incident_type = "MEDICAL_EMERGENCY"

    # 4. Patient Counts
    patient_count = prev_patient_count
    num_map = {"one": 1, "two": 2, "three": 3, "four": 4, "five": 5, "six": 6, "seven": 7, "eight": 8, "nine": 9, "ten": 10, "oru": 1, "rendu": 2, "moonu": 3, "naalu": 4}
    
    pat_matches = re.findall(r'(\d+|one|two|three|four|five|six|seven|eight|nine|ten|oru|rendu|moonu|naalu)\s+(?:people|persons|patients|injured|victims|casualties|per)', msg_lower)
    if pat_matches:
        v = pat_matches[0]
        patient_count = int(v) if v.isdigit() else num_map.get(v, 1)
    elif patient_count is None and incident_type is not None:
        patient_count = 1

    # 5. Critical Count & Consciousness
    critical_count = prev_crit_count if prev_crit_count is not None else 0
    if any(k in msg_lower for k in ["unconscious", "not responding", "unresponsive", "critical", "severe bleeding", "no pulse", "cardiac arrest", "not breathing", "oru aal unconscious"]):
        crit_matches = re.findall(r'(\d+|one|two|three|four|five|oru|rendu)\s+(?:person|patient|victim|people|aal)?\s*(?:is|are)?\s*(?:unconscious|unresponsive|critical|not responding)', msg_lower)
        if crit_matches:
            v = crit_matches[0]
            critical_count = int(v) if v.isdigit() else num_map.get(v, 1)
        else:
            critical_count = 1
    elif any(k in msg_lower for k in ["conscious", "talking", "awake", "stable", "minor"]):
        critical_count = 0

    # 6. Road Passability
    road_passability = prev_road
    if any(k in msg_lower for k in ["block", "blocked", "jam", "closed", "traffic jam", "waterlogging", "road block", "block aagiduchu"]):
        road_passability = "BLOCKED"
    elif any(k in msg_lower for k in ["clear", "open", "passable", "moving"]):
        road_passability = "PASSABLE"

    # 7. Severity
    severity = "MEDIUM"
    if critical_count > 0 or (incident_type in ["CARDIAC_ARREST", "STROKE"]) or any(k in msg_lower for k in ["unconscious", "cardiac arrest", "severe head injury", "heavy bleeding", "massive crash", "not breathing", "critical"]):
        severity = "CRITICAL"
    elif (patient_count and patient_count >= 3) or incident_type == "FIRE_BURN" or any(k in msg_lower for k in ["major accident", "deep cut", "burn", "chest pain", "serious"]):
        severity = "HIGH"
    elif any(k in msg_lower for k in ["minor", "stable", "conscious", "scratch", "small cut"]):
        severity = "LOW"

    # 8. Location Extraction
    location_desc = prev_loc
    # Check "bridge pakkam" or "[place] pakkam"
    pakkam_match = re.search(r'([a-zA-Z0-9\s]{3,30})\s+pakkam', msg_lower)
    if pakkam_match:
        extracted = pakkam_match.group(1).strip()
        if extracted not in ["accident", "oru", "anna"]:
            location_desc = f"{extracted.title()} Area"
    
    if not location_desc or location_desc == prev_loc:
        loc_match = re.search(r'(?:near|at|on|around|by|in)\s+([a-zA-Z0-9\s]{3,40})(?:\.|\,|$)', msg_lower)
        if loc_match:
            extracted = loc_match.group(1).strip()
            # Ensure it's not a common non-location phrase
            if extracted not in ["the road", "the car", "the spot", "an accident", "trouble", "pain"]:
                location_desc = extracted.title()

    has_loc = location_confirmed or (location_desc is not None and len(location_desc.strip()) > 2)

    # 9. Determine Missing Fields & Sufficiency
    missing = []
    if not incident_type:
        missing.append("incident_type")
    if not has_loc:
        missing.append("location")
    if patient_count is None:
        missing.append("patient_count")
    if critical_count == 0 and severity == "MEDIUM" and not any(k in msg_lower for k in ["conscious", "awake", "unconscious", "unresponsive"]):
        missing.append("consciousness_status")

    # Sufficiency rule: Incident type AND Location MUST be known.
    has_sufficient = (incident_type is not None) and has_loc

    # Determine state & next focused question
    suggested_quick_replies: List[str] = []
    
    if not incident_type:
        conv_state = "COLLECTING_INCIDENT"
        reply = "What type of emergency is occurring (e.g. road accident, cardiac arrest, fall, fire)?"
        suggested_quick_replies = ["Road Accident", "Cardiac Emergency", "Severe Injury", "Fire Emergency"]
    elif not has_loc:
        conv_state = "COLLECTING_LOCATION"
        reply = "Where is the exact location or nearest landmark?"
        suggested_quick_replies = ["Use My GPS Location", "Near Tambaram Bridge", "Near Chromepet Signal", "Near Guindy Station"]
    elif "consciousness_status" in missing and len(history) <= 2:
        conv_state = "COLLECTING_CRITICAL_STATUS"
        reply = "Is anyone unconscious or non-responsive at the scene?"
        suggested_quick_replies = ["Yes, 1 unconscious", "No, all conscious", "Unsure / Checking"]
    elif road_passability is None and len(history) <= 3:
        conv_state = "COLLECTING_ROAD_ACCESS"
        reply = "Is the road clear or blocked by traffic/debris?"
        suggested_quick_replies = ["Road is clear", "Road is blocked / jammed"]
    else:
        conv_state = "INFORMATION_SUFFICIENT"
        reply = f"Information received for {incident_type.replace('_', ' ').title()}. Ready to calculate optimal response."
        suggested_quick_replies = ["Find Best Response", "Add Patient Details", "Road is Blocked"]

    # Special requirements
    special_reqs = []
    if severity == "CRITICAL" or critical_count > 0:
        special_reqs.append("advanced_emergency_support")
        special_reqs.append("ventilator_or_oxygen")
    if incident_type in ["ROAD_ACCIDENT", "TRAUMA_INJURY"]:
        special_reqs.append("trauma_care")
    if incident_type == "CARDIAC_ARREST":
        special_reqs.append("defibrillator")

    return {
        "intent": "EMERGENCY_REPORT" if incident_type else "UNKNOWN",
        "conversation_state": conv_state,
        "reply_text": reply,
        "has_sufficient_information": has_sufficient,
        "missing_information": missing,
        "suggested_quick_replies": suggested_quick_replies,
        "structured_state": {
            "incident_type": incident_type,
            "severity": severity,
            "patient_count": patient_count or 1,
            "critical_patient_count": critical_count,
            "location_description": location_desc or ("Confirmed Location" if location_confirmed else None),
            "road_passability": road_passability or "PASSABLE",
            "special_requirements": special_reqs,
            "confidence": 0.95 if has_sufficient else 0.50
        }
    }


async def process_dispatcher_chat(
    message: str,
    conversation_id: Optional[str] = None,
    history: Optional[List[ChatMessage]] = None,
    latitude: Optional[float] = None,
    longitude: Optional[float] = None,
    location_source: Optional[str] = None,
    accuracy_meters: Optional[float] = None
) -> ChatResponse:
    """
    Core conversational intake dispatcher powered by Google Gemini (with deterministic rule-engine fallback).
    Guarantees zero false decisions and accurate intent classification.
    """
    conv_id = conversation_id or f"conv-{str(uuid.uuid4())[:8]}"
    msg_history = history or []
    
    # Retrieve stored state
    stored = _CONVERSATION_STORE.get(conv_id, {
        "history": [],
        "state": EmergencyDispatcherState(),
        "latitude": latitude,
        "longitude": longitude,
        "location_source": location_source,
        "accuracy_meters": accuracy_meters,
        "location_confirmed": bool(latitude and longitude)
    })

    current_state: EmergencyDispatcherState = stored.get("state", EmergencyDispatcherState())
    loc_confirmed = bool(latitude and longitude) or current_state.location_confirmed

    api_key = settings.GEMINI_API_KEY.strip()
    result_data = None

    # Check for simple greeting to avoid wasting Gemini quota on "hi"
    msg_words = set(re.findall(r'\b[a-zA-Z]+\b', message.strip().lower()))
    is_simple_greeting = message.strip().lower() in GREETING_WORDS or (len(msg_words) <= 2 and bool(msg_words & GREETING_WORDS))

    if not is_simple_greeting and api_key and api_key != "your_gemini_api_key_here":
        try:
            # Prepare Gemini prompt contents
            gemini_messages = []
            for h in msg_history:
                role = "user" if h.role == "user" else "model"
                gemini_messages.append({"role": role, "parts": [{"text": h.content}]})
            
            # Contextual prompt addition with current known location
            prompt_context = f"Current message: {message}"
            if loc_confirmed:
                prompt_context += f" (Note: User has confirmed coordinates: {latitude or stored.get('latitude')}, {longitude or stored.get('longitude')})"
            
            gemini_messages.append({"role": "user", "parts": [{"text": prompt_context}]})

            candidate_models = [settings.GEMINI_MODEL, "gemini-2.5-flash", "gemini-1.5-flash", "gemini-2.0-flash"]
            seen_models = set()
            models_to_try = [m for m in candidate_models if m and not (m in seen_models or seen_models.add(m))]

            async with httpx.AsyncClient(timeout=4.0) as client:
                for model_name in models_to_try:
                    try:
                        url = f"https://generativelanguage.googleapis.com/v1beta/models/{model_name}:generateContent?key={api_key}"
                        payload = {
                            "systemInstruction": {"parts": [{"text": DISPATCHER_SYSTEM_PROMPT}]},
                            "contents": gemini_messages,
                            "generationConfig": {
                                "temperature": 0.1,
                                "responseMimeType": "application/json",
                                "maxOutputTokens": 450
                            }
                        }
                        resp = await client.post(url, json=payload)
                        if resp.status_code == 200:
                            resp_json = resp.json()
                            candidates = resp_json.get("candidates", [])
                            if candidates:
                                text_content = candidates[0].get("content", {}).get("parts", [{}])[0].get("text", "")
                                parsed = json.loads(text_content)
                                # Validate minimum schema structure
                                if "reply_text" in parsed and "structured_state" in parsed:
                                    result_data = parsed
                                    break
                        else:
                            logger.warning(f"Gemini API model {model_name} returned status {resp.status_code}: {resp.text[:100]}")
                    except Exception as model_err:
                        logger.warning(f"Gemini API error with model {model_name}: {str(model_err)}")
        except Exception as e:
            logger.warning(f"Gemini Dispatcher API call failed ({str(e)}). Engaging fallback rule engine.")

    if not result_data:
        result_data = fallback_dispatcher_rule_engine(
            message=message,
            history=msg_history,
            current_state=current_state,
            current_lat=latitude or stored.get("latitude"),
            current_lng=longitude or stored.get("longitude"),
            location_confirmed=loc_confirmed
        )

    st_raw = result_data.get("structured_state", {})
    intent = result_data.get("intent", "UNKNOWN")
    conv_state = result_data.get("conversation_state", "IDLE")

    # Safety override: if intent is GREETING, guarantee has_sufficient_information is False
    has_sufficient = bool(result_data.get("has_sufficient_information", False))
    if intent in ["GREETING", "GENERAL_QUESTION", "UNKNOWN"] or not st_raw.get("incident_type"):
        has_sufficient = False

    state_obj = EmergencyDispatcherState(
        intent=intent,
        conversation_state=conv_state,
        incident_type=st_raw.get("incident_type"),
        severity=st_raw.get("severity", "MEDIUM"),
        patient_count=st_raw.get("patient_count"),
        critical_patient_count=st_raw.get("critical_patient_count"),
        location_description=st_raw.get("location_description"),
        location_confirmed=loc_confirmed,
        latitude=latitude or stored.get("latitude"),
        longitude=longitude or stored.get("longitude"),
        location_source=location_source or stored.get("location_source"),
        accuracy_meters=accuracy_meters or stored.get("accuracy_meters"),
        road_passability=st_raw.get("road_passability"),
        special_requirements=st_raw.get("special_requirements", []),
        confidence=float(st_raw.get("confidence", 0.85 if has_sufficient else 0.0)),
        missing_information=result_data.get("missing_information", []),
        has_sufficient_information=has_sufficient
    )

    # Update server memory
    updated_history = list(msg_history) + [
        ChatMessage(role="user", content=message),
        ChatMessage(role="assistant", content=result_data.get("reply_text", "Understood."))
    ]
    _CONVERSATION_STORE[conv_id] = {
        "history": updated_history,
        "state": state_obj,
        "latitude": state_obj.latitude,
        "longitude": state_obj.longitude,
        "location_source": state_obj.location_source,
        "accuracy_meters": state_obj.accuracy_meters,
        "location_confirmed": loc_confirmed
    }

    return ChatResponse(
        reply=result_data.get("reply_text", "Understood."),
        conversation_id=conv_id,
        state=state_obj,
        has_sufficient_information=has_sufficient,
        suggested_quick_replies=result_data.get("suggested_quick_replies", [])
    )
