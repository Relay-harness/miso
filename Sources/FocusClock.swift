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
    private var awakeUntil: Date?
    mutating func opened() { isInspecting = true; awakeUntil = nil }
    mutating func closed(at now: Date) {
        guard isInspecting else { return }
        isInspecting = false; awakeUntil = now.addingTimeInterval(Self.cooldown)
    }
    mutating func wakeManually() { manuallyAwake = true; awakeUntil = nil }
    mutating func napManually() { manuallyAwake = false; awakeUntil = nil }
    func isSleeping(at now: Date) -> Bool {
        !isInspecting && !manuallyAwake && !(awakeUntil.map { now < $0 } ?? false)
    }
}
