"""Stub DSPy optimization pipeline.

This script demonstrates how to turn dataset JSONL files into prompt artifacts
expected by the TypeScript runtime. Replace the placeholder logic with actual
DSPy programs when ready.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any, Dict


def read_jsonl(path: Path) -> list[Dict[str, Any]]:
  records: list[Dict[str, Any]] = []
  with path.open("r", encoding="utf-8") as handle:
    for line in handle:
      line = line.strip()
      if not line:
        continue
      records.append(json.loads(line))
  return records


def build_artifact(experiment: str, dataset: list[Dict[str, Any]]) -> Dict[str, Any]:
  return {
    "name": experiment,
    "systemPrompt": "You are a careful JA-EN translator optimized by DSPy.",
    "template": "# Source\n{{text}}\n# Constraints\n{{constraints}}",
    "fewShots": [
      {
        "role": "user",
        "content": sample["ja"]["text"],
      }
      for sample in dataset[:2]
    ],
    "params": {
      "temperature": 0,
      "maxOutputTokens": 800,
    },
    "provenance": {
      "datasetSize": len(dataset),
    },
  }


def main() -> None:
  parser = argparse.ArgumentParser(description="Export DSPy artifact")
  parser.add_argument("--input", required=True, help="Dataset JSONL")
  parser.add_argument("--output", required=True, help="Artifact JSON path")
  parser.add_argument("--experiment", default="translator", help="Experiment name")
  args = parser.parse_args()

  dataset_path = Path(args.input)
  dataset = read_jsonl(dataset_path)
  artifact = build_artifact(args.experiment, dataset)

  output_path = Path(args.output)
  output_path.parent.mkdir(parents=True, exist_ok=True)
  output_path.write_text(json.dumps(artifact, ensure_ascii=False, indent=2), encoding="utf-8")
  print(f"wrote artifact to {output_path}")


if __name__ == "__main__":
  main()
