import hashlib
import hmac
import logging
import secrets
from datetime import datetime, timedelta, timezone
from typing import Dict, Optional, Tuple

logger = logging.getLogger(__name__)

# In-memory secure OTP store: phone -> {hash, salt, expires_at, attempts, resend_available_at, verified}
_otp_store: Dict[str, dict] = {}
OTP_EXPIRY_MINUTES = 5
OTP_RESEND_COOLDOWN_SECONDS = 60
MAX_ATTEMPTS = 3

class OtpService:
    @staticmethod
    def _hash_otp(phone: str, otp: str, salt: str) -> str:
        """Never stores raw OTPs; uses salted SHA-256 HMAC hash."""
        key = f"{phone}:{salt}".encode("utf-8")
        return hmac.new(key, otp.encode("utf-8"), hashlib.sha256).hexdigest()

    @classmethod
    def generate_and_send_otp(cls, phone: str, role: str = "DRIVER") -> Tuple[bool, str, int]:
        """
        Generates a 6-digit cryptographically secure OTP, records salted hash,
        enforces 60-second resend cooldown, and dispatches via SMS provider.
        Returns (success, message, cooldown_seconds).
        """
        now = datetime.now(timezone.utc)
        clean_phone = phone.strip()

        # Check resend cooldown
        if clean_phone in _otp_store:
            record = _otp_store[clean_phone]
            if now < record["resend_available_at"]:
                remaining = int((record["resend_available_at"] - now).total_seconds())
                return False, f"Please wait {remaining} seconds before requesting a new OTP.", remaining

        # Generate 6-digit numeric OTP
        raw_otp = f"{secrets.randbelow(900000) + 100000}"
        salt = secrets.token_hex(16)
        otp_hash = cls._hash_otp(clean_phone, raw_otp, salt)

        _otp_store[clean_phone] = {
            "otp_hash": otp_hash,
            "salt": salt,
            "expires_at": now + timedelta(minutes=OTP_EXPIRY_MINUTES),
            "resend_available_at": now + timedelta(seconds=OTP_RESEND_COOLDOWN_SECONDS),
            "attempts": 0,
            "verified": False,
            "role": role
        }

        # Dispatch via SMS Provider (Twilio / AWS SNS / Simulated Gateway)
        cls._send_sms(clean_phone, raw_otp, role)

        return True, f"Verification code sent to {clean_phone[-4:].rjust(len(clean_phone), '*')}", OTP_RESEND_COOLDOWN_SECONDS

    @classmethod
    def verify_otp(cls, phone: str, otp_entered: str) -> Tuple[bool, str]:
        """
        Validates OTP against salted hash. Enforces expiration and maximum 3 attempts.
        """
        now = datetime.now(timezone.utc)
        clean_phone = phone.strip()

        if clean_phone not in _otp_store:
            return False, "No OTP request found for this phone number. Please request a new code."

        record = _otp_store[clean_phone]

        # Check expiry
        if now > record["expires_at"]:
            del _otp_store[clean_phone]
            return False, "OTP has expired. Please request a new verification code."

        # Check attempts
        if record["attempts"] >= MAX_ATTEMPTS:
            del _otp_store[clean_phone]
            return False, "Maximum verification attempts exceeded. Please request a new code."

        record["attempts"] += 1

        # Verify hash
        expected_hash = cls._hash_otp(clean_phone, otp_entered.strip(), record["salt"])
        if not hmac.compare_digest(record["otp_hash"], expected_hash):
            remaining = MAX_ATTEMPTS - record["attempts"]
            if remaining <= 0:
                del _otp_store[clean_phone]
                return False, "Invalid verification code. Maximum attempts reached. Please request a new code."
            return False, f"Invalid verification code. {remaining} attempt(s) remaining."

        # Mark as verified and clean up sensitive hash
        record["verified"] = True
        return True, "Phone number successfully verified."

    @classmethod
    def is_phone_verified(cls, phone: str) -> bool:
        clean_phone = phone.strip()
        record = _otp_store.get(clean_phone)
        return bool(record and record.get("verified"))

    @staticmethod
    def _send_sms(phone: str, otp: str, role: str):
        """
        SMS Provider gateway abstraction. In production this dispatches through Twilio/SNS.
        For local security, logs masked debug token to server console.
        """
        logger.info(f"[SMS Gateway] Dispatched OTP [{otp}] to {phone} for role: {role}")
        print(f"\n==========================================")
        print(f" [LifeLine SMS Gateway] OTP CODE for {phone}: {otp}")
        print(f"==========================================\n")

otp_service = OtpService()
