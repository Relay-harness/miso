#!/usr/bin/env python3
"""Package the clean-built, ad-hoc signed app; this does not notarize or publish it."""
import plistlib
from common import ROOT, BUILD, require_macos, run, sha256


def main():
    require_macos()
    app = BUILD / "Miso.app"
    if not app.is_dir():
        raise SystemExit("Run python3 Scripts/build.py first.")
    run(["codesign", "--verify", "--strict", app])
    version = plistlib.loads((app / "Contents/Info.plist").read_bytes())["CFBundleShortVersionString"]
    destination = ROOT / "dist"
    destination.mkdir(exist_ok=True)
    archive = destination / ("Miso-" + version + "-macos-arm64.zip")
    if archive.exists():
        archive.unlink()
    run(["ditto", "-c", "-k", "--norsrc", "--noextattr", "--noqtn", "--keepParent", app, archive])
    (destination / "SHA256SUMS").write_text(sha256(archive) + "  " + archive.name + "\n")
    print("Created " + str(archive) + " (ad-hoc signed, not notarized)")


if __name__ == "__main__":
    main()
