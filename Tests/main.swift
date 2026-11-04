import Foundation
import CoreGraphics
var checks = 0
func check(_ condition: @autoclosure () -> Bool, _ name: String) {
    guard condition() else { fatalError("FAIL: " + name) }
    checks += 1; print("PASS: " + name)
}
let t = Date(timeIntervalSince1970: 1_000_000)
var clock = FocusClock()
check(clock.phase == .idle && !clock.isRunning, "initially idle")
check(clock.remaining(at: t) == 0, "idle time zero")
clock.start(minutes: 25, at: t)
check(clock.phase == .focus && clock.remaining(at: t) == 1500, "start 25 minute session")
check(clock.label(at: t) == "25:00", "formatted duration")
check(clock.remaining(at: t.addingTimeInterval(0.1)) == 1500, "ceil partial seconds")
check(clock.remaining(at: t.addingTimeInterval(60)) == 1440, "deadline counts down")
clock.pause(at: t.addingTimeInterval(100))
check(clock.isPaused && clock.remaining(at: t.addingTimeInterval(1000)) == 1400, "pause preserves remaining time")
check(clock.tick(at: t.addingTimeInterval(2000)) == nil, "paused timer does not advance")
clock.resume(at: t.addingTimeInterval(2000))
check(!clock.isPaused && clock.remaining(at: t.addingTimeInterval(2000)) == 1400, "resume rebases deadline")
check(clock.tick(at: t.addingTimeInterval(3400)) == .focusFinished, "focus completes once")
check(clock.phase == .rest && clock.remaining(at: t.addingTimeInterval(3400)) == 300, "five minute break starts")
check(clock.tick(at: t.addingTimeInterval(3400)) == nil, "no duplicate completion")
check(clock.tick(at: t.addingTimeInterval(3700)) == .breakFinished && clock.phase == .idle, "break returns to idle")
clock.start(minutes: 15, at: t); clock.stop()
check(clock.phase == .idle && clock.deadline == nil && clock.pausedSeconds == nil, "stop clears state")
clock.start(minutes: 0, at: t)
check(clock.remaining(at: t) == 60, "invalid duration clamps")
check(clock.remaining(at: t.addingTimeInterval(500)) == 0, "overdue time never negative")
check(clock.tick(at: t.addingTimeInterval(500)) == .focusFinished, "wake after deadline begins a fresh break")
clock.pause(at: t.addingTimeInterval(510)); clock.stop()
check(!clock.isPaused && !clock.isRunning, "stop paused clock")
print("\(checks) checks passed")

