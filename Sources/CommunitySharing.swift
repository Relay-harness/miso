import Foundation
import CryptoKit
import Security
import LocalAuthentication
import Darwin

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
    static let defaultServer = "https://api.throttleindex.com"
    static func bucket(_ date: Date) -> Int64 { Int64(floor(date.timeIntervalSince1970 / 300)) * 300_000 }
    /// Reset times round UP so a window in its final five minutes is not dropped as already reset.
    static func resetBucket(_ date: Date) -> Int64 { Int64(ceil(date.timeIntervalSince1970 / 300)) * 300_000 }
    static func windows(_ reading: QuotaReading, now: Date) -> [CommunityWindow] {
        guard !reading.stale(at: now), reading.provider == .claude || reading.provider == .codex else { return [] }
        var seen = Set<String>()
        return reading.available(at: now).compactMap { window in
            guard ["primary", "secondary"].contains(window.key) else { return nil }
            let kind: String
            switch window.durationMinutes { case 300: kind = "five_hour"; case 10080: kind = "weekly"; default: return nil }
            guard !seen.contains(kind), window.used.isFinite, window.used >= 0, window.used <= 100,
                  let reset = window.resetsAt, resetBucket(reset) > Int64(now.timeIntervalSince1970 * 1000),
                  reset.timeIntervalSince(reading.capturedAt) <= Double((window.durationMinutes ?? 0) * 60 + 600),
                  // Mirror the collector's rule on the rounded values, so a report is never sent only to be rejected.
                  resetBucket(reset) - bucket(reading.capturedAt) <= Int64((window.durationMinutes ?? 0) * 60_000 + 600_000) else { return nil }
            seen.insert(kind)
            // Floor, never round 99.9% up to an exhausted 100%.
            return CommunityWindow(kind: kind, usedPercent: Int(floor(window.used / 5)) * 5, resetsAt: resetBucket(reset))
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

/// Own reporting identity only. Never accesses a provider's credentials.
struct CommunityIdentityStore {
    let file: URL
    var legacy: () throws -> Data? = {
        let context = LAContext(); context.interactionNotAllowed = true
        let query: [String: Any] = [kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: "org.relayharness.relay-cat.community", kSecAttrAccount as String: "signing-v1",
            kSecReturnData as String: true, kSecMatchLimit as String: kSecMatchLimitOne,
            kSecUseAuthenticationContext as String: context]
        var result: CFTypeRef?
        let code = SecItemCopyMatching(query as CFDictionary, &result)
        if code == errSecItemNotFound { return nil }
        guard code == errSecSuccess, let data = result as? Data else {
            throw NSError(domain: "MisoIdentity", code: Int(code), userInfo: [NSLocalizedDescriptionKey:
                "Legacy reporting key needs recovery. No password prompt was opened. Reporting is paused for this identity."])
        }
        return data
    }
    func load(create: Bool) throws -> Curve25519.Signing.PrivateKey {
        let manager = FileManager.default
        if manager.fileExists(atPath: file.path) {
            let attributes = try manager.attributesOfItem(atPath: file.path)
            guard attributes[.type] as? FileAttributeType == .typeRegular else { throw CocoaError(.fileReadNoPermission) }
            try manager.setAttributes([.posixPermissions: 0o600], ofItemAtPath: file.path)
            return try Curve25519.Signing.PrivateKey(rawRepresentation: Data(contentsOf: file))
        }
        guard create else { throw CocoaError(.fileNoSuchFile) }
        let value: Curve25519.Signing.PrivateKey
        if let bytes = try legacy() { value = try Curve25519.Signing.PrivateKey(rawRepresentation: bytes) }
        else { value = Curve25519.Signing.PrivateKey() }
        try manager.createDirectory(at: file.deletingLastPathComponent(), withIntermediateDirectories: true,
                                    attributes: [.posixPermissions: 0o700])
        let fd = open(file.path, O_WRONLY | O_CREAT | O_EXCL | O_NOFOLLOW, S_IRUSR | S_IWUSR)
        guard fd >= 0 else { throw CocoaError(.fileWriteNoPermission) }
        let handle = FileHandle(fileDescriptor: fd, closeOnDealloc: true)
        do { try handle.write(contentsOf: value.rawRepresentation); try handle.synchronize(); try handle.close() }
        catch { try? handle.close(); try? manager.removeItem(at: file); throw error }
        return value
    }
}

@MainActor
final class CommunitySharing {
    private let defaults: UserDefaults
    private var generation = 0
    private var deleting = false
    /// Bucket plus rounded windows of the last accepted report. Re-sending inside a bucket is allowed only when the
    /// coarse 5% usage actually moved; the collector replaces that bucket's reading, so this never adds a vote.
    private var lastSent: [QuotaProvider: String] = [:]
    private var scopes: [QuotaProvider: String] = [:]
    private var series: [QuotaProvider: String] = [:]
    private var unscopedBucket: [QuotaProvider: Int64] = [:]
    private var taskIDs: [QuotaProvider: UUID] = [:]
    private var tasks: [QuotaProvider: Task<Void, Never>] = [:]
    private let session: URLSession
    private let retryDelays: [UInt64]
    static func session() -> URLSession {
        let config = URLSessionConfiguration.ephemeral
        config.httpCookieStorage = nil; config.httpShouldSetCookies = false
        config.urlCache = nil; config.requestCachePolicy = .reloadIgnoringLocalCacheData
        config.timeoutIntervalForRequest = 12; config.timeoutIntervalForResource = 15
        return URLSession(configuration: config, delegate: CommunityRedirectBlocker(), delegateQueue: nil)
    }
    private(set) var status = "Sharing is off."
    var enabled: Bool { defaults.bool(forKey: "communitySharingEnabled") && defaults.integer(forKey: "communityConsentVersion") == 1 }
    var hasIdentity: Bool { FileManager.default.fileExists(atPath: identityURL.path) }
    private let identityStore: CommunityIdentityStore
    private var identityURL: URL { identityStore.file }
    var onChange: (() -> Void)?
    private(set) var providerStatus: [QuotaProvider: String] = [:]
    func lastAccepted(_ provider: QuotaProvider) -> Date? { defaults.object(forKey: "communityAccepted-" + provider.rawValue) as? Date }
    var endpoint: URL? {
        // Consent always writes a server; if that key is lost, fall back to the documented default instead of silently never sending.
        guard let saved = defaults.string(forKey: "communityServer")?.trimmingCharacters(in: .whitespacesAndNewlines), !saved.isEmpty
        else { return enabled ? CommunityPayload.endpoint(CommunityPayload.defaultServer) : nil }
        // Both public roots route to the same operator/identity. Custom collectors are untouched.
        return CommunityPayload.endpoint(saved == "https://www.throttleindex.com" || saved == "https://www.throttleindex.com/" ? CommunityPayload.defaultServer : saved)
    }
    init(defaults: UserDefaults = .standard, identityStore: CommunityIdentityStore? = nil, session: URLSession? = nil,
         retryDelays: [UInt64] = [2_000_000_000, 5_000_000_000, 15_000_000_000]) {
        self.defaults = defaults; self.session = session ?? Self.session(); self.retryDelays = retryDelays
        self.identityStore = identityStore ?? CommunityIdentityStore(file: FileManager.default.homeDirectoryForCurrentUser
            .appendingPathComponent("Library/Application Support/Relay Cat/Community/signing-v1.key"))
        if enabled { status = "Waiting for a fresh quota reading. Last acknowledgement is shown per provider." }
    }
    private func setStatus(_ text: String, provider: QuotaProvider) {
        status = text; providerStatus[provider] = text; onChange?()
    }
    func pauseUploads() { generation += 1; tasks.values.forEach { $0.cancel() }; tasks.removeAll(); taskIDs.removeAll(); onChange?() }

    func enable(server: URL, claudePlan: String, codexPlan: String) throws {
        guard !deleting, CommunityPayload.endpoint(server.absoluteString) != nil else { throw URLError(.badURL) }
        if hasIdentity || defaults.bool(forKey: "communityIdentityCreated"), let previous = endpoint, previous.absoluteString != server.absoluteString { throw URLError(.badURL) }
        // Configure an identity only after consent. Never replace a retained deletion identity silently.
        _ = try key(create: true)
        defaults.set(server.absoluteString, forKey: "communityServer")
        defaults.set(claudePlan, forKey: "communityClaudePlan"); defaults.set(codexPlan, forKey: "communityCodexPlan")
        defaults.set(1, forKey: "communityConsentVersion"); defaults.set(true, forKey: "communitySharingEnabled")
        pauseUploads(); lastSent.removeAll(); status = "Waiting for a fresh five-hour or weekly reading."
    }
    func stop() {
        defaults.set(false, forKey: "communitySharingEnabled"); generation += 1
        tasks.values.forEach { $0.cancel() }; tasks.removeAll(); taskIDs.removeAll(); lastSent.removeAll()
        status = "Sharing stopped. Previously sent readings remain until deleted or expired."; onChange?()
    }
    private func key(create: Bool) throws -> Curve25519.Signing.PrivateKey {
        if defaults.bool(forKey: "legacyReportingDeletionConfirmed"), !hasIdentity {
            return try CommunityIdentityStore(file: identityURL, legacy: { nil }).load(create: create)
        }
        return try identityStore.load(create: create)
    }
    func submit(_ reading: QuotaReading, now: Date = Date()) {
        guard enabled, let server = endpoint, tasks[reading.provider] == nil else { return }
        let windows = CommunityPayload.windows(reading, now: now)
        guard !windows.isEmpty else { status = "No fresh supported standard windows to share."; return }
        let bucket = CommunityPayload.bucket(reading.capturedAt)
        let sentKey = "\(bucket)|" + windows.map { "\($0.kind):\($0.usedPercent):\($0.resetsAt)" }.joined(separator: ",")
        guard lastSent[reading.provider] != sentKey else { return }
        if let scope = reading.scopeKey, scopes[reading.provider] != scope {
            scopes[reading.provider] = scope; series[reading.provider] = UUID().uuidString
        }
        // Missing scope cannot support a longitudinal forecast: start a new series for each five-minute bucket.
        // Within one bucket it stays the same, so a rising reading can replace that bucket's row instead of a 409.
        if series[reading.provider] == nil || (reading.scopeKey == nil && unscopedBucket[reading.provider] != bucket) {
            series[reading.provider] = UUID().uuidString
        }
        unscopedBucket[reading.provider] = reading.scopeKey == nil ? bucket : nil
        do {
            let identity = try key(create: true)
            let provider = reading.provider.rawValue
            let requestedPlan = defaults.string(forKey: reading.provider == .claude ? "communityClaudePlan" : "communityCodexPlan") ?? "unknown"
            let allowed = reading.provider == .claude ? ["unknown", "pro", "max", "team", "enterprise"] : ["unknown", "plus", "pro", "team", "enterprise"]
            let report = CommunityReport(version: 1, publicKey: identity.publicKey.rawRepresentation.base64EncodedString(), nonce: UUID().uuidString, sentAt: Int64(now.timeIntervalSince1970 * 1000), provider: provider, plan: allowed.contains(requestedPlan) ? requestedPlan : "unknown", series: series[reading.provider]!, observedAt: bucket, windows: windows)
            let data = try JSONEncoder().encode(report)
            var request = URLRequest(url: server.appendingPathComponent("v1/reports"))
            request.httpMethod = "POST"; request.httpBody = data
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.setValue(try identity.signature(for: data).base64EncodedString(), forHTTPHeaderField: "X-Miso-Signature")
            let token = generation, id = UUID()
            taskIDs[reading.provider] = id
            setStatus("Sending quota report…", provider: reading.provider)
            tasks[reading.provider] = Task { [weak self] in
                guard let self else { return }
                defer { if taskIDs[reading.provider] == id { tasks[reading.provider] = nil; taskIDs[reading.provider] = nil } }
                for attempt in 0...retryDelays.count {
                    guard !Task.isCancelled, token == generation, enabled else { return }
                    guard !CommunityPayload.windows(reading, now: Date()).isEmpty else {
                        setStatus("Reading expired before delivery. Waiting for a fresh one.", provider: reading.provider); return
                    }
                    // Refresh request time/signature on retry; observation identity/data stay unchanged.
                    let retryReport = CommunityReport(version: report.version, publicKey: report.publicKey, nonce: UUID().uuidString,
                        sentAt: Int64(Date().timeIntervalSince1970*1000), provider: report.provider, plan: report.plan,
                        series: report.series, observedAt: report.observedAt, windows: report.windows)
                    do {
                        let body = try JSONEncoder().encode(retryReport)
                        var retryRequest = request; retryRequest.httpBody = body
                        retryRequest.setValue(try identity.signature(for: body).base64EncodedString(), forHTTPHeaderField: "X-Miso-Signature")
                        let (_, response) = try await session.data(for: retryRequest)
                        guard !Task.isCancelled, token == generation, enabled else { return }
                        let code = (response as? HTTPURLResponse)?.statusCode ?? 0
                        if code == 202 {
                            lastSent[reading.provider] = sentKey
                            defaults.set(Date(), forKey: "communityAccepted-" + reading.provider.rawValue)
                            setStatus("Accepted by throttleindex collector.", provider: reading.provider); return
                        }
                        setStatus("Upload HTTP \(code)" + ((code == 429 || code >= 500) ? " · retrying" : " · check connection details"), provider: reading.provider)
                        if code != 429 && code < 500 { return }
                    } catch {
                        guard !Task.isCancelled, token == generation else { return }
                        setStatus("Collector unavailable · retrying", provider: reading.provider)
                    }
                    guard attempt < retryDelays.count else {
                        setStatus("Not delivered. Will retry on the next fresh reading.", provider: reading.provider); return
                    }
                    do { try await Task.sleep(nanoseconds: retryDelays[attempt] + UInt64.random(in: 0...100_000_000)) }
                    catch { return }
                }
            }
        } catch { setStatus("Reporting identity unavailable: " + error.localizedDescription, provider: reading.provider) }
    }
    /// Explicit recovery/deletion for pre-1.9.3 keys only. The caller must show consent first.
    func deleteLegacyReports() async throws {
        guard let server = endpoint else { throw URLError(.badURL) }
        let query: [String: Any] = [kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: "org.relayharness.relay-cat.community", kSecAttrAccount as String: "signing-v1"]
        var value: CFTypeRef?
        let code = SecItemCopyMatching(query.merging([kSecReturnData as String: true, kSecMatchLimit as String: kSecMatchLimitOne]) { _, n in n } as CFDictionary, &value)
        if code == errSecItemNotFound { status = "No legacy reporting key found."; onChange?(); return }
        guard code == errSecSuccess, let bytes = value as? Data else { throw NSError(domain: NSOSStatusErrorDomain, code: Int(code)) }
        let oldKey = try Curve25519.Signing.PrivateKey(rawRepresentation: bytes)
        // Stop only if the active key is the same legacy identity. A newer independent key is preserved.
        let activeIsLegacy = (try? key(create: false).publicKey.rawRepresentation) == oldKey.publicKey.rawRepresentation
        if activeIsLegacy { stop() }
        struct Removal: Codable { let version: Int; let publicKey: String; let nonce: String; let sentAt: Int64; let action: String }
        let body = try JSONEncoder().encode(Removal(version: 1, publicKey: oldKey.publicKey.rawRepresentation.base64EncodedString(), nonce: UUID().uuidString, sentAt: Int64(Date().timeIntervalSince1970*1000), action: "delete"))
        var request = URLRequest(url: server.appendingPathComponent("v1/reports")); request.httpMethod = "DELETE"; request.httpBody = body
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue(try oldKey.signature(for: body).base64EncodedString(), forHTTPHeaderField: "X-Miso-Signature")
        let (_, response) = try await session.data(for: request)
        guard (response as? HTTPURLResponse)?.statusCode == 200 else { throw URLError(.badServerResponse) }
        defaults.set(true, forKey: "legacyReportingDeletionConfirmed")
        // A matching file identity is now revoked at the server. Remove only that matching file,
        // so a later explicit opt-in can create a new identity. A different file key is untouched.
        if activeIsLegacy { try FileManager.default.removeItem(at: identityURL) }
        status = "Legacy reports deleted. Old Keychain item retained for diagnosis; any different active file identity is unchanged."; onChange?()
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
                    do { try FileManager.default.removeItem(at: self.identityURL) }
                    catch where (error as? CocoaError)?.code == .fileNoSuchFile { }
                    catch { status = "Server readings deleted, but local identity could not be removed. Retry deletion."; completion(false); return }
                    defaults.set(false, forKey: "communityIdentityCreated"); status = "Shared readings deleted. Sharing is off."
                    completion(true)
                } catch { status = "Deletion not confirmed. Identity kept so you can retry."; completion(false) }
            }
        } catch { status = "Unable to read deletion identity."; completion(false) }
    }
}
