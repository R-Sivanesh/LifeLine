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

def seed_demo_accounts_only(db: Session, now: datetime):
    """Adds demo drivers, demo ambulances, and demo hospital if missing."""
    demo_ambs = [
        Ambulance(
            id="amb-demo-001",
            vehicle_number="LL-DEMO-AMB-001",
            latitude=13.0425,
            longitude=80.2410,
            capability="ADVANCED",
            equipment=["ventilator", "defibrillator", "oxygen", "cardiac_monitor", "trauma_kit"],
            status="AVAILABLE",
            eta_minutes=5.0,
            is_demo=True,
            demo_type="DEMO_FLEET_A",
            last_gps_at=now,
            created_at=now
        ),
        Ambulance(
            id="amb-demo-002",
            vehicle_number="LL-DEMO-AMB-002",
            latitude=13.0305,
            longitude=80.2250,
            capability="BASIC",
            equipment=["oxygen", "first_aid_kit", "stretcher", "splints"],
            status="AVAILABLE",
            eta_minutes=7.0,
            is_demo=True,
            demo_type="DEMO_FLEET_B",
            last_gps_at=now,
            created_at=now
        )
    ]
    for a in demo_ambs:
        if not db.query(Ambulance).filter(Ambulance.id == a.id).first():
            db.add(a)

    demo_drivers = [
        Driver(
            id="drv-demo-001",
            google_id="demo_goog_driver_a",
            name="Demo Driver A",
            email="demo.driver.a@lifeline.org",
            phone="+91 98401 00001",
            phone_verified=True,
            otp_verified_at=now,
            role="DRIVER",
            assigned_ambulance_id="amb-demo-001",
            status="AVAILABLE",
            latitude=13.0425,
            longitude=80.2410,
            is_demo=True,
            demo_type="DEMO_DRIVER_A",
            last_active_at=now,
            created_at=now
        ),
        Driver(
            id="drv-demo-002",
            google_id="demo_goog_driver_b",
            name="Demo Driver B",
            email="demo.driver.b@lifeline.org",
            phone="+91 98401 00002",
            phone_verified=True,
            otp_verified_at=now,
            role="DRIVER",
            assigned_ambulance_id="amb-demo-002",
            status="AVAILABLE",
            latitude=13.0305,
            longitude=80.2250,
            is_demo=True,
            demo_type="DEMO_DRIVER_B",
            last_active_at=now,
            created_at=now
        ),
        Driver(
            id="staff-demo-001",
            google_id="demo_goog_hospital_staff",
            name="Demo ER Staff",
            email="demo.hospital@lifeline.org",
            phone="+91 98402 00001",
            phone_verified=True,
            otp_verified_at=now,
            role="HOSPITAL_STAFF",
            assigned_ambulance_id=None,
            status="AVAILABLE",
            is_demo=True,
            demo_type="DEMO_STAFF",
            last_active_at=now,
            created_at=now
        )
    ]
    for d in demo_drivers:
        if not db.query(Driver).filter(Driver.id == d.id).first():
            db.add(d)

    demo_hosp = Hospital(
        id="hosp-demo-001",
        place_id="demo_place_lifeline_hospital",
        name="LifeLine Demo Hospital",
        latitude=13.0100,
        longitude=80.2120,
        address="Demo ER Ward, Grand Southern Trunk Rd, Chennai, Tamil Nadu 600044",
        phone="+914422201000",
        emergency_available=True,
        trauma_capable=True,
        icu_available=True,
        available_beds=12,
        specialities=["Level 1 Trauma", "Emergency Medicine", "Cardiac Care"],
        status="OPEN",
        capacity_status="DEMO",
        is_demo=True,
        demo_type="DEMO_HOSPITAL",
        updated_at=now
    )
    if not db.query(Hospital).filter(Hospital.id == demo_hosp.id).first():
        db.add(demo_hosp)

    db.commit()

