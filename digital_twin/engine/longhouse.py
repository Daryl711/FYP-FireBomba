"""Spatial model of a Sarawak longhouse.

Six bilik (family units) along one elongated building. Each bilik is a
self-contained dwelling of three rooms: dapur at the back, then bilik tidur
and ruang.

The ruai and the tanju are COMMUNAL. They are not divided per family: the ruai
is one undivided covered corridor running the full length of the building, and
the tanju one open drying platform. They are segmented internally only so fire
can travel along them, and those segments carry a high edge weight because
there is no wall between them. That corridor is what turns a one-family fire
into a whole-longhouse fire.
"""

from .fire import AMBIENT_C

BILIK_W = 6.0
BILIK_D = 11.0
RUAI_D = 5.0
TANJU_D = 4.0

# room templates inside one bilik, local metres
BILIK_ROOMS = [
    # key      label          x    y    w    h    fuel  couple
    ("dapur", "Dapur", 0.0, 0.0, 6.0, 4.0, 1.00, 1.00),
    ("tidur", "Bilik Tidur", 0.0, 4.0, 3.2, 7.0, 0.88, 0.90),
    ("ruang", "Ruang", 3.2, 4.0, 2.8, 7.0, 0.92, 0.95),
]

RUAI_FUEL, RUAI_COUPLE = 0.72, 1.35
TANJU_FUEL, TANJU_COUPLE = 0.30, 0.55

# edge weights: an open space conducts far better than a wall
EDGE_WALL = 1.00
EDGE_DOOR = 1.25
EDGE_OPEN = 2.40
EDGE_EAVES = 0.70

STATE_SAFE = "safe"
STATE_BURNING = "burning"
STATE_BURNT = "burnt"
STATE_SUPPRESSED = "suppressed"


class Cell:
    __slots__ = (
        "id", "place", "kind", "label", "name", "bilik",
        "x", "y", "w", "h", "fuel_max", "fuel", "coupling", "has_sensors",
        "temp", "smoke", "co", "humidity", "state", "suppression",
        "ignited_at", "neighbours",
    )

    def __init__(self, cid, place, kind, label, name, bilik,
                 x, y, w, h, fuel, coupling, has_sensors):
        self.id, self.place, self.kind = cid, place, kind
        self.label, self.name, self.bilik = label, name, bilik
        self.x, self.y, self.w, self.h = x, y, w, h
        self.fuel_max = fuel
        self.fuel = fuel
        self.coupling = coupling
        self.has_sensors = has_sensors
        self.temp = AMBIENT_C
        self.smoke = 0.0
        self.co = 0.0
        self.humidity = 72.0
        self.state = STATE_SAFE
        self.suppression = 0.0
        self.ignited_at = None
        self.neighbours = []          # list of (cell, edge_weight)

    @property
    def area(self):
        return self.w * self.h

    @property
    def flame_detected(self):
        return self.state == STATE_BURNING

    def as_dict(self):
        return {
            "id": self.id, "name": self.name, "place": self.place,
            "kind": self.kind, "bilik": self.bilik, "state": self.state,
            "temp": round(self.temp, 1), "smoke": round(self.smoke, 1),
            "co": round(self.co, 1), "humidity": round(self.humidity, 1),
            "fuel": round(self.fuel, 3), "area": round(self.area, 1),
        }


class Place:
    """What a user selects and the 2D plan draws."""

    def __init__(self, pid, kind, label, short, x, y, w, h, sub=""):
        self.id, self.kind = pid, kind
        self.label, self.short, self.sub = label, short, sub
        self.x, self.y, self.w, self.h = x, y, w, h

    @property
    def communal(self):
        return self.kind in ("ruai", "tanju")


