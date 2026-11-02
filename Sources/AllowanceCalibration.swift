import Foundation
import CoreFoundation
import CryptoKit
import Darwin

struct CalibrationFailure: Error, LocalizedError, Sendable {
    let message: String
    var errorDescription: String? { message }
    init(_ message: String) { self.message = message }
}
struct CalibrationWorkload: Codable, Sendable {
    let tasks: Int
    let inputTokens: Int
    let outputTokens: Int
    let cacheReadTokens: Int
    let cacheWriteTokens: Int
    let toolCalls: Int
    let contextTokens: Int
}
struct CalibrationMeasurement: Codable, Sendable {
    let kind: String
    let model: String
    let contextBand: String
    let `protocol`: String
    let startAt: Int64
    let endAt: Int64
    let resetsAt: Int64
    let startUsed: Double
    let endUsed: Double
    let resolutionPercent: Double
    let exclusive: Bool
    let complete: Bool
    let workload: CalibrationWorkload
}
struct CalibrationCandidate: Sendable {
    let scope: String
    let plan: String
    let measurements: [CalibrationMeasurement]
}
struct CalibrationSnapshot: Sendable {
    let reading: QuotaReading
    let accountDigest: String
}
struct CalibrationAuth: Equatable, Sendable {
    let accountDigest: String
    let subscription: String
}
struct CalibrationTaskUsage: Sendable {
    let input: Int
    let output: Int
    let cacheRead: Int
    let cacheWrite: Int
    var context: Int { input + cacheRead + cacheWrite }
}

