import Foundation
import CryptoKit
import Security

struct CalibrationEnvelope: Codable, Sendable {
    let version: Int
    let publicKey: String
    let nonce: String
    let sentAt: Int64
    let provider: String
    let plan: String
    let series: String
    let measurement: CalibrationMeasurement
    static func encode(_ measurement: CalibrationMeasurement, plan: String, series: String,
                       identity: Curve25519.Signing.PrivateKey, now: Date) throws -> (Data, String) {
        let envelope = CalibrationEnvelope(version: 1, publicKey: identity.publicKey.rawRepresentation.base64EncodedString(),
            nonce: UUID().uuidString, sentAt: Int64(now.timeIntervalSince1970*1000), provider: "claude", plan: plan,
            series: series, measurement: measurement)
        let bytes = try JSONEncoder().encode(envelope)
        guard bytes.count <= 8192 else { throw CalibrationFailure("Calibration payload exceeds the safe request size.") }
        return (bytes, try identity.signature(for: bytes).base64EncodedString())
    }
}
private struct CalibrationIdentity: Codable {
    let privateKey: Data
    let server: String
    var scope: String
    var plan: String
    var series: String
}
private final class CalibrationRedirectBlocker: NSObject, URLSessionTaskDelegate, @unchecked Sendable {
    func urlSession(_ session: URLSession, task: URLSessionTask, willPerformHTTPRedirection response: HTTPURLResponse,
                    newRequest request: URLRequest, completionHandler: @escaping (URLRequest?) -> Void) { completionHandler(nil) }
}
@MainActor
final class CalibrationTransport {
    private let defaults: UserDefaults
    private let service = "org.relayharness.relay-cat.calibration"
    private let account = "calibration-v1"
    private let session: URLSession
    private(set) var status = "Calibration is off. Sessions require a new confirmation each time."
    var hasIdentity: Bool { defaults.bool(forKey: "calibrationIdentityCreated") }
    var endpoint: URL? { defaults.string(forKey: "calibrationServer").flatMap(CommunityPayload.endpoint) }
    init(defaults: UserDefaults) {
        self.defaults = defaults
        let config = URLSessionConfiguration.ephemeral
        config.httpCookieStorage = nil; config.httpShouldSetCookies = false; config.urlCache = nil
        config.timeoutIntervalForRequest = 12; config.timeoutIntervalForResource = 15
        session = URLSession(configuration: config, delegate: CalibrationRedirectBlocker(), delegateQueue: nil)
    }
    func configure(_ server: URL) throws {
        guard CommunityPayload.endpoint(server.absoluteString) != nil else { throw CalibrationFailure("Use a trusted HTTPS collector root, or loopback HTTP for development.") }
        if let retained = try stored() {
            defaults.set(true, forKey: "calibrationIdentityCreated")
            if retained.server != server.absoluteString {
                defaults.set(retained.server, forKey: "calibrationServer")
                throw CalibrationFailure("Delete the retained server's calibration identity before changing servers.")
            }
        } else { defaults.set(false, forKey: "calibrationIdentityCreated") }
        defaults.set(server.absoluteString, forKey: "calibrationServer")
    }
    private var query: [String: Any] { [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: service, kSecAttrAccount as String: account] }
    private func stored() throws -> CalibrationIdentity? {
        var result: CFTypeRef?
        let status = SecItemCopyMatching(query.merging([kSecReturnData as String: true, kSecMatchLimit as String: kSecMatchLimitOne]) { _, new in new } as CFDictionary, &result)
        if status == errSecItemNotFound { return nil }
        guard status == errSecSuccess, let bytes = result as? Data else { throw CalibrationFailure("Calibration Keychain identity is unavailable. Nothing uploaded.") }
        return try JSONDecoder().decode(CalibrationIdentity.self, from: bytes)
    }
    private func identity(scope: String, plan: String, server: URL) throws -> CalibrationIdentity {
        var value: CalibrationIdentity
        let existing = try stored()
        if let existing {
            guard existing.server == server.absoluteString else { throw CalibrationFailure("The retained identity belongs to a different collector. Delete it there before switching.") }
            value = existing
            if value.scope != scope || value.plan != plan { value.scope = scope; value.plan = plan; value.series = UUID().uuidString }
        } else {
            value = CalibrationIdentity(privateKey: Curve25519.Signing.PrivateKey().rawRepresentation, server: server.absoluteString,
                scope: scope, plan: plan, series: UUID().uuidString)
        }
        let bytes = try JSONEncoder().encode(value)
        let code: OSStatus
        if existing != nil { code = SecItemUpdate(query as CFDictionary, [kSecValueData as String: bytes] as CFDictionary) }
        else { code = SecItemAdd(query.merging([kSecValueData as String: bytes, kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly]) { _, new in new } as CFDictionary, nil) }
        guard code == errSecSuccess else { throw CalibrationFailure("Unable to store the calibration signing identity safely.") }
        defaults.set(true, forKey: "calibrationIdentityCreated")
        return value
    }
    func submit(_ candidate: CalibrationCandidate) async throws {
        guard let server = endpoint else { throw CalibrationFailure("No trusted calibration collector is configured.") }
        try Task.checkCancellation()
        let identity = try identity(scope: candidate.scope, plan: candidate.plan, server: server)
        let key = try Curve25519.Signing.PrivateKey(rawRepresentation: identity.privateKey)
        var accepted = 0
        for measurement in candidate.measurements {
            try Task.checkCancellation()
            let now = Date()
            guard Int64(now.timeIntervalSince1970*1000)-measurement.endAt <= 600_000 else { throw CalibrationFailure("The confirmation took too long; stale calibration evidence was not uploaded.") }
            let (bytes, signature) = try CalibrationEnvelope.encode(measurement, plan: candidate.plan, series: identity.series, identity: key, now: now)
            var request = URLRequest(url: server.appendingPathComponent("v1/allowance-reports"))
            request.httpMethod = "POST"; request.httpBody = bytes
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.setValue(signature, forHTTPHeaderField: "X-Miso-Signature")
            let (_, response) = try await session.data(for: request)
            guard (response as? HTTPURLResponse)?.statusCode == 202 else { throw CalibrationFailure("Collector rejected a calibration report. Some earlier windows may already be accepted; deletion remains available.") }
            accepted += 1
        }
        status = "Accepted \(accepted) measured window(s). Public changes still require historical baselines and at least 10 matched installations."
    }
    func delete() async throws {
        guard let server = endpoint, let identity = try stored(), identity.server == server.absoluteString else { throw CalibrationFailure("No matching calibration deletion identity was found.") }
        let key = try Curve25519.Signing.PrivateKey(rawRepresentation: identity.privateKey)
        struct Deletion: Codable { let version: Int; let publicKey: String; let nonce: String; let sentAt: Int64; let action: String }
        let bytes = try JSONEncoder().encode(Deletion(version: 1, publicKey: key.publicKey.rawRepresentation.base64EncodedString(), nonce: UUID().uuidString, sentAt: Int64(Date().timeIntervalSince1970*1000), action: "delete"))
        var request = URLRequest(url: server.appendingPathComponent("v1/reports")); request.httpMethod = "DELETE"; request.httpBody = bytes
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue(try key.signature(for: bytes).base64EncodedString(), forHTTPHeaderField: "X-Miso-Signature")
        let (_, response) = try await session.data(for: request)
        guard (response as? HTTPURLResponse)?.statusCode == 200 else { throw CalibrationFailure("Deletion was not confirmed. The key is retained for retry.") }
        let removed = SecItemDelete(query as CFDictionary)
        guard removed == errSecSuccess || removed == errSecItemNotFound else { throw CalibrationFailure("Server deletion succeeded, but local key removal failed. Retry deletion.") }
        defaults.set(false, forKey: "calibrationIdentityCreated")
        status = "Calibration reports deleted. The local calibration key was removed."
    }
}

