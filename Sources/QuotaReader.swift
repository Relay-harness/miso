import Foundation
import Darwin

struct ReaderResult: Sendable {
    let data: Data
    let exitCode: Int32
    let timedOut: Bool
    let tooLarge: Bool
}

enum QuotaReader {
    /// Keep the real macOS account identity for owner-CLI credential lookup, but never inherit API keys or tokens.
    static func environment(home: URL, config: URL, allowBrowserCookies: Bool, userName: String = NSUserName()) -> [String: String] {
        return ["HOME": home.path, "USER": userName, "LOGNAME": userName,
                "PATH": "\(home.path)/.local/bin:\(home.path)/.grok/bin:/opt/homebrew/opt/node@24/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin",
                "TMPDIR": NSTemporaryDirectory(), "LANG": "en_US.UTF-8", "NO_COLOR": "1",
                "CODEXBAR_CONFIG": config.path,
                "CODEXBAR_ALLOW_BROWSER_COOKIE_IMPORT": allowBrowserCookies ? "1" : "0"]
    }
    static func read(executable: URL, arguments: [String], environment: [String: String], directory: URL, timeout: TimeInterval = 70) async -> ReaderResult {
        await Task.detached(priority: .utility) {
            run(executable: executable, arguments: arguments, environment: environment, directory: directory, timeout: timeout)
        }.value
    }
    /// Run an argument-array command, never a shell. No raw responses or stderr are persisted.
    static func run(executable: URL, arguments: [String], environment: [String: String], directory: URL, timeout: TimeInterval = 70) -> ReaderResult {
        let process = Process()
        process.executableURL = executable
        process.arguments = arguments
        process.environment = environment
        process.currentDirectoryURL = directory
        let pipe = Pipe()
        process.standardOutput = pipe
        process.standardError = FileHandle.nullDevice
        process.standardInput = FileHandle.nullDevice
        let state = ReaderBuffer()
        let finishedReading = DispatchSemaphore(value: 0)
        do { try process.run() }
        catch { return ReaderResult(data: Data(), exitCode: -1, timedOut: false, tooLarge: false) }
        let deadline = DispatchWorkItem {
            if process.isRunning {
                state.markTimeout()
                process.terminate()
                DispatchQueue.global().asyncAfter(deadline: .now()+2) {
                    if process.isRunning { Darwin.kill(process.processIdentifier, SIGKILL) }
                }
            }
        }
        DispatchQueue.global().asyncAfter(deadline: .now()+timeout, execute: deadline)
        DispatchQueue.global().async {
            while true {
                let chunk = pipe.fileHandleForReading.readData(ofLength: 65536)
                if chunk.isEmpty { break }
                if !state.append(chunk), process.isRunning { process.terminate() }
            }
            finishedReading.signal()
        }
        process.waitUntilExit()
        deadline.cancel()
        // A misbehaving descendant must not hold this read forever.
        _ = finishedReading.wait(timeout: .now()+3)
        let result = state.result(exit: process.terminationStatus)
        return result
    }
}

private final class ReaderBuffer: @unchecked Sendable {
    private let lock = NSLock()
    private var data = Data()
    private var timedOut = false
    private var tooLarge = false
    func append(_ chunk: Data) -> Bool {
        lock.lock(); defer { lock.unlock() }
        if data.count + chunk.count > 4*1024*1024 { tooLarge = true; return false }
        data.append(chunk); return true
    }
    func markTimeout() { lock.lock(); timedOut = true; lock.unlock() }
    func result(exit: Int32) -> ReaderResult {
        lock.lock(); defer { lock.unlock() }
        return ReaderResult(data: data, exitCode: exit, timedOut: timedOut, tooLarge: tooLarge)
    }
}

struct QuotaFetch: Sendable {
    let provider: QuotaProvider
    let reading: QuotaReading?
    let problem: String?
}

@MainActor
final class QuotaStore {
    private let defaults: UserDefaults
    private(set) var readings: [QuotaProvider: QuotaReading] = [:]
    private(set) var problems: [QuotaProvider: String] = [:]
    private(set) var refreshing = false
    private(set) var connectingBrowser = false
    private(set) var history = QuotaHistory()
    private(set) var tokens: [QuotaProvider: TokenReading] = [:]
    private(set) var tokenProblems: [QuotaProvider: String] = [:]
    private(set) var readingTokens = false
    private var lastTokenAttempt = Date.distantPast
    private var tokenGeneration = 0
    var tokensEnabled: Bool { defaults.bool(forKey: "localTokenStatsEnabled") }
    var onChange: (() -> Void)?
    private var generation = 0
    private var lastAttempt = Date.distantPast
    var enabled: Bool { defaults.bool(forKey: "realQuotasEnabled") }
    var geminiBrowserAllowed: Bool { defaults.bool(forKey: "geminiBrowserAllowed") }
    private var providerSelection: ProviderSelection { ProviderSelection(saved: defaults.stringArray(forKey: "optionalQuotaProviders")) }
    var visibleProviders: [QuotaProvider] { providerSelection.providers }
    var quotaProvidersForRefresh: [QuotaProvider] { providerSelection.quotaRequests(allowGemini: geminiBrowserAllowed) }
    var displayedProvider: QuotaProvider {
        let stored = QuotaProvider(rawValue: defaults.string(forKey: "quotaInBar") ?? "claude") ?? .claude
        return visibleProviders.contains(stored) ? stored : .codex
    }
    var showInBar: Bool { defaults.object(forKey: "showQuotaInBar") as? Bool ?? true }

