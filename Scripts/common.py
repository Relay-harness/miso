"""Standard-library-only build helpers. No project/account credentials are read."""
from pathlib import Path
import hashlib
import platform
import shlex
import subprocess

ROOT = Path(__file__).resolve().parent.parent
BUILD = ROOT / "build"


def require_macos():
    if platform.system() != "Darwin":
        raise SystemExit("Miso requires macOS and Apple Command Line Tools.")


def run(arguments, cwd=ROOT, timeout=300):
    print("+ " + shlex.join([str(value) for value in arguments]), flush=True)
    return subprocess.run([str(value) for value in arguments], cwd=str(cwd), check=True, timeout=timeout)


def swift_flags():
    return ["-file-prefix-map", str(ROOT) + "=/miso-track"]


def sha256(path):
    digest = hashlib.sha256()
    with Path(path).open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()
