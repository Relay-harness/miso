import Foundation
import CryptoKit
import Security

/// Explicitly opt-in, pseudonymous community transport. Provider credentials never enter this type.
struct CommunityWindow: Codable, Sendable {
    let kind: String
    let usedPercent: Int
    let resetsAt: Int64
}
struct CommunityReport: Codable, Sendable {
    let version: Int
    let publicKey: String
    let nonce: String
    let sentAt: Int64
    let provider: String
    let plan: String
    let series: String
    let observedAt: Int64
    let windows: [CommunityWindow]
}
enum CommunityPayload {
    /// Public dashboard. Users can still enter their own collector; nothing is sent without consent.
    static let defaultServer = "https://www.throttleindex.com"
    static func bucket(_ date: Date) -> Int64 { Int64(floor(date.timeIntervalSince1970 / 300)) * 300_000 }
    static func windows(_ reading: QuotaReading, now: Date) -> [CommunityWindow] {
        guard !reading.stale(at: now), reading.provider == .claude || reading.provider == .codex else { return [] }
        var seen = Set<String>()
        return reading.available(at: now).compactMap { window in
            guard ["primary", "secondary"].contains(window.key) else { return nil }
            let kind: String
            switch window.durationMinutes { case 300: kind = "five_hour"; case 10080: kind = "weekly"; default: return nil }
            guard !seen.contains(kind), window.used.isFinite, window.used >= 0, window.used <= 100,
                  let reset = window.resetsAt, bucket(reset) > Int64(now.timeIntervalSince1970 * 1000),
                  reset.timeIntervalSince(reading.capturedAt) <= Double((window.durationMinutes ?? 0) * 60 + 600) else { return nil }
            seen.insert(kind)
            // Floor, never round 99.9% up to an exhausted 100%.
            return CommunityWindow(kind: kind, usedPercent: Int(floor(window.used / 5)) * 5, resetsAt: bucket(reset))
        }
    }
    static func endpoint(_ text: String) -> URL? {
        guard let url = URL(string: text), let c = URLComponents(url: url, resolvingAgainstBaseURL: false),
              let host = c.host, !host.isEmpty, c.user == nil, c.password == nil, c.query == nil, c.fragment == nil,
              c.path.isEmpty || c.path == "/",
              c.scheme == "https" || (c.scheme == "http" && ["localhost", "127.0.0.1", "::1"].contains(host)) else { return nil }
        return url
    }
}
private final class CommunityRedirectBlocker: NSObject, URLSessionTaskDelegate, @unchecked Sendable {
    func urlSession(_ session: URLSession, task: URLSessionTask, willPerformHTTPRedirection response: HTTPURLResponse, newRequest request: URLRequest, completionHandler: @escaping (URLRequest?) -> Void) { completionHandler(nil) }
}
@MainActor
final class CommunitySharing {
    private let defaults: UserDefaults
    private let service = "org.relayharness.relay-cat.community"
    private let account = "signing-v1"
    private var generation = 0
    private var deleting = false
    private var lastBucket: [QuotaProvider: Int64] = [:]
    private var scopes: [QuotaProvider: String] = [:]
    private var series: [QuotaProvider: String] = [:]
    private var tasks: [QuotaProvider: Task<Void, Never>] = [:]
    private lazy var session: URLSession = {
        let config = URLSessionConfiguration.ephemeral
        config.httpCookieStorage = nil; config.httpShouldSetCookies = false
        config.urlCache = nil; config.requestCachePolicy = .reloadIgnoringLocalCacheData
        config.timeoutIntervalForRequest = 12; config.timeoutIntervalForResource = 15
        return URLSession(configuration: config, delegate: CommunityRedirectBlocker(), delegateQueue: nil)
    }()
    private(set) var status = "Sharing is off."
    var enabled: Bool { defaults.bool(forKey: "communitySharingEnabled") && defaults.integer(forKey: "communityConsentVersion") == 1 }
    var hasIdentity: Bool { defaults.bool(forKey: "communityIdentityCreated") }
    var endpoint: URL? { defaults.string(forKey: "communityServer").flatMap(CommunityPayload.endpoint) }
    init(defaults: UserDefaults = .standard) { self.defaults = defaults; if enabled { status = "Consent retained. Waiting for a fresh quota reading." } }
    func enable(server: URL, claudePlan: String, codexPlan: String) throws {
        guard !deleting, CommunityPayload.endpoint(server.absoluteString) != nil else { throw URLError(.badURL) }
        if hasIdentity, let previous = endpoint, previous.absoluteString != server.absoluteString { throw URLError(.badURL) }
        // Configure an identity only after consent. Never replace a retained deletion identity silently.
        _ = try key(create: true)
        defaults.set(server.absoluteString, forKey: "communityServer")
        defaults.set(claudePlan, forKey: "communityClaudePlan"); defaults.set(codexPlan, forKey: "communityCodexPlan")
        defaults.set(1, forKey: "communityConsentVersion"); defaults.set(true, forKey: "communitySharingEnabled")
        generation += 1; lastBucket.removeAll(); status = "Waiting for a fresh five-hour or weekly reading."
    }
    func stop() {
        defaults.set(false, forKey: "communitySharingEnabled"); generation += 1
        tasks.values.forEach { $0.cancel() }; tasks.removeAll(); lastBucket.removeAll()
        status = "Sharing stopped. Previously sent readings remain until deleted or expired."
    }
    private func key(create: Bool) throws -> Curve25519.Signing.PrivateKey {
        let query: [String: Any] = [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: service, kSecAttrAccount as String: account]
        var result: CFTypeRef?
        let code = SecItemCopyMatching(query.merging([kSecReturnData as String: true, kSecMatchLimit as String: kSecMatchLimitOne]) { _, new in new } as CFDictionary, &result)
        if code == errSecSuccess, let data = result as? Data { defaults.set(true, forKey: "communityIdentityCreated"); return try Curve25519.Signing.PrivateKey(rawRepresentation: data) }
        guard code == errSecItemNotFound, create else { throw NSError(domain: NSOSStatusErrorDomain, code: Int(code)) }
        let value = Curve25519.Signing.PrivateKey()
        let attributes = query.merging([kSecValueData as String: value.rawRepresentation, kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly]) { _, new in new }
        let saved = SecItemAdd(attributes as CFDictionary, nil)
        guard saved == errSecSuccess else { throw NSError(domain: NSOSStatusErrorDomain, code: Int(saved)) }
        defaults.set(true, forKey: "communityIdentityCreated")
        return value
    }
    func submit(_ reading: QuotaReading, now: Date = Date()) {
        guard enabled, let server = endpoint, tasks[reading.provider] == nil else { return }
        let windows = CommunityPayload.windows(reading, now: now)
        guard !windows.isEmpty else { status = "No fresh supported standard windows to share."; return }
        let bucket = CommunityPayload.bucket(reading.capturedAt)
        guard lastBucket[reading.provider] != bucket else { return }
        if let scope = reading.scopeKey, scopes[reading.provider] != scope {
            scopes[reading.provider] = scope; series[reading.provider] = UUID().uuidString
        }
        // Missing scope cannot support a longitudinal forecast: start a new series each time.
        if reading.scopeKey == nil || series[reading.provider] == nil { series[reading.provider] = UUID().uuidString }
        do {
            let identity = try key(create: false)
            let provider = reading.provider.rawValue
            let requestedPlan = defaults.string(forKey: reading.provider == .claude ? "communityClaudePlan" : "communityCodexPlan") ?? "unknown"
            let allowed = reading.provider == .claude ? ["unknown", "pro", "max", "team", "enterprise"] : ["unknown", "plus", "pro", "team", "enterprise"]
            let report = CommunityReport(version: 1, publicKey: identity.publicKey.rawRepresentation.base64EncodedString(), nonce: UUID().uuidString, sentAt: Int64(now.timeIntervalSince1970 * 1000), provider: provider, plan: allowed.contains(requestedPlan) ? requestedPlan : "unknown", series: series[reading.provider]!, observedAt: bucket, windows: windows)
            let data = try JSONEncoder().encode(report)
            var request = URLRequest(url: server.appendingPathComponent("v1/reports"))
            request.httpMethod = "POST"; request.httpBody = data
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.setValue(try identity.signature(for: data).base64EncodedString(), forHTTPHeaderField: "X-Miso-Signature")
            let token = generation
            lastBucket[reading.provider] = bucket
            tasks[reading.provider] = Task { [weak self] in
                guard let self else { return }
                do {
                    let (_, response) = try await session.data(for: request)
                    guard token == generation, enabled else { return }
                    let code = (response as? HTTPURLResponse)?.statusCode ?? 0
                    status = code == 202 ? "Signed quota reading accepted. Public cohorts need enough installations." : "Community server did not accept the reading (HTTP \(code))."
                } catch { if token == generation { status = "Community server unavailable. Local quota tracking is unaffected." } }
                if token == generation { tasks[reading.provider] = nil }
            }
        } catch { status = "Signing identity is unavailable. Stop sharing and check Keychain access." }
    }
    func deleteShared(completion: @escaping (Bool) -> Void) {
        guard !deleting else { completion(false); return }
        stop()
        guard let server = endpoint else { completion(false); return }
        do {
            let identity = try key(create: false)
            struct Deletion: Codable { let version: Int; let publicKey: String; let nonce: String; let sentAt: Int64; let action: String }
            let payload = Deletion(version: 1, publicKey: identity.publicKey.rawRepresentation.base64EncodedString(), nonce: UUID().uuidString, sentAt: Int64(Date().timeIntervalSince1970 * 1000), action: "delete")
            let data = try JSONEncoder().encode(payload)
            var request = URLRequest(url: server.appendingPathComponent("v1/reports"))
            request.httpMethod = "DELETE"; request.httpBody = data
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.setValue(try identity.signature(for: data).base64EncodedString(), forHTTPHeaderField: "X-Miso-Signature")
            deleting = true
            Task { [weak self] in
                guard let self else { completion(false); return }
                defer { deleting = false }
                do {
                    let (_, response) = try await session.data(for: request)
                    guard (response as? HTTPURLResponse)?.statusCode == 200 else { status = "Deletion not confirmed. Identity kept so you can retry."; completion(false); return }
                    let removed = SecItemDelete([kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: service, kSecAttrAccount as String: account] as CFDictionary)
                    guard removed == errSecSuccess || removed == errSecItemNotFound else { status = "Server readings deleted, but local identity could not be removed. Retry deletion."; completion(false); return }
                    defaults.set(false, forKey: "communityIdentityCreated"); status = "Shared readings deleted. Sharing is off."
                    completion(true)
                } catch { status = "Deletion not confirmed. Identity kept so you can retry."; completion(false) }
            }
        } catch { status = "Unable to read deletion identity."; completion(false) }
    }
}