@MainActor
final class CalibrationCoordinator {
    private(set) var running = false
    private(set) var status = "Calibration is off. No benchmark has been started."
    private var cancellation: CalibrationCancellation?
    private var task: Task<Void, Never>?
    let transport: CalibrationTransport
    init(defaults: UserDefaults) { transport = CalibrationTransport(defaults: defaults) }
    func stop() {
        cancellation?.cancel(); task?.cancel()
        status = "Stop requested. The current command is being terminated. No further work or upload will start."
    }
    func start(configuration: CalibrationConfiguration, confirm: @escaping @MainActor (CalibrationCandidate) -> Bool,
               finished: @escaping @MainActor (String) -> Void) {
        guard !running else { return }
        running = true; let token = CalibrationCancellation(); cancellation = token
        status = "Checking first-party sign-in and identified quota. No workload has run yet."
        task = Task {
            defer { running = false; cancellation = nil; task = nil; try? FileManager.default.removeItem(at: configuration.directory) }
            do {
                let candidate = try await CalibrationEngine().run(configuration, cancellation: token) { [weak self] text in self?.status = text }
                try token.check()
                guard confirm(candidate) else { status = "Calibration discarded. Nothing uploaded."; finished(status); return }
                try token.check()
                try await transport.submit(candidate)
                status = transport.status; finished(status)
            } catch is CancellationError { status = "Calibration stopped. No further reports will be sent. Previously accepted reports require deletion."; finished(status) }
            catch { status = (error as? CalibrationFailure)?.message ?? "Calibration could not complete. Nothing unvalidated was uploaded."; finished(status) }
        }
    }
}
