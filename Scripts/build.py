#!/usr/bin/env python3
"""Build an arm64 macOS app from clean source and a verified pinned dependency."""
import argparse
import json
import os
from pathlib import Path, PurePosixPath
import plistlib
import shutil
import tarfile
import tempfile
import urllib.request

from common import ROOT, BUILD, require_macos, run, sha256, swift_flags

MAX_ARCHIVE_BYTES = 128 * 1024 * 1024
MAX_EXPANDED_BYTES = 256 * 1024 * 1024


def dependency_archive(offline=False):
    info = json.loads((ROOT / "ThirdParty/CodexBar/dependency.json").read_text())
    cache = ROOT / ".cache"
    cache.mkdir(exist_ok=True)
    archive = cache / info["asset"]
    if archive.exists() and sha256(archive) == info["sha256"]:
        return archive
    if offline:
        raise SystemExit("The pinned reader archive is not cached with the correct SHA-256. Run once without --offline.")
    if archive.exists():
        archive.unlink()
    descriptor, temporary = tempfile.mkstemp(prefix="reader-", suffix=".partial", dir=str(cache))
    try:
        request = urllib.request.Request(info["url"], headers={"User-Agent": "miso-track-source-build"})
        total = 0
        print("Downloading pinned CodexBar CLI " + info["version"], flush=True)
        with os.fdopen(descriptor, "wb") as output, urllib.request.urlopen(request, timeout=60) as response:
            while True:
                chunk = response.read(1024 * 1024)
                if not chunk:
                    break
                total += len(chunk)
                if total > MAX_ARCHIVE_BYTES:
                    raise RuntimeError("Reader archive exceeds the download limit")
                output.write(chunk)
        if sha256(temporary) != info["sha256"]:
            raise RuntimeError("Reader SHA-256 mismatch; refusing to package unverified code")
        os.replace(temporary, archive)
        print("Pinned reader SHA-256 verified", flush=True)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)
    return archive


def copy_reader(archive, destination):
    destination.mkdir(parents=True)
    total = 0
    with tarfile.open(archive, "r:gz") as package:
        for member in package:
            path = PurePosixPath(member.name)
            if path.is_absolute() or ".." in path.parts:
                raise RuntimeError("Unsafe path in reader archive")
            if not path.parts:
                continue
            selected = path.as_posix() in {"CodexBarCLI", "VERSION", "THIRD_PARTY_NOTICES"} or path.parts[0] == "CodexBar_CodexBarCore.bundle"
            if not selected:
                continue
            if member.issym() or member.islnk():
                raise RuntimeError("Selected reader resources must not contain archive links")
            target = destination.joinpath(*path.parts)
            if member.isdir():
                target.mkdir(parents=True, exist_ok=True)
            elif member.isfile():
                total += member.size
                if total > MAX_EXPANDED_BYTES:
                    raise RuntimeError("Reader archive exceeds the expanded-size limit")
                target.parent.mkdir(parents=True, exist_ok=True)
                stream = package.extractfile(member)
                if stream is None:
                    raise RuntimeError("Missing archive member contents")
                with stream, target.open("wb") as output:
                    shutil.copyfileobj(stream, output)
                target.chmod(0o755 if path.as_posix() == "CodexBarCLI" else 0o644)
            else:
                raise RuntimeError("Unsupported selected reader archive member")
    if not (destination / "CodexBarCLI").is_file():
        raise RuntimeError("Pinned archive did not contain CodexBarCLI")
    shutil.copy2(ROOT / "ThirdParty/CodexBar/LICENSE", destination / "LICENSE-CodexBar")
    if not (destination / "THIRD_PARTY_NOTICES").is_file():
        raise RuntimeError("Pinned reader archive is missing third-party notices")


def build(offline=False):
    require_macos()
    archive = dependency_archive(offline)
    BUILD.mkdir(exist_ok=True)
    app = BUILD / "Miso.app"
    if app.exists():
        shutil.rmtree(app)
    executable = app / "Contents/MacOS/Miso"
    resources = app / "Contents/Resources"
    executable.parent.mkdir(parents=True)
    resources.mkdir(parents=True)
    shutil.copy2(ROOT / "Resources/Info.plist", app / "Contents/Info.plist")
    shutil.copy2(ROOT / "LICENSE", resources / "LICENSE-Miso")
    copy_reader(archive, resources / "QuotaReader")
    artwork = BUILD / "artwork"
    artwork.mkdir(exist_ok=True)
    renderer = BUILD / "render-art"
    run(["xcrun", "swiftc", "-O"] + swift_flags() + [ROOT / "Sources/CatArt.swift", ROOT / "Tools/main.swift", "-o", renderer])
    run([renderer, artwork])
    run(["xcrun", "iconutil", "-c", "icns", artwork / "build/Miso.iconset", "-o", resources / "Miso.icns"])
    sources = sorted((ROOT / "Sources").glob("*.swift"))
    run(["xcrun", "swiftc", "-O", "-target", "arm64-apple-macosx14.0"] + swift_flags() + sources + ["-o", executable])
    run(["codesign", "--force", "--sign", "-", app])
    run(["codesign", "--verify", "--strict", "--verbose=2", app])
    version = plistlib.loads((app / "Contents/Info.plist").read_bytes())["CFBundleShortVersionString"]
    manifest = {"version": version, "architecture": "arm64", "minimum_macos": "14.0", "signature": "ad-hoc; not notarized", "executable_sha256": sha256(executable), "reader_archive_sha256": sha256(archive)}
    (BUILD / "build-manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
    print("Built " + str(app), flush=True)
    return app


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--offline", action="store_true", help="Require the previously verified cached dependency")
    build(parser.parse_args().offline)
