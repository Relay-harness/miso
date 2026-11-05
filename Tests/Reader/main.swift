import Foundation
var count = 0
func check(_ condition: @autoclosure () -> Bool, _ text: String) {
    guard condition() else { fatalError("FAIL: " + text) }
    count += 1; print("PASS: " + text)
}
let directory = URL(fileURLWithPath: NSTemporaryDirectory())
let env = ["PATH": "/usr/bin:/bin", "LANG": "C"]
let json = "[{\"provider\":\"claude\",\"usage\":null}]"
let normal = QuotaReader.run(executable: URL(fileURLWithPath: "/usr/bin/printf"), arguments: ["%s", json], environment: env, directory: directory)
check(normal.exitCode == 0 && String(data: normal.data, encoding: .utf8) == json, "argument-array process returns exact stdout")
check(!normal.timedOut && !normal.tooLarge, "normal result is not flagged")
let failure = QuotaReader.run(executable: URL(fileURLWithPath: "/usr/bin/false"), arguments: [], environment: env, directory: directory)
check(failure.exitCode != 0, "nonzero exit preserved")
let missing = QuotaReader.run(executable: URL(fileURLWithPath: "/nonexistent/relay-cat-fixture"), arguments: [], environment: env, directory: directory)
check(missing.exitCode == -1, "missing helper does not crash")
let before = Date()
let timeout = QuotaReader.run(executable: URL(fileURLWithPath: "/bin/sleep"), arguments: ["10"], environment: env, directory: directory, timeout: 0.1)
check(timeout.timedOut, "hung reader is terminated at deadline")
check(Date().timeIntervalSince(before) < 4, "deadline remains bounded")
let oversized = QuotaReader.run(executable: URL(fileURLWithPath: "/usr/bin/yes"), arguments: ["synthetic-output-only"], environment: env, directory: directory, timeout: 5)
check(oversized.tooLarge, "oversized stdout rejected")
check(oversized.data.count <= 4*1024*1024, "stdout memory bound enforced")
let fixtureHome = URL(fileURLWithPath: "/tmp/relay-cat-fixture-home")
let fixtureConfig = fixtureHome.appendingPathComponent("reader/config.json")
let safeEnv = QuotaReader.environment(home: fixtureHome, config: fixtureConfig, allowBrowserCookies: false, userName: "fixture-user")
check(safeEnv["USER"] == "fixture-user", "owner CLI receives macOS USER for credential lookup")
check(safeEnv["LOGNAME"] == "fixture-user", "LOGNAME matches the same macOS account")
check(safeEnv["HOME"] == fixtureHome.path, "owner CLI home remains explicit")
check(safeEnv["CODEXBAR_CONFIG"] == fixtureConfig.path, "isolated helper config is preserved")
check(safeEnv["CODEXBAR_ALLOW_BROWSER_COOKIE_IMPORT"] == "0", "browser import stays off without separate consent")
let browserEnv = QuotaReader.environment(home: fixtureHome, config: fixtureConfig, allowBrowserCookies: true, userName: "fixture-user")
check(browserEnv["CODEXBAR_ALLOW_BROWSER_COOKIE_IMPORT"] == "1", "separate browser consent remains expressible")
let allowed = Set(["HOME", "USER", "LOGNAME", "PATH", "TMPDIR", "LANG", "NO_COLOR", "CODEXBAR_CONFIG", "CODEXBAR_ALLOW_BROWSER_COOKIE_IMPORT"])
check(Set(safeEnv.keys) == allowed, "environment allowlist excludes inherited API keys, auth tokens and custom profiles")
let realIdentity = QuotaReader.environment(home: fixtureHome, config: fixtureConfig, allowBrowserCookies: false)
check(realIdentity["USER"] == NSUserName() && realIdentity["LOGNAME"] == NSUserName(), "default identity comes from the running macOS user")
print("\(count) reader checks passed")

let cancellation = ReaderCancellation()
DispatchQueue.global().asyncAfter(deadline: .now()+0.1) { cancellation.cancel() }
let began = Date()
let cancelledRead = QuotaReader.run(executable: URL(fileURLWithPath: "/bin/sleep"), arguments: ["20"], environment: env, directory: directory, timeout: 3, cancellation: cancellation)
check(Date().timeIntervalSince(began) < 3 && cancelledRead.exitCode != 0, "revoking a reader cancels its owned helper promptly")
MainActor.assumeIsolated {
    let suite = "miso-reader-test-" + UUID().uuidString; let defaults = UserDefaults(suiteName: suite)!
    defer { defaults.removePersistentDomain(forName: suite) }
    let store = QuotaStore(defaults: defaults)
    store.setActiveProviders([.claude]); check(store.quotaProvidersForRefresh == [.claude], "Claude-only activity does not query Codex")
    store.setActiveProviders([.codex]); check(store.quotaProvidersForRefresh == [.codex], "Codex-only activity does not query Claude")
    store.pauseForSleep(); check(store.quotaProvidersForRefresh.isEmpty, "sleep pauses provider quota work")
    check(store.userRequestedProviders.contains(.claude) && store.userRequestedProviders.contains(.codex), "Refresh button and open popover still read quotas when no provider app is running")
    check(!defaults.bool(forKey: "realQuotasEnabled") && !defaults.bool(forKey: "localTokenStatsEnabled"), "activity detection grants no permissions")
}
print("\(count) reader/lifecycle checks passed")
