import Foundation
import CoreFoundation
import CryptoKit

enum QuotaProvider: String, CaseIterable, Sendable {
    case claude, codex, gemini, grok
    var name: String { switch self { case .claude: return "Claude"; case .codex: return "OpenAI · Codex"; case .gemini: return "Gemini app"; case .grok: return "Grok" } }
    var short: String { switch self { case .claude: return "C"; case .codex: return "O"; case .gemini: return "G"; case .grok: return "X" } }
    var source: String { switch self { case .claude: return "cli"; case .codex, .grok: return "oauth"; case .gemini: return "web" } }
    var dashboard: String { switch self {
    case .claude: return "https://claude.ai/settings/usage"
    case .codex: return "https://chatgpt.com/codex/settings/usage"
    case .gemini: return "https://gemini.google.com/usage"
    case .grok: return "https://grok.com/usage"
    } }
    var note: String { switch self {
    case .claude: return "Uses Claude Code's /usage through its signed-in CLI."
    case .codex: return "Codex subscription limits only; not all ChatGPT model limits."
    case .gemini: return "Gemini app limits; not Gemini API or Gemini CLI quota."
    case .grok: return "Provider-reported subscription windows; not xAI API credits."
    } }
}

struct QuotaWindow: Sendable {
    let title: String
    let used: Double
    let resetsAt: Date?
    var key: String = ""
    var durationMinutes: Int? = nil
    var remaining: Double { max(0, min(100, 100-used)) }
    var usedFraction: Double { used.isFinite ? max(0, min(1, used/100)) : 0 }
    var usedText: String {
        guard used.isFinite, used >= 0 else { return "—" }
        if used == 0 { return "0%" }
        if used < 0.1 { return "<0.1%" }
        if used >= 1000 { return "999%+" }
        let display = (used*10).rounded()/10
        // A rounded label must not claim exhaustion before the measured quota reaches 100%.
        if used < 100 && display >= 100 { return "<100%" }
        return String(format: display == display.rounded() ? "%.0f%%" : "%.1f%%", display)
    }
    func expired(at now: Date) -> Bool { resetsAt.map { $0 <= now } ?? false }
    var remainingText: String { remaining == 0 ? "0%" : remaining < 1 ? "<1%" : String(format: "%.0f%%", floor(remaining)) }
    func resetText(at now: Date) -> String {
        guard let resetsAt else { return "Reset time unavailable" }
        let seconds = resetsAt.timeIntervalSince(now)
        guard seconds > 0 else { return "Reset passed — refresh needed" }
        let minutes = max(1, Int(ceil(seconds/60)))
        if minutes >= 1440 { return "Resets in \(minutes/1440)d \((minutes%1440)/60)h" }
        if minutes >= 60 { return "Resets in \(minutes/60)h \(minutes%60)m" }
        return "Resets in \(minutes)m"
    }
}

struct QuotaReading: Sendable {
    let provider: QuotaProvider
    let capturedAt: Date
    let source: String
    let windows: [QuotaWindow]
    let lastKnown: Bool
    var scopeKey: String? = nil
    func stale(at now: Date) -> Bool { lastKnown || now.timeIntervalSince(capturedAt) > 600 || capturedAt.timeIntervalSince(now) > 60 }
    func available(at now: Date) -> [QuotaWindow] { stale(at: now) ? [] : windows.filter { !$0.expired(at: now) } }
    func headline(at now: Date) -> String {
        guard let window = available(at: now).max(by: { $0.used < $1.used }) else { return "Unavailable" }
        return "\(window.usedText) used · \(window.title)"
    }
}

enum QuotaDecodeError: Error { case invalidJSON, missingProvider, providerError, noMeasuredQuota, missingTimestamp }

