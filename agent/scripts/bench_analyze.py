#!/usr/bin/env python3
"""
bench_analyze.py — Autoresearch-style benchmark harness for analyze.py.

Measures wall-clock time and output correctness (hash) for each optimization
iteration. Implements a keep/revert loop: keep if faster + correct, revert otherwise.

Usage:
  python3 agent/scripts/bench_analyze.py --baseline          # Capture reference
  python3 agent/scripts/bench_analyze.py --check             # Compare to baseline
  python3 agent/scripts/bench_analyze.py --check --label "script_cache"  # Label the attempt
"""

import argparse
import hashlib
import json
import os
import re
import subprocess
import sys
import time
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = SCRIPT_DIR.parent.parent
ANALYZE_SCRIPT = SCRIPT_DIR / "analyze.py"
SANDBOX_DIR = PROJECT_ROOT / "agent" / "sandbox"

SOLUTIONS = ["KeepaScoreApp", "FM_Quickstart_v26_0_1"]
BASELINE_FILE = SCRIPT_DIR / "bench_baseline.json"
LOG_FILE = SCRIPT_DIR / "bench_log.jsonl"

RUNS_PER_MEASUREMENT = 3  # Take median of N runs


def normalize_json(path):
    """Read JSON, normalize volatile fields, return canonical string."""
    with open(path, "r", encoding="utf-8") as f:
        data = json.load(f)
    # Remove volatile fields
    data.pop("generated_at", None)
    # Recursively sort keys for deterministic output
    return json.dumps(data, sort_keys=True, ensure_ascii=False)


def hash_output(path):
    """SHA256 hash of normalized JSON output."""
    content = normalize_json(path)
    return hashlib.sha256(content.encode("utf-8")).hexdigest()


def run_once(solution):
    """Run analyze.py once, return (wall_time, output_path)."""
    output_path = Path(f"/tmp/bench_{solution}.json")
    cmd = [
        "python3", str(ANALYZE_SCRIPT),
        "-s", solution,
        "--format", "json",
        "-o", str(output_path),
    ]
    start = time.monotonic()
    result = subprocess.run(
        cmd, capture_output=True, text=True,
        cwd=str(PROJECT_ROOT),
    )
    elapsed = time.monotonic() - start

    if result.returncode != 0:
        print(f"  ERROR running analyze.py for {solution}:", file=sys.stderr)
        print(f"  {result.stderr}", file=sys.stderr)
        return None, output_path

    return elapsed, output_path


def measure(solution):
    """Run N times, return (median_time, output_hash, output_path)."""
    times = []
    output_path = None
    for i in range(RUNS_PER_MEASUREMENT):
        t, output_path = run_once(solution)
        if t is None:
            return None, None, None
        times.append(t)

    times.sort()
    median = times[len(times) // 2]
    h = hash_output(output_path)
    return median, h, output_path


def capture_baseline():
    """Capture baseline measurements for all solutions."""
    print("Capturing baseline...")
    baseline = {}
    for sol in SOLUTIONS:
        print(f"\n  {sol}:")
        median_time, h, _ = measure(sol)
        if median_time is None:
            print(f"    FAILED — skipping")
            continue
        baseline[sol] = {
            "time_s": round(median_time, 4),
            "hash": h,
        }
        print(f"    Time: {median_time:.4f}s (median of {RUNS_PER_MEASUREMENT})")
        print(f"    Hash: {h[:16]}...")

    with open(BASELINE_FILE, "w") as f:
        json.dump(baseline, f, indent=2)
    print(f"\nBaseline saved to {BASELINE_FILE}")


def check_against_baseline(label=""):
    """Run and compare against baseline."""
    if not BASELINE_FILE.exists():
        print("ERROR: No baseline found. Run with --baseline first.", file=sys.stderr)
        sys.exit(1)

    with open(BASELINE_FILE) as f:
        baseline = json.load(f)

    print(f"Checking{' [' + label + ']' if label else ''}...")
    results = []
    all_pass = True

    for sol in SOLUTIONS:
        if sol not in baseline:
            print(f"  {sol}: no baseline, skipping")
            continue

        bl = baseline[sol]
        print(f"\n  {sol}:")
        median_time, h, _ = measure(sol)

        if median_time is None:
            print(f"    FAILED")
            all_pass = False
            continue

        correct = h == bl["hash"]
        delta_pct = ((median_time - bl["time_s"]) / bl["time_s"]) * 100
        improved = median_time < bl["time_s"]

        if correct and improved:
            verdict = "KEEP"
        elif not correct:
            verdict = "REVERT (output changed)"
            all_pass = False
        else:
            verdict = "REVERT (slower)"
            all_pass = False

        print(f"    Time:     {median_time:.4f}s (baseline: {bl['time_s']:.4f}s, {delta_pct:+.1f}%)")
        print(f"    Correct:  {'YES' if correct else 'NO — hash mismatch!'}")
        print(f"    Verdict:  {verdict}")

        results.append({
            "solution": sol,
            "label": label,
            "time_s": round(median_time, 4),
            "baseline_s": bl["time_s"],
            "delta_pct": round(delta_pct, 1),
            "output_correct": correct,
            "verdict": verdict,
            "timestamp": time.strftime("%Y-%m-%dT%H:%M:%S"),
        })

    # Append to log
    with open(LOG_FILE, "a") as f:
        for r in results:
            f.write(json.dumps(r) + "\n")

    if all_pass:
        print(f"\n==> ALL PASS — keep this change.")
    else:
        print(f"\n==> FAILED — revert this change.")

    return all_pass


def update_baseline():
    """Update baseline with current measurements (after accepting a known output change)."""
    print("Updating baseline with current measurements...")
    capture_baseline()
    print("Baseline updated. Future --check runs will compare against these values.")


def main():
    parser = argparse.ArgumentParser(description="Benchmark harness for analyze.py")
    parser.add_argument("--baseline", action="store_true", help="Capture baseline measurements")
    parser.add_argument("--check", action="store_true", help="Check against baseline")
    parser.add_argument("--update", action="store_true", help="Update baseline (after known output change)")
    parser.add_argument("--label", default="", help="Label for this optimization attempt")
    args = parser.parse_args()

    if args.baseline:
        capture_baseline()
    elif args.update:
        update_baseline()
    elif args.check:
        ok = check_against_baseline(args.label)
        sys.exit(0 if ok else 1)
    else:
        parser.print_help()


if __name__ == "__main__":
    main()
