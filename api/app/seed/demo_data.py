import logging
from sqlalchemy.orm import Session
from app.models import Emergency, Ambulance, Hospital, RoadIncident, Dispatch, RouteEvent

logger = logging.getLogger(__name__)

def seed_database(db: Session, force_reset: bool = False):
    """
    Populates deterministic demo data for Chennai emergency operational zone.
    """
    if force_reset:
        db.query(RouteEvent).delete()
        db.query(Dispatch).delete()
        db.query(Emergency).delete()
        db.query(Ambulance).delete()
        db.query(Hospital).delete()
        db.query(RoadIncident).delete()
        db.commit()

    if db.query(Hospital).count() > 0 and not force_reset:
        logger.info("Database already seeded with hospitals and ambulances.")
        return

    # 1. Seed Hospitals (Simulated Demo Data)
    hospitals = [
        Hospital(
            id="hosp-001",
            name="City Trauma Center & Multi-Speciality",
            latitude=13.0352,
            longitude=80.2155,
            emergency_available=True,
            trauma_capable=True,
            icu_available=True,
            available_beds=18,
            specialities=["Trauma Surgery", "Critical Care", "Cardiology", "Orthopedics"],
            status="OPEN"
        ),
        Hospital(
            id="hosp-002",
            name="Apollo Greams Medical Center",
            latitude=13.0588,
            longitude=80.2520,
            emergency_available=True,
            trauma_capable=True,
            icu_available=True,
            available_beds=24,
            specialities=["Emergency Medicine", "Neurotrauma", "Cardiology"],
            status="OPEN"
        ),
        Hospital(
            id="hosp-003",
            name="Rajiv Gandhi Govt General Hospital",
            latitude=13.0805,
            longitude=80.2785,
            emergency_available=True,
            trauma_capable=True,
            icu_available=True,
            available_beds=42,
            specialities=["Level 1 Trauma", "Burn Unit", "Neurosurgery", "Toxicology"],
            status="OPEN"
        ),
        Hospital(
            id="hosp-004",
            name="Adyar Community Health Hospital",
            latitude=13.0062,
            longitude=80.2560,
            emergency_available=True,
            trauma_capable=False,
            icu_available=False,
            available_beds=8,
            specialities=["General Medicine", "Pediatrics", "Minor Injury Care"],
            status="OPEN"
        ),
        Hospital(
            id="hosp-005",
            name="Velachery Metro Emergency Clinic",
            latitude=12.9785,
            longitude=80.2210,
            emergency_available=True,
            trauma_capable=False,
            icu_available=True,
            available_beds=4,
            specialities=["Internal Medicine", "First Response Stabilization"],
            status="LIMITED"
        )
    ]
    for h in hospitals:
        db.add(h)

    # 2. Seed Ambulances
    ambulances = [
        Ambulance(
            id="amb-101",
            vehicle_number="A-101 (Basic Transport)",
            latitude=13.0425,
            longitude=80.2410,
            capability="BASIC",
            equipment=["oxygen", "first_aid_kit", "stretcher"],
            status="AVAILABLE",
            eta_minutes=4.0
        ),
        Ambulance(
            id="amb-102",
            vehicle_number="A-102 (Advanced Life Support)",
            latitude=13.0305,
            longitude=80.2250,
            capability="ADVANCED",
            equipment=["ventilator", "defibrillator", "oxygen", "cardiac_monitor", "trauma_kit"],
            status="AVAILABLE",
            eta_minutes=6.0
        ),
        Ambulance(
            id="amb-103",
            vehicle_number="A-103 (Mobile ICU Unit)",
            latitude=13.0080,
            longitude=80.2015,
            capability="ICU",
            equipment=["ventilator", "defibrillator", "advanced_cardiac_life_support", "infusion_pump", "oxygen"],
            status="AVAILABLE",
            eta_minutes=12.0
        ),
        Ambulance(
            id="amb-104",
            vehicle_number="A-104 (Rapid First Response)",
            latitude=13.0610,
            longitude=80.2510,
            capability="BASIC",
            equipment=["oxygen", "aed", "splints"],
            status="BUSY",
            eta_minutes=8.0
        ),
        Ambulance(
            id="amb-105",
            vehicle_number="A-105 (Paramedic ALS)",
            latitude=13.0210,
            longitude=80.2105,
            capability="ADVANCED",
            equipment=["ventilator", "defibrillator", "trauma_kit", "suction_unit"],
            status="AVAILABLE",
            eta_minutes=9.0
        ),
        Ambulance(
            id="amb-106",
            vehicle_number="A-106 (Critical Care ICU)",
            latitude=13.0825,
            longitude=80.2690,
            capability="ICU",
            equipment=["ventilator", "defibrillator", "cardiac_monitor", "blood_warmer"],
            status="AVAILABLE",
            eta_minutes=15.0
        )
    ]
    for a in ambulances:
        db.add(a)

    # 3. Seed Road Incidents
    incidents = [
        RoadIncident(
            id="inc-001",
            type="ACCIDENT",
            latitude=13.0410,
            longitude=80.2360,
            severity="HIGH",
            description="Multi-vehicle collision near Anna Salai flyover lane",
            radius_meters=250,
            active=True
        ),
        RoadIncident(
            id="inc-002",
            type="CONSTRUCTION",
            latitude=13.0150,
            longitude=80.2225,
            severity="MEDIUM",
            description="Metro rail phase-2 utility excavation",
            radius_meters=200,
            active=True
        ),
        RoadIncident(
            id="inc-003",
            type="FLOOD",
            latitude=12.9850,
            longitude=80.2180,
            severity="CRITICAL",
            description="Severe seasonal waterlogging near Velachery lake bypass",
            radius_meters=400,
            active=True
        )
    ]
    for inc in incidents:
        db.add(inc)

    # 4. Seed Standard Hero Demo Emergency
    hero_emergency = Emergency(
        id="emg-hero-001",
        title="Critical Multi-Vehicle Collision",
        description="Three people injured in a road accident near the railway bridge. One person is unconscious.",
        incident_type="ROAD_ACCIDENT",
        latitude=13.0380,
        longitude=80.2300,
        patient_count=3,
        critical_patient_count=1,
        severity="CRITICAL",
        status="ACTIVE"
    )
    db.add(hero_emergency)

    db.commit()
    logger.info("Demo data successfully seeded!")
