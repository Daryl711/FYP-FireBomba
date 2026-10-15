"""Fire spread, detection and suppression simulation.

This is a parameterised zone model, not a CFD solve. It is intended for
comparative work -- system on versus off, one fire class versus another --
rather than absolute prediction. Calibrate the rise rates against a real
controlled burn before quoting any figure as measured.
"""

import random

from .fire import (
    AMBIENT_C, IGNITE_C, SMOKE_THRESHOLD, TEMP_THRESHOLD,
    ALERT_LAG_S, PUMP_LAG_S, HORIZON_S,
    FIRE_CLASSES, NOZZLE_MODES, WIND_LEVELS,
)
from .longhouse import (
    Longhouse, STATE_SAFE, STATE_BURNING, STATE_BURNT, STATE_SUPPRESSED,
)


class Scenario:
    """A reproducible simulation configuration."""

    def __init__(self, ignition="b2-dapur", fire_class="A", nozzle="direct",
                 wind=1, system_enabled=True, bilik_count=6, seed=1337,
                 name="unnamed"):
        self.name = name
        self.ignition = ignition
        self.fire_class = fire_class
        self.nozzle = nozzle
        self.wind = wind
        self.system_enabled = system_enabled
        self.bilik_count = bilik_count
        self.seed = seed

    @classmethod
    def from_dict(cls, d):
        return cls(
            name=d.get("name", "unnamed"),
            ignition=d.get("ignition", "b2-dapur"),
            fire_class=d.get("fire_class", "A"),
            nozzle=d.get("nozzle", "direct"),
            wind=d.get("wind", 1),
            system_enabled=d.get("system_enabled", True),
            bilik_count=d.get("bilik_count", 6),
            seed=d.get("seed", 1337),
        )

    def as_dict(self):
        return {
            "name": self.name,
            "ignition": self.ignition,
            "fire_class": self.fire_class,
            "nozzle": self.nozzle,
            "wind": self.wind,
            "system_enabled": self.system_enabled,
            "bilik_count": self.bilik_count,
            "seed": self.seed,
        }


