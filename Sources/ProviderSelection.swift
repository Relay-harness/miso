import Foundation

/// The two main providers are fixed. Optional providers are opt-in, canonical and duplicate-free.
struct ProviderSelection {
    static let required: [QuotaProvider] = [.codex, .claude]
    static let optional: [QuotaProvider] = [.gemini, .grok]
    private(set) var added: [QuotaProvider]

    init(saved: [String]? = nil) {
        added = Self.optional.filter { saved?.contains($0.rawValue) == true }
    }
    var providers: [QuotaProvider] { Self.required + added }
    func quotaRequests(allowGemini: Bool) -> [QuotaProvider] {
        providers.filter { $0 != .gemini || allowGemini }
    }
    @discardableResult
    mutating func setVisible(_ provider: QuotaProvider, _ visible: Bool) -> Bool {
        guard Self.optional.contains(provider), added.contains(provider) != visible else { return false }
        if visible { added.append(provider) } else { added.removeAll { $0 == provider } }
        added = Self.optional.filter { added.contains($0) }
        return true
    }
}
