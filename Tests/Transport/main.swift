import Foundation
import CryptoKit

final class MockCollector: URLProtocol {
    static let lock = NSLock()
    static var codes = [Int]()
    static var requests = 0
    static var series = [String]()
    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
    override func startLoading() {
        var body = request.httpBody
        if body == nil, let stream = request.httpBodyStream {
            stream.open(); var data = Data(); var buffer = [UInt8](repeating: 0, count: 4096)
            while stream.hasBytesAvailable { let n = stream.read(&buffer, maxLength: buffer.count); if n <= 0 { break }; data.append(buffer, count: n) }
            stream.close(); body = data
        }
        let sent = body.flatMap { try? JSONSerialization.jsonObject(with: $0) as? [String: Any] }?["series"] as? String
        Self.lock.lock(); Self.requests += 1; if let sent { Self.series.append(sent) }; let code = Self.codes.isEmpty ? 202 : Self.codes.removeFirst(); Self.lock.unlock()
        let response = HTTPURLResponse(url: request.url!, statusCode: code, httpVersion: nil, headerFields: nil)!
        client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
        client?.urlProtocol(self, didLoad: Data("{}".utf8)); client?.urlProtocolDidFinishLoading(self)
    }
    override func stopLoading() {}
    static func setup(_ codes: [Int]) { lock.lock(); self.codes = codes; requests = 0; lock.unlock() }
    static func count() -> Int { lock.lock(); defer { lock.unlock() }; return requests }
    static func sentSeries() -> [String] { lock.lock(); defer { lock.unlock() }; return series }
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
        // Daily cadence: a second, different reading within 24 hours is not sent.
        let rising = QuotaReading(provider: .claude, capturedAt: now, source: "fixture",
            windows: [QuotaWindow(title: "5-hour", used: 45, resetsAt: now.addingTimeInterval(7200), key: "primary", durationMinutes: 300)], lastKnown: false)
        share.submit(rising); check(MockCollector.count() == 2, "a different reading within 24 hours is not sent")
        check(!share.dailyReportDue() && share.dailyReportDue(now: Date().addingTimeInterval(CommunitySharing.reportInterval + 1)), "the next report is due 24 hours after acceptance")
        // A day later the next reading goes out.
        preferences.set(now.addingTimeInterval(-CommunitySharing.reportInterval - 60), forKey: "communityAccepted-claude")
        await withCheckedContinuation { continuation in
            var finished = false
            share.onChange = {
                if MockCollector.count() == 3 && share.providerStatus[.claude]?.hasPrefix("Accepted") == true && !finished { finished = true; continuation.resume() }
            }
            share.submit(rising)
        }
        check(MockCollector.count() == 3, "after 24 hours the next daily reading is sent")
        share.onChange = nil
        share.stop(); check(!share.enabled && !preferences.bool(forKey: "communitySharingEnabled"), "stop preserves explicit revoked consent")
        let reloaded = CommunitySharing(defaults: preferences,
            identityStore: CommunityIdentityStore(file: directory.appendingPathComponent("key"), legacy: { nil }), session: session)
        check(!reloaded.enabled && reloaded.lastAccepted(.claude) != nil, "restart preserves revocation and last acknowledgement")
        share.onChange = nil
        preferences.removeObject(forKey: "communityAccepted-claude")
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