// Quota contract tests: all account data is synthetic.
func quotaPayload(_ provider: String = "claude", _ usage: [String: Any], extra: [String: Any] = [:]) -> Data {
    var root: [String: Any] = ["provider": provider, "source": "oauth", "usage": usage]
    for (k,v) in extra { root[k] = v }
    return try! JSONSerialization.data(withJSONObject: [root])
}
func quotaPayload(_ usage: [String: Any], extra: [String: Any] = [:]) -> Data {
    quotaPayload("claude", usage, extra: extra)
}
let qnow = Date(timeIntervalSince1970: 1_800_000_000)
let qdate = ISO8601DateFormatter().string(from: qnow)
let qreset = ISO8601DateFormatter().string(from: qnow.addingTimeInterval(3600))
func qUsage(_ window: Any) -> [String: Any] { ["updatedAt": qdate, "primary": window] }
func rejected(_ data: Data, provider: QuotaProvider = .claude) -> Bool { do { _ = try QuotaParser.parse(data, provider: provider, now: qnow); return false } catch { return true } }
let measured = try! QuotaParser.parse(quotaPayload(qUsage(["usedPercent": 28.2, "windowMinutes": 300, "resetsAt": qreset])), provider: .claude, now: qnow)
check(measured.windows[0].remaining == 71.8, "remaining derives only from measured used percent")
check(measured.headline(at: qnow) == "28.2% used · 5-hour", "headline shows measured usage and retains lane")
check(measured.windows[0].resetText(at: qnow) == "Resets in 1h 0m", "reported reset countdown")
check(measured.available(at: qnow.addingTimeInterval(601)).isEmpty, "old reading is unavailable, not current")
let expiring = try! QuotaParser.parse(quotaPayload(qUsage(["usedPercent": 10, "resetsAt": ISO8601DateFormatter().string(from: qnow.addingTimeInterval(10))])), provider: .claude, now: qnow)
check(expiring.available(at: qnow.addingTimeInterval(11)).isEmpty, "reset expiry does not invent a fresh 100 percent")
check(rejected(quotaPayload(qUsage(["windowMinutes": 300]))), "missing percent never becomes zero")
check(rejected(quotaPayload(qUsage(["usedPercent": NSNull()]))), "null percent unavailable")
check(rejected(quotaPayload(qUsage(["usedPercent": true]))), "boolean percent rejected")
check(rejected(quotaPayload(qUsage(["usedPercent": "0"]))), "string percent rejected")
check(rejected(quotaPayload(qUsage(["usedPercent": -1]))), "negative percent rejected")
let over = try! QuotaParser.parse(quotaPayload(qUsage(["usedPercent": 130])), provider: .claude, now: qnow)
check(over.windows[0].remaining == 0, "over quota clamps remaining to zero")
let zero = try! QuotaParser.parse(quotaPayload(qUsage(["usedPercent": 0])), provider: .claude, now: qnow)
check(zero.windows[0].remaining == 100, "genuine measured zero remains valid")
check(rejected(quotaPayload(qUsage(["usedPercent": 0, "isSyntheticPlaceholder": true]))), "synthetic zero placeholder is not real quota")
let partial: [String: Any] = ["updatedAt": qdate, "primary": ["usedPercent": 0, "isSyntheticPlaceholder": true], "secondary": ["usedPercent": 23, "windowMinutes": 10080]]
let week = try! QuotaParser.parse(quotaPayload(partial), provider: .claude, now: qnow)
check(week.windows.count == 1 && week.windows[0].title == "7-day", "missing session does not erase measured weekly window")
let extras: [String: Any] = ["updatedAt": qdate, "extraRateWindows": [["title": "Spark", "usageKnown": false, "window": ["usedPercent": 100]]]]
check(rejected(quotaPayload(extras)), "unknown extra-window usage is not an exhausted quota")
check(rejected(quotaPayload("codex", qUsage(["usedPercent": 3]))), "wrong provider rejected")
check(rejected(Data("[]".utf8)), "empty result rejected")
check(rejected(Data("not json".utf8)), "malformed JSON rejected")
check(rejected(quotaPayload(["primary": ["usedPercent": 1]])), "missing capture time rejected")
let future: [String: Any] = ["updatedAt": ISO8601DateFormatter().string(from: qnow.addingTimeInterval(90)), "primary": ["usedPercent": 1]]
check(rejected(quotaPayload(future)), "future capture time rejected")
check(rejected(quotaPayload(qUsage(["usedPercent": 0]), extra: ["error": ["message": "synthetic authentication failure"]])), "error plus usage cannot look successful")
let stale = try! QuotaParser.parse(quotaPayload(qUsage(["usedPercent": 0]), extra: ["diagnostic": "last known"]), provider: .claude, now: qnow)
check(stale.lastKnown && stale.available(at: qnow).isEmpty, "diagnostic last-known values never displayed as live")
let cache = try! QuotaParser.parse(quotaPayload(qUsage(["usedPercent": 1]), extra: ["source": "codexbar-app"]), provider: .claude, now: qnow)
check(cache.available(at: qnow).isEmpty, "cached app fallback never treated as fresh")
let labeled = try! QuotaParser.parse(quotaPayload(qUsage(["usedPercent": 1]), extra: ["rateWindowLabels": ["primary": "Weekly"]]), provider: .claude, now: qnow)
check(labeled.windows[0].title == "Weekly", "reader provider-specific lane labels retained")
let small = try! QuotaParser.parse(quotaPayload(qUsage(["usedPercent": 99.8])), provider: .claude, now: qnow)
check(small.windows[0].remainingText == "<1%", "fractional remaining does not show false zero")
var pair = try! JSONSerialization.jsonObject(with: quotaPayload(qUsage(["usedPercent": 1]))) as! [[String: Any]]
pair.append(pair[0])
check(rejected(try! JSONSerialization.data(withJSONObject: pair)), "multiple accounts never silently merged")
let secretFixture = try! QuotaParser.parse(quotaPayload(qUsage(["usedPercent": 1]), extra: ["account": "synthetic-person@example.invalid", "token": "synthetic-only"]), provider: .claude, now: qnow)
check(!String(describing: secretFixture).contains("synthetic-person") && !String(describing: secretFixture).contains("synthetic-only"), "quota model does not retain account identifiers or tokens")
check(QuotaProvider.codex.note.contains("not all ChatGPT"), "Codex scope explicitly excludes general ChatGPT quota")
check(QuotaProvider.gemini.source == "web", "Gemini app source cannot silently substitute CLI quota")
print("\(checks) combined checks passed")

