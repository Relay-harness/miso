import Foundation
import CryptoKit

var checks = 0
func check(_ value: @autoclosure () -> Bool, _ text: String) {
    guard value() else { fatalError("FAIL: " + text) }
    checks += 1; print("PASS: " + text)
}
func rejects(_ text: String, _ block: () throws -> Void) {
    do { try block(); fatalError("FAIL: " + text) } catch { checks += 1; print("PASS: " + text) }
}
func json(_ value: Any) -> Data { try! JSONSerialization.data(withJSONObject: value) }
let base = Date(timeIntervalSince1970: 1_800_000_000)
func timestamp(_ date: Date) -> String { let f = ISO8601DateFormatter(); f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]; return f.string(from: date) }
func authData(email: String = "private-fixture@example.invalid", subscription: String = "pro") -> Data {
    json(["loggedIn": true, "authMethod": "claude.ai", "apiProvider": "firstParty", "email": email, "subscriptionType": subscription])
}
func quotaData(at: Date, used: Double, email: String = "private-fixture@example.invalid", reset: Date? = nil) -> Data {
    json([["provider": "claude", "source": "cli", "usage": ["updatedAt": timestamp(at), "identity": ["accountEmail": email],
        "primary": ["usedPercent": used, "resetsAt": timestamp(reset ?? base.addingTimeInterval(14_400)), "windowMinutes": 300],
        "secondary": ["usedPercent": used, "resetsAt": timestamp(base.addingTimeInterval(500_000)), "windowMinutes": 10080]]]])
}
func taskObject() -> [String: Any] {
    ["type": "result", "subtype": "success", "is_error": false, "num_turns": 1, "permission_denials": [],
     "result": String(data: json(CalibrationProtocol.numbers.sorted()), encoding: .utf8)!,
     "usage": ["input_tokens": 1800, "output_tokens": 1600, "cache_read_input_tokens": 0, "cache_creation_input_tokens": 0,
                "server_tool_use": ["web_search_requests": 0, "web_fetch_requests": 0]],
     "modelUsage": [CalibrationProtocol.cliModel: ["inputTokens": 1800, "outputTokens": 1600, "cacheReadInputTokens": 0,
        "cacheCreationInputTokens": 0, "webSearchRequests": 0]], "private_output": "NEVER_UPLOAD_THIS"]
}
let auth = try CalibrationProtocol.auth(authData())
check(auth.subscription == "pro", "first-party subscription metadata is accepted without retaining email")
check(auth.accountDigest != "private-fixture@example.invalid", "raw account email is reduced to a local digest")
for method in ["apiKey", "bedrock", "unknown"] {
    rejects("API or unknown authentication is rejected: " + method) {
        _ = try CalibrationProtocol.auth(json(["loggedIn": true, "authMethod": method, "apiProvider": "firstParty", "email": "fixture@example.invalid", "subscriptionType": "pro"]))
    }
}
let taskUsage = try CalibrationProtocol.task(json(taskObject()))
check(taskUsage.context == 1800 && taskUsage.output == 1600, "only numeric fixed-task counters leave the result parser")
for key in ["usage", "modelUsage", "permission_denials"] {
    var row = taskObject(); row.removeValue(forKey: key)
    rejects("missing " + key + " cannot be assumed complete") { _ = try CalibrationProtocol.task(json(row)) }
}
var wrongTask = taskObject(); wrongTask["result"] = "[1,2,3]"
rejects("arbitrary or incomplete model output is not a completed benchmark task") { _ = try CalibrationProtocol.task(json(wrongTask)) }
var multi = taskObject(); multi["num_turns"] = 2
rejects("multiple turns are not silently counted as one controlled task") { _ = try CalibrationProtocol.task(json(multi)) }
var mismatch = taskObject(); mismatch["modelUsage"] = ["other-model": ["inputTokens": 1800]]
rejects("model fallback or unknown revisions are rejected") { _ = try CalibrationProtocol.task(json(mismatch)) }
var badCounters = taskObject(); var badUsage = badCounters["usage"] as! [String: Any]; badUsage["output_tokens"] = true; badCounters["usage"] = badUsage
rejects("boolean token counters are not numbers") { _ = try CalibrationProtocol.task(json(badCounters)) }
var toolTask = taskObject(); var toolUsage = toolTask["usage"] as! [String: Any]; toolUsage["server_tool_use"] = ["web_search_requests": 1]; toolTask["usage"] = toolUsage
rejects("hidden server-tool usage is excluded") { _ = try CalibrationProtocol.task(json(toolTask)) }
var crossCounters = taskObject(); var crossUsage = crossCounters["usage"] as! [String: Any]; crossUsage["input_tokens"] = 100; crossCounters["usage"] = crossUsage
rejects("aggregate and per-model usage counters must agree") { _ = try CalibrationProtocol.task(json(crossCounters)) }
let first = try CalibrationProtocol.snapshot(quotaData(at: base, used: 20), now: base)
let endedAt = base.addingTimeInterval(360), settledAt = base.addingTimeInterval(390)
let end = try CalibrationProtocol.snapshot(quotaData(at: endedAt, used: 60), now: endedAt)
let stable = try CalibrationProtocol.snapshot(quotaData(at: settledAt, used: 60), now: settledAt)
let tasks = Array(repeating: taskUsage, count: 6)
func build(_ a: CalibrationSnapshot = first, _ b: CalibrationSnapshot = end, _ c: CalibrationSnapshot = stable,
           finalAuth: CalibrationAuth = auth, workloads: [CalibrationTaskUsage] = tasks, confirmed: Bool = true,
           now: Date = base.addingTimeInterval(390)) throws -> CalibrationCandidate {
    try CalibrationProtocol.build(start: a, end: b, stable: c, auth: auth, finalAuth: finalAuth, plan: "pro", tasks: workloads,
        lastTaskAt: base.addingTimeInterval(300), now: now, exclusiveConfirmed: confirmed)
}
let candidate = try build()
check(candidate.measurements.count == 2, "one controlled workload can qualify five-hour and weekly windows separately")
check(candidate.measurements.allSatisfy { $0.protocol == "claude-sort-v1" && $0.resolutionPercent == 5 && $0.workload.tasks == 6 }, "native protocol has explicit task identity and conservative quota resolution")
check(candidate.measurements[0].startUsed == 20 && candidate.measurements[0].endUsed == 60, "quota delta is actually measured, not derived from tokens")
rejects("exclusive coverage must be confirmed") { _ = try build(confirmed: false) }
let other = try CalibrationProtocol.snapshot(quotaData(at: settledAt, used: 60, email: "other@example.invalid"), now: settledAt)
rejects("cross-account quota cannot be combined") { _ = try build(first, end, other) }
rejects("final authentication must match the initial subscription account") { _ = try build(finalAuth: CalibrationProtocol.auth(authData(email: "other@example.invalid"))) }
let unsettled = try CalibrationProtocol.snapshot(quotaData(at: settledAt, used: 65), now: settledAt)
rejects("quota still moving after the workload is not settled evidence") { _ = try build(first, end, unsettled) }
rejects("a repeated cached timestamp cannot prove a fresh settlement check") { _ = try build(first, end, end) }
let tooLittle = try CalibrationProtocol.snapshot(quotaData(at: endedAt, used: 30), now: endedAt)
let tooLittleStable = try CalibrationProtocol.snapshot(quotaData(at: settledAt, used: 30), now: settledAt)
rejects("small quota movements are not promoted into noisy estimates") { _ = try build(first, tooLittle, tooLittleStable) }
let saturated = try CalibrationProtocol.snapshot(quotaData(at: endedAt, used: 100), now: endedAt)
let saturatedStable = try CalibrationProtocol.snapshot(quotaData(at: settledAt, used: 100), now: settledAt)
rejects("saturation hides denominator information and is excluded") { _ = try build(first, saturated, saturatedStable) }
var varied = tasks; varied[0] = CalibrationTaskUsage(input: 3000, output: 1600, cacheRead: 0, cacheWrite: 0)
rejects("context shifts inside the fixed workload are rejected") { _ = try build(workloads: varied) }
rejects("old final readings cannot create a fresh report") { _ = try build(now: settledAt.addingTimeInterval(601)) }
rejects("stale quota metadata is rejected before work") { _ = try CalibrationProtocol.snapshot(quotaData(at: base, used: 20), now: base.addingTimeInterval(61)) }
let config = CalibrationConfiguration(cli: URL(fileURLWithPath: "/fixture/claude"), reader: URL(fileURLWithPath: "/fixture/reader"), directory: URL(fileURLWithPath: "/tmp"), config: URL(fileURLWithPath: "/fixture/config"), plan: "pro", taskLimit: 6, environment: [:])
let args = config.command(.task).arguments
check(args.contains("--no-session-persistence") && args.contains("--safe-mode") && args.contains("--restricted"), "benchmark disables persistence and user customizations")
check(args[args.firstIndex(of: "--tools")! + 1] == "" && args.contains("--strict-mcp-config"), "no local tools or inherited MCP servers are enabled")
check(!args.contains("--bare") && !args.contains("--dangerously-skip-permissions"), "OAuth is not replaced with API-key-only mode or permission bypass")
check(args.last == CalibrationProtocol.prompt, "only the fixed public prompt is sent to the provider")
let identity = Curve25519.Signing.PrivateKey()
let (bytes, signature) = try CalibrationEnvelope.encode(candidate.measurements[0], plan: "pro", series: "public-fixture-series-1", identity: identity, now: settledAt)
check(identity.publicKey.isValidSignature(Data(base64Encoded: signature)!, for: bytes), "native calibration bytes have a valid Ed25519 signature")
let text = String(data: bytes, encoding: .utf8)!
for forbidden in ["private-fixture", "NEVER_UPLOAD_THIS", candidate.scope, auth.accountDigest, CalibrationProtocol.prompt, "/fixture/"] {
    check(!text.contains(forbidden), "signed calibration payload excludes private source material")
}
check(bytes.count < 8192, "native report fits the collector request limit")

