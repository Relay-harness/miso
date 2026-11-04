import Foundation
import CryptoKit

final class MockCollector: URLProtocol {
    static let lock = NSLock()
    static var codes = [Int]()
    static var requests = 0
    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
    override func startLoading() {
        Self.lock.lock(); Self.requests += 1; let code = Self.codes.isEmpty ? 202 : Self.codes.removeFirst(); Self.lock.unlock()
        let response = HTTPURLResponse(url: request.url!, statusCode: code, httpVersion: nil, headerFields: nil)!
        client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
        client?.urlProtocol(self, didLoad: Data("{}".utf8)); client?.urlProtocolDidFinishLoading(self)
    }
    override func stopLoading() {}
    static func setup(_ codes: [Int]) { lock.lock(); self.codes = codes; requests = 0; lock.unlock() }
    static func count() -> Int { lock.lock(); defer { lock.unlock() }; return requests }
}

@main struct TransportTests {
    @MainActor static func main() async throws {
        var checks = 0
        func check(_ value: Bool, _ label: String) { precondition(value, label); checks += 1; print("PASS: " + label) }
        let suite = "miso-transport-" + UUID().uuidString
        // Use a dedicated suite with no relationship to real app preferences.
        let preferences = UserDefaults(suiteName: suite)!
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(suite)
        defer { preferences.removePersistentDomain(forName: suite); try? FileManager.default.removeItem(at: directory) }
        let config = URLSessionConfiguration.ephemeral; config.protocolClasses = [MockCollector.self]
        let session = URLSession(configuration: config)
        let share = CommunitySharing(defaults: preferences,
            identityStore: CommunityIdentityStore(file: directory.appendingPathComponent("key"), legacy: { nil }),
            session: session, retryDelays: [1_000_000, 1_000_000])
        check(!share.enabled, "constructing transport does not enable consent")
        try share.enable(server: URL(string: "https://collector.invalid")!, claudePlan: "unknown", codexPlan: "unknown")
        let now = Date(), reading = QuotaReading(provider: .claude, capturedAt: now, source: "fixture",
            windows: [QuotaWindow(title: "5-hour", used: 35, resetsAt: now.addingTimeInterval(7200), key: "primary", durationMinutes: 300)], lastKnown: false)
        MockCollector.setup([500, 202])
        await withCheckedContinuation { continuation in
            var finished = false
            share.onChange = {
                if share.lastAccepted(.claude) != nil && !finished { finished = true; continuation.resume() }
            }
            share.submit(reading)
        }
        check(MockCollector.count() == 2, "a transient server failure retries and reaches acceptance")
        check(share.lastAccepted(.claude) != nil, "server acknowledgement is persisted per provider")
        // Continuation can resume before the task's defer; yield once, without polling.
        await Task.yield()
        share.submit(reading); check(MockCollector.count() == 2, "accepted bucket is not resent")
        share.stop(); check(!share.enabled && !preferences.bool(forKey: "communitySharingEnabled"), "stop preserves explicit revoked consent")
        let reloaded = CommunitySharing(defaults: preferences,
            identityStore: CommunityIdentityStore(file: directory.appendingPathComponent("key"), legacy: { nil }), session: session)
        check(!reloaded.enabled && reloaded.lastAccepted(.claude) != nil, "restart preserves revocation and last acknowledgement")
        share.onChange = nil
        MockCollector.setup([403])
        try share.enable(server: URL(string: "https://collector.invalid")!, claudePlan: "unknown", codexPlan: "unknown")
        await withCheckedContinuation { continuation in
            var finished = false
            share.onChange = { if share.providerStatus[.claude]?.contains("HTTP 403") == true && !finished { finished = true; continuation.resume() } }
            share.submit(reading)
        }
        check(MockCollector.count() == 1, "permanent rejection is not repeatedly retried")
        share.stop(); share.onChange = nil
        preferences.set("https://www.throttleindex.com", forKey: "communityServer")
        check(reloaded.endpoint?.host == "api.throttleindex.com", "known public proxy root migrates to canonical collector without changing identity")
        print("\(checks) transport checks passed. Mock HTTP only; no Keychain, accounts or production reports.")
    }
}