// Usage forecasts are calibrated only from same-account, same-window quota samples.
let fw = QuotaWindow(title: "5-hour", used: 30, resetsAt: qnow.addingTimeInterval(18000), key: "primary", durationMinutes: 300)
let samples = [QuotaSample(at: qnow.addingTimeInterval(-600), used: 20), QuotaSample(at: qnow.addingTimeInterval(-300), used: 25), QuotaSample(at: qnow, used: 30)]
let estimate = QuotaHistory.estimate(samples: samples, window: fw, now: qnow)
check(abs(estimate.secondsToLimit! - 4200) < 0.001, "quota slope predicts 70 minutes from observed quota changes")
check(estimate.title.contains("1h 10m"), "forecast is explicitly at this pace")
check(QuotaHistory.estimate(samples: Array(samples.prefix(2)), window: fw, now: qnow).secondsToLimit == nil, "two samples cannot invent a forecast")
let flat = samples.map { QuotaSample(at: $0.at, used: 30) }
check(QuotaHistory.estimate(samples: flat, window: fw, now: qnow).secondsToLimit == nil, "flat quota is not infinite guaranteed capacity")
let decrease = [samples[0], QuotaSample(at: samples[1].at, used: 10), samples[2]]
check(QuotaHistory.estimate(samples: decrease, window: fw, now: qnow).secondsToLimit == nil, "decreasing quota breaks the forecast")
let resetSoon = QuotaWindow(title: "5-hour", used: 30, resetsAt: qnow.addingTimeInterval(60), key: "primary", durationMinutes: 300)
check(QuotaHistory.estimate(samples: samples, window: resetSoon, now: qnow).title == "On track until reset", "reset before exhaustion is distinguished")
let exhausted = QuotaWindow(title: "Weekly", used: 100, resetsAt: qnow.addingTimeInterval(1000), key: "secondary", durationMinutes: 10080)
check(QuotaHistory.estimate(samples: [], window: exhausted, now: qnow).title == "Limit reached", "real measured exhaustion is explicit")
let near = QuotaWindow(title: "Weekly", used: 83, resetsAt: qnow.addingTimeInterval(86400), key: "secondary", durationMinutes: 10080)
check(QuotaHistory.estimate(samples: [], window: near, now: qnow).urgent, "near-weekly-limit warning works without a fabricated ETA")
let noReset = QuotaWindow(title: "Quota", used: 30, resetsAt: nil)
check(QuotaHistory.estimate(samples: samples, window: noReset, now: qnow).secondsToLimit == nil, "unknown reset prevents forecast")
let alreadyReset = QuotaWindow(title: "Quota", used: 100, resetsAt: qnow.addingTimeInterval(-1))
check(QuotaHistory.estimate(samples: samples, window: alreadyReset, now: qnow).title == "Refresh needed", "expired exhaustion is not retained as a live limit")
var history = QuotaHistory()
func historyReading(_ sample: QuotaSample, scope: String? = "account-A", reset: Date? = nil) -> QuotaReading {
    let win = QuotaWindow(title: "Session", used: sample.used, resetsAt: reset ?? fw.resetsAt, key: "primary", durationMinutes: 300)
    return QuotaReading(provider: .claude, capturedAt: sample.at, source: "cli", windows: [win], lastKnown: false, scopeKey: scope)
}
for sample in samples { history.observe(historyReading(sample)) }
let latest = historyReading(samples.last!)
check(history.forecast(provider: .claude, reading: latest, window: latest.windows[0], now: qnow).secondsToLimit != nil, "three same-account samples establish a forecast")
history.observe(historyReading(samples.last!, scope: "account-B"))
let other = historyReading(samples.last!, scope: "account-B")
check(history.forecast(provider: .claude, reading: other, window: other.windows[0], now: qnow).secondsToLimit == nil, "switching account clears trend")
history.observe(historyReading(samples.last!, scope: nil))
let anonymous = historyReading(samples.last!, scope: nil)
check(history.forecast(provider: .claude, reading: anonymous, window: anonymous.windows[0], now: qnow).secondsToLimit == nil, "unidentified account never reuses an earlier forecast")
history.clear()
for sample in samples { history.observe(historyReading(sample)) }
let nextReset = historyReading(QuotaSample(at: qnow.addingTimeInterval(1), used: 31), reset: qnow.addingTimeInterval(36000))
history.observe(nextReset)
check(history.forecast(provider: .claude, reading: nextReset, window: nextReset.windows[0], now: qnow.addingTimeInterval(1)).secondsToLimit == nil, "new quota reset starts new trend")
let identityData = quotaPayload(["updatedAt": qdate, "accountEmail": "account-a@example.invalid", "primary": ["usedPercent": 1]])
let scoped = try! QuotaParser.parse(identityData, provider: .claude, now: qnow)
check(scoped.scopeKey != nil && !String(describing: scoped).contains("account-a@example.invalid"), "forecast scope is hashed, not stored as a raw email")
let today = TokenParser.day(at: qnow)
let tokenData = try! JSONSerialization.data(withJSONObject: [["provider": "claude", "daily": [["date": today, "inputTokens": 1200, "outputTokens": 300]]]])
let tokenRow = try! TokenParser.parse(tokenData, provider: .claude, now: qnow)
check(tokenRow.input == 1200 && tokenRow.output == 300, "input and output daily counters stay separate")
let tokenNext = TokenReading(day: today, input: 1800, output: 600, capturedAt: qnow.addingTimeInterval(300))
check(TokenParser.rate(previous: tokenRow, current: tokenNext) == 180, "token pace is measured from counter differences")
let tomorrow = TokenReading(day: "2099-01-01", input: 1800, output: 600, capturedAt: qnow.addingTimeInterval(300))
check(TokenParser.rate(previous: tokenRow, current: tomorrow) == nil, "midnight clears token rate")
let negative = TokenReading(day: today, input: 100, output: 20, capturedAt: qnow.addingTimeInterval(300))
check(TokenParser.rate(previous: tokenRow, current: negative) == nil, "counter shrink invalidates token rate")
let yesterdayData = try! JSONSerialization.data(withJSONObject: [["provider": "claude", "daily": [["date": "2000-01-01", "inputTokens": 1200, "outputTokens": 300]]]])
var noYesterday = false
do { _ = try TokenParser.parse(yesterdayData, provider: .claude, now: qnow) } catch { noYesterday = true }
check(noYesterday, "yesterday's tokens cannot masquerade as today's")
let boolTokens = try! JSONSerialization.data(withJSONObject: [["provider": "claude", "daily": [["date": today, "inputTokens": true, "outputTokens": 300]]]])
var noBool = false
do { _ = try TokenParser.parse(boolTokens, provider: .claude, now: qnow) } catch { noBool = true }
check(noBool, "boolean token counts rejected")
print("\(checks) total core checks passed")

