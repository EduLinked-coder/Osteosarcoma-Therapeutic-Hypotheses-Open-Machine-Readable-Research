#!/usr/bin/env python3
"""Write the governed GitHub Pages deployment receipt for this repository."""
from __future__ import annotations

import argparse
import json
import os
import re
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlparse

WORKFLOW_FILE = ".github/workflows/pages.yml"
AUTHORITY_BOUNDARY = (
    "Technical provenance for the public research projection URL emitted by GitHub Pages only. "
    "This receipt does not grant scientific review, clinical-use, publication, accessibility-"
    "conformance, source-authority, merge, or canonical-destination approval."
)


def _required_env(name: str) -> str:
    value = os.environ.get(name, "")
    if not value:
        raise SystemExit(f"missing required environment variable: {name}")
    return value


def build_receipt(page_url: str, generated_at: str | None = None) -> dict:
    repository = _required_env("GITHUB_REPOSITORY")
    commit_sha = _required_env("GITHUB_SHA")
    run_id = _required_env("GITHUB_RUN_ID")
    run_attempt = _required_env("GITHUB_RUN_ATTEMPT")
    server_url = _required_env("GITHUB_SERVER_URL")

    if not re.fullmatch(r"[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+", repository):
        raise SystemExit("repository must use owner/name form")
    if not re.fullmatch(r"[0-9a-f]{40}", commit_sha):
        raise SystemExit("commit_sha must be an exact 40-character source revision")
    if not run_id.isdigit() or not run_attempt.isdigit():
        raise SystemExit("workflow run identifiers must be integers")

    parsed = urlparse(page_url)
    if (
        parsed.scheme != "https"
        or not parsed.netloc
        or parsed.username
        or parsed.password
        or parsed.query
        or parsed.fragment
    ):
        raise SystemExit("page_url must be a plain HTTPS URL")

    generated_at = generated_at or datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    if not re.fullmatch(r"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z", generated_at):
        raise SystemExit("generated_at must be an RFC3339 UTC second timestamp")

    run_url = f"{server_url}/{repository}/actions/runs/{run_id}"
    expected_run_url = f"https://github.com/{repository}/actions/runs/{run_id}"
    if run_url != expected_run_url:
        raise SystemExit("workflow.run_url must match repository and run_id")

    receipt = {
        "schema_version": "1.0",
        "receipt_type": "github_pages_deployment",
        "repository": repository,
        "commit_sha": commit_sha,
        "workflow": {
            "run_id": int(run_id),
            "run_attempt": int(run_attempt),
            "run_url": run_url,
            "workflow_file": WORKFLOW_FILE,
        },
        "environment": "github-pages",
        "page_url": page_url,
        "generated_at": generated_at,
        "authority_boundary": AUTHORITY_BOUNDARY,
    }

    expected_top_level = {
        "schema_version",
        "receipt_type",
        "repository",
        "commit_sha",
        "workflow",
        "environment",
        "page_url",
        "generated_at",
        "authority_boundary",
    }
    expected_workflow = {"run_id", "run_attempt", "run_url", "workflow_file"}
    if set(receipt) != expected_top_level:
        raise SystemExit("receipt fields do not match the governed Pages deployment receipt contract")
    if set(receipt["workflow"]) != expected_workflow:
        raise SystemExit("workflow fields do not match the governed Pages deployment receipt contract")
    return receipt


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--page-url", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--generated-at")
    args = parser.parse_args()

    receipt = build_receipt(args.page_url, args.generated_at)
    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(receipt, indent=2, sort_keys=True) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