    init(defaults: UserDefaults = .standard) { self.defaults = defaults }
    func setEnabled(_ value: Bool) {
        generation += 1
        defaults.set(value, forKey: "realQuotasEnabled")
        if !value { defaults.set(false, forKey: "geminiBrowserAllowed") }
        lastAttempt = .distantPast
        readings.removeAll(); problems.removeAll(); history.clear()
        onChange?()
        if value { refresh() }
    }
    func setDisplayed(_ provider: QuotaProvider) {
        guard visibleProviders.contains(provider) else { return }
        defaults.set(provider.rawValue, forKey: "quotaInBar"); onChange?()
    }
    func setProviderVisible(_ provider: QuotaProvider, _ visible: Bool) {
        var selection = providerSelection
        guard selection.setVisible(provider, visible) else { return }
        generation += 1 // In-flight results from the old provider set cannot publish.
        defaults.set(selection.added.map(\.rawValue), forKey: "optionalQuotaProviders")
        if !visible {
            readings[provider] = nil; problems[provider] = nil
            history.clear(provider: provider)
        }
        // If the selected optional tab was removed, keep the bar and dashboard on the same valid tab.
        defaults.set(displayedProvider.rawValue, forKey: "quotaInBar")
        lastAttempt = .distantPast
        onChange?()
        if enabled { refresh() }
    }
    func toggleInBar() { defaults.set(!showInBar, forKey: "showQuotaInBar"); onChange?() }
    func revokeGemini() {
        generation += 1
        defaults.set(false, forKey: "geminiBrowserAllowed")
        readings[.gemini] = nil; problems[.gemini] = nil
        lastAttempt = .distantPast
        onChange?()
    }
    func refreshIfDue() {
        if enabled && Date().timeIntervalSince(lastAttempt) >= 300 { refresh() }
        if tokensEnabled && Date().timeIntervalSince(lastTokenAttempt) >= 300 { refreshTokens() }
    }
    func forecast(_ provider: QuotaProvider, window: QuotaWindow, now: Date) -> QuotaForecast? {
        guard problems[provider] == nil, let reading = readings[provider] else { return nil }
        return history.forecast(provider: provider, reading: reading, window: window, now: now)
    }
    func setTokensEnabled(_ enabled: Bool) {
        tokenGeneration += 1
        defaults.set(enabled, forKey: "localTokenStatsEnabled")
        tokens.removeAll(); tokenProblems.removeAll(); lastTokenAttempt = .distantPast
        if enabled { refreshTokens() }
        onChange?()
    }
    func refreshTokens() {
        guard tokensEnabled, !readingTokens else { return }
        let paths: (URL, URL, URL)
        do { paths = try locations() } catch { return }
        readingTokens = true; lastTokenAttempt = Date()
        let token = tokenGeneration
        let jobs = [QuotaProvider.claude, .codex].map { ($0, environment(config: paths.2, provider: $0)) }
        onChange?()
        Task {
            await withTaskGroup(of: (QuotaProvider, TokenReading?).self) { group in
                for (provider, env) in jobs {
                    group.addTask {
                        let result = await QuotaReader.read(executable: paths.0, arguments: ["cost", "--provider", provider.rawValue, "--days", "1", "--format", "json", "--json-only", "--no-color"], environment: env, directory: paths.1)
                        guard result.exitCode == 0, !result.timedOut, !result.tooLarge else { return (provider, nil) }
                        return (provider, try? TokenParser.parse(result.data, provider: provider, now: Date()))
                    }
                }
                for await (provider, reading) in group where token == tokenGeneration && tokensEnabled {
                    if var reading {
                        reading.ratePerMinute = TokenParser.rate(previous: tokens[provider], current: reading)
                        tokens[provider] = reading; tokenProblems[provider] = nil
                    } else { tokenProblems[provider] = "No supported local token totals for today." }
                    onChange?()
                }
            }
            readingTokens = false; onChange?()
        }
    }
    func headline(_ provider: QuotaProvider, at now: Date = Date()) -> String {
        guard enabled else { return "Not connected" }
        if provider == .gemini && !geminiBrowserAllowed { return "Browser permission needed" }
        if problems[provider] != nil { return "Unavailable" }
        if let reading = readings[provider] { return reading.headline(at: now) }
        return refreshing ? "Checking…" : "Unavailable"
    }
    func barText(at now: Date = Date()) -> String {
        guard enabled && showInBar else { return "" }
        let provider = displayedProvider
        guard problems[provider] == nil, let reading = readings[provider],
              let tightest = reading.available(at: now).max(by: { $0.used < $1.used }) else { return " \(provider.short) —" }
        return " \(provider.short) \(tightest.usedText) used"
    }
    private func locations() throws -> (URL, URL, URL) {
        guard let resources = Bundle.main.resourceURL else { throw CocoaError(.fileNoSuchFile) }
        let helper = resources.appendingPathComponent("QuotaReader/CodexBarCLI")
        let directory = FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent("Library/Application Support/Miso/QuotaReader", isDirectory: true)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true, attributes: [.posixPermissions: 0o700])
        let config = directory.appendingPathComponent("config.json")
        let providers: [[String: Any]] = QuotaProvider.allCases.map {
            ["id": $0.rawValue, "enabled": visibleProviders.contains($0), "source": $0.source,
             "cookieSource": $0 == .gemini && visibleProviders.contains(.gemini) && geminiBrowserAllowed ? "auto" : "off"]
        }
        let document: [String: Any] = ["version": 1, "providers": providers, "shareUsageWithCLI": false]
        try JSONSerialization.data(withJSONObject: document).write(to: config, options: [.atomic])
        try FileManager.default.setAttributes([.posixPermissions: 0o600], ofItemAtPath: config.path)
        return (helper, directory, config)
    }
    private func environment(config: URL, provider: QuotaProvider) -> [String: String] {
        // No inherited API keys, browser tokens, shell startup scripts, or custom account profiles.
        QuotaReader.environment(home: FileManager.default.homeDirectoryForCurrentUser, config: config,
            allowBrowserCookies: provider == .gemini && geminiBrowserAllowed)
    }
    func refresh() {
        guard enabled, !refreshing, !connectingBrowser else { return }
        let locations: (URL, URL, URL)
        do { locations = try self.locations() }
        catch { for p in QuotaProvider.allCases { problems[p] = "Quota reader is unavailable. Reinstall Miso." }; onChange?(); return }
        refreshing = true; lastAttempt = Date()
        let token = generation
        let jobs = quotaProvidersForRefresh.map { ($0, environment(config: locations.2, provider: $0)) }
        onChange?()
        Task {
            await withTaskGroup(of: QuotaFetch.self) { group in
                for (provider, env) in jobs {
                    group.addTask {
                        let result = await QuotaReader.read(executable: locations.0,
                            arguments: ["usage", "--provider", provider.rawValue, "--source", provider.source, "--format", "json", "--json-only", "--no-color", "--web-timeout", "30"],
                            environment: env, directory: locations.1)
                        if result.timedOut { return QuotaFetch(provider: provider, reading: nil, problem: "Request timed out. Retry or check sign-in.") }
                        if result.tooLarge { return QuotaFetch(provider: provider, reading: nil, problem: "Response was too large; no quota accepted.") }
                        // A nonzero command cannot publish a success-looking quota.
                        guard result.exitCode == 0 else { return QuotaFetch(provider: provider, reading: nil, problem: "No live quota returned. Check sign-in, access, or provider availability.") }
                        do { return QuotaFetch(provider: provider, reading: try QuotaParser.parse(result.data, provider: provider), problem: nil) }
                        catch { return QuotaFetch(provider: provider, reading: nil, problem: "No measured subscription quota in this response.") }
                    }
                }
                for await result in group {
                    if token == generation && enabled && visibleProviders.contains(result.provider) {
                        if let reading = result.reading {
                            readings[result.provider] = reading
                            history.observe(reading)
                        }
                        problems[result.provider] = result.problem
                        onChange?()
                    }
                }
            }
            refreshing = false; onChange?()
        }
    }
    func connectGeminiBrowser() {
        guard enabled, visibleProviders.contains(.gemini), !refreshing, !connectingBrowser else { return }
        defaults.set(true, forKey: "geminiBrowserAllowed")
        let locations: (URL, URL, URL)
        do { locations = try self.locations() }
        catch { problems[.gemini] = "Quota reader is unavailable."; onChange?(); return }
        connectingBrowser = true; onChange?()
        let env = environment(config: locations.2, provider: .gemini)
        Task {
            _ = await Task.detached {
                QuotaReader.run(executable: locations.0, arguments: ["cookie", "refresh", "--provider", "gemini", "--allow-keychain-prompt"], environment: env, directory: locations.1, timeout: 70)
            }.value
            connectingBrowser = false
            if enabled && geminiBrowserAllowed { refresh() }
            onChange?()
        }
    }
}