let zeroTokens = try! JSONSerialization.data(withJSONObject: [["provider": "claude", "daily": [["date": today, "inputTokens": 0, "outputTokens": 0]]]])
let observedZero = try! TokenParser.parse(zeroTokens, provider: .claude, now: qnow)
check(observedZero.input == 0 && observedZero.output == 0, "measured zero local tokens remain genuine zero")
let duplicateDay = try! JSONSerialization.data(withJSONObject: [["provider": "claude", "daily": [["date": today, "inputTokens": 1, "outputTokens": 2], ["date": today, "inputTokens": 3, "outputTokens": 4]]]])
var duplicatesRejected = false
do { _ = try TokenParser.parse(duplicateDay, provider: .claude, now: qnow) } catch { duplicatesRejected = true }
check(duplicatesRejected, "duplicate day totals do not silently undercount")
let partialTokens = try! JSONSerialization.data(withJSONObject: [["provider": "claude", "historyCoverageIsEstablished": false, "daily": [["date": today, "inputTokens": 1, "outputTokens": 2]]]])
var partialRejected = false
do { _ = try TokenParser.parse(partialTokens, provider: .claude, now: qnow) } catch { partialRejected = true }
check(partialRejected, "explicitly incomplete history is not shown as a complete total")
history.clear()
for sample in samples { history.observe(historyReading(sample)) }
let correction = historyReading(samples.last!, reset: qnow.addingTimeInterval(36000))
history.observe(correction)
check(history.forecast(provider: .claude, reading: correction, window: correction.windows[0], now: qnow).secondsToLimit == nil, "same-time reset correction cannot reuse a trend")
history.clear()
for sample in samples { history.observe(historyReading(sample)) }
var ambiguous = historyReading(samples.last!)
let duplicateWindow = QuotaReading(provider: .claude, capturedAt: qnow, source: "cli", windows: [ambiguous.windows[0], ambiguous.windows[0]], lastKnown: false, scopeKey: ambiguous.scopeKey)
history.observe(duplicateWindow)
check(history.forecast(provider: .claude, reading: ambiguous, window: ambiguous.windows[0], now: qnow).secondsToLimit == nil, "duplicate window identities cannot create a forecast")
print("\(checks) final core checks passed")