def seed_database(db: Session, force_reset: bool = False, reset_only_demo: bool = False):
    """
    Populates registered ambulances, authenticated drivers, facilities, and demo baseline data.
    If reset_only_demo is True, only resets demo records (is_demo=True) while preserving real data.
    """
    now = datetime.now(timezone.utc)

    if reset_only_demo:
        # Safely reset ONLY demo data
        demo_emg_ids = [e.id for e in db.query(Emergency.id).filter(Emergency.is_demo == True).all()]
        if demo_emg_ids:
            db.query(EmergencySession).filter(EmergencySession.emergency_id.in_(demo_emg_ids)).delete(synchronize_session=False)
            db.query(Dispatch).filter(Dispatch.emergency_id.in_(demo_emg_ids)).delete(synchronize_session=False)
            db.query(RouteEvent).filter(RouteEvent.emergency_id.in_(demo_emg_ids)).delete(synchronize_session=False)
            db.query(DriverAlert).filter(DriverAlert.emergency_id.in_(demo_emg_ids)).delete(synchronize_session=False)
            db.query(EmergencyEvent).filter(EmergencyEvent.emergency_id.in_(demo_emg_ids)).delete(synchronize_session=False)

        db.query(EmergencyEvent).filter(EmergencyEvent.is_demo == True).delete(synchronize_session=False)
        db.query(DriverAlert).filter(DriverAlert.is_demo == True).delete(synchronize_session=False)
        db.query(Dispatch).filter(Dispatch.is_demo == True).delete(synchronize_session=False)
        db.query(Emergency).filter(Emergency.is_demo == True).delete(synchronize_session=False)
        db.query(Driver).filter(Driver.is_demo == True).delete(synchronize_session=False)
        db.query(Ambulance).filter(Ambulance.is_demo == True).delete(synchronize_session=False)
        db.query(Hospital).filter(Hospital.is_demo == True).delete(synchronize_session=False)
        db.query(RoadIncident).filter(RoadIncident.is_demo == True).delete(synchronize_session=False)
        db.commit()

    elif force_reset:
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

    if not force_reset and not reset_only_demo and db.query(Hospital).count() > 0:
        # Check if demo accounts exist, if not seed them
        if db.query(Driver).filter(Driver.is_demo == True).count() == 0:
            seed_demo_accounts_only(db, now)
        return

    # 1. Seed Registered Real Ambulances Fleet (is_demo=False)
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
            is_demo=False,
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
            is_demo=False,
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
            is_demo=False,
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
            is_demo=False,
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
            is_demo=False,
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
            is_demo=False,
            last_gps_at=now,
            created_at=now
        ),
        # ── DEMO FLEET RECORDS ──
        Ambulance(
            id="amb-demo-001",
            vehicle_number="LL-DEMO-AMB-001",
            latitude=13.0425,
            longitude=80.2410,
            capability="ADVANCED",
            equipment=["ventilator", "defibrillator", "oxygen", "cardiac_monitor", "trauma_kit"],
            status="AVAILABLE",
            eta_minutes=5.0,
            is_demo=True,
            demo_type="DEMO_FLEET_A",
            last_gps_at=now,
            created_at=now
        ),
        Ambulance(
            id="amb-demo-002",
            vehicle_number="LL-DEMO-AMB-002",
            latitude=13.0305,
            longitude=80.2250,
            capability="BASIC",
            equipment=["oxygen", "first_aid_kit", "stretcher", "splints"],
            status="AVAILABLE",
            eta_minutes=7.0,
            is_demo=True,
            demo_type="DEMO_FLEET_B",
            last_gps_at=now,
            created_at=now
        )
    ]
    for a in ambulances:
        db.merge(a)

    # 2. Seed Registered Drivers (Real & Demo)
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
            is_demo=False,
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
            is_demo=False,
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
            is_demo=False,
            last_active_at=now,
            created_at=now
        ),
        # ── DEMO DRIVER ACCOUNTS ──
        Driver(
            id="drv-demo-001",
            google_id="demo_goog_driver_a",
            name="Demo Driver A",
            email="demo.driver.a@lifeline.org",
            phone="+91 98401 00001",
            phone_verified=True,
            otp_verified_at=now,
            role="DRIVER",
            assigned_ambulance_id="amb-demo-001",
            status="AVAILABLE",
            latitude=13.0425,
            longitude=80.2410,
            is_demo=True,
            demo_type="DEMO_DRIVER_A",
            last_active_at=now,
            created_at=now
        ),
        Driver(
            id="drv-demo-002",
            google_id="demo_goog_driver_b",
            name="Demo Driver B",
            email="demo.driver.b@lifeline.org",
            phone="+91 98401 00002",
            phone_verified=True,
            otp_verified_at=now,
            role="DRIVER",
            assigned_ambulance_id="amb-demo-002",
            status="AVAILABLE",
            latitude=13.0305,
            longitude=80.2250,
            is_demo=True,
            demo_type="DEMO_DRIVER_B",
            last_active_at=now,
            created_at=now
        ),
        Driver(
            id="staff-demo-001",
            google_id="demo_goog_hospital_staff",
            name="Demo ER Staff",
            email="demo.hospital@lifeline.org",
            phone="+91 98402 00001",
            phone_verified=True,
            otp_verified_at=now,
            role="HOSPITAL_STAFF",
            assigned_ambulance_id=None,
            status="AVAILABLE",
            is_demo=True,
            demo_type="DEMO_STAFF",
            last_active_at=now,
            created_at=now
        )
    ]
    for d in drivers:
        db.merge(d)

    # 3. Seed Hospitals (Real Facilities + Demo Hospital)
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
            is_demo=False,
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
            is_demo=False,
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
            is_demo=False,
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
            is_demo=False,
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
            is_demo=False,
            updated_at=now
        ),
        # ── DEMO HOSPITAL RECORD ──
        Hospital(
            id="hosp-demo-001",
            place_id="demo_place_lifeline_hospital",
            name="LifeLine Demo Hospital",
            latitude=13.0100,
            longitude=80.2120,
            address="Demo ER Ward, Grand Southern Trunk Rd, Chennai, Tamil Nadu 600044",
            phone="+914422201000",
            emergency_available=True,
            trauma_capable=True,
            icu_available=True,
            available_beds=12,
            specialities=["Level 1 Trauma", "Emergency Medicine", "Cardiac Care"],
            status="OPEN",
            capacity_status="DEMO",
            is_demo=True,
            demo_type="DEMO_HOSPITAL",
            updated_at=now
        )
    ]
    for h in hospitals:
        db.merge(h)

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
            is_demo=False,
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
            is_demo=False,
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
            is_demo=False,
            created_at=now
        )
    ]
    for inc in incidents:
        db.merge(inc)

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
        is_demo=True,
        demo_type="HERO_DEMO",
        created_at=now - timedelta(minutes=5),
        updated_at=now
    )
    db.merge(hero_emergency)
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
    db.merge(hero_session)
    hero_emergency.session_id = hero_session.id

    db.merge(
        EmergencyEvent(
            id="evt-hero-001",
            emergency_id=hero_emergency.id,
            event_type="CREATED",
            actor_type="PATIENT",
            description="Emergency case created (EMG-8F72A). Intake: ROAD_ACCIDENT (CRITICAL).",
            metadata_json={"session_code": "EMG-8F72A", "patient_count": 3, "severity": "CRITICAL"},
            latitude=hero_emergency.latitude,
            longitude=hero_emergency.longitude,
            is_demo=True,
            created_at=now - timedelta(minutes=5)
        )
    )

    db.commit()
    logger.info("Demo data successfully seeded!")
