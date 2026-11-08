import Foundation

/// When a 5-hour or weekly window reaches 95%, Miso tells you about Relay once for that window, until it resets.
enum LimitNudge {
    static let threshold = 95.0
    /// The resume page gives the one-line command, never a pricing page.
    static let url = URL(string: "https://relayevals.com/resume?from=miso")!
    static let defaultsKey = "limitNudgeSent"

    struct Notice: Equatable {
        let id: String
        let title: String
        /// What Miso says first, in plain words, e.g. "I see your Claude 5-hour limit is almost used up."
        let line: String
        let url: URL
    }

    /// `sent` maps provider and window to the reset time already notified. Returns at most one notice for the reading,
    /// and the updated map with past resets dropped.
    static func evaluate(_ reading: QuotaReading, sent: [String: Double], now: Date) -> (notice: Notice?, sent: [String: Double]) {
        var next = sent.filter { $0.value > now.timeIntervalSince1970 }
        guard !reading.stale(at: now) else { return (nil, next) }
        var due: [(key: String, label: String, window: QuotaWindow)] = []
        for window in reading.available(at: now) where window.used.isFinite && window.used >= threshold {
            let label: String
            switch window.durationMinutes { case 300: label = "5-hour"; case 10080: label = "weekly"; default: continue }
            let key = "\(reading.provider.rawValue):\(label)"
            if next[key] != nil { continue }
            due.append((key, label, window))
            // Without a reported reset, wait one full window before suggesting it again.
            next[key] = (window.resetsAt ?? now.addingTimeInterval(Double(window.durationMinutes ?? 300) * 60)).timeIntervalSince1970
        }
        guard let top = due.max(by: { $0.window.used < $1.window.used }) else { return (nil, next) }
        let reached = top.window.used >= 100
        let used = reached ? "reached" : "at \(Int(top.window.used.rounded(.down)))%"
        let provider = reading.provider == .codex ? "Codex" : reading.provider.name
        return (Notice(id: "limit-\(top.key)-\(Int(next[top.key]!))",
                       title: "\(provider) \(top.label) limit \(used)",
                       line: "I see your \(provider) \(top.label) limit is \(reached ? "used up" : "almost used up").",
                       url: url), next)
    }
}