let agedEstimate = QuotaHistory.estimate(samples: samples, window: fw, now: qnow.addingTimeInterval(60))
check(abs(agedEstimate.secondsToLimit! - 4140) < 0.001, "ETA countdown accounts for time since the last quota sample")
let almostFull = QuotaWindow(title: "Session", used: 99, resetsAt: qnow.addingTimeInterval(18000), key: "primary", durationMinutes: 300)
let fastSamples = [QuotaSample(at: qnow.addingTimeInterval(-600), used: 89), QuotaSample(at: qnow.addingTimeInterval(-300), used: 94), QuotaSample(at: qnow, used: 99)]
let overdue = QuotaHistory.estimate(samples: fastSamples, window: almostFull, now: qnow.addingTimeInterval(120))
check(overdue.secondsToLimit == nil && overdue.title == "Estimate overdue — refresh", "an elapsed prediction does not falsely confirm a reached limit")
print("\(checks) final core checks passed")

let compactPreferred = DashboardLayout.preferredSize
check(compactPreferred == CGSize(width: 360, height: 316), "glance panel has one shared 360 by 316 size contract")
check(DashboardLayout.size(for: CGSize(width: 1470, height: 856)) == compactPreferred, "actual display geometry uses compact size")
check(DashboardLayout.size(for: CGSize(width: 600, height: 300)) == CGSize(width: 360, height: 180), "short display caps panel height at 60 percent")
check(DashboardLayout.size(for: CGSize(width: 320, height: 700)).width == 296, "narrow display reserves horizontal margin")
check(DashboardLayout.size(for: CGSize(width: 200, height: 200)) == CGSize(width: 176, height: 120), "very small available area is bounded, not expanded")
check(compactPreferred.width*compactPreferred.height < 480*690*0.5, "popover footprint is less than half the old panel area")
print("\(checks) compact core checks passed")

