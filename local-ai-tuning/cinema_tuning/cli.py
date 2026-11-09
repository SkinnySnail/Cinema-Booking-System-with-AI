from __future__ import annotations

import argparse
import json
from pathlib import Path

from .common import ROOT, TASKS, new_directory, read_json, write_json
from .data import prepare
from .seed import seed
from .training import bundle, evaluate, tune

CONFIG = ROOT / "local-ai-tuning/configs/default.json"


def demo(output, config):
    root = new_directory(output)
    seed(root / "datasets")
    runs, summary = [], {}
    for task in TASKS:
        source = root / "datasets" / ("interactions.csv" if task == "recommendation" else task + ".csv")
        prepared, run = root / "prepared" / task, root / "runs" / task
        prepare(task, source, prepared, config["seed"],
                movies=root / "datasets/movies.json" if task == "recommendation" else None,
                cinema_id=1 if task == "forecast" else None)
        tune(prepared, run, config)
        summary[task] = evaluate(run, prepared)
        runs.append(run)
    manifest = bundle(runs, root / "bundle", allow_demo=True, allow_below_threshold=True)
    result = {"notice": "Demo only; never treat these metrics as real-user quality.",
              "bundle": str(root / "bundle"), "bundle_id": manifest["bundle_id"], "evaluations": summary}
    write_json(root / "summary.json", result)
    return result


def main(argv=None):
    parser = argparse.ArgumentParser(description="Local cinema ML tuning: prepare -> tune -> evaluate -> bundle")
    commands = parser.add_subparsers(dest="command", required=True)
    p = commands.add_parser("seed", help="Write explicitly labelled bootstrap/synthetic example data")
    p.add_argument("--out", required=True)
    p = commands.add_parser("prepare", help="Validate data, deduplicate and split without leakage")
    p.add_argument("--task", choices=TASKS, required=True)
    p.add_argument("--input", required=True)
    p.add_argument("--out", required=True)
    p.add_argument("--movies", help="Recommendation movie catalog JSON")
    p.add_argument("--cinema-id", type=int, help="Forecast scope (one cinema per run)")
    p.add_argument("--seed", type=int, default=7)
    p.add_argument("--provenance", choices=["real", "bootstrap", "synthetic"], default="real")
    p = commands.add_parser("tune", help="Select parameters on validation only; fit on train only")
    p.add_argument("--data", required=True)
    p.add_argument("--out", required=True)
    p.add_argument("--config", default=str(CONFIG))
    p = commands.add_parser("evaluate", help="One-time held-out test metrics and error analysis")
    p.add_argument("--run", required=True)
    p.add_argument("--data", required=True)
    p = commands.add_parser("bundle", help="Export evaluated models for ai-service; does not activate them")
    p.add_argument("--runs", nargs="+", required=True)
    p.add_argument("--out", required=True)
    p.add_argument("--allow-demo", action="store_true")
    p.add_argument("--allow-below-threshold", action="store_true")
    p = commands.add_parser("inspect", help="Read bundle manifest (does not deserialize models)")
    p.add_argument("directory")
    p = commands.add_parser("demo", help="Run all four tasks on clearly identified demo data")
    p.add_argument("--out", required=True)
    p.add_argument("--config", default=str(CONFIG))
    args = parser.parse_args(argv)
    try:
        if args.command == "seed":
            result = seed(args.out)
        elif args.command == "prepare":
            if args.task == "recommendation" and not args.movies:
                raise ValueError("Recommendation prepare requires --movies")
            result = prepare(args.task, args.input, args.out, args.seed, args.movies, args.cinema_id, args.provenance)
        elif args.command == "tune":
            result = tune(args.data, args.out, read_json(args.config))
        elif args.command == "evaluate":
            result = evaluate(args.run, args.data)
        elif args.command == "bundle":
            result = bundle(args.runs, args.out, args.allow_demo, args.allow_below_threshold)
        elif args.command == "inspect":
            result = read_json(Path(args.directory) / "manifest.json")
        else:
            result = demo(args.out, read_json(args.config))
        print(json.dumps(result, ensure_ascii=True, indent=2, allow_nan=False))
    except (ValueError, OSError, KeyError, TypeError) as error:
        parser.exit(2, f"Error: {error}\n")
