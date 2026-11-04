#!/usr/bin/env python3
"""Run account-free fixture tests; interactive native UI checks are explicitly opt-in."""
import argparse
import platform
import sys
from common import ROOT, BUILD, require_macos, run, swift_flags


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--native-ui", action="store_true", help="Build and run native UI checks on an interactive Apple Silicon Mac")
    parser.add_argument("--offline", action="store_true", help="Use only a cached helper if --native-ui builds the app")
    args = parser.parse_args()
    require_macos()
    run([sys.executable, ROOT / "Scripts/check_source.py"])
    tests = BUILD / "tests"
    tests.mkdir(parents=True, exist_ok=True)
    core = ["FocusClock", "QuotaModel", "UsageForecast", "DashboardLayout", "ProviderSelection", "UpdateChecker"]
    reader = ["QuotaModel", "UsageForecast", "ProviderSelection", "QuotaReader"]
    community = ["QuotaModel", "CommunitySharing"]
    calibration = ["QuotaModel", "UsageForecast", "ProviderSelection", "QuotaReader", "CommunitySharing", "AllowanceCalibration", "CalibrationTransport"]
    for name, files, entry in [("core", core, "Tests/main.swift"), ("reader", reader, "Tests/Reader/main.swift"), ("community", community, "Tests/Community/main.swift"), ("calibration", calibration, "Tests/Calibration/main.swift"), ("invitation", ["ContributionInvitation"], "Tests/Invitation/main.swift")]:
        output = tests / name
        run(["xcrun", "swiftc"] + swift_flags() + [ROOT / ("Sources/" + item + ".swift") for item in files] + [ROOT / entry, "-o", output])
        run([output], timeout=30)
    if args.native_ui:
        if platform.machine() != "arm64":
            raise SystemExit("Native UI tests require Apple Silicon; core/reader tests already passed.")
        from build import build
        app = build(args.offline)
        results = tests / "native-results"
        results.mkdir(exist_ok=True)
        run([app / "Contents/MacOS/Miso", "--verify-quota-menu"], cwd=results, timeout=30)
    print("All requested fixture tests passed. No private account validation was performed.", flush=True)


if __name__ == "__main__":
    main()
