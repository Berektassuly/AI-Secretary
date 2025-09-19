"""Utility script that evaluates the task extractor on a small curated set."""

from __future__ import annotations

import json
import os
import re
import sys
from pathlib import Path
from statistics import mean
from typing import Iterable

ROOT_DIR = Path(__file__).resolve().parents[1]
if str(ROOT_DIR) not in sys.path:
    sys.path.append(str(ROOT_DIR))

from app.logic import TaskExtractor

DATASET_PATH = Path(__file__).with_name("dataset.json")


def normalise(text: str) -> str:
    cleaned = re.sub(r"[^a-z0-9а-яё]+", " ", text.lower())
    return re.sub(r"\s+", " ", cleaned).strip()


def f1(precision: float, recall: float) -> float:
    if precision == 0 or recall == 0:
        return 0.0
    return 2 * precision * recall / (precision + recall)


def evaluate_sample(extractor: TaskExtractor, transcript: str, expected: list[dict[str, object]]) -> dict[str, float]:
    predicted = extractor.extract_tasks(transcript)
    predicted_map = {normalise(item.summary): item for item in predicted}
    expected_map = {normalise(entry["summary"]) if isinstance(entry.get("summary"), str) else "": entry for entry in expected}

    predicted_keys = {key for key in predicted_map.keys() if key}
    expected_keys = {key for key in expected_map.keys() if key}
    true_positive_keys = predicted_keys & expected_keys

    precision = len(true_positive_keys) / len(predicted_keys) if predicted_keys else 0.0
    recall = len(true_positive_keys) / len(expected_keys) if expected_keys else 0.0
    f1_score = f1(precision, recall)

    def metadata_accuracy(field: str) -> float:
        if not true_positive_keys:
            return 0.0
        matches = 0
        for key in true_positive_keys:
            predicted_value = getattr(predicted_map[key], field, None)
            expected_value = expected_map[key].get(field)
            if expected_value is None:
                continue
            if isinstance(expected_value, Iterable) and not isinstance(expected_value, (str, bytes)):
                expected_set = {normalise(str(item)) for item in expected_value}
                predicted_set = (
                    {normalise(str(item)) for item in predicted_value}
                    if isinstance(predicted_value, Iterable) and not isinstance(predicted_value, (str, bytes))
                    else set()
                )
                matches += 1 if expected_set & predicted_set else 0
            else:
                if normalise(str(predicted_value or "")) == normalise(str(expected_value)):
                    matches += 1
        return matches / len(true_positive_keys)

    return {
        "precision": precision,
        "recall": recall,
        "f1": f1_score,
        "assignee_accuracy": metadata_accuracy("assignee"),
        "due_accuracy": metadata_accuracy("due"),
        "priority_accuracy": metadata_accuracy("priority"),
        "labels_accuracy": metadata_accuracy("labels"),
        "predicted_tasks": float(len(predicted_keys)),
        "expected_tasks": float(len(expected_keys)),
    }


def main() -> None:
    if not DATASET_PATH.exists():
        raise SystemExit(f"Dataset not found: {DATASET_PATH}")

    if os.getenv("OPEN_SOURCE_LLM_DISABLED") is None:
        # Disable LLM enrichment during evaluation to keep metrics deterministic in CI.
        os.environ["OPEN_SOURCE_LLM_DISABLED"] = "1"

    dataset = json.loads(DATASET_PATH.read_text(encoding="utf-8"))

    extractor = TaskExtractor()
    extractor.startup()

    sample_metrics = [
        evaluate_sample(extractor, sample["transcript"], sample.get("expected", []))
        for sample in dataset
    ]

    def average(metric_name: str) -> float:
        values = [metrics[metric_name] for metrics in sample_metrics]
        return float(mean(values)) if values else 0.0

    summary = {
        "precision": average("precision"),
        "recall": average("recall"),
        "f1": average("f1"),
        "assignee_accuracy": average("assignee_accuracy"),
        "due_accuracy": average("due_accuracy"),
        "priority_accuracy": average("priority_accuracy"),
        "labels_accuracy": average("labels_accuracy"),
        "avg_predicted_tasks": average("predicted_tasks"),
        "avg_expected_tasks": average("expected_tasks"),
    }

    print(json.dumps({"samples": sample_metrics, "aggregate": summary}, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
