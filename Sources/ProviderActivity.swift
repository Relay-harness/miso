import AppKit
import Foundation

/// Detects actual provider processes only. It reads process names, never shell history,
/// prompts, usage logs, credentials, or provider account data.
final class ProviderActivityMonitor {
    private var lastCheck = Date.distantPast
    private(set) var activeProviders: Set<QuotaProvider> = []
    var active: Bool { !activeProviders.isEmpty }
    func refreshIfDue(now: Date = Date(), interval: TimeInterval = 10, changed: @escaping (Set<QuotaProvider>) -> Void) {
        guard now.timeIntervalSince(lastCheck) >= interval else { return }
        lastCheck = now
        DispatchQueue.global(qos: .utility).async { [weak self] in
            let running = Self.runningProviders()
            DispatchQueue.main.async {
                guard let self else { return }
                if self.activeProviders != running { self.activeProviders = running; changed(running) }
            }
        }
    }
    static func runningProviders() -> Set<QuotaProvider> {
        var result: Set<QuotaProvider> = []
        if commandRunning("claude") || commandRunning("Claude") { result.insert(.claude) }
        if commandRunning("codex") || commandRunning("Codex") { result.insert(.codex) }
        for app in NSWorkspace.shared.runningApplications {
            if app.localizedName?.lowercased() == "claude" { result.insert(.claude) }
            if app.localizedName?.lowercased() == "codex" { result.insert(.codex) }
        }
        return result
    }
    func reset() { lastCheck = .distantPast; activeProviders = [] }
    private static func commandRunning(_ name: String) -> Bool {
        let task = Process(); task.executableURL = URL(fileURLWithPath: "/usr/bin/pgrep")
        task.arguments = ["-x", name]; task.standardInput = FileHandle.nullDevice
        task.standardOutput = FileHandle.nullDevice; task.standardError = FileHandle.nullDevice
        do { try task.run(); task.waitUntilExit(); return task.terminationStatus == 0 } catch { return false }
    }
}
