import AppKit
import SwiftUI

@MainActor
final class DashboardState: ObservableObject {
    static let tabs = ProviderSelection.required + ProviderSelection.optional
    var visibleTabs: [QuotaProvider] { store.visibleProviders }
    let store: QuotaStore
    @Published var selected: QuotaProvider = .claude
    @Published var revision = 0
    @Published var now = Date()
    @Published var panelSize = DashboardLayout.preferredSize
    @Published var showingStats = false { didSet { onLayoutChange?() } }
    var onLayoutChange: (() -> Void)?
    var hasQuota: Bool { isFresh && lanes().contains { $0.1.map { !$0.expired(at: now) } == true } }
    var expandedLayout: Bool { showingStats || connected }
    var preview = false
    var sampleReading: QuotaReading?
    var sampleTokens: TokenReading?
    var sampleHistory = QuotaHistory()
    init(store: QuotaStore) { self.store = store; selected = store.displayedProvider }
    func sync() {
        if !visibleTabs.contains(selected) { selected = store.displayedProvider }
        now = Date(); revision += 1
        onLayoutChange?()
    }
    func select(_ provider: QuotaProvider) {
        guard visibleTabs.contains(provider) else { return }
        selected = provider
        if !preview { store.setDisplayed(provider) } else { sync() }
    }
    func setProviderVisible(_ provider: QuotaProvider, _ visible: Bool) {
        store.setProviderVisible(provider, visible)
        if visible { select(provider) }
        sync()
    }
    var reading: QuotaReading? { preview ? (sampleReading?.provider == selected ? sampleReading : nil) : store.readings[selected] }
    var tokens: TokenReading? { preview ? sampleTokens : store.tokens[selected] }
    var connected: Bool { preview || store.enabled }
    var problem: String? { preview ? nil : store.problems[selected] }
    var isFresh: Bool { problem == nil && reading.map { !$0.stale(at: now) } == true }
    var providerName: String { Self.label(selected) }
    static func label(_ p: QuotaProvider) -> String { switch p { case .claude: return "Claude"; case .gemini: return "Gemini"; case .grok: return "Grok"; case .codex: return "OpenAI" } }
    func lanes() -> [(String, QuotaWindow?)] {
        let windows = reading?.windows ?? []
        if selected == .claude {
            let five = windows.first { $0.durationMinutes == 300 || $0.title.lowercased().contains("session") || $0.title.lowercased().contains("5-hour") }
            let weekly = windows.first { $0.durationMinutes == 10080 || $0.title.lowercased().contains("week") || $0.title.lowercased().contains("7-day") }
            var result: [(String, QuotaWindow?)] = [("5-hour window", five), ("Weekly window", weekly)]
            result += windows.filter { $0.key != five?.key && $0.key != weekly?.key }.map { ($0.title, Optional($0)) }
            return result
        }
        return windows.isEmpty ? [("Subscription quota", nil)] : windows.map { ($0.title, Optional($0)) }
    }
    func forecast(_ window: QuotaWindow) -> QuotaForecast? {
        guard isFresh, !window.expired(at: now) else { return nil }
        if preview, let reading { return sampleHistory.forecast(provider: selected, reading: reading, window: window, now: now) }
        return store.forecast(selected, window: window, now: now)
    }
    var limitNotice: String? {
        guard hasQuota else { return nil }
        let windows = lanes().compactMap { $0.1 }.filter { !$0.expired(at: now) }
        if let full = windows.first(where: { $0.used >= 100 }) { return "\(full.title) limit fully used" }
        let measured = windows.compactMap { window -> (QuotaWindow, QuotaForecast)? in
            guard let estimate = forecast(window), let seconds = estimate.secondsToLimit, seconds > 0 else { return nil }
            return (window, estimate)
        }
        let preReset = measured.filter { window, estimate in
            guard let reset = window.resetsAt, let seconds = estimate.secondsToLimit else { return false }
            return seconds < reset.timeIntervalSince(now)
        }
        if let first = preReset.min(by: { ($0.1.secondsToLimit ?? .infinity) < ($1.1.secondsToLimit ?? .infinity) }) {
            let minutes = max(1, Int(ceil(first.1.secondsToLimit!/60)))
            let duration = minutes >= 1440 ? "\(minutes/1440)d \((minutes%1440)/60)h" : minutes >= 60 ? "\(minutes/60)h \(minutes%60)m" : "\(minutes)m"
            let title = first.0.durationMinutes == 300 ? "5-hour" : first.0.title.replacingOccurrences(of: " window", with: "").lowercased()
            return "Est. ~\(duration) to \(title) limit"
        }
        if measured.count == windows.count && !measured.isEmpty { return "At this pace: resets before limit" }
        if reading?.scopeKey == nil { return "Limit ETA: account identity unavailable" }
        if windows.contains(where: { $0.resetsAt == nil }) { return "Limit ETA: reset time unavailable" }
        return "Limit ETA: collecting usage pace"
    }
    static func sample(store: QuotaStore) -> DashboardState {
        let state = DashboardState(store: store); state.preview = true
        let now = Date(); state.now = now
        let reset = now.addingTimeInterval(2*3600+37*60)
        let weekReset = now.addingTimeInterval(3*86400+3600)
        for index in 0..<3 {
            let at = now.addingTimeInterval(Double(index-2)*300)
            let windows = [QuotaWindow(title: "Session", used: 31+Double(index)*4, resetsAt: reset, key: "primary", durationMinutes: 300),
                           QuotaWindow(title: "Weekly", used: 78+Double(index)*2, resetsAt: weekReset, key: "secondary", durationMinutes: 10080),
                           QuotaWindow(title: "Fable", used: 48+Double(index)*2, resetsAt: weekReset, key: "tertiary", durationMinutes: 10080)]
            let reading = QuotaReading(provider: .claude, capturedAt: at, source: "cli", windows: windows, lastKnown: false, scopeKey: "synthetic-preview-account")
            state.sampleHistory.observe(reading); state.sampleReading = reading
        }
        state.sampleTokens = TokenReading(day: TokenParser.day(at: now), input: 128460, output: 24720, capturedAt: now, ratePerMinute: 428)
        return state
    }
}

