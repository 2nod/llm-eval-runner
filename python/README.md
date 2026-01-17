# DSPy Optimization Stubs

This directory contains placeholder scripts that demonstrate how to compile
prompt artifacts with DSPy (or any other Python-based optimizer) and export the
results as JSON. The TypeScript runtime expects each artifact to contain at
least `systemPrompt`, `template`, `fewShots`, `params`, and an optional
`provenance` block.

Usage example:

```bash
python optimizer.py --input ../datasets/dev.sample.jsonl \
  --output ../artifacts/dspy/dev-translator.json \
  --experiment translator
```

Replace `optimizer.py` with a real DSPy program once you are able to install the
framework (e.g., `pip install dspy-ai`).