var providerChoice = ProviderSelection()
check(providerChoice.providers == [.codex, .claude], "default provider order is OpenAI, Claude")
check(providerChoice.quotaRequests(allowGemini: true) == [.codex, .claude], "browser consent alone cannot query an unadded provider")
check(providerChoice.setVisible(.grok, true), "Grok can be added")
check(providerChoice.providers == [.codex, .claude, .grok], "Grok is appended without adding Gemini")
check(!providerChoice.setVisible(.grok, true), "adding Grok twice is idempotent")
check(providerChoice.setVisible(.gemini, true), "Gemini can be added")
check(providerChoice.providers == [.codex, .claude, .gemini, .grok], "all added providers keep canonical order")
check(providerChoice.quotaRequests(allowGemini: false) == [.codex, .claude, .grok], "Gemini addition does not grant browser access")
check(providerChoice.quotaRequests(allowGemini: true) == providerChoice.providers, "added Gemini is queried only with separate permission")
check(!providerChoice.setVisible(.claude, false) && !providerChoice.setVisible(.codex, false), "the two main providers cannot be removed")
check(providerChoice.setVisible(.grok, false) && !providerChoice.quotaRequests(allowGemini: true).contains(.grok), "removed provider is excluded from future requests")
check(ProviderSelection(saved: providerChoice.added.map(\.rawValue)).providers == providerChoice.providers, "optional choices round-trip through saved preferences")
check(ProviderSelection(saved: ["grok", "grok", "unknown", "claude", "codex"]).providers == [.codex, .claude, .grok], "saved choices ignore duplicates and invalid optional identifiers")
check(ProviderSelection(saved: []).providers == [.codex, .claude], "empty preferences restore just the two default tabs")
print("\(checks) provider/core checks passed")

var selectiveHistory = QuotaHistory()
let selectiveReset = t.addingTimeInterval(20_000)
func selectiveReading(_ provider: QuotaProvider, _ index: Int) -> QuotaReading {
    QuotaReading(provider: provider, capturedAt: t.addingTimeInterval(Double(index-2)*300), source: "fixture",
        windows: [QuotaWindow(title: "Session", used: 30+Double(index)*5, resetsAt: selectiveReset, key: "primary", durationMinutes: 300)],
        lastKnown: false, scopeKey: "synthetic-selective-history")
}
for index in 0..<3 {
    selectiveHistory.observe(selectiveReading(.claude, index))
    selectiveHistory.observe(selectiveReading(.grok, index))
}
let selectiveClaude = selectiveReading(.claude, 2), selectiveGrok = selectiveReading(.grok, 2)
let selectiveBefore = selectiveHistory.forecast(provider: .claude, reading: selectiveClaude, window: selectiveClaude.windows[0], now: t)
check(selectiveBefore.secondsToLimit != nil, "synthetic history has a calibrated baseline before removal")
selectiveHistory.clear(provider: .grok)
check(selectiveHistory.forecast(provider: .claude, reading: selectiveClaude, window: selectiveClaude.windows[0], now: t).secondsToLimit == selectiveBefore.secondsToLimit, "removing Grok preserves Claude's measured pace history")
check(selectiveHistory.forecast(provider: .grok, reading: selectiveGrok, window: selectiveGrok.windows[0], now: t).secondsToLimit == nil, "removed provider cannot reuse old pace history when added again")
print("\(checks) final provider/core checks passed")

check(DashboardLayout.size(for: CGSize(width: 1470, height: 856), expanded: false) == CGSize(width: 360, height: 180), "disconnected panel shrinks instead of reserving empty quota space")
check(DashboardLayout.size(for: CGSize(width: 200, height: 200), expanded: false) == CGSize(width: 176, height: 120), "empty panel still obeys the short-display cap")
print("\(checks) final glance/core checks passed")