struct DashboardActions {
    var enable: () -> Void
    var refresh: () -> Void
    var gemini: () -> Void
    var tokens: () -> Void
    var settings: () -> Void
    var close: () -> Void
    var signIn: () -> Void = {}
}

// A glance first: quota figures, one reset line, and no setup/settings prose.
struct MisoDashboard: View {
    @ObservedObject var model: DashboardState
    let actions: DashboardActions
    private var panelSize: CGSize { model.panelSize }
    @Environment(\.colorScheme) private var scheme
    init(model: DashboardState, actions: DashboardActions, panelSize: CGSize = DashboardLayout.preferredSize) {
        self.model = model; self.actions = actions
        if model.panelSize != panelSize { model.panelSize = panelSize }
    }
    private var accent: Color { scheme == .dark ? Color(red: 0.94, green: 0.66, blue: 0.43) : Color(red: 0.65, green: 0.33, blue: 0.16) }
    private var canvas: Color { Color(nsColor: .windowBackgroundColor) }
    private var muted: Color { scheme == .dark ? Color(white: 0.70) : Color(white: 0.40) }
    private var busy: Bool { model.store.refreshing || model.store.readingTokens || model.store.connectingBrowser }
    private var hasQuota: Bool { model.hasQuota }
    private var needsGemini: Bool { model.selected == .gemini && !model.preview && !model.store.geminiBrowserAllowed }

    var body: some View {
        let _ = model.revision
        VStack(spacing: 0) {
            if model.showingStats { activityHeader } else { navigation }
            ScrollView {
                Group {
                    if model.showingStats { activity }
                    else if hasQuota { quotaOverview }
                    else { connectionState }
                }.frame(maxWidth: .infinity, alignment: .leading)
            }.frame(maxWidth: .infinity, maxHeight: .infinity)
            footer
        }
        .padding(.horizontal, 18)
        .frame(width: panelSize.width, height: panelSize.height)
        .background(canvas).tint(accent)
        .onExitCommand(perform: actions.close)
        .onReceive(Timer.publish(every: 15, on: .main, in: .common).autoconnect()) { _ in if !model.preview { model.sync() } }
        .accessibilityElement(children: .contain).accessibilityLabel("Miso usage")
    }

    private var navigation: some View {
        HStack(spacing: 8) {
            Picker("Provider", selection: Binding(get: { model.selected }, set: { model.select($0) })) {
                ForEach(model.visibleTabs, id: \.self) { provider in
                    Text(DashboardState.label(provider)).tag(provider)
                }
            }
            .pickerStyle(.segmented).labelsHidden().controlSize(.regular)
            .tint(Color(white: 0.30))
            .frame(maxWidth: .infinity, minHeight: 30)
            .accessibilityLabel("Provider")
            Menu {
                ForEach(ProviderSelection.optional, id: \.self) { provider in
                    Toggle(DashboardState.label(provider), isOn: Binding(
                        get: { model.visibleTabs.contains(provider) },
                        set: { model.setProviderVisible(provider, $0) }))
                }
            } label: {
                Image(systemName: "plus").font(.system(size: 13, weight: .medium)).frame(width: 26, height: 28)
            }
            .menuStyle(.borderlessButton).menuIndicator(.hidden).fixedSize()
            .help("Add or remove Gemini and Grok").accessibilityLabel("Add providers")
        }.padding(.top, 14).padding(.bottom, 16)
    }

