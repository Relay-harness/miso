import Foundation
import CryptoKit
var count = 0
func check(_ value: @autoclosure () -> Bool, _ text: String) { guard value() else { fatalError("FAIL: " + text) }; count += 1; print("PASS: " + text) }
let now = Date(timeIntervalSince1970: 1793563200)
let windows = [QuotaWindow(title: "Private extra label", used: 99.9, resetsAt: now.addingTimeInterval(10000), key: "primary", durationMinutes: 300), QuotaWindow(title: "Weekly", used: 100, resetsAt: now.addingTimeInterval(500000), key: "secondary", durationMinutes: 10080), QuotaWindow(title: "File uploads", used: 50, resetsAt: now.addingTimeInterval(10000), key: "files", durationMinutes: nil)]
let reading = QuotaReading(provider: .claude, capturedAt: now, source: "cli", windows: windows, lastKnown: false, scopeKey: "local-only-digest")
let output = CommunityPayload.windows(reading, now: now)
check(output.count == 2, "only exactly supported five-hour and weekly windows leave device")
check(output[0].usedPercent == 95, "99.9 percent never rounds into a false exhausted report")
check(output[1].usedPercent == 100, "a provider-reported 100 percent remains exhausted")
check(output.allSatisfy { $0.resetsAt % 300_000 == 0 }, "reset precision is reduced to five minutes")
let stale = QuotaReading(provider: .claude, capturedAt: now.addingTimeInterval(-700), source: "cli", windows: windows, lastKnown: false)
check(CommunityPayload.windows(stale, now: now).isEmpty, "stale readings are never uploaded")
let cached = QuotaReading(provider: .claude, capturedAt: now, source: "cache", windows: windows, lastKnown: true)
check(CommunityPayload.windows(cached, now: now).isEmpty, "diagnostic/cached data is excluded")
let wrongProvider = QuotaReading(provider: .gemini, capturedAt: now, source: "web", windows: windows, lastKnown: false)
check(CommunityPayload.windows(wrongProvider, now: now).isEmpty, "unsupported provider is not relabeled as a supported source")
let identity = Curve25519.Signing.PrivateKey()
let report = CommunityReport(version: 1, publicKey: identity.publicKey.rawRepresentation.base64EncodedString(), nonce: UUID().uuidString, sentAt: Int64(now.timeIntervalSince1970 * 1000), provider: "claude", plan: "pro", series: UUID().uuidString, observedAt: CommunityPayload.bucket(now), windows: output)
let data = try JSONEncoder().encode(report)
let text = String(data: data, encoding: .utf8)!
check(!text.contains("local-only-digest") && !text.contains("Private extra label") && !text.contains("cli"), "allowlist payload excludes scope, source and private labels")
let signature = try identity.signature(for: data)
check(identity.publicKey.isValidSignature(signature, for: data), "payload signature verifies using public key")
check(CommunityPayload.endpoint("https://signals.example") != nil, "HTTPS collector allowed")
check(CommunityPayload.endpoint("http://127.0.0.1:8787") != nil, "loopback HTTP allowed for development")
for invalid in ["http://signals.example", "https://user:pass@signals.example", "https://signals.example/path", "https://signals.example?secret=x", "file:///tmp/test"] { check(CommunityPayload.endpoint(invalid) == nil, "unsafe endpoint rejected") }
print("\(count) community privacy/encoding checks passed. No account or network access.")

if CommandLine.arguments.contains("--emit-envelope") {
    let envelope: [String: String] = ["raw": text, "signature": signature.base64EncodedString()]
    let encoded = try JSONSerialization.data(withJSONObject: envelope, options: [.sortedKeys])
    print("ENVELOPE:" + String(data: encoded, encoding: .utf8)!)
}