var catRest = CatRestState()
check(catRest.isSleeping(at: t), "Relay Cat starts asleep without monitoring keyboard activity")
catRest.opened()
check(!catRest.isSleeping(at: t) && catRest.isInspecting, "opening usage wakes Relay Cat")
check(!catRest.isSleeping(at: t.addingTimeInterval(60)), "Relay Cat stays awake while usage is open")
catRest.closed(at: t)
check(!catRest.isInspecting && !catRest.isSleeping(at: t), "closing starts a cooldown rather than instant sleep")
check(!catRest.isSleeping(at: t.addingTimeInterval(1.99)), "Relay Cat stays awake just before the two-second deadline")
check(catRest.isSleeping(at: t.addingTimeInterval(2)), "Relay Cat sleeps at the two-second deadline")
catRest.opened()
check(!catRest.isSleeping(at: t.addingTimeInterval(3)), "reopening cancels the previous sleep deadline")
catRest.closed(at: t.addingTimeInterval(4))
check(!catRest.isSleeping(at: t.addingTimeInterval(5)), "rapid reopen and close starts a fresh cooldown")
check(catRest.isSleeping(at: t.addingTimeInterval(6)), "fresh cooldown completes normally")
catRest.closed(at: t.addingTimeInterval(8))
check(catRest.isSleeping(at: t.addingTimeInterval(8)), "duplicate close events do not prolong the cooldown")
catRest.wakeManually()
check(!catRest.isSleeping(at: t.addingTimeInterval(1000)), "manual wake remains available as an explicit override")
catRest.opened(); catRest.closed(at: t)
check(!catRest.isSleeping(at: t.addingTimeInterval(10)), "manual wake remains respected after checking usage")
catRest.napManually()
check(catRest.isSleeping(at: t), "manual nap overrides and clears a pending cooldown")
catRest.opened()
check(!catRest.isSleeping(at: t), "checking usage temporarily wakes an explicitly napping cat")
catRest.closed(at: t)
check(catRest.isSleeping(at: t.addingTimeInterval(3)), "temporary wake returns the manually napping cat to sleep")
print("\(checks) rest/layout core checks passed")

func displayWindow(_ used: Double) -> QuotaWindow { QuotaWindow(title: "Fixture", used: used, resetsAt: qnow.addingTimeInterval(3600)) }
check(displayWindow(0).usedText == "0%" && displayWindow(0).usedFraction == 0, "unused quota has an empty used bar")
check(displayWindow(39).usedText == "39%" && displayWindow(39).usedFraction == 0.39, "used label and fill both increase with consumption")
check(displayWindow(28.2).usedText == "28.2%", "fractional provider usage is retained")
check(displayWindow(0.04).usedText == "<0.1%", "tiny positive usage does not show a false zero")
check(displayWindow(99.99).usedText == "<100%", "rounding never falsely reports a fully used quota")
check(displayWindow(100).usedText == "100%" && displayWindow(100).usedFraction == 1, "measured full quota has a full used bar")
check(displayWindow(130).usedText == "130%" && displayWindow(130).usedFraction == 1, "reported overage remains visible but cannot overdraw the bar")
check(displayWindow(10000).usedText == "999%+", "extreme provider percentages cannot overflow the label")
check(displayWindow(.nan).usedText == "—" && displayWindow(.nan).usedFraction == 0, "invalid internal values never become numeric usage")
check(displayWindow(-1).usedText == "—" && displayWindow(-1).usedFraction == 0, "negative internal usage cannot draw a negative bar")
print("\(checks) used-quota core checks passed")

check(MisoUpdateChecker.newer("1.9.1", than: "1.9.0"), "newer Miso release is detected")
check(MisoUpdateChecker.newer("v1.10.0", than: "1.9.9"), "version components compare numerically")
check(!MisoUpdateChecker.newer("1.9.1", than: "1.9.1"), "current Miso release does not prompt")

check(!MisoUpdateChecker.newer("1.9.bad", than: "1.9.3"), "malformed versions cannot offer updates")
check(!MisoUpdateChecker.newer("1.10.0-beta", than: "1.9.3"), "unconfigured prerelease version formats are not treated as stable updates")
let badReleaseBytes = Data("not-json".utf8)
if case .unavailable = MisoUpdateChecker.parse(badReleaseBytes, current: "1.9.3") { check(true, "failed update response is unavailable, not up to date") } else { fatalError("invalid update response") }
