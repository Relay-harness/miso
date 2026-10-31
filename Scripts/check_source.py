#!/usr/bin/env python3
"""Check the publication tree for common secrets, private paths and generated products.

This is a conservative local guard, not a complete secret/security certification.
"""
from pathlib import Path
import re
import subprocess
import sys

ROOT = Path(__file__).resolve().parent.parent
EXCLUDED = {".git", ".cache", "build", "dist", ".venv", "__pycache__"}
PATTERNS = {
    "private key": re.compile(rb"-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----"),
    "GitHub token": re.compile(rb"\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{50,})"),
    "provider token": re.compile(rb"\bsk-(?:ant-[A-Za-z0-9_-]{20,}|[A-Za-z0-9_-]{40,})"),
    "credential assignment": re.compile(rb"(?:access_token|refresh_token|api_key|client_secret)[\"']?\s*[:=]\s*[\"'][A-Za-z0-9_./+-]{24,}[\"']", re.I),
    "personal absolute home path": re.compile(rb"/Users/[A-Za-z0-9._-]+/"),
}


def files():
    if (ROOT / ".git").exists():
        result = subprocess.run(["git", "ls-files", "--cached", "--others", "--exclude-standard", "-z"], cwd=ROOT, check=True, stdout=subprocess.PIPE)
        return sorted(set(ROOT / name.decode() for name in result.stdout.split(b"\0") if name))
    return sorted(path for path in ROOT.rglob("*") if path.is_file() and not any(part in EXCLUDED for part in path.relative_to(ROOT).parts))


def main():
    failures = []
    checked = 0
    for path in files():
        relative = path.relative_to(ROOT)
        if not path.exists():
            continue
        if path.is_symlink():
            failures.append((str(relative), "symlink is not allowed in the source publication set"))
            continue
        if any(part in EXCLUDED for part in relative.parts):
            failures.append((str(relative), "generated product is tracked"))
            continue
        if path.name.startswith(".env") and path.name != ".env.example" or path.suffix in {".pem", ".p12", ".key"}:
            failures.append((str(relative), "sensitive filename"))
        if path.stat().st_size > 2 * 1024 * 1024:
            failures.append((str(relative), "file exceeds the 2 MiB source-publication limit"))
            continue
        data = path.read_bytes()
        checked += 1
        for label, pattern in PATTERNS.items():
            if pattern.search(data):
                failures.append((str(relative), label))
    for path, reason in failures:
        print("FAIL: " + path + ": " + reason)
    if failures:
        return 1
    print("Publication guard passed for " + str(checked) + " files. No matching candidates; unknown secret formats may still exist.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
