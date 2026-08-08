#!/usr/bin/env python3
"""Hephaestus wrapper: ensure themis-agent checkout, then run its review_followups.py.

Sets engine THEMIS_* defaults, then delegates via runpy to
`.themis-agent/scripts/review_followups.py` (source of truth).
"""
from __future__ import annotations

import os
import runpy
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
os.environ.setdefault("THEMIS_REVIEW_MARKER", "<!-- dev-agent-cursor-review -->")
os.environ.setdefault(
    "THEMIS_FOLLOWUP_SECTIONS", "Suggestions,High priority issues,Risks"
)
themis = ROOT / ".themis-agent" / "scripts" / "review_followups.py"
if not themis.is_file():
    subprocess.check_call(["bash", str(ROOT / "scripts" / "ensure_themis_agent.sh")])
    themis = ROOT / ".themis-agent" / "scripts" / "review_followups.py"
sys.argv[0] = str(themis)
runpy.run_path(str(themis), run_name="__main__")