    private var quotaOverview: some View {
        VStack(alignment: .leading, spacing: 10) {
            if let estimate = model.limitNotice {
                Label(estimate, systemImage: "clock")
                    .font(.system(size: 11)).foregroundStyle(muted)
                    .help("Estimate at your recent measured quota pace, assuming similar model and context use. Needs at least three fresh samples, normally about ten minutes. Message counts are not supplied by this quota feed.")
                    .fixedSize(horizontal: false, vertical: true)
            }
            VStack(alignment: .leading, spacing: 10) {
                ForEach(Array(model.lanes().enumerated()), id: \.offset) { _, lane in
                    quotaFigure(title: shortTitle(lane.0), window: lane.1)
                }
            }
        }.padding(.top, 1).padding(.bottom, 8)
    }
    private func quotaFigure(title: String, window: QuotaWindow?) -> some View {
        let usable = model.isFresh && window.map { !$0.expired(at: model.now) } == true
        let near = usable && (window?.used ?? 0) >= 80
        return VStack(alignment: .leading, spacing: 3) {
            HStack(alignment: .firstTextBaseline, spacing: 5) {
                Text(title).font(.system(size: 12, weight: .medium)).lineLimit(1).help(title)
                if near {
                    Image(systemName: "exclamationmark.triangle.fill").font(.system(size: 10)).foregroundStyle(accent)
                        .help("Near limit: at least 80% used").accessibilityLabel("Near limit")
                }
                Spacer(minLength: 8)
                Text(usable ? window!.usedText : "—")
                    .font(.system(size: 23, weight: .semibold, design: .rounded)).tracking(-0.5).monospacedDigit()
                    .foregroundStyle(near ? accent : Color.primary)
                    .lineLimit(1).minimumScaleFactor(0.75)
                if usable { Text("used").font(.system(size: 11)).foregroundStyle(muted) }
            }.accessibilityElement(children: .combine)
            GeometryReader { geometry in
                ZStack(alignment: .leading) {
                    Capsule().fill(Color.primary.opacity(0.08))
                    if usable, let window {
                        Capsule().fill(accent).frame(width: max(0, geometry.size.width * window.usedFraction))
                    }
                }
            }.frame(height: 4)
            Text(usable ? window!.resetText(at: model.now).replacingOccurrences(of: "Resets in ", with: "Resets ") : "Unavailable")
                .font(.system(size: 11)).foregroundStyle(muted).lineLimit(1).monospacedDigit()
                .help(usable ? window!.resetText(at: model.now) : "No current measured quota for this window")
        }
    }
    private func shortTitle(_ title: String) -> String {
        if title == "5-hour window" { return "5-hour" }
        if title == "Weekly window" { return "Weekly" }
        return title
    }

    private var connectionState: some View {
        HStack(spacing: 12) {
            Text(!model.connected ? "Not connected" : busy ? "Checking usage…" : needsGemini ? "Browser access needed" : "Quota unavailable")
                .font(.system(size: 15, weight: .semibold)).lineLimit(2)
            Spacer(minLength: 0)
            if !model.connected {
                Button("Connect", action: actions.enable).controlSize(.large)
            } else if needsGemini {
                Button("Allow access", action: actions.gemini).controlSize(.large).disabled(busy)
            } else if !busy {
                Button("Retry", action: actions.refresh).controlSize(.large)
                Button(action: actions.signIn) { Image(systemName: "questionmark.circle").frame(width: 24, height: 24) }
                    .buttonStyle(.plain).foregroundStyle(muted).help("Sign-in help").accessibilityLabel("Sign-in help")
            } else {
                ProgressView().controlSize(.small).accessibilityLabel("Checking usage")
            }
        }
        .frame(maxWidth: .infinity, minHeight: 58, alignment: .leading)
        .help(model.problem ?? "Uses your existing subscription sign-in; adding a tab does not sign in.")
    }

