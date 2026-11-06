import Foundation

enum FocusPhase: String { case idle, focus, rest }
enum FocusEvent { case focusFinished, breakFinished }

struct FocusClock {
    private(set) var phase: FocusPhase = .idle
    private(set) var deadline: Date?
    private(set) var pausedSeconds: Int?
    var isPaused: Bool { pausedSeconds != nil }
    var isRunning: Bool { phase != .idle }

    func remaining(at now: Date) -> Int {
        if let pausedSeconds { return pausedSeconds }
        guard let deadline else { return 0 }
        return max(0, Int(ceil(deadline.timeIntervalSince(now))))
    }
    mutating func start(minutes: Int, at now: Date) {
        phase = .focus
        pausedSeconds = nil
        deadline = now.addingTimeInterval(TimeInterval(max(1, minutes) * 60))
    }
    mutating func pause(at now: Date) {
        guard isRunning, !isPaused else { return }
        pausedSeconds = remaining(at: now)
        deadline = nil
    }
    mutating func resume(at now: Date) {
        guard let seconds = pausedSeconds else { return }
        pausedSeconds = nil
        deadline = now.addingTimeInterval(TimeInterval(seconds))
    }
    mutating func stop() {
        phase = .idle; deadline = nil; pausedSeconds = nil
    }
    mutating func tick(at now: Date) -> FocusEvent? {
        guard isRunning, !isPaused, remaining(at: now) == 0 else { return nil }
        if phase == .focus {
            phase = .rest
            deadline = now.addingTimeInterval(5 * 60)
            return .focusFinished
        }
        stop()
        return .breakFinished
    }
    func label(at now: Date) -> String {
        let seconds = remaining(at: now)
        return String(format: "%02d:%02d", seconds / 60, seconds % 60)
    }
}

/// Usage inspection temporarily wakes the cat. Explicit manual wake stays in effect until manual nap.
struct CatRestState {
    static let cooldown: TimeInterval = 2
    private(set) var isInspecting = false
    private(set) var manuallyAwake = false
    private(set) var manuallyNapped = false
    private var awakeUntil: Date?
    mutating func opened() { isInspecting = true; awakeUntil = nil }
    mutating func closed(at now: Date) {
        guard isInspecting else { return }
        isInspecting = false; awakeUntil = now.addingTimeInterval(Self.cooldown)
    }
    mutating func wakeManually() { manuallyAwake = true; manuallyNapped = false; awakeUntil = nil }
    mutating func napManually() { manuallyAwake = false; manuallyNapped = true; awakeUntil = nil }
    /// A nap lasts for the current Claude or Codex session; the next session wakes Miso again.
    mutating func providersStopped() { manuallyNapped = false }
    /// Miso is awake while Claude or Codex runs, so the cat itself shows whether it is tracking.
    func isSleeping(at now: Date, providerActive: Bool = false) -> Bool {
        !isInspecting && !manuallyAwake && !(awakeUntil.map { now < $0 } ?? false) && !(providerActive && !manuallyNapped)
    }
}

enum MisoStatus {
    /// Plain words for what Miso is doing right now.
    static func text(active: Set<QuotaProvider>, quotasEnabled: Bool) -> String {
        guard quotasEnabled else { return "Miso is running · quota access off" }
        switch (active.contains(.claude), active.contains(.codex)) {
        case (true, true): return "Miso is running · watching Claude and Codex"
        case (true, false): return "Miso is running · watching Claude"
        case (false, true): return "Miso is running · watching Codex"
        case (false, false): return "Miso is running · waiting for Claude or Codex"
        }
    }
}

enum LoginItemPolicy {
    /// Register once, and only from an installed copy: never from a build folder or test copy.
    /// After that the Open at login checkbox is the user's choice and is never overridden.
    static func shouldRegister(alreadyApplied: Bool, bundlePath: String, home: String) -> Bool {
        !alreadyApplied && (bundlePath.hasPrefix("/Applications/") || bundlePath.hasPrefix(home + "/Applications/"))
    }
}