class Longhouse:
    def __init__(self, bilik_count=6):
        self.bilik_count = bilik_count
        self.width_m = bilik_count * BILIK_W
        self.ruai_y = BILIK_D
        self.tanju_y = BILIK_D + RUAI_D
        self.depth_m = BILIK_D + RUAI_D + TANJU_D

        self.cells = []
        self.places = []
        self._build_places()
        self._build_cells()
        self._link()

    # ------------------------------------------------------------ places
    def _build_places(self):
        for k in range(self.bilik_count):
            self.places.append(Place(
                f"bilik-{k}", "bilik", f"Bilik {k + 1}", f"B{k + 1}",
                k * BILIK_W, 0.0, BILIK_W, BILIK_D,
                "Family unit: dapur, bilik tidur, ruang",
            ))
        self.places.append(Place(
            "ruai", "ruai", "Ruai", "Ruai",
            0.0, self.ruai_y, self.width_m, RUAI_D,
            "Shared covered corridor",
        ))
        self.places.append(Place(
            "tanju", "tanju", "Tanju", "Tanju",
            0.0, self.tanju_y, self.width_m, TANJU_D,
            "Open drying platform",
        ))

    # ------------------------------------------------------------- cells
    def _build_cells(self):
        for k in range(self.bilik_count):
            for key, label, x, y, w, h, fuel, couple in BILIK_ROOMS:
                self.cells.append(Cell(
                    f"b{k}-{key}", f"bilik-{k}", key, label,
                    f"B{k + 1} · {label}", k,
                    k * BILIK_W + x, y, w, h, fuel, couple, True,
                ))
        for k in range(self.bilik_count):
            self.cells.append(Cell(
                f"ruai-{k}", "ruai", "ruai", "Ruai",
                f"Ruai · bay {k + 1}", k,
                k * BILIK_W, self.ruai_y, BILIK_W, RUAI_D,
                RUAI_FUEL, RUAI_COUPLE, True,
            ))
        for k in range(self.bilik_count):
            self.cells.append(Cell(
                f"tanju-{k}", "tanju", "tanju", "Tanju",
                f"Tanju · bay {k + 1}", k,
                k * BILIK_W, self.tanju_y, BILIK_W, TANJU_D,
                TANJU_FUEL, TANJU_COUPLE, True,
            ))

    def _link(self):
        idx = {c.id: c for c in self.cells}

        def link(a, b, weight):
            ca, cb = idx.get(a), idx.get(b)
            if ca is None or cb is None:
                return
            ca.neighbours.append((cb, weight))
            cb.neighbours.append((ca, weight))

        n = self.bilik_count
        for k in range(n):
            # inside one bilik
            link(f"b{k}-dapur", f"b{k}-tidur", EDGE_WALL)
            link(f"b{k}-dapur", f"b{k}-ruang", EDGE_DOOR)
            link(f"b{k}-tidur", f"b{k}-ruang", EDGE_DOOR)
            # bilik out to the communal corridor
            link(f"b{k}-ruang", f"ruai-{k}", EDGE_DOOR)
            link(f"b{k}-tidur", f"ruai-{k}", EDGE_WALL)
            # party walls to the next bilik along
            if k + 1 < n:
                link(f"b{k}-dapur", f"b{k + 1}-dapur", EDGE_WALL)
                link(f"b{k}-ruang", f"b{k + 1}-tidur", EDGE_WALL)
                # the ruai and tanju are undivided
                link(f"ruai-{k}", f"ruai-{k + 1}", EDGE_OPEN)
                link(f"tanju-{k}", f"tanju-{k + 1}", EDGE_OPEN)
            link(f"ruai-{k}", f"tanju-{k}", EDGE_EAVES)

    # ------------------------------------------------------------ lookup
    def by_id(self, cell_id):
        for c in self.cells:
            if c.id == cell_id:
                return c
        raise KeyError(f"No such cell: {cell_id}")

    def place_by_id(self, place_id):
        for p in self.places:
            if p.id == place_id:
                return p
        raise KeyError(f"No such place: {place_id}")

    def cells_of_place(self, place_id):
        return [c for c in self.cells if c.place == place_id]

    @property
    def sensor_cells(self):
        return [c for c in self.cells if c.has_sensors]
