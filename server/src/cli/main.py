"""Real HTTP CLI for the active NUVORA API."""
from __future__ import annotations

import argparse
import json
import os
import sys

import httpx


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="nuvora")
    parser.add_argument(
        "--base-url",
        default=os.getenv("NUVORA_API_URL", "http://127.0.0.1:4117"),
    )
    parser.add_argument("--token", default=os.getenv("NUVORA_API_TOKEN", ""))
    subcommands = parser.add_subparsers(dest="command", required=True)
    subcommands.add_parser("health")
    for name in ("guidance", "skills", "chain", "export"):
        command = subcommands.add_parser(name)
        command.add_argument("project_id")
    return parser


def _print_json(value) -> None:
    print(json.dumps(value, indent=2, ensure_ascii=False, sort_keys=True))


def main() -> None:
    args = _parser().parse_args()
    base_url = args.base_url.rstrip("/")
    headers = {}
    if args.command != "health":
        if not args.token:
            raise SystemExit("--token or NUVORA_API_TOKEN is required")
        headers["Authorization"] = f"Bearer {args.token}"

    paths = {
        "health": "/healthz",
        "guidance": f"/api/projects/{getattr(args, 'project_id', '')}/continuity/guidance",
        "skills": f"/api/projects/{getattr(args, 'project_id', '')}/continuity/skills",
        "chain": f"/api/projects/{getattr(args, 'project_id', '')}/continuity/evidence-chain",
        "export": f"/api/projects/{getattr(args, 'project_id', '')}/continuity/project.md",
    }

    try:
        with httpx.Client(timeout=20.0) as client:
            response = client.get(base_url + paths[args.command], headers=headers)
            response.raise_for_status()
    except httpx.HTTPError as exc:
        raise SystemExit(f"NUVORA request failed: {exc}") from exc

    if args.command == "export":
        sys.stdout.write(response.text)
    else:
        _print_json(response.json())


if __name__ == "__main__":
    main()