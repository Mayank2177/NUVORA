"""Workspace challenges and the in-product coding assistant."""
from __future__ import annotations

from typing import Any, Optional

CHALLENGES: list[dict[str, Any]] = [
    {
        "id": "slugify",
        "title": "Build a slugify function",
        "brief": 'Turn "Hello, World!" into "hello-world". Make every test pass.',
        "files": {
            "slugify.js": (
                '// Turn "Hello, World!" into "hello-world"\n'
                "export function slugify(text) {\n"
                "  // TODO\n"
                "  return text;\n"
                "}\n"
            ),
            "slugify.test.js": """import { slugify } from "./slugify.js";

test("lowercases text", () => {
  expect(slugify("Hello")).toBe("hello");
});

test("replaces spaces with hyphens", () => {
  expect(slugify("hello world")).toBe("hello-world");
});

test("removes punctuation", () => {
  expect(slugify("Hello, World!")).toBe("hello-world");
});

test("trims extra separators", () => {
  expect(slugify("  --Hi there--  ")).toBe("hi-there");
});
""",
        },
        "solution": {
            "slugify.js": """// Turn "Hello, World!" into "hello-world"
export function slugify(text) {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
""",
        },
        "hints": [
            "Start with the easy part: make the text lowercase and see which tests still fail.",
            'Punctuation and spaces are both "not letters or numbers". One regular expression can replace runs of them with a single hyphen.',
            "After replacing, hyphens can be left at the start or end. Strip those with a second replace.",
        ],
    },
    {
        "id": "emitter",
        "title": "Build a tiny event emitter",
        "brief": "Implement on, off and emit so listeners can subscribe to named events.",
        "files": {
            "emitter.js": (
                "// Build your own event emitter\n"
                "export class Emitter {\n"
                "  // TODO: on(event, fn), off(event, fn), emit(event, ...args)\n"
                "}\n"
            ),
            "emitter.test.js": """import { Emitter } from "./emitter.js";

test("calls a listener on emit", () => {
  const e = new Emitter();
  let n = 0;
  e.on("hit", () => n++);
  e.emit("hit");
  expect(n).toBe(1);
});

test("passes arguments to listeners", () => {
  const e = new Emitter();
  let got;
  e.on("say", (x) => { got = x; });
  e.emit("say", "hi");
  expect(got).toBe("hi");
});

test("stops calling a listener after off", () => {
  const e = new Emitter();
  let n = 0;
  const f = () => n++;
  e.on("a", f);
  e.off("a", f);
  e.emit("a");
  expect(n).toBe(0);
});

test("emit with no listeners is safe", () => {
  const e = new Emitter();
  e.emit("nothing");
  expect(true).toBe(true);
});
""",
        },
        "solution": {
            "emitter.js": """// Build your own event emitter
export class Emitter {
  constructor() {
    this.map = {};
  }
  on(event, fn) {
    if (!this.map[event]) this.map[event] = [];
    this.map[event].push(fn);
  }
  off(event, fn) {
    this.map[event] = (this.map[event] || []).filter((f) => f !== fn);
  }
  emit(event, ...args) {
    (this.map[event] || []).forEach((f) => f(...args));
  }
}
""",
        },
        "hints": [
            "You need somewhere to keep listeners for each event name. An object of arrays works well.",
            "emit should loop over the listeners for that event, and do nothing if there are none.",
            "off can rebuild the array without the listener you were given.",
        ],
    },
]

CHALLENGE_BY_ID = {item["id"]: item for item in CHALLENGES}

MAX_FILES = 300
MAX_FILE_BYTES = 200_000
MAX_TOTAL_BYTES = 1_000_000
MAX_PATH = 500
MAX_FOLDERS = 200
MAX_OPEN_TABS = 50


def public_challenge(item: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": item["id"],
        "title": item["title"],
        "brief": item["brief"],
        "files": item["files"],
        "hints": item["hints"],
    }


def validate_workspace_paths(
    files: dict[str, str],
    folders: list[str],
    open_tabs: list[str],
    active_tab: str,
    ai_files: list[str],
) -> None:
    from fastapi import HTTPException

    if len(files) > MAX_FILES:
        raise HTTPException(status_code=400, detail="Too many files in the workspace.")
    if len(folders) > MAX_FOLDERS:
        raise HTTPException(status_code=400, detail="Too many folders in the workspace.")
    if len(open_tabs) > MAX_OPEN_TABS:
        raise HTTPException(status_code=400, detail="Too many open tabs.")
    if len(ai_files) > 100:
        raise HTTPException(status_code=400, detail="Too many AI-touched files.")

    total = 0
    for path, contents in files.items():
        _assert_safe_path(path)
        if not isinstance(contents, str):
            raise HTTPException(status_code=400, detail="File contents must be text.")
        size = len(contents.encode("utf-8"))
        if size > MAX_FILE_BYTES:
            raise HTTPException(status_code=400, detail=f"{path} is too large.")
        total += size
    if total > MAX_TOTAL_BYTES:
        raise HTTPException(status_code=400, detail="Workspace is too large to save.")

    for folder in folders:
        _assert_safe_path(folder)
    for path in [*open_tabs, *ai_files, *([active_tab] if active_tab else [])]:
        _assert_safe_path(path)


def _assert_safe_path(path: str) -> None:
    from fastapi import HTTPException

    if not isinstance(path, str) or not path.strip() or len(path) > MAX_PATH:
        raise HTTPException(status_code=400, detail="Invalid file path.")
    if path.startswith("/") or path.startswith("\\") or ".." in path.split("/"):
        raise HTTPException(status_code=400, detail="Invalid file path.")
    if any(part in {"", ".", ".."} for part in path.split("/")):
        raise HTTPException(status_code=400, detail="Invalid file path.")


def assistant_reply(
    prompt: str,
    *,
    challenge_id: Optional[str],
    failing_tests: list[str],
    error: Optional[str],
    hint_index: int,
) -> dict[str, Any]:
    challenge = CHALLENGE_BY_ID.get(challenge_id or "")
    text = prompt.strip()
    lowered = text.lower()
    hint_index = max(0, hint_index)

    wants_hint = lowered in {"hint", "give me a hint"} or "hint" in lowered
    wants_solution = "solution" in lowered or "show the answer" in lowered
    wants_explain = "explain" in lowered or "why" in lowered or "fail" in lowered

    if challenge and wants_hint:
        hints = challenge["hints"]
        index = min(hint_index, len(hints) - 1)
        remaining = max(0, len(hints) - index - 1)
        suffix = (
            f" You have {remaining} hint{'s' if remaining != 1 else ''} left after this."
            if remaining
            else " That was the last hint."
        )
        return {"text": hints[index] + suffix, "hint": True, "patch": None}

    if challenge and wants_solution:
        file, code = next(iter(challenge["solution"].items()))
        return {
            "text": (
                "Here is a working solution. Review it, then apply it only if you want "
                "to replace your file. Applying it is logged as AI-assisted evidence."
            ),
            "hint": False,
            "patch": {"file": file, "code": code},
        }

    if wants_explain or failing_tests or error:
        parts = []
        if failing_tests:
            parts.append("Failing tests: " + ", ".join(failing_tests) + ".")
        if error:
            parts.append(error.strip())
        if challenge:
            parts.append(
                "Compare the failing cases with the starter tests, then ask for a hint "
                "if you want a smaller nudge."
            )
        else:
            parts.append(
                "Open the file that threw, read the last error in the Output pane, "
                "and run the tests again after each small change."
            )
        return {"text": " ".join(parts), "hint": False, "patch": None}

    if challenge:
        return {
            "text": (
                f"{challenge['brief']} Ask for a hint, an explanation of failing tests, "
                "or a solution when you want one."
            ),
            "hint": False,
            "patch": None,
        }

    if text:
        return {
            "text": (
                "I can help with workspace challenges: add a starter from the explorer, "
                "run tests, then ask for a hint, an explanation, or a solution."
            ),
            "hint": False,
            "patch": None,
        }

    return {"text": "Ask a question about your current file or tests.", "hint": False, "patch": None}
