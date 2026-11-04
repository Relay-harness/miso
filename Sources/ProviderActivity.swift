import AppKit
import Foundation

/// Detects actual provider processes only. It reads process names, never shell history,
/// prompts, usage logs, credentials, or provider account data.
final class ProviderActivityMonitor {
    private var lastCheck = Date.distantPast
    private(set) var active = false
    func refreshIfDue(now: Date = Date(), interval: TimeInterval = 10, changed: @escaping (Bool) -> Void) {
        guard now.timeIntervalSince(lastCheck) >= interval else { return }
        lastCheck = now
        DispatchQueue.global(qos: .utility).async { [weak self] in
            let running = Self.anyProviderRunning()
            DispatchQueue.main.async {
                guard let self else { return }
                if self.active != running { self.active = running; changed(running) }
            }
        }
    }
    static func anyProviderRunning() -> Bool {
        // `pgrep -x` matches only the executable basename. Do not inspect arguments.
        for name in ["claude", "codex", "Claude", "Codex"] where commandRunning(name) { return true }
        return NSWorkspace.shared.runningApplications.contains { app in
            let name = app.localizedName?.lowercased() ?? ""
            return name == "claude" || name == "codex"
        }
    }
    private static func commandRunning(_ name: String) -> Bool {
        let task = Process(); task.executableURL = URL(fileURLWithPath: "/usr/bin/pgrep")
        task.arguments = ["-x", name]; task.standardInput = FileHandle.nullDevice
        task.standardOutput = FileHandle.nullDevice; task.standardError = FileHandle.nullDevice
        do { try task.run(); task.waitUntilExit(); return task.terminationStatus == 0 } catch { return false }
    }
}
