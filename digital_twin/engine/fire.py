"""Fire behaviour constants for the FireBomba digital twin.

Growth rates follow the standard t-squared fire growth categories used in
NFPA 72 / ISO 834. Water effectiveness per class reflects the feedback the
team received at the Western Digital Elevate 2026 showcase: water is the
correct agent only for Class A, and is actively harmful on cooking oil
(boilover) and electrical fires (conduction).
"""

AMBIENT_C = 28.0        # ambient temperature, degrees C
IGNITE_C = 250.0        # timber piloted ignition threshold, degrees C
SMOKE_THRESHOLD = 38.0  # % obscuration that trips a sensor
TEMP_THRESHOLD = 57.0   # degrees C that trips a sensor
ALERT_LAG_S = 2.0       # detection -> push notification
PUMP_LAG_S = 9.0        # notification -> resident confirms pump
HORIZON_S = 600.0       # default simulation horizon


class FireClass:
    def __init__(self, key, label, standard, growth, peak_c, water, note):
        self.key = key
        self.label = label
        self.standard = standard
        self.growth = growth        # multiplier on t-squared growth
        self.peak_c = peak_c        # fully developed temperature
        self.water = water          # suppression coefficient, negative = harmful
        self.note = note


FIRE_CLASSES = {
    "A": FireClass(
        "A", "Timber / ordinary combustible", "Class A",
        growth=1.00, peak_c=780, water=0.85,
        note="Water is the correct agent. Cooling and soaking the fuel works.",
    ),
    "K": FireClass(
        "K", "Cooking oil", "Class K / F",
        growth=1.55, peak_c=950, water=-0.65,
        note="Water sinks under burning oil and flashes to steam, ejecting the "
             "oil. The pump makes this fire worse.",
    ),
    "C": FireClass(
        "C", "Electrical", "Class C / E",
        growth=0.80, peak_c=700, water=0.05,
        note="Water conducts. Negligible suppression and a live shock hazard.",
    ),
}


class NozzleMode:
    def __init__(self, key, label, on_source, on_neighbour, note):
        self.key = key
        self.label = label
        self.on_source = on_source
        self.on_neighbour = on_neighbour
        self.note = note


NOZZLE_MODES = {
    "direct": NozzleMode(
        "direct", "Direct spray", 1.00, 0.15,
        "All water on the seat of the fire. Fastest knockdown when the agent "
        "suits the fire class.",
    ),
    "perimeter": NozzleMode(
        "perimeter", "Perimeter containment", 0.45, 0.80,
        "Client guidance: wet the sides to stop spread rather than attacking "
        "the seat. Slower knockdown, better containment.",
    ),
}


WIND_LEVELS = {
    0: {"label": "Still air", "mult": 0.75, "lengthwise": False},
    1: {"label": "Breeze", "mult": 1.00, "lengthwise": True},
    2: {"label": "Strong wind", "mult": 1.45, "lengthwise": True},
}
