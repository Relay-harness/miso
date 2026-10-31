import Foundation

struct QuotaSample: Sendable {
    let at: Date
    let used: Double
}
struct QuotaForecast: Sendable {
    let title: String
    let detail: String
    let urgent: Bool
    let secondsToLimit: TimeInterval?
}
struct QuotaHistory {
    private struct Series {
        let scope: String
        let reset: Date
        var samples: [QuotaSample]
    }
    private var series: [String: Series] = [:]
    mutating func clear() { series.removeAll() }
    mutating func clear(provider: QuotaProvider) {
        let prefix = provider.rawValue + ":"
        series = series.filter { !$0.key.hasPrefix(prefix) }
    }
    mutating func observe(_ reading: QuotaReading) {
        let prefix = reading.provider.rawValue + ":"
        guard !reading.lastKnown, let scope = reading.scopeKey else {
            series = series.filter { !$0.key.hasPrefix(prefix) }; return
        }
        // Switching account or losing a previously present lane invalidates that lane's history.
        let validKeys = Set(reading.windows.map { prefix + $0.key })
        series = series.filter { !$0.key.hasPrefix(prefix) || validKeys.contains($0.key) }
        for window in reading.windows {
            let key = prefix + window.key
            guard !window.key.isEmpty, reading.windows.filter({ $0.key == window.key }).count == 1 else { series[key] = nil; continue }
            guard let reset = window.resetsAt, reset > reading.capturedAt else { series[key] = nil; continue }
            let sample = QuotaSample(at: reading.capturedAt, used: window.used)
            if var current = series[key], current.scope == scope, abs(current.reset.timeIntervalSince(reset)) <= 30,
               let last = current.samples.last, sample.at > last.at,
               sample.at.timeIntervalSince(last.at) <= 900, sample.used >= last.used {
                current.samples.append(sample)
                current.samples = Array(current.samples.filter { sample.at.timeIntervalSince($0.at) <= 3600 }.suffix(48))
                series[key] = current
            } else if series[key]?.samples.last?.at != sample.at || series[key]?.scope != scope || series[key]?.samples.last?.used != sample.used || series[key].map({ abs($0.reset.timeIntervalSince(reset)) > 30 }) == true {
                series[key] = Series(scope: scope, reset: reset, samples: [sample])
            }
        }
    }
    func forecast(provider: QuotaProvider, reading: QuotaReading, window: QuotaWindow, now: Date) -> QuotaForecast {
        guard !reading.stale(at: now), !window.expired(at: now) else {
            return QuotaForecast(title: "Refresh needed", detail: "No estimate from stale or expired quota.", urgent: false, secondsToLimit: nil)
        }
        guard reading.scopeKey != nil else {
            return QuotaForecast(title: "Collecting data", detail: "A stable account identity is needed for a safe estimate.", urgent: window.used >= 80, secondsToLimit: nil)
        }
        let samples = series[provider.rawValue + ":" + window.key]?.samples ?? []
        return Self.estimate(samples: samples, window: window, now: now)
    }
    static func estimate(samples: [QuotaSample], window: QuotaWindow, now: Date) -> QuotaForecast {
        if window.expired(at: now) { return QuotaForecast(title: "Refresh needed", detail: "The reset passed; refresh actual quota.", urgent: false, secondsToLimit: nil) }
        if window.remaining == 0 { return QuotaForecast(title: "Limit reached", detail: window.resetText(at: now), urgent: true, secondsToLimit: 0) }
        guard let reset = window.resetsAt else { return QuotaForecast(title: "Reset time unavailable", detail: "Cannot compare your pace with the reset.", urgent: window.used >= 80, secondsToLimit: nil) }
        guard samples.count >= 3, let first = samples.first, let last = samples.last,
              last.at > first.at, last.at.timeIntervalSince(first.at) >= 300,
              now.timeIntervalSince(last.at) <= 600, last.at <= now else {
            return QuotaForecast(title: "Collecting data", detail: "Needs 3 fresh samples over about 10 minutes.", urgent: window.used >= 80, secondsToLimit: nil)
        }
        for index in 1..<samples.count {
            if samples[index].used < samples[index-1].used || samples[index].at <= samples[index-1].at || samples[index].at.timeIntervalSince(samples[index-1].at) > 900 {
                return QuotaForecast(title: "Collecting data", detail: "Usage changed or a sample gap broke the trend.", urgent: window.used >= 80, secondsToLimit: nil)
            }
        }
        let delta = last.used-first.used
        guard delta >= 0.5 else { return QuotaForecast(title: "No clear burn yet", detail: "Quota has not moved enough to estimate a limit time.", urgent: window.used >= 80, secondsToLimit: nil) }
        // End-to-end observed quota slope, not API token prices or guessed subscription weights.
        let rate = delta / last.at.timeIntervalSince(first.at)
        let predictedHit = last.at.addingTimeInterval(window.remaining / rate)
        let seconds = predictedHit.timeIntervalSince(now)
        guard seconds > 0 else {
            return QuotaForecast(title: "Estimate overdue — refresh", detail: "A new provider reading is needed; exhaustion is not confirmed.", urgent: true, secondsToLimit: nil)
        }
        let minutes = max(1, Int(ceil(seconds/60)))
        let duration = minutes >= 1440 ? "\(minutes/1440)d \((minutes%1440)/60)h" : minutes >= 60 ? "\(minutes/60)h \(minutes%60)m" : "\(minutes)m"
        let span = max(1, Int(last.at.timeIntervalSince(first.at)/60))
        let hitBeforeReset = seconds < reset.timeIntervalSince(now)
        return QuotaForecast(title: hitBeforeReset ? "At this pace: ~\(duration) left" : "On track until reset",
            detail: "Estimate from \(span)m of quota changes · \(String(format: "%.1f", rate*3600))% / hour.",
            urgent: window.used >= 80 || hitBeforeReset && seconds < 3600, secondsToLimit: seconds)
    }
}

