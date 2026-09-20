import re
import json
import logging
from typing import List, Dict, Any
from app.config import settings
from app.schemas import EmergencyAnalysisResponse

logger = logging.getLogger(__name__)

# Fallback deterministic keyword parser
def fallback_parse_emergency(text: str) -> EmergencyAnalysisResponse:
    """
    Deterministic NLP rule engine to extract structured emergency metrics
    when external LLM APIs are offline or unconfigured.
    """
    lower_text = text.lower()
    
    def has_word(keywords: list) -> bool:
        for kw in keywords:
            if re.search(r'\b' + re.escape(kw) + r'\b', lower_text):
                return True
        return False
    
    # 1. Detect Incident Type
    incident_type = "MEDICAL_EMERGENCY"
    if has_word(["collision", "accident", "crash", "hit and run", "run over", "railway bridge", "vehicle", "car", "bike", "truck", "motorcycle"]):
        incident_type = "ROAD_ACCIDENT"
    elif has_word(["heart attack", "cardiac", "cardiac arrest", "chest pain", "pulse", "collapsed"]):
        incident_type = "CARDIAC_ARREST"
    elif has_word(["stroke", "paralysis", "slurred speech"]):
        incident_type = "STROKE"
    elif has_word(["fire", "burn", "explosion", "smoke"]):
        incident_type = "FIRE_BURN"
    elif has_word(["fall", "fracture", "broken bone", "bleeding"]):
        incident_type = "TRAUMA_INJURY"
    elif has_word(["breath", "suffocat", "asthma", "chok", "shortness of breath"]):
        incident_type = "RESPIRATORY_DISTRESS"

    # 2. Extract Patient Counts
    patient_count = 1
    word_to_num = {
        "one": 1, "two": 2, "three": 3, "four": 4, "five": 5,
        "six": 6, "seven": 7, "eight": 8, "nine": 9, "ten": 10
    }
    
    num_matches = re.findall(r'(\d+|one|two|three|four|five|six|seven|eight|nine|ten)\s+(?:people|persons|patients|injured|victims|individuals|casualties)', lower_text)
    if num_matches:
        val = num_matches[0]
        patient_count = int(val) if val.isdigit() else word_to_num.get(val, 1)

    # 3. Extract Critical Count
    critical_count = 0
    if any(k in lower_text for k in ["unconscious", "not responding", "unresponsive", "critical", "severe bleeding", "no pulse", "cardiac arrest", "not breathing"]):
        crit_matches = re.findall(r'(\d+|one|two|three|four|five)\s+(?:person|patient|victim|individual|people)?\s*(?:is|are)?\s*(?:unconscious|unresponsive|critical|not responding)', lower_text)
        if crit_matches:
            val = crit_matches[0]
            critical_count = int(val) if val.isdigit() else word_to_num.get(val, 1)
        else:
            critical_count = 1

    # 4. Determine Severity
    severity = "MEDIUM"
    if critical_count > 0 or any(k in lower_text for k in ["unconscious", "cardiac arrest", "severe head injury", "heavy bleeding", "massive crash", "not breathing", "critical"]):
        severity = "CRITICAL"
    elif patient_count >= 3 or any(k in lower_text for k in ["major accident", "fracture", "deep cut", "burn", "chest pain", "high fever", "serious"]):
        severity = "HIGH"
    elif any(k in lower_text for k in ["minor", "stable", "conscious", "small cut", "scratch", "mild"]):
        severity = "LOW"

    # 5. Extract Special Requirements
    special_reqs = []
    if critical_count > 0 or severity == "CRITICAL":
        special_reqs.append("advanced_emergency_support")
        special_reqs.append("ventilator_or_oxygen")
    if incident_type in ["ROAD_ACCIDENT", "TRAUMA_INJURY"]:
        special_reqs.append("trauma_care")
    if incident_type == "CARDIAC_ARREST":
        special_reqs.append("defibrillator")
        special_reqs.append("cardiac_monitoring")
    if patient_count > 2:
        special_reqs.append("multi_patient_triage")

    # Extract location hint
    loc_match = re.search(r'(?:near|at|on|around|by|in)\s+([a-zA-Z0-9\s]{3,40})(?:\.|\,|$)', text)
    location_desc = loc_match.group(1).strip() if loc_match else "Reported incident coordinates"

    return EmergencyAnalysisResponse(
        incident_type=incident_type,
        patient_count=max(patient_count, 1),
        critical_patient_count=critical_count,
        severity=severity,
        location_description=location_desc,
        special_requirements=special_reqs
    )


async def analyze_emergency_description(description: str) -> EmergencyAnalysisResponse:
    """
    Extract structured emergency data from unstructured natural language reports using OpenAI.
    Falls back gracefully to the deterministic parser if OpenAI is unavailable or errors.
    """
    api_key = settings.OPENAI_API_KEY.strip()
    if not api_key or api_key == "your_openai_api_key_here":
        logger.info("Using deterministic emergency analyzer (no OpenAI API key configured).")
        return fallback_parse_emergency(description)
    
    try:
        from openai import AsyncOpenAI
        client = AsyncOpenAI(api_key=api_key)
        
        system_prompt = (
            "You are a 911 / emergency dispatcher AI assistant. Analyze the incoming emergency report text "
            "and extract structured JSON with exact fields:\n"
            "- incident_type: string (e.g., ROAD_ACCIDENT, CARDIAC_ARREST, TRAUMA_INJURY, STROKE, FIRE_BURN, RESPIRATORY_DISTRESS, MEDICAL_EMERGENCY)\n"
            "- patient_count: integer (minimum 1)\n"
            "- critical_patient_count: integer\n"
            "- severity: string exactly one of ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']\n"
            "- location_description: string (e.g. 'near the railway bridge')\n"
            "- special_requirements: array of strings (e.g. ['advanced_emergency_support', 'trauma_care', 'defibrillator'])\n"
            "Return ONLY raw valid JSON, no markdown formatting."
        )

        response = await client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": description}
            ],
            response_format={"type": "json_object"},
            temperature=0.1,
            max_tokens=300
        )
        
        content = response.choices[0].message.content
        data = json.loads(content)
        
        return EmergencyAnalysisResponse(
            incident_type=data.get("incident_type", "ROAD_ACCIDENT").upper(),
            patient_count=int(data.get("patient_count", 1)),
            critical_patient_count=int(data.get("critical_patient_count", 0)),
            severity=data.get("severity", "HIGH").upper(),
            location_description=data.get("location_description", ""),
            special_requirements=data.get("special_requirements", [])
        )
    except Exception as e:
        logger.warning(f"OpenAI analysis failed or unavailable ({str(e)}). Falling back to deterministic parser.")
        return fallback_parse_emergency(description)