final class FakeClock: @unchecked Sendable {
    let lock = NSLock(); var date: Date; var taskCount = 0; var quotaCount = 0
    init(_ date: Date) { self.date = date }
    func now() -> Date { lock.lock(); defer { lock.unlock() }; return date }
    func advance(_ seconds: Double) { lock.lock(); date = date.addingTimeInterval(seconds); lock.unlock() }
    func task() { lock.lock(); taskCount += 1; lock.unlock() }
    func quota() -> Int { lock.lock(); defer { lock.unlock() }; quotaCount += 1; return quotaCount }
}
let emit = CommandLine.arguments.contains("--emit-envelopes")
if emit {
    // Public, generated synthetic packets only. Private keys and raw source records never leave this process.
    var records: [[String: String]] = []
    for _ in 0..<10 {
        let key = Curve25519.Signing.PrivateKey(), series = UUID().uuidString
        for current in [false, true] { for index in 0..<3 {
            let at = base.addingTimeInterval((current ? -3600 : -172800) + Double(index*900))
            let reset = at.addingTimeInterval(14400)
            let a = try CalibrationProtocol.snapshot(quotaData(at: at, used: 20, reset: reset), now: at)
            let bAt = at.addingTimeInterval(360), cAt = at.addingTimeInterval(390)
            // Keep the weekly reset fixture inside its explicit window as well.
            let b = try CalibrationProtocol.snapshot(quotaData(at: bAt, used: current ? 60 : 40, reset: reset), now: bAt)
            let c = try CalibrationProtocol.snapshot(quotaData(at: cAt, used: current ? 60 : 40, reset: reset), now: cAt)
            let measured = try CalibrationProtocol.build(start: a, end: b, stable: c, auth: auth, finalAuth: auth, plan: "pro", tasks: tasks, lastTaskAt: at.addingTimeInterval(300), now: cAt, exclusiveConfirmed: true)
            let packet = try CalibrationEnvelope.encode(measured.measurements.first(where: { $0.kind == "five_hour" })!, plan: "pro", series: series, identity: key, now: cAt)
            records.append(["raw": String(data: packet.0, encoding: .utf8)!, "signature": packet.1])
        }}
    }
    let payload = json(["finalAt": Int64(base.timeIntervalSince1970*1000), "packets": records])
    let destination = CommandLine.arguments[CommandLine.arguments.firstIndex(of: "--emit-envelopes")! + 1]
    try payload.write(to: URL(fileURLWithPath: destination), options: .atomic)
    print("Wrote public synthetic signed packets, not live reports.")
}
Task {
    do {
        let clock = FakeClock(base)
        let engine = CalibrationEngine(now: { clock.now() }, pause: { seconds in clock.advance(seconds) }, command: { command, _ in
            switch command.kind {
            case .auth: return authData()
            case .quota: return quotaData(at: clock.now(), used: clock.quota() == 1 ? 20 : 60)
            case .task: clock.task(); return json(taskObject())
            }
        })
        let generated = try await engine.run(config, cancellation: CalibrationCancellation()) { _ in }
        check(clock.taskCount == 6 && generated.measurements.count == 2, "native engine automatically measures a bounded fixed workload through injected local interfaces")
        check(clock.now().timeIntervalSince(base) == 390, "fixed pacing and fresh settlement create a bounded measurable interval")
        let cancelled = CalibrationCancellation(); cancelled.cancel()
        do { _ = try await engine.run(config, cancellation: cancelled) { _ in }; fatalError("Cancelled session ran") } catch is CancellationError { checks += 1; print("PASS: cancelled session never starts a command") }
        let mismatchClock = FakeClock(base)
        let wrongEngine = CalibrationEngine(now: { mismatchClock.now() }, pause: { mismatchClock.advance($0) }, command: { command, _ in
            switch command.kind {
            case .auth: return authData()
            case .quota: return quotaData(at: mismatchClock.now(), used: 20, email: "other@example.invalid")
            case .task: mismatchClock.task(); return json(taskObject())
            }
        })
        do { _ = try await wrongEngine.run(config, cancellation: CalibrationCancellation()) { _ in }; fatalError("Mismatched account ran") } catch { check(mismatchClock.taskCount == 0, "account mismatch fails before consuming benchmark quota") }
        // Exercise real process plumbing using account-free system fixtures, never the provider CLI.
        let command = CalibrationCommand(kind: .task, executable: URL(fileURLWithPath: "/usr/bin/printf"), arguments: ["%s", "synthetic"], environment: ["PATH": "/usr/bin:/bin"], directory: URL(fileURLWithPath: "/tmp"))
        let out = try await CalibrationCommand.run(command, cancellation: CalibrationCancellation())
        check(String(data: out, encoding: .utf8) == "synthetic", "native command runner preserves bounded stdout without shell interpolation")
        let token = CalibrationCancellation()
        let sleeper = CalibrationCommand(kind: .task, executable: URL(fileURLWithPath: "/bin/sleep"), arguments: ["30"], environment: [:], directory: URL(fileURLWithPath: "/tmp"))
        let started = Date(); let active = Task { try await CalibrationCommand.run(sleeper, cancellation: token) }
        try await Task.sleep(nanoseconds: 100_000_000); token.cancel()
        do { _ = try await active.value; fatalError("Cancellation ignored") } catch { check(Date().timeIntervalSince(started) < 4, "stop terminates an active local process within the bounded grace period") }
        print("\(checks) native calibration checks passed. No provider account, Keychain or network accessed.")
        exit(0)
    } catch { print("FAIL: synthetic calibration engine check: \(error)"); exit(1) }
}
dispatchMain()