enum CalibrationProtocol {
    static let name = "claude-sort-v1"
    static let model = "sonnet-4-5"
    static let cliModel = "claude-sonnet-4-5-20250929"
    static let systemPrompt = "You perform one deterministic sorting task. Return only the requested JSON. Do not use tools."
    static let numbers = (0..<512).map { ($0 * 73 + 19) % 1009 }
    static let prompt = "Sort this fixed list of integers in ascending numeric order. Preserve duplicates. Return only a JSON array of integers, without markdown or commentary.\n" + numbers.map(String.init).joined(separator: ",")
    static func digest(_ account: String) -> String {
        SHA256.hash(data: Data(account.trimmingCharacters(in: .whitespacesAndNewlines).lowercased().utf8)).map { String(format: "%02x", $0) }.joined()
    }
    static func number(_ raw: Any?, maximum: Int = 1_000_000_000) throws -> Int {
        guard let n = raw as? NSNumber, CFGetTypeID(n) != CFBooleanGetTypeID(), n.doubleValue.isFinite,
              n.doubleValue == n.doubleValue.rounded(), n.doubleValue >= 0, n.doubleValue <= Double(maximum) else {
            throw CalibrationFailure("Missing or invalid numeric workload metadata; nothing uploaded.")
        }
        return n.intValue
    }
    static func auth(_ data: Data) throws -> CalibrationAuth {
        guard data.count <= 1_048_576, let row = try JSONSerialization.jsonObject(with: data) as? [String: Any],
              row["loggedIn"] as? Bool == true, row["authMethod"] as? String == "claude.ai",
              row["apiProvider"] as? String == "firstParty", let email = row["email"] as? String, !email.isEmpty,
              let subscription = row["subscriptionType"] as? String, ["pro", "max"].contains(subscription) else {
            throw CalibrationFailure("A supported first-party Claude subscription sign-in is required. API-key/unknown authentication is not calibration evidence.")
        }
        return CalibrationAuth(accountDigest: digest(email), subscription: subscription)
    }
    static func snapshot(_ data: Data, now: Date) throws -> CalibrationSnapshot {
        let reading = try QuotaParser.parse(data, provider: .claude, now: now)
        guard !reading.lastKnown, !reading.stale(at: now), now.timeIntervalSince(reading.capturedAt) <= 60,
              reading.scopeKey != nil, let rows = try JSONSerialization.jsonObject(with: data) as? [[String: Any]],
              let row = rows.first(where: { $0["provider"] as? String == "claude" }), let usage = row["usage"] as? [String: Any] else {
            throw CalibrationFailure("Fresh, identified quota metadata is required; cached/unknown-account data is excluded.")
        }
        let identity = usage["identity"] as? [String: Any] ?? [:]
        guard let email = identity["accountEmail"] as? String ?? usage["accountEmail"] as? String, !email.isEmpty else {
            throw CalibrationFailure("The quota reader did not identify its account; nothing uploaded.")
        }
        return CalibrationSnapshot(reading: reading, accountDigest: digest(email))
    }
    static func task(_ data: Data) throws -> CalibrationTaskUsage {
        guard data.count <= 1_048_576, let row = try JSONSerialization.jsonObject(with: data) as? [String: Any],
              row["type"] as? String == "result", row["subtype"] as? String == "success", row["is_error"] as? Bool == false,
              try number(row["num_turns"]) == 1, let denied = row["permission_denials"] as? [Any], denied.isEmpty,
              let usage = row["usage"] as? [String: Any], let models = row["modelUsage"] as? [String: [String: Any]],
              models.count == 1, let model = models[cliModel], let result = row["result"] as? String,
              let bytes = result.trimmingCharacters(in: .whitespacesAndNewlines).data(using: .utf8),
              let array = try JSONSerialization.jsonObject(with: bytes) as? [Any], array.count == numbers.count else {
            throw CalibrationFailure("Claude did not return a single complete fixed-task result with supported model metadata.")
        }
        let output = try array.map { try number($0, maximum: 1009) }
        guard output == numbers.sorted(), try number(model["webSearchRequests"]) == 0 else {
            throw CalibrationFailure("The fixed task failed validation or used an unsupported server tool.")
        }
        let input = try number(usage["input_tokens"]), out = try number(usage["output_tokens"])
        let read = try number(usage["cache_read_input_tokens"]), write = try number(usage["cache_creation_input_tokens"])
        guard input == (try number(model["inputTokens"])), out == (try number(model["outputTokens"])),
              read == (try number(model["cacheReadInputTokens"])), write == (try number(model["cacheCreationInputTokens"])),
              out > 0, input + read + write > 0 else {
            throw CalibrationFailure("Incomplete or mixed-model token counters cannot be uploaded.")
        }
        if let server = usage["server_tool_use"] as? [String: Any] {
            for value in server.values { guard try number(value) == 0 else { throw CalibrationFailure("Server tool activity invalidates this task.") } }
        }
        return CalibrationTaskUsage(input: input, output: out, cacheRead: read, cacheWrite: write)
    }
    static func build(start: CalibrationSnapshot, end: CalibrationSnapshot, stable: CalibrationSnapshot,
                      auth: CalibrationAuth, finalAuth: CalibrationAuth, plan: String, tasks: [CalibrationTaskUsage],
                      lastTaskAt: Date, now: Date, exclusiveConfirmed: Bool) throws -> CalibrationCandidate {
        guard exclusiveConfirmed, !tasks.isEmpty, tasks.count <= 12,
              auth == finalAuth, auth.accountDigest == start.accountDigest, auth.accountDigest == end.accountDigest,
              auth.accountDigest == stable.accountDigest, start.reading.scopeKey == end.reading.scopeKey,
              end.reading.scopeKey == stable.reading.scopeKey,
              ["pro", "max_5x", "max_20x"].contains(plan), (plan == "pro" ? auth.subscription == "pro" : auth.subscription == "max"),
              end.reading.capturedAt >= lastTaskAt, stable.reading.capturedAt.timeIntervalSince(end.reading.capturedAt) >= 20,
              now.timeIntervalSince(stable.reading.capturedAt) <= 60 else {
            throw CalibrationFailure("Account, subscription, coverage or fresh quota continuity could not be established.")
        }
        let contexts = tasks.map(\.context).sorted(), context = contexts[contexts.count / 2]
        guard context <= 2_000_000, tasks.allSatisfy({ abs(Double($0.context) / Double(context) - 1) <= 0.05 }) else {
            throw CalibrationFailure("The fixed task's context changed; no comparable interval was produced.")
        }
        let workload = CalibrationWorkload(tasks: tasks.count, inputTokens: tasks.reduce(0) { $0 + $1.input }, outputTokens: tasks.reduce(0) { $0 + $1.output }, cacheReadTokens: tasks.reduce(0) { $0 + $1.cacheRead }, cacheWriteTokens: tasks.reduce(0) { $0 + $1.cacheWrite }, toolCalls: 0, contextTokens: context)
        guard [workload.inputTokens, workload.outputTokens, workload.cacheReadTokens, workload.cacheWriteTokens].allSatisfy({ $0 <= 1_000_000_000 }) else {
            throw CalibrationFailure("Workload counters exceed the supported safe range.")
        }
        let first = CommunityPayload.bucket(start.reading.capturedAt), last = CommunityPayload.bucket(stable.reading.capturedAt)
        guard last - first >= 300_000, last - first <= 3_600_000,
              Int64(now.timeIntervalSince1970 * 1000) - last <= 600_000 else {
            throw CalibrationFailure("The interval is too short, long or stale for a trustworthy measurement.")
        }
        var measurements: [CalibrationMeasurement] = []
        for a in start.reading.windows where ["primary", "secondary"].contains(a.key) {
            guard let minutes = a.durationMinutes, [300, 10080].contains(minutes),
                  let b = end.reading.windows.first(where: { $0.key == a.key && $0.durationMinutes == minutes }),
                  let c = stable.reading.windows.first(where: { $0.key == a.key && $0.durationMinutes == minutes }),
                  let reset = a.resetsAt, reset == b.resetsAt, reset == c.resetsAt,
                  reset > stable.reading.capturedAt, CommunityPayload.bucket(reset) > last, reset.timeIntervalSince(start.reading.capturedAt) <= Double(minutes * 60 + 300),
                  a.used.isFinite, b.used.isFinite, c.used.isFinite, a.used >= 5, c.used <= 90,
                  b.used == c.used else { continue }
            // The current reader does not attest finer resolution; use a conservative five-point bound.
            guard c.used - a.used >= 20 else { continue }
            measurements.append(CalibrationMeasurement(kind: minutes == 300 ? "five_hour" : "weekly", model: model,
                contextBand: context <= 16_000 ? "short" : context <= 64_000 ? "medium" : "long", protocol: name,
                startAt: first, endAt: last, resetsAt: CommunityPayload.bucket(reset), startUsed: a.used, endUsed: c.used,
                resolutionPercent: 5, exclusive: true, complete: true, workload: workload))
        }
        guard !measurements.isEmpty else {
            throw CalibrationFailure("No window had enough settled, uncensored quota movement (20 points required with conservative resolution). Nothing uploaded; do not run more work just to force a result.")
        }
        return CalibrationCandidate(scope: start.reading.scopeKey!, plan: plan, measurements: measurements)
    }
}

