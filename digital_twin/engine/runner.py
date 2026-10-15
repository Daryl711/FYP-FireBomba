"""Command line runner for the FireBomba digital twin.

Examples
--------
    python -m engine.runner --list
    python -m engine.runner --scenario scenarios/kitchen-oil-boilover.json
    python -m engine.runner --scenario scenarios/kitchen-timber.json --compare
    python -m engine.runner --scenario scenarios/kitchen-timber.json \
        --compare --csv out/timber.csv
"""

import argparse
import csv
import json
import os
import sys

from .simulation import Scenario, Simulation, compare
from .fire import FIRE_CLASSES, NOZZLE_MODES, HORIZON_S


def _fmt(seconds):
    if seconds is None:
        return "--:--"
    m, s = divmod(int(seconds), 60)
    return f"{m:02d}:{s:02d}"


def load_scenario(path):
    with open(path, "r", encoding="utf-8") as fh:
        return Scenario.from_dict(json.load(fh))


def write_csv(path, series):
    os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
    with open(path, "w", newline="", encoding="utf-8") as fh:
        writer = csv.DictWriter(fh, fieldnames=list(series[0].keys()))
        writer.writeheader()
        writer.writerows(series)


def print_single(result):
    sc = result["scenario"]
    fire = FIRE_CLASSES[sc["fire_class"]]
    print(f"\n  Scenario     {sc['name']}")
    print(f"  Fire class   {fire.standard} - {fire.label}")
    print(f"  Nozzle       {NOZZLE_MODES[sc['nozzle']].label}")
    print(f"  System       {'enabled' if sc['system_enabled'] else 'DISABLED'}")
    print(f"\n  Detection    {_fmt(result['detection_s'])}")
    print(f"  Alert        {_fmt(result['alert_s'])}")
    print(f"  Pump active  {_fmt(result['pump_s'])}")
    f = result["final"]
    print(f"\n  Rooms involved  {f['involved']} / {f['total_cells']}")
    print(f"  Bilik lost      {f['bilik_lost']} / {f['total_bilik']}")
    print("\n  Events")
    for e in result["events"][:14]:
        print(f"    {_fmt(e['t'])}  [{e['level']:<8}] {e['message']}")
    if len(result["events"]) > 14:
        print(f"    ... {len(result['events']) - 14} more")
    print()


def print_compare(result):
    sc = result["scenario"]
    fire = FIRE_CLASSES[sc["fire_class"]]
    print(f"\n  Scenario     {sc['name']}")
    print(f"  Fire class   {fire.standard} - {fire.label}")
    print(f"  Nozzle       {NOZZLE_MODES[sc['nozzle']].label}")
    print(f"\n  {fire.note}\n")

    w, wo = result["with_system"], result["without_system"]
    print(f"  Detection    {_fmt(w['detection_s'])}")
    print(f"  Pump active  {_fmt(w['pump_s'])}")
    print()
    print("  Rooms   With system   No system     Time gained")
    print("  " + "-" * 52)
    for d in result["deltas"]:
        a, b, gained = d["with_system_s"], d["without_system_s"], d["time_gained_s"]
        a_s = "contained" if a is None else _fmt(a)
        b_s = "--:--" if b is None else _fmt(b)
        if gained is None:
            gs = "never reached" if (a is None and b is not None) else "--"
        elif gained >= 0:
            gs = f"+{_fmt(gained)}"
        else:
            gs = f"-{_fmt(abs(gained))}"
        print(f"  {d['rooms_involved']:>5}   {a_s:>11}   {b_s:>9}   {gs:>13}")
    print()
    print(f"  Final bilik lost   with system: {w['final']['bilik_lost']}"
          f"   without: {wo['final']['bilik_lost']}")
    print()


def main(argv=None):
    p = argparse.ArgumentParser(prog="engine.runner",
                                description="FireBomba digital twin runner")
    p.add_argument("--scenario", help="path to a scenario JSON file")
    p.add_argument("--compare", action="store_true",
                   help="run with and without the system and report the delta")
    p.add_argument("--horizon", type=float, default=HORIZON_S,
                   help="simulated seconds to run (default 600)")
    p.add_argument("--dt", type=float, default=0.5, help="time step in seconds")
    p.add_argument("--json", help="write the full result to this JSON path")
    p.add_argument("--csv", help="write the time series to this CSV path")
    p.add_argument("--list", action="store_true",
                   help="list fire classes and nozzle modes, then exit")
    args = p.parse_args(argv)

    if args.list:
        print("\n  Fire classes")
        for k, f in FIRE_CLASSES.items():
            print(f"    {k}  {f.standard:<14} water={f.water:+.2f}  {f.label}")
        print("\n  Nozzle modes")
        for k, n in NOZZLE_MODES.items():
            print(f"    {k:<10} source={n.on_source:.2f} "
                  f"neighbour={n.on_neighbour:.2f}")
        print()
        return 0

    if not args.scenario:
        p.error("--scenario is required (or use --list)")

    scenario = load_scenario(args.scenario)

    if args.compare:
        result = compare(scenario, horizon=args.horizon, dt=args.dt)
        print_compare(result)
        series = result["with_system"]["series"]
    else:
        result = Simulation(scenario).summary(horizon=args.horizon, dt=args.dt)
        print_single(result)
        series = result["series"]

    if args.json:
        os.makedirs(os.path.dirname(args.json) or ".", exist_ok=True)
        with open(args.json, "w", encoding="utf-8") as fh:
            json.dump(result, fh, indent=2)
        print(f"  Wrote {args.json}")
    if args.csv:
        write_csv(args.csv, series)
        print(f"  Wrote {args.csv}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