enum QuotaParser {
    static func parse(_ data: Data, provider: QuotaProvider, now: Date = Date()) throws -> QuotaReading {
        guard data.count <= 4*1024*1024,
              let array = try JSONSerialization.jsonObject(with: data) as? [[String: Any]] else { throw QuotaDecodeError.invalidJSON }
        // Never merge accounts or accept another provider's result.
        let matches = array.filter { $0["provider"] as? String == provider.rawValue }
        guard matches.count == 1, let row = matches.first else { throw QuotaDecodeError.missingProvider }
        if let error = row["error"], !(error is NSNull) { throw QuotaDecodeError.providerError }
        guard let usage = row["usage"] as? [String: Any] else { throw QuotaDecodeError.noMeasuredQuota }
        guard let captured = date(usage["updatedAt"]), captured.timeIntervalSince(now) <= 60 else { throw QuotaDecodeError.missingTimestamp }
        let labels = row["rateWindowLabels"] as? [String: String] ?? [:]
        var windows: [QuotaWindow] = []
        for key in ["primary", "secondary", "tertiary"] {
            if let value = window(usage[key], label: labels[key], key: key) { windows.append(value) }
        }
        for extra in usage["extraRateWindows"] as? [[String: Any]] ?? [] {
            if extra["usageKnown"] as? Bool != false,
               let value = window(extra["window"], label: extra["title"] as? String ?? extra["label"] as? String, key: extra["id"] as? String ?? "extra") { windows.append(value) }
        }
        guard !windows.isEmpty else { throw QuotaDecodeError.noMeasuredQuota }
        let diagnostic = (row["diagnostic"] as? String)?.isEmpty == false
        let cached = row["source"] as? String == "codexbar-app"
        return QuotaReading(provider: provider, capturedAt: captured, source: clean(row["source"] as? String ?? "provider"), windows: windows, lastKnown: diagnostic || cached, scopeKey: scope(usage, provider: provider))
    }
    private static func window(_ raw: Any?, label: String?, key: String) -> QuotaWindow? {
        guard let row = raw as? [String: Any], row["isSyntheticPlaceholder"] as? Bool != true,
              let number = row["usedPercent"] as? NSNumber,
              CFGetTypeID(number) != CFBooleanGetTypeID(), number.doubleValue.isFinite,
              number.doubleValue >= 0 else { return nil }
        let minutes = row["windowMinutes"] as? Int
        let fallback: String
        if let minutes, minutes > 0 { fallback = minutes % 1440 == 0 ? "\(minutes/1440)-day" : minutes % 60 == 0 ? "\(minutes/60)-hour" : "\(minutes)-minute" }
        else { fallback = "Provider window" }
        let supplied = row["title"] as? String ?? label
        let title = supplied.flatMap { $0.isEmpty ? nil : $0 } ?? fallback
        return QuotaWindow(title: clean(title), used: number.doubleValue, resetsAt: date(row["resetsAt"]), key: key, durationMinutes: minutes)
    }
    private static func scope(_ usage: [String: Any], provider: QuotaProvider) -> String? {
        let identity = usage["identity"] as? [String: Any] ?? [:]
        let account = identity["accountID"] as? String ?? identity["accountEmail"] as? String ?? usage["accountEmail"] as? String
        guard let account, !account.isEmpty else { return nil }
        let organization = identity["accountOrganization"] as? String ?? usage["accountOrganization"] as? String ?? ""
        // Retain only an in-memory digest, never the account identifier itself.
        let plan = identity["loginMethod"] as? String ?? usage["loginMethod"] as? String ?? ""
        let material = (try? JSONSerialization.data(withJSONObject: [provider.rawValue, account, organization, plan])) ?? Data()
        return SHA256.hash(data: material).map { String(format: "%02x", $0) }.joined()
    }
    static func date(_ raw: Any?) -> Date? {
        guard let text = raw as? String else { return nil }
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let result = f.date(from: text) { return result }
        f.formatOptions = [.withInternetDateTime]
        return f.date(from: text)
    }
    private static func clean(_ text: String) -> String {
        String(text.unicodeScalars.filter { !CharacterSet.controlCharacters.contains($0) }.prefix(64))
    }
}
