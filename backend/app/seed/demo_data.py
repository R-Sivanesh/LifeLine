import logging
from datetime import datetime, timezone, timedelta
from sqlalchemy.orm import Session
from app.models import (
    Emergency,
    EmergencySession,
    Driver,
    Ambulance,
    Hospital,
    RoadIncident,
    Dispatch,
    RouteEvent,
    EmergencyEvent,
    DriverAlert
)

logger = logging.getLogger(__name__)

def seed_database(db: Session, force_reset: bool = False):
    """
    Populates registered ambulances, authenticated drivers, facilities, and demo baseline data.
    """
    if force_reset:
        db.query(EmergencyEvent).delete()
        db.query(DriverAlert).delete()
        db.query(RouteEvent).delete()
        db.query(Dispatch).delete()
        db.query(EmergencySession).delete()
        db.query(Emergency).delete()
        db.query(Driver).delete()
        db.query(Ambulance).delete()
        db.query(Hospital).delete()
        db.query(RoadIncident).delete()
        db.commit()

    if db.query(Hospital).count() > 0 and not force_reset:
        logger.info("Database already seeded with hospitals and ambulances.")
        return

    now = datetime.now(timezone.utc)

    # 1. Seed Registered Ambulances Fleet
    ambulances = [
        Ambulance(
            id="amb-101",
            vehicle_number="A-101 (Basic Transport)",
            latitude=13.0425,
            longitude=80.2410,
            capability="BASIC",
            equipment=["oxygen", "first_aid_kit", "stretcher"],
            status="AVAILABLE",
            eta_minutes=4.0,
            last_gps_at=now,
            created_at=now
        ),
        Ambulance(
            id="amb-102",
            vehicle_number="A-102 (Advanced Life Support)",
            latitude=13.0305,
            longitude=80.2250,
            capability="ADVANCED",
            equipment=["ventilator", "defibrillator", "oxygen", "cardiac_monitor", "trauma_kit"],
            status="AVAILABLE",
            eta_minutes=6.0,
            last_gps_at=now,
            created_at=now
        ),
        Ambulance(
            id="amb-103",
            vehicle_number="A-103 (Mobile ICU Unit)",
            latitude=13.0080,
            longitude=80.2015,
            capability="ICU",
            equipment=["ventilator", "defibrillator", "advanced_cardiac_life_support", "infusion_pump", "oxygen"],
            status="AVAILABLE",
            eta_minutes=12.0,
            last_gps_at=now,
            created_at=now
        ),
        Ambulance(
            id="amb-104",
            vehicle_number="A-104 (Rapid First Response)",
            latitude=13.0610,
            longitude=80.2510,
            capability="BASIC",
            equipment=["oxygen", "aed", "splints"],
            status="BUSY",
            eta_minutes=8.0,
            last_gps_at=now,
            created_at=now
        ),
        Ambulance(
            id="amb-105",
            vehicle_number="A-105 (Paramedic ALS)",
            latitude=13.0210,
            longitude=80.2105,
            capability="ADVANCED",
            equipment=["ventilator", "defibrillator", "trauma_kit", "suction_unit"],
            status="AVAILABLE",
            eta_minutes=9.0,
            last_gps_at=now,
            created_at=now
        ),
        Ambulance(
            id="amb-106",
            vehicle_number="A-106 (Critical Care ICU)",
            latitude=13.0825,
            longitude=80.2690,
            capability="ICU",
            equipment=["ventilator", "defibrillator", "cardiac_monitor", "blood_warmer"],
            status="AVAILABLE",
            eta_minutes=15.0,
            last_gps_at=now,
            created_at=now
        )
    ]
    for a in ambulances:
        db.add(a)

    # 2. Seed Registered Drivers
    drivers = [
        Driver(
            id="drv-101",
            google_id="goog_driver_101",
            name="Murugan Sundaram (Lead Paramedic)",
            email="driver.a103@lifeline.org",
            phone="+91 98401 23456",
            role="DRIVER",
            assigned_ambulance_id="amb-103",
            status="AVAILABLE",
            latitude=13.0080,
            longitude=80.2015,
            last_active_at=now,
            created_at=now
        ),
        Driver(
            id="drv-102",
            google_id="goog_driver_102",
            name="Karthik Rajan (ALS Specialist)",
            email="driver.a102@lifeline.org",
            phone="+91 98402 34567",
            role="DRIVER",
            assigned_ambulance_id="amb-102",
            status="AVAILABLE",
            latitude=13.0305,
            longitude=80.2250,
            last_active_at=now,
            created_at=now
        ),
        Driver(
            id="drv-ops-01",
            google_id="goog_ops_01",
            name="Dr. Anita Raman (Dispatch Controller)",
            email="operations@lifeline.org",
            phone="+91 98400 11223",
            role="OPERATOR",
            assigned_ambulance_id=None,
            status="AVAILABLE",
            last_active_at=now,
            created_at=now
        )
    ]
    for d in drivers:
        db.add(d)

    # 3. Seed Hospitals (Simulated Demo Data with phone numbers for tel: calls)
    hospitals = [
        Hospital(
            id="hosp-001",
            place_id="ChIJ-yR_cTZVURIROkR91d-citytrauma",
            name="City Trauma Center & Multi-Speciality",
            latitude=13.0352,
            longitude=80.2155,
            address="142 Anna Salai, Guindy, Chennai, Tamil Nadu 600032",
            phone="+914422201234",
            emergency_available=True,
            trauma_capable=True,
            icu_available=True,
            available_beds=18,
            specialities=["Trauma Surgery", "Critical Care", "Cardiology", "Orthopedics"],
            status="OPEN",
            capacity_status="UNKNOWN",
            updated_at=now
        ),
        Hospital(
            id="hosp-002",
            place_id="ChIJ-apll_greams_med",
            name="Apollo Greams Medical Center",
            latitude=13.0588,
            longitude=80.2520,
            address="21 Greams Lane, Thousand Lights, Chennai, Tamil Nadu 600006",
            phone="+914428290200",
            emergency_available=True,
            trauma_capable=True,
            icu_available=True,
            available_beds=24,
            specialities=["Emergency Medicine", "Neurotrauma", "Cardiology"],
            status="OPEN",
            capacity_status="UNKNOWN",
            updated_at=now
        ),
        Hospital(
            id="hosp-003",
            place_id="ChIJ-rgggh_ghospital",
            name="Rajiv Gandhi Govt General Hospital",
            latitude=13.0805,
            longitude=80.2785,
            address="EVR Periyar Salai, Park Town, Chennai, Tamil Nadu 600003",
            phone="+914425305000",
            emergency_available=True,
            trauma_capable=True,
            icu_available=True,
            available_beds=42,
            specialities=["Level 1 Trauma", "Burn Unit", "Neurosurgery", "Toxicology"],
            status="OPEN",
            capacity_status="UNKNOWN",
            updated_at=now
        ),
        Hospital(
            id="hosp-004",
            place_id="ChIJ-adyar_comm",
            name="Adyar Community Health Hospital",
            latitude=13.0062,
            longitude=80.2560,
            address="Sardar Patel Road, Adyar, Chennai, Tamil Nadu 600020",
            phone="+914424911234",
            emergency_available=True,
            trauma_capable=False,
            icu_available=False,
            available_beds=8,
            specialities=["General Medicine", "Pediatrics", "Minor Injury Care"],
            status="OPEN",
            capacity_status="UNKNOWN",
            updated_at=now
        ),
        Hospital(
            id="hosp-005",
            place_id="ChIJ-velachery_metro",
            name="Velachery Metro Emergency Clinic",
            latitude=12.9785,
            longitude=80.2210,
            address="100 Feet Bypass Road, Velachery, Chennai, Tamil Nadu 600042",
            phone="+914422445566",
            emergency_available=True,
            trauma_capable=False,
            icu_available=True,
            available_beds=4,
            specialities=["Internal Medicine", "First Response Stabilization"],
            status="LIMITED",
            capacity_status="UNKNOWN",
            updated_at=now
        )
    ]
    for h in hospitals:
        db.add(h)

    # 4. Seed Road Incidents
    incidents = [
        RoadIncident(
            id="inc-001",
            type="ACCIDENT",
            latitude=13.0410,
            longitude=80.2360,
            severity="HIGH",
            description="Multi-vehicle collision near Anna Salai flyover lane",
            radius_meters=250,
            active=True,
            created_at=now
        ),
        RoadIncident(
            id="inc-002",
            type="CONSTRUCTION",
            latitude=13.0150,
            longitude=80.2225,
            severity="MEDIUM",
            description="Metro rail phase-2 utility excavation",
            radius_meters=200,
            active=True,
            created_at=now
        ),
        RoadIncident(
            id="inc-003",
            type="FLOOD",
            latitude=12.9850,
            longitude=80.2180,
            severity="CRITICAL",
            description="Severe seasonal waterlogging near Velachery lake bypass",
            radius_meters=400,
            active=True,
            created_at=now
        )
    ]
    for inc in incidents:
        db.add(inc)

    # 5. Seed Hero Demo Emergency with Session and Audit Event
    hero_emergency = Emergency(
        id="emg-hero-001",
        code="EMG-8F72A",
        title="Critical Multi-Vehicle Collision",
        description="Three people injured in a road accident near the railway bridge. One person is unconscious.",
        incident_type="ROAD_ACCIDENT",
        latitude=13.0380,
        longitude=80.2300,
        patient_count=3,
        critical_patient_count=1,
        severity="CRITICAL",
        status="SEARCHING",
        created_at=now - timedelta(minutes=5),
        updated_at=now
    )
    db.add(hero_emergency)
    db.flush()

    hero_session = EmergencySession(
        id="sess-hero-001",
        session_token="ll_sess_hero_demo_token_12345",
        session_code="EMG-8F72A",
        emergency_id=hero_emergency.id,
        created_at=now - timedelta(minutes=5),
        expires_at=now + timedelta(hours=2),
        is_active=True
    )
    db.add(hero_session)
    hero_emergency.session_id = hero_session.id

    db.add(
        EmergencyEvent(
            id="evt-hero-001",
            emergency_id=hero_emergency.id,
            event_type="CREATED",
            actor_type="PATIENT",
            description="Emergency case created (EMG-8F72A). Intake: ROAD_ACCIDENT (CRITICAL).",
            metadata_json={"session_code": "EMG-8F72A", "patient_count": 3, "severity": "CRITICAL"},
            latitude=hero_emergency.latitude,
            longitude=hero_emergency.longitude,
            created_at=now - timedelta(minutes=5)
        )
    )

    db.commit()
    logger.info("Demo data successfully seeded!")