final class CalibrationCancellation: @unchecked Sendable {
    private let lock = NSLock()
    private var cancelled = false
    private var process: Process?
    var isCancelled: Bool { lock.lock(); defer { lock.unlock() }; return cancelled }
    func attach(_ value: Process?) {
        lock.lock(); process = value; let shouldStop = cancelled; lock.unlock()
        if shouldStop, let value { terminate(value) }
    }
    func cancel() { lock.lock(); cancelled = true; let value = process; lock.unlock(); if let value { terminate(value) } }
    private func terminate(_ value: Process) {
        if value.isRunning { value.terminate() }
        DispatchQueue.global().asyncAfter(deadline: .now() + 2) { if value.isRunning { Darwin.kill(value.processIdentifier, SIGKILL) } }
    }
    func check() throws { if isCancelled || Task.isCancelled { throw CancellationError() } }
}
private final class CalibrationOutput: @unchecked Sendable {
    private let lock = NSLock()
    private var bytes = Data()
    private var invalid = false
    func append(_ data: Data) -> Bool {
        lock.lock(); defer { lock.unlock() }
        guard bytes.count + data.count <= 1_048_576 else { invalid = true; return false }
        bytes.append(data); return true
    }
    func fail() { lock.lock(); invalid = true; lock.unlock() }
    func result() throws -> Data {
        lock.lock(); defer { lock.unlock() }
        guard !invalid else { throw CalibrationFailure("Calibration output was incomplete, oversized or timed out.") }
        return bytes
    }
}
struct CalibrationCommand: Sendable {
    enum Kind: Sendable { case auth, quota, task }
    let kind: Kind
    let executable: URL
    let arguments: [String]
    let environment: [String: String]
    let directory: URL
    static func run(_ command: CalibrationCommand, cancellation: CalibrationCancellation) async throws -> Data {
        try await withTaskCancellationHandler(operation: {
            try await Task.detached(priority: .utility) { try blockingRun(command, cancellation: cancellation) }.value
        }, onCancel: { cancellation.cancel() })
    }
    private static func blockingRun(_ command: CalibrationCommand, cancellation: CalibrationCancellation) throws -> Data {
        try cancellation.check()
        let process = Process(), pipe = Pipe()
        process.executableURL = command.executable; process.arguments = command.arguments
        process.environment = command.environment; process.currentDirectoryURL = command.directory
        process.standardInput = FileHandle.nullDevice; process.standardError = FileHandle.nullDevice; process.standardOutput = pipe
        try process.run(); cancellation.attach(process)
        let output = CalibrationOutput(), done = DispatchSemaphore(value: 0)
        let deadline = DispatchWorkItem { output.fail(); if process.isRunning { process.terminate(); DispatchQueue.global().asyncAfter(deadline: .now()+2) { if process.isRunning { Darwin.kill(process.processIdentifier, SIGKILL) } } } }
        DispatchQueue.global().asyncAfter(deadline: .now()+70, execute: deadline)
        DispatchQueue.global().async {
            while true {
                let chunk = pipe.fileHandleForReading.readData(ofLength: 65536)
                if chunk.isEmpty { break }
                if !output.append(chunk), process.isRunning { process.terminate() }
            }
            done.signal()
        }
        process.waitUntilExit(); deadline.cancel(); cancellation.attach(nil)
        if done.wait(timeout: .now()+2) != .success { output.fail() }
        try cancellation.check()
        guard process.terminationStatus == 0 else { throw CalibrationFailure("A local calibration command failed. No raw response was logged or uploaded.") }
        return try output.result()
    }
}
struct CalibrationConfiguration: Sendable {
    let cli: URL
    let reader: URL
    let directory: URL
    let config: URL
    let plan: String
    let taskLimit: Int
    let environment: [String: String]
    func command(_ kind: CalibrationCommand.Kind) -> CalibrationCommand {
        let arguments: [String]
        switch kind {
        case .auth: arguments = ["--safe-mode", "--setting-sources", "", "auth", "status", "--json"]
        case .quota: arguments = ["usage", "--provider", "claude", "--source", "cli", "--format", "json", "--json-only", "--no-color", "--web-timeout", "30"]
        case .task: arguments = ["--print", "--output-format", "json", "--model", CalibrationProtocol.cliModel,
            "--tools", "", "--strict-mcp-config", "--mcp-config", "{\"mcpServers\":{}}", "--safe-mode", "--restricted",
            "--setting-sources", "", "--settings", "{\"disableAllHooks\":true}", "--disable-slash-commands",
            "--no-session-persistence", "--no-chrome", "--effort", "low", "--system-prompt", CalibrationProtocol.systemPrompt, CalibrationProtocol.prompt]
        }
        return CalibrationCommand(kind: kind, executable: kind == .quota ? reader : cli, arguments: arguments, environment: environment, directory: directory)
    }
}
struct CalibrationEngine: Sendable {
    var now: @Sendable () -> Date = { Date() }
    var pause: @Sendable (TimeInterval) async throws -> Void = { seconds in if seconds > 0 { try await Task.sleep(nanoseconds: UInt64(seconds * 1_000_000_000)) } }
    var command: @Sendable (CalibrationCommand, CalibrationCancellation) async throws -> Data = { command, token in try await CalibrationCommand.run(command, cancellation: token) }
    func run(_ config: CalibrationConfiguration, cancellation: CalibrationCancellation,
             progress: @MainActor @Sendable (String) -> Void) async throws -> CalibrationCandidate {
        guard [6, 12].contains(config.taskLimit) else { throw CalibrationFailure("Unsupported bounded task limit.") }
        try cancellation.check()
        let auth = try CalibrationProtocol.auth(await command(config.command(.auth), cancellation))
        guard config.plan == "pro" ? auth.subscription == "pro" : ["max_5x", "max_20x"].contains(config.plan) && auth.subscription == "max" else {
            throw CalibrationFailure("The declared plan does not match the local Claude subscription.")
        }
        let start = try CalibrationProtocol.snapshot(await command(config.command(.quota), cancellation), now: now())
        guard start.accountDigest == auth.accountDigest else { throw CalibrationFailure("CLI and quota-reader accounts differ; no workload was started.") }
        let eligible = start.reading.windows.contains { [300, 10080].contains($0.durationMinutes ?? 0) && $0.used >= 5 && $0.used <= 70 && !$0.expired(at: now().addingTimeInterval(1200)) }
        guard eligible else { throw CalibrationFailure("No suitable nonempty quota window has enough safe headroom. No workload was started.") }
        var tasks: [CalibrationTaskUsage] = [], lastTask = now()
        let began = now()
        for index in 0..<config.taskLimit {
            try cancellation.check()
            await progress("Controlled task \(index+1) of \(config.taskLimit). Stop is always available.")
            tasks.append(try CalibrationProtocol.task(await command(config.command(.task), cancellation)))
            lastTask = now()
            // Fixed pacing bounds request rate and creates a measurable interval, not background polling.
            try await pause(max(0, began.addingTimeInterval(Double(index+1)*60).timeIntervalSince(now())))
        }
        try cancellation.check()
        await progress("Checking settled quota and account continuity. No further tasks will run.")
        let end = try CalibrationProtocol.snapshot(await command(config.command(.quota), cancellation), now: now())
        try await pause(30); try cancellation.check()
        let stable = try CalibrationProtocol.snapshot(await command(config.command(.quota), cancellation), now: now())
        let finalAuth = try CalibrationProtocol.auth(await command(config.command(.auth), cancellation))
        return try CalibrationProtocol.build(start: start, end: end, stable: stable, auth: auth, finalAuth: finalAuth,
            plan: config.plan, tasks: tasks, lastTaskAt: lastTask, now: now(), exclusiveConfirmed: true)
    }
}