class Simulation:
    def __init__(self, scenario):
        self.scenario = scenario
        self.house = Longhouse(scenario.bilik_count)
        self.fire = FIRE_CLASSES[scenario.fire_class]
        self.nozzle = NOZZLE_MODES[scenario.nozzle]
        self.wind = WIND_LEVELS[scenario.wind]
        self.rng = random.Random(scenario.seed)

        self.t = 0.0
        self.detect_t = None
        self.alert_t = None
        self.pump_t = None
        self.pump_on = False
        self._boilover_done = False
        self._shock_logged = False
        self.events = []

        if scenario.ignition in ("ruai", "tanju"):
            # a communal area is one space: the whole of it catches at once
            area = self.house.cells_of_place(scenario.ignition)
            for c in area:
                self._ignite(c, first=True, quiet=True)
            self._log("critical", f"Ignition - {area[0].label} (whole area)")
        else:
            self._ignite(self.house.by_id(scenario.ignition), first=True)

    # ---------------------------------------------------------------- events
    def _log(self, level, message):
        self.events.append({"t": round(self.t, 1), "level": level,
                            "message": message})

    def _ignite(self, cell, first=False, quiet=False):
        if cell.state != STATE_SAFE or cell.fuel <= 0:
            return
        cell.state = STATE_BURNING
        cell.ignited_at = self.t
        cell.temp = max(cell.temp, 320.0)
        if quiet:
            return
        verb = "Ignition" if first else "Fire spread to"
        self._log("critical", f"{verb} {cell.name}")

    # ------------------------------------------------------------ suppression
    def _apply_suppression(self):
        for c in self.house.cells:
            c.suppression = 0.0
        if not self.pump_on:
            return

        burning = [c for c in self.house.cells if c.state == STATE_BURNING]
        if not burning:
            return
        target = max(burning, key=lambda c: c.temp)

        target.suppression = self.fire.water * self.nozzle.on_source
        for n, _w in target.neighbours:
            n.suppression = self.fire.water * self.nozzle.on_neighbour

        if self.fire.water < 0 and not self._boilover_done:
            self._boilover_done = True
            self._log("critical",
                      "BOILOVER - water on burning oil ejected fuel and "
                      "spread the fire")
            for n, _w in target.neighbours:
                if self.rng.random() < 0.75:
                    self._ignite(n)

        if self.fire.key == "C" and not self._shock_logged:
            self._shock_logged = True
            self._log("critical",
                      "HAZARD - water onto a live electrical fire: conduction "
                      "and shock risk")

    # ------------------------------------------------------------------ step
    def step(self, dt=0.5):
        self._apply_suppression()
        cells = self.house.cells
        gains = [0.0] * len(cells)
        index = {id(c): i for i, c in enumerate(cells)}

        for c in cells:
            if c.state != STATE_BURNING:
                continue
            # burning oil thrown outward by the water jet
            boost = 1.9 if (self.fire.water < 0 and c.suppression < 0) else 1.0
            for n, edge in c.neighbours:
                if n.state != STATE_SAFE:
                    continue
                k = (c.coupling * n.coupling * edge
                     * 0.0075 * self.wind["mult"] * boost)
                if self.wind["lengthwise"] and n.x > c.x:
                    k *= 1.45
                shield = max(0.0, n.suppression) * 0.85
                gains[index[id(n)]] += (c.temp - n.temp) * k * (1 - shield) * dt

        for i, c in enumerate(cells):
            c.temp += gains[i]
            c.temp += (AMBIENT_C - c.temp) * 0.0065 * dt

            if c.state == STATE_BURNING:
                sup = c.suppression
                burn_mult = (1 - sup * 0.92) if sup > 0 else (1 + abs(sup) * 1.3)
                peak = self.fire.peak_c * (0.55 + c.fuel_max * 0.45)
                c.temp += (peak - c.temp) * 0.085 * self.fire.growth * burn_mult * dt
                if sup > 0:
                    c.temp -= sup * 42 * dt
                c.fuel -= 0.0115 * self.fire.growth * burn_mult * dt
                c.smoke = min(100.0, c.smoke + (
                    7.5 * self.fire.growth * burn_mult - (sup * 5 if sup > 0 else 0)
                ) * dt)
                c.co = min(300.0, c.co + 5.2 * self.fire.growth * burn_mult * dt)
                c.humidity = max(12.0, c.humidity - 1.4 * dt)

                if c.fuel <= 0:
                    c.state = STATE_BURNT
                    c.fuel = 0.0
                    self._log("warning", f"{c.name} burnt out")
                elif sup > 0.5 and c.temp < IGNITE_C * 0.72:
                    c.state = STATE_SUPPRESSED
                    c.smoke *= 0.6
                    self._log("ok", f"Knocked down - {c.name}")
            else:
                bleed = sum((n.smoke - c.smoke) * 0.055
                            for n, _w in c.neighbours if n.smoke > c.smoke)
                c.smoke = min(100.0, max(0.0, c.smoke + bleed * dt - 1.1 * dt))
                c.co = max(0.0, c.co - 1.6 * dt)
                if c.state == STATE_SAFE and c.temp > IGNITE_C and c.fuel > 0:
                    self._ignite(c)

            if c.temp < AMBIENT_C:
                c.temp = AMBIENT_C

        if self.scenario.system_enabled:
            self._run_detection()

        self.t += dt

    def _run_detection(self):
        if self.detect_t is None:
            for c in self.house.sensor_cells:
                if (c.state == STATE_BURNING
                        or c.smoke > SMOKE_THRESHOLD
                        or c.temp > TEMP_THRESHOLD):
                    self.detect_t = self.t
                    self._log("warning",
                              f"Sensors tripped in "
                              f"{c.label if c.kind in ('ruai', 'tanju') else c.name} - "
                              f"smoke {c.smoke:.0f}%, {c.temp:.0f}C")
                    break

        if (self.detect_t is not None and self.alert_t is None
                and self.t >= self.detect_t + ALERT_LAG_S):
            self.alert_t = self.t
            self._log("info", "Alert pushed to residents and the tuai rumah")

        if (self.alert_t is not None and not self.pump_on
                and self.t >= self.alert_t + PUMP_LAG_S):
            self.pump_on = True
            self.pump_t = self.t
            self._log("info",
                      f"Water pump engaged - {self.nozzle.label.lower()}")

    # ----------------------------------------------------------------- stats
    def stats(self):
        involved = burnt = burning = suppressed = 0
        bilik_hit = set()
        for c in self.house.cells:
            if c.state != STATE_SAFE:
                involved += 1
                if c.state == STATE_BURNT:
                    burnt += 1
                elif c.state == STATE_BURNING:
                    burning += 1
                elif c.state == STATE_SUPPRESSED:
                    suppressed += 1
            if c.place.startswith("bilik-") and c.state != STATE_SAFE:
                bilik_hit.add(c.bilik)
        return {
            "t": round(self.t, 1),
            "involved": involved,
            "burning": burning,
            "burnt": burnt,
            "suppressed": suppressed,
            "bilik_lost": len(bilik_hit),
            "total_cells": len(self.house.cells),
            "total_bilik": self.house.bilik_count,
        }

    def run(self, horizon=HORIZON_S, dt=0.5, sample_every=5.0):
        """Run to the horizon, returning a sampled time series."""
        series = []
        next_sample = 0.0
        while self.t <= horizon:
            if self.t >= next_sample:
                series.append(self.stats())
                next_sample += sample_every
            self.step(dt)
        return series

    def summary(self, horizon=HORIZON_S, dt=0.5):
        series = self.run(horizon=horizon, dt=dt)
        final = self.stats()
        return {
            "scenario": self.scenario.as_dict(),
            "detection_s": self.detect_t,
            "alert_s": self.alert_t,
            "pump_s": self.pump_t,
            "final": final,
            "series": series,
            "events": self.events,
        }


def compare(scenario, horizon=HORIZON_S, dt=0.5):
    """Run the scenario with and without the system and report the delta.

    This is the experiment Dr Sheena asked for: how much extra time does
    FireBomba buy before the fire reaches a given level of involvement?
    """
    on_cfg = Scenario.from_dict({**scenario.as_dict(), "system_enabled": True})
    off_cfg = Scenario.from_dict({**scenario.as_dict(), "system_enabled": False})

    with_system = Simulation(on_cfg).summary(horizon, dt)
    without = Simulation(off_cfg).summary(horizon, dt)

    def time_to(series, n):
        for row in series:
            if row["involved"] >= n:
                return row["t"]
        return None

    deltas = []
    for n in (2, 4, 8, 12, 18, 24):
        a = time_to(with_system["series"], n)
        b = time_to(without["series"], n)
        deltas.append({
            "rooms_involved": n,
            "with_system_s": a,
            "without_system_s": b,
            "time_gained_s": (round(a - b, 1)
                              if a is not None and b is not None else None),
        })

    return {
        "scenario": scenario.as_dict(),
        "with_system": with_system,
        "without_system": without,
        "deltas": deltas,
    }
