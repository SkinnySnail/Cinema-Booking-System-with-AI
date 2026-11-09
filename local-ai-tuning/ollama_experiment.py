"""Run a local research experiment on already downloaded public datasets."""
from __future__ import annotations

import argparse
from pathlib import Path

from cinema_tuning.cli import CONFIG
from cinema_tuning.common import read_json, write_json
from cinema_tuning.ollama_trial import MODEL, predict_text, train_text
from cinema_tuning.public_data import sentiment_data, intent_data


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("task", choices=("sentiment", "intent", "forecast", "recommendation"))
    parser.add_argument("--workspace", type=Path, required=True)
    parser.add_argument("--model", default=MODEL)
    parser.add_argument("--validation-only", action="store_true", help="Screen text candidates before using test data")
    parser.add_argument("--text", help="Run an existing sentiment or intent classifier on one sentence")
    args = parser.parse_args()
    root = args.workspace.resolve(strict=True)
    if args.task not in {"sentiment", "intent"} and (args.text is not None or args.validation_only):
        parser.error("--text and --validation-only apply only to sentiment and intent")
    run_name = args.task if args.model == MODEL else f"{args.task}-{args.model.rsplit('/', 1)[-1].replace(':', '-')}"
    run_folder = root / "runs" / run_name
    if args.text is not None:
        print(predict_text(args.text, run_folder))
        return
    raw, inputs = root / "raw", root / "inputs"
    inputs.mkdir(exist_ok=True)
    config = read_json(CONFIG)
    if args.task in {"sentiment", "intent"}:
        splits = sentiment_data(raw, inputs) if args.task == "sentiment" else intent_data(
            raw, inputs, Path(__file__).parent / "configs/cinema_intent_families.json",
        )
        write_json(inputs / f"{args.task}-splits.json", splits)
        result = train_text(args.task, splits, run_folder, config, args.model, args.validation_only)
        metric = "validation" if args.validation_only else "test"
        print(args.task, result["selected"], result["counts"],
              {name: round(value["validation_macro_f1"] if metric == "validation" else value["test"]["macro_f1"], 4)
               for name, value in result["methods"].items()}, flush=True)
    else:
        from cinema_tuning.public_tabular import run_forecast, run_recommendation
        if args.task == "forecast":
            run_forecast(raw, inputs, root / "runs", config)
        else:
            run_recommendation(raw, inputs, root / "runs", config, args.model)


if __name__ == "__main__":
    main()