struct TokenReading: Sendable {
    let day: String
    let input: Double
    let output: Double
    let capturedAt: Date
    var ratePerMinute: Double? = nil
}
enum TokenParser {
    static func day(at now: Date) -> String {
        let f = DateFormatter(); f.locale = Locale(identifier: "en_US_POSIX"); f.dateFormat = "yyyy-MM-dd"
        return f.string(from: now)
    }
    static func parse(_ data: Data, provider: QuotaProvider, now: Date) throws -> TokenReading {
        guard data.count <= 4*1024*1024,
              let rows = try JSONSerialization.jsonObject(with: data) as? [[String: Any]],
              rows.filter({ $0["provider"] as? String == provider.rawValue }).count == 1,
              let row = rows.first(where: { $0["provider"] as? String == provider.rawValue }),
              row["error"] == nil || row["error"] is NSNull,
              row["historyCoverageIsEstablished"] as? Bool != false,
              let days = row["daily"] as? [[String: Any]],
              days.filter({ $0["date"] as? String == day(at: now) }).count == 1,
              let today = days.first(where: { $0["date"] as? String == day(at: now) }),
              (today["incompleteRequestCount"] as? Int ?? 0) == 0,
              let input = number(today["inputTokens"]), let output = number(today["outputTokens"]) else { throw QuotaDecodeError.noMeasuredQuota }
        return TokenReading(day: day(at: now), input: input, output: output, capturedAt: now)
    }
    private static func number(_ value: Any?) -> Double? {
        guard let value = value as? NSNumber, String(cString: value.objCType) != "c" else { return nil }
        let n = value.doubleValue
        return n.isFinite && n >= 0 && n <= 9_007_199_254_740_991 && n.rounded() == n ? n : nil
    }
    static func rate(previous: TokenReading?, current: TokenReading) -> Double? {
        guard let previous, previous.day == current.day, current.input >= previous.input, current.output >= previous.output else { return nil }
        let span = current.capturedAt.timeIntervalSince(previous.capturedAt)
        guard span >= 60 && span <= 900 else { return nil }
        return ((current.input-previous.input)+(current.output-previous.output))/span*60
    }
}