    private var activityHeader: some View {
        HStack {
            Button { model.showingStats = false } label: { Label("Usage", systemImage: "chevron.left") }
                .buttonStyle(.plain).font(.system(size: 12)).accessibilityLabel("Back to usage")
            Spacer()
            Text(model.providerName).font(.system(size: 12, weight: .medium)).foregroundStyle(muted)
        }.padding(.top, 13).padding(.bottom, 14)
    }
    private var activity: some View {
        let supported = model.selected == .claude || model.selected == .codex
        let reading = model.tokens
        let fresh = reading.map { $0.day == TokenParser.day(at: model.now) && model.now.timeIntervalSince($0.capturedAt) <= 600 } == true
        let usable = fresh && (model.preview || model.store.tokenProblems[model.selected] == nil)
        return VStack(alignment: .leading, spacing: 12) {
            Text("Today on this Mac").font(.system(size: 11)).foregroundStyle(muted)
                .help("Observed local logs. May be incomplete or include other accounts. Not subscription quota.")
            if supported && (model.preview || model.store.tokensEnabled) {
                HStack(spacing: 20) {
                    tokenFigure("Input", usable ? reading?.input : nil)
                    tokenFigure("Output", usable ? reading?.output : nil)
                }
                Text(usable && reading?.ratePerMinute != nil ? "\(Int(reading!.ratePerMinute!).formatted()) tokens/min" : "Pace —")
                    .font(.system(size: 12)).foregroundStyle(muted)
                    .help("Recent measured input/output pace; requires multiple local readings.")
            } else if supported {
                Button("Enable local stats", action: actions.tokens).controlSize(.large)
            } else {
                Text("Local stats unavailable").font(.system(size: 14, weight: .medium))
            }
            HStack {
                Text("Messages used / left")
                Spacer()
                Text("Not reported")
            }.font(.system(size: 11)).foregroundStyle(muted)
                .help("The quota feed provides weighted usage percentages, not an exact count of typed messages or a fixed message allowance. Tokens and API requests are not user messages.")
        }.padding(.top, 2)
    }
    private func tokenFigure(_ label: String, _ value: Double?) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(label).font(.system(size: 12)).foregroundStyle(muted)
            Text(value.map { $0.formatted(.number.precision(.fractionLength(0))) } ?? "—")
                .font(.system(size: 22, weight: .semibold, design: .rounded)).monospacedDigit()
                .lineLimit(1).minimumScaleFactor(0.7)
        }.frame(maxWidth: .infinity, alignment: .leading)
    }
    private var footer: some View {
        HStack(spacing: 8) {
            Image(nsImage: CatArt.image(frame: 0, sleeping: false, palette: 0))
                .interpolation(.none).resizable().frame(width: 24, height: 15).accessibilityHidden(true)
            Text(status).font(.system(size: 11)).foregroundStyle(muted).lineLimit(1)
                .help(sourceDetail)
            Spacer(minLength: 0)
            if !model.showingStats {
                Button("Stats") { model.showingStats = true }.buttonStyle(.plain).font(.system(size: 11)).foregroundStyle(muted)
                    .accessibilityLabel("Show input and output stats")
            }
            Button(action: actions.refresh) { Image(systemName: "arrow.clockwise").font(.system(size: 12)).frame(width: 24, height: 24) }
                .buttonStyle(.plain).foregroundStyle(muted).help("Refresh").accessibilityLabel("Refresh usage")
                .disabled(!model.preview && (busy || !model.connected && !model.store.tokensEnabled))
                .keyboardShortcut("r", modifiers: .command)
            Button(action: actions.settings) { Image(systemName: "gearshape").font(.system(size: 12)).frame(width: 24, height: 24) }
                .buttonStyle(.plain).foregroundStyle(muted).help("Settings").accessibilityLabel("Settings")
        }.padding(.top, 5).padding(.bottom, 9)
    }
    private var status: String {
        if model.preview { return "Sample data" }
        if model.selected == .codex { return "Codex quota" }
        if model.selected == .gemini { return "Gemini app" }
        if !hasQuota { return "Miso" }
        guard let reading = model.reading else { return "Miso" }
        let minutes = max(0, Int(model.now.timeIntervalSince(reading.capturedAt)/60))
        return minutes == 0 ? "Just updated" : "Updated \(minutes)m ago"
    }
    private var sourceDetail: String {
        switch model.selected {
        case .claude: return "Claude subscription quota. Checks every five minutes. Forecasts are estimates at your recent quota pace."
        case .codex: return "Codex subscription limits, not every ChatGPT model's message limit."
        case .gemini: return "Gemini app subscription quota, not Gemini CLI or API credits."
        case .grok: return "Grok subscription quota, not xAI API credits."
        }
    }
}
