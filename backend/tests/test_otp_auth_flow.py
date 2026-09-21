import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.services.otp_service import _otp_store, OtpService

client = TestClient(app)

def test_otp_generation_and_cooldown():
    phone = "+919876543210"
    if phone in _otp_store:
        del _otp_store[phone]
        
    # 1. Send OTP
    resp = client.post("/api/auth/send-otp", json={"phone": phone, "role": "DRIVER"})
    assert resp.status_code == 200
    data = resp.json()
    assert data["success"] is True
    assert data["cooldown_seconds"] == 60
    assert phone in _otp_store
    
    # 2. Resend immediately within cooldown -> should fail with 429
    resp_cooldown = client.post("/api/auth/send-otp", json={"phone": phone, "role": "DRIVER"})
    assert resp_cooldown.status_code == 429
    assert "wait" in resp_cooldown.json()["detail"].lower()

def test_otp_verification_failure_and_success():
    phone = "+919876543211"
    if phone in _otp_store:
        del _otp_store[phone]
        
    # 1. Send OTP
    client.post("/api/auth/send-otp", json={"phone": phone, "role": "HOSPITAL_STAFF"})
    
    # 2. Try invalid OTP
    resp_fail = client.post("/api/auth/verify-otp", json={
        "phone": phone,
        "otp": "000000",
        "name": "Dr. Testing",
        "role": "HOSPITAL_STAFF"
    })
    assert resp_fail.status_code == 400
    assert "invalid" in resp_fail.json()["detail"].lower()
    
    # 3. Simulate correct OTP verification
    record = _otp_store[phone]
    salt = record["salt"]
    correct_otp = "123456"
    record["otp_hash"] = OtpService._hash_otp(phone, correct_otp, salt)
    
    resp_success = client.post("/api/auth/verify-otp", json={
        "phone": phone,
        "otp": correct_otp,
        "name": "Dr. Testing",
        "email": "dr.testing@lifeline.org",
        "role": "HOSPITAL_STAFF"
    })
    assert resp_success.status_code == 200
    data = resp_success.json()
    assert data["success"] is True
    assert data["token"].startswith("ll_auth_")
    assert data["driver"]["phone_verified"] is True
    assert data["driver"]["role"] == "HOSPITAL_STAFF"
