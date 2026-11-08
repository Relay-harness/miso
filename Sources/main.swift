import AppKit
import CoreGraphics
import SwiftUI
import ServiceManagement

@MainActor
final class AppDelegate: NSObject, NSApplicationDelegate, NSMenuDelegate, NSMenuItemValidation, NSPopoverDelegate {
    private var status: NSStatusItem!
    private var timer: Timer?
    private var clock = FocusClock()
    private let settings: UserDefaults = {
        if CommandLine.arguments.contains("--verify-quota-menu") {
            let suite = "org.relayharness.relay-cat.ui-test"
            let defaults = UserDefaults(suiteName: suite)!
            defaults.removePersistentDomain(forName: suite)
            return defaults
        }
        return .standard
    }()
    private var frame = 0
    private var lastImageKey = ""
    private var catRest = CatRestState()
    private var verificationCount = 0
    private var menuOpen = false
    private var completed = 0
    private lazy var quotas = QuotaStore(defaults: settings)
    private lazy var sharing = CommunitySharing(defaults: settings, identityStore: CommandLine.arguments.contains("--verify-quota-menu") ?
        CommunityIdentityStore(file: FileManager.default.temporaryDirectory.appendingPathComponent("miso-ui-" + UUID().uuidString + "/identity.key"), legacy: { nil }) : nil)
    private lazy var calibration = CalibrationCoordinator(defaults: settings)
    private let clickHint = ClickMeHint()
    /// Set at 95%: the menu-bar cat turns to face you and waves until you click it.
    private var pendingInvite: LimitNudge.Notice?
    private let popover = NSPopover()
    private var dashboardHost: NSViewController?
    private var pendingPopoverCheck: (@MainActor @Sendable () -> Void)?
    private var settingsMenu = NSMenu()
    private lazy var dashboard = DashboardState(store: quotas)
    private var interactionHost: NSViewController?
    private var interactionAnchor: NSPanel?
    private var interactionClicksDone = false
    private var interactionReaderDone = false
    private var interactionHeartbeat = false
    private var message: String?
    private let activity = ProviderActivityMonitor()
    private var availableUpdate: MisoUpdate?
    private var messageUntil = Date.distantPast
    private var palette: Int { settings.integer(forKey: "palette") }
    private var animate: Bool { settings.object(forKey: "animate") as? Bool ?? true }
    private var sound: Bool { settings.object(forKey: "sound") as? Bool ?? true }
    private var sleeping: Bool { catRest.isSleeping(at: Date(), providerActive: quotas.providerActive) }

    func applicationDidFinishLaunching(_ notification: Notification) {
        NSApp.setActivationPolicy(.accessory)
        status = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
        status.button?.imagePosition = .imageLeading
        status.button?.font = NSFont.monospacedDigitSystemFont(ofSize: 11, weight: .medium)
        let menu = NSMenu()
        menu.delegate = self
        settingsMenu = menu
        status.button?.target = self
        status.button?.action = #selector(toggleDashboard)
        status.button?.sendAction(on: [.leftMouseUp, .rightMouseUp])
        popover.behavior = .transient
        popover.delegate = self
        applyDashboardSize(DashboardLayout.size(for: NSScreen.main?.visibleFrame.size ?? CGSize(width: 800, height: 600), expanded: dashboard.expandedLayout))
        dashboard.onLayoutChange = { [weak self] in self?.resizeDashboardIfNeeded() }
        quotas.onChange = { [weak self] in
            self?.update()
            self?.dashboard.sync(); self?.syncConnectionStatus()
        }
        sharing.onChange = { [weak self] in self?.syncConnectionStatus() }
        syncConnectionStatus()
        quotas.onFreshReading = { [weak self] reading in self?.sharing.submit(reading); self?.suggestRelayIfNearLimit(reading) }
        if !CommandLine.arguments.contains("--verify-quota-menu") { enableSharingByDefault(); enableOpenAtLoginByDefault() }
        if !CommandLine.arguments.contains("--verify-quota-menu") { activity.refreshIfDue(interval: 0) { [weak self] active in self?.providersChanged(active) } }
        if !CommandLine.arguments.contains("--verify-quota-menu") { MisoUpdateChecker.check { [weak self] result in self?.handleUpdateResult(result, manual: false) } }
        quotas.refreshIfDue()
        update()
        // Shows the bubble with a sample reading, for design review.
        if CommandLine.arguments.contains("--preview-relay-invite") {
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) { self.showRelayInvite(LimitNudge.Notice(id: "preview", title: "Claude 5-hour limit at 96%", line: "I see your Claude 5-hour limit is almost used up.", url: LimitNudge.url)) }
        }
        if CommandLine.arguments.contains("--verify-quota-menu") {
            // A shown-window test must run after AppKit completes launch and attaches the status item.
            DispatchQueue.main.async { self.verifyQuotaMenu(menu) }
            return
        }
        timer = Timer(timeInterval: 0.25, target: self, selector: #selector(tick), userInfo: nil, repeats: true)
        RunLoop.main.add(timer!, forMode: .common)
        NSWorkspace.shared.notificationCenter.addObserver(self, selector: #selector(didWake), name: NSWorkspace.didWakeNotification, object: nil)
        NSWorkspace.shared.notificationCenter.addObserver(self, selector: #selector(willSleep), name: NSWorkspace.willSleepNotification, object: nil)
    }

    private func syncConnectionStatus() {
        dashboard.watching = quotas.enabled && quotas.providerActive
        dashboard.activityStatus = MisoStatus.text(active: quotas.activeProviders, quotasEnabled: quotas.enabled)
        // Check-ins are daily and don't depend on a provider running, so this line reports the last one.
        let problem = [dashboard.selected, .claude, .codex].compactMap { sharing.providerStatus[$0] }.first { !$0.hasPrefix("Accepted") }
        let last = [QuotaProvider.claude, .codex].compactMap { sharing.lastAccepted($0) }.max()
        if !sharing.enabled { dashboard.reportingStatus = "Website sharing off" }
        else if !quotas.enabled { dashboard.reportingStatus = "Website sharing paused · quota access off" }
        else if let problem, last == nil || sharing.dailyReportDue() { dashboard.reportingStatus = "Website: " + problem }
        else if let last { dashboard.reportingStatus = "Website: shared " + DateFormatter.localizedString(from: last, dateStyle: .none, timeStyle: .short) + " · next check-in within a day" }
        else { dashboard.reportingStatus = "Website: first check-in pending" }
    }
    private func providersChanged(_ active: Set<QuotaProvider>) {
        if active.isEmpty { catRest.providersStopped() }
        quotas.setActiveProviders(active); update()
    }
    /// At 95% of a 5-hour or weekly window, Miso waves and tells you about Relay, once for that window.
    private func suggestRelayIfNearLimit(_ reading: QuotaReading) {
        guard !CommandLine.arguments.contains("--verify-quota-menu") else { return }
        let sent = settings.dictionary(forKey: LimitNudge.defaultsKey) as? [String: Double] ?? [:]
        let result = LimitNudge.evaluate(reading, sent: sent, now: Date())
        settings.set(result.sent, forKey: LimitNudge.defaultsKey)
        if let notice = result.notice { showRelayInvite(notice) }
    }
    /// Nothing opens by itself: Miso waves, a small tag says "click me, hooman", and the message shows only after a click.
    private func showRelayInvite(_ notice: LimitNudge.Notice) {
        pendingInvite = notice
        lastImageKey = ""
        update()
        let anchor = status.button.flatMap { button in button.window.map { $0.convertToScreen(button.convert(button.bounds, to: nil)) } }
        clickHint.show(under: anchor)
    }
    /// Miso can only notice Claude or Codex while it is open, so it opens at login. Applied once; the checkbox decides after that.
    private func enableOpenAtLoginByDefault() {
        guard LoginItemPolicy.shouldRegister(alreadyApplied: settings.bool(forKey: "openAtLoginDefaultApplied"), bundlePath: Bundle.main.bundlePath, home: NSHomeDirectory()) else { return }
        settings.set(true, forKey: "openAtLoginDefaultApplied")
        if SMAppService.mainApp.status != .enabled { try? SMAppService.mainApp.register() }
    }
    @objc private func willSleep() { quotas.pauseForSleep(); sharing.pauseUploads() }
    @objc private func didWake() { activity.reset(); tick() }
    func applicationWillTerminate(_ notification: Notification) { quotas.cancelReaders(); sharing.pauseUploads(); calibration.stop() }
    @objc private func tick() {
        let now = Date()
        if let event = clock.tick(at: now) {
            switch event {
            case .focusFinished:
                completed += 1
                message = "Nice work! Time for a five-minute stretch."
            case .breakFinished:
                message = "Break is over. Ready when you are."
            }
            messageUntil = now.addingTimeInterval(90)
            if sound { NSSound(named: NSSound.Name("Glass"))?.play() }
        }
        frame = (frame + 1) % 8
        activity.refreshIfDue { [weak self] active in self?.providersChanged(active) }
        quotas.refreshIfDue()
        // An open popover is someone looking at the numbers: keep them fresh even between coding sessions.
        if popover.isShown { quotas.refreshVisibleIfDue() }
        // Daily website check-in: right after install, then once every 24 hours, even when no provider app is open.
        // A failed reading retries at most hourly until one is accepted.
        if sharing.dailyReportDue() { quotas.refreshVisibleIfDue(interval: 3600) }
        update()
    }

    private func update() {
        let now = Date()
        let motion = animate && !NSWorkspace.shared.accessibilityDisplayShouldReduceMotion
        let activeFrame = motion ? frame : 0
        let asleep = sleeping
        if pendingInvite != nil {
            let wave = motion ? frame % 4 : 4
            let key = "wave-\(wave)-\(palette)"
            if lastImageKey != key { status.button?.image = CatArt.menuWave(frame: wave, palette: palette); lastImageKey = key }
        } else {
            let key = "\(activeFrame)-\(asleep)-\(palette)"
            if lastImageKey != key {
                status.button?.image = CatArt.image(frame: activeFrame, sleeping: asleep, palette: palette)
                lastImageKey = key
            }
        }
        let focusText = clock.isRunning ? " " + (clock.isPaused ? "Ⅱ " : "") + clock.label(at: now) : ""
        status.button?.title = focusText + quotas.barText(at: now)
        let description = MisoStatus.text(active: quotas.activeProviders, quotasEnabled: quotas.enabled) + (asleep && quotas.providerActive ? " · napping" : "") + (clock.isRunning ? " · \(clock.phase == .focus ? "Focus" : "Break") \(clock.label(at: now))" : "")
        status.button?.toolTip = now < messageUntil ? message : description
        status.button?.setAccessibilityLabel(description + (quotas.enabled ? " · " + quotas.displayedProvider.name + " " + quotas.headline(quotas.displayedProvider) : ""))
    }

    func menuWillOpen(_ menu: NSMenu) {
        menuOpen = true
        menu.removeAllItems()
        let nap = add(menu, sleeping ? "Wake Miso up" : "Let Miso nap", #selector(toggleNap(_:)))
        nap.tag = sleeping ? 1 : 0 // Follow the displayed action even if the cooldown ends while the menu is open.
        let colors = NSMenu(title: "Coat color")
        for (index, name) in ["Ginger", "Silver", "Midnight"].enumerated() {
            let item = add(colors, name, #selector(setPalette(_:)))
            item.tag = index; item.state = palette == index ? .on : .off
        }
        let coat = NSMenuItem(title: "Coat color", action: nil, keyEquivalent: "")
        coat.submenu = colors; menu.addItem(coat)
        add(menu, "Animate cat", #selector(toggleAnimation)).state = animate ? .on : .off
        add(menu, "Open at login", #selector(toggleOpenAtLogin)).state = !CommandLine.arguments.contains("--verify-quota-menu") && SMAppService.mainApp.status == .enabled ? .on : .off
        menu.addItem(.separator())
        add(menu, "Show quota beside cat", #selector(toggleQuotaInBar)).state = quotas.showInBar ? .on : .off
        // Sharing is on from install; one plain checkbox turns it off. No permissions submenu or consent dialogs.
        add(menu, "Share usage with throttleindex", #selector(toggleCommunitySharing)).state = sharing.enabled ? .on : .off
        if sharing.hasIdentity { add(menu, "Delete my shared readings…", #selector(deleteCommunityReadings)) }
        add(menu, "Local token statistics", #selector(toggleTokenStats)).state = quotas.tokensEnabled ? .on : .off
        if quotas.enabled && quotas.visibleProviders.contains(.gemini) {
            add(menu, "Gemini browser access", #selector(connectGemini)).state = quotas.geminiBrowserAllowed ? .on : .off
        }
        add(menu, calibration.running ? "Stop allowance calibration" : "Run allowance calibration…", #selector(toggleAllowanceCalibration))
        if calibration.transport.hasIdentity { add(menu, "Delete calibration reports…", #selector(deleteCalibrationReports)) }
        menu.addItem(.separator())
        if Date() < messageUntil, let message { menu.addItem(NSMenuItem(title: message, action: nil, keyEquivalent: "")) }
        if clock.isRunning {
            let kind = clock.phase == .focus ? "Focus" : "Break"
            menu.addItem(NSMenuItem(title: "\(kind) · \(clock.label(at: Date()))", action: nil, keyEquivalent: ""))
            add(menu, clock.isPaused ? "Resume timer" : "Pause timer", #selector(togglePause))
            add(menu, "End timer", #selector(stopTimer))
        } else {
            let focus = NSMenu(title: "Start a focus session")
            for minutes in [15, 25, 45] {
                let item = add(focus, "\(minutes) minutes", #selector(startTimer(_:)))
                item.tag = minutes
            }
            let item = NSMenuItem(title: "Start a focus session", action: nil, keyEquivalent: "")
            item.submenu = focus; menu.addItem(item)
        }
        if completed > 0 { menu.addItem(NSMenuItem(title: "\(completed) focus sessions this launch", action: nil, keyEquivalent: "")) }
        add(menu, "Timer sounds", #selector(toggleSound)).state = sound ? .on : .off
        menu.addItem(.separator())
        let usage = add(menu, "Open selected provider usage page…", #selector(openQuotaDashboard(_:)))
        usage.representedObject = dashboard.selected.rawValue
        let help = add(menu, "Selected provider sign-in help…", #selector(quotaSignInHelp(_:)))
        help.representedObject = dashboard.selected.rawValue
        menu.addItem(.separator())
        if let availableUpdate { let item=add(menu, "Update to Miso \(availableUpdate.version)…", #selector(openUpdate)); item.representedObject=availableUpdate.page }
        add(menu, "Check for updates…", #selector(checkForUpdates))
        add(menu, "About Miso…", #selector(about))
        add(menu, "Quit Miso", #selector(quit), key: "q")
    }
    func menuDidClose(_ menu: NSMenu) { menuOpen = false }

    @discardableResult
    private func add(_ menu: NSMenu, _ title: String, _ action: Selector, key: String = "") -> NSMenuItem {
        let item = NSMenuItem(title: title, action: action, keyEquivalent: key)
        item.target = self; menu.addItem(item); return item
    }
    @objc private func startTimer(_ sender: NSMenuItem) { clock.start(minutes: sender.tag, at: Date()); update() }
    @objc private func togglePause() { if clock.isPaused { clock.resume(at: Date()) } else { clock.pause(at: Date()) }; update() }
    @objc private func stopTimer() { clock.stop(); update() }
    @objc private func toggleNap(_ sender: NSMenuItem) {
        if sender.tag == 1 { catRest.wakeManually() } else { catRest.napManually() }
        update()
    }
    @objc private func setPalette(_ sender: NSMenuItem) { settings.set(sender.tag, forKey: "palette"); update() }
    @objc private func toggleOpenAtLogin() {
        Task {
            do {
                if SMAppService.mainApp.status == .enabled { try await SMAppService.mainApp.unregister() }
                else { try SMAppService.mainApp.register() }
            } catch { communityAlert("Login setting was not changed", error.localizedDescription) }
        }
    }
    @objc private func toggleAnimation() { settings.set(!animate, forKey: "animate"); update() }
    @objc private func toggleSound() { settings.set(!sound, forKey: "sound") }
    @objc private func checkForUpdates() { MisoUpdateChecker.check { [weak self] result in self?.handleUpdateResult(result, manual: true) } }
    private func handleUpdateResult(_ result: MisoUpdateResult, manual: Bool) {
        switch result {
        case .current: if manual { communityAlert("Miso is up to date", "No newer published Miso release was found.") }
        case .unavailable(let reason): if manual { communityAlert("Update check failed", reason) }
        case .available(let update):
            availableUpdate = update
            dashboard.updateVersion = update.version
            if manual || settings.string(forKey: "offeredMisoVersion") != update.version { showUpdateAlert(update) }
        }
    }
    @objc private func openUpdate(_ sender: NSMenuItem) { openAvailableUpdate() }
    private func openAvailableUpdate() {
        if let availableUpdate { showUpdateAlert(availableUpdate) } else { checkForUpdates() }
    }
    private func showUpdateAlert(_ update: MisoUpdate) {
        guard NSApp.modalWindow == nil else { return } // The menu action remains available if a dialog is already open.
        // A menu-bar (accessory) app must come to the front, or the alert opens behind other windows.
        popover.performClose(nil)
        NSApp.activate(ignoringOtherApps: true)
        settings.set(update.version, forKey: "offeredMisoVersion")
        let alert=NSAlert(); alert.messageText="Miso \(update.version) is available"
        alert.informativeText="This version does not install updates itself. If installed with Homebrew, quit Miso and run:\n\nbrew update && brew upgrade --cask relay-harness/tap/relay-cat\n\nFor a manual installation, view the release. Keep only one installed app copy."
        alert.addButton(withTitle:"Copy Homebrew update command"); alert.addButton(withTitle:"View release"); alert.addButton(withTitle:"Later")
        let answer = alert.runModal()
        if answer == .alertFirstButtonReturn {
            NSPasteboard.general.clearContents(); NSPasteboard.general.setString("brew update && brew upgrade --cask relay-harness/tap/relay-cat", forType: .string)
        } else if answer == .alertSecondButtonReturn { NSWorkspace.shared.open(update.page) }
    }
    @objc private func about() {
        NSApp.activate(ignoringOtherApps: true)
        let alert = NSAlert()
        alert.messageText = "Meet Miso"
        alert.informativeText = "A tiny, original pixel cat for your menu bar.\n\nMiso naps after 90 seconds of inactivity, or during a five-minute focus break.\n\nReal subscription quotas use the bundled CodexBar reader and your existing sign-ins. No API-cost estimates are shown as quota. Gemini browser access requires separate consent. No raw quota responses or account emails are saved by Miso.\n\nNo advertising analytics or keyboard recording. Miso shares rounded 5-hour and weekly usage with throttleindex.com; uncheck Share usage with throttleindex to stop. OpenAI and Claude tabs, optional Gemini and Grok, quota pace forecasts and optional local token stats. Version \(Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "unknown") · Independent of Mac Pet."
        alert.addButton(withTitle: "Lovely")
        alert.runModal()
    }

    private func dashboardView(size: CGSize) -> RelayCatDashboard {
        RelayCatDashboard(model: dashboard, actions: DashboardActions(
            enable: { [weak self] in self?.toggleQuotas() },
            refresh: { [weak self] in self?.refreshDashboard() },
            update: { [weak self] in self?.openAvailableUpdate() },
            gemini: { [weak self] in self?.connectGemini() },
            tokens: { [weak self] in self?.toggleTokenStats() },
            settings: { [weak self] in self?.showSettings() },
            close: { [weak self] in self?.popover.performClose(nil) },
            openInvite: { [weak self] in
                guard let self, let url = self.dashboard.invite?.url else { return }
                NSWorkspace.shared.open(url); self.dashboard.invite = nil; self.popover.performClose(nil)
            },
            dismissInvite: { [weak self] in self?.dashboard.invite = nil },
            signIn: { [weak self] in
                guard let self else { return }
                let item = NSMenuItem(); item.representedObject = self.dashboard.selected.rawValue
                self.quotaSignInHelp(item)
            }), panelSize: size)
    }
    private func applyDashboardSize(_ size: CGSize) {
        // Resize the parent first, then update the observed child layout. The root stays the same.
        if dashboardHost != nil { popover.contentSize = size }
        dashboard.panelSize = size
        if dashboardHost == nil {
            let view = DashboardHostingView(rootView: dashboardView(size: size))
            view.sizingOptions = []
            let controller = NSViewController()
            controller.view = view
            dashboardHost = controller
            popover.contentViewController = controller
        }
        guard let dashboardHost else { return }
        dashboardHost.preferredContentSize = size
        dashboardHost.view.setFrameSize(size)
        dashboardHost.view.autoresizingMask = [.width, .height]
        popover.contentSize = size
    }
    private func resizeDashboardIfNeeded() {
        guard popover.isShown else { return }
        let visible = status.button?.window?.screen?.visibleFrame.size ?? NSScreen.main?.visibleFrame.size ?? CGSize(width: 800, height: 600)
        let size = DashboardLayout.size(for: visible, expanded: dashboard.expandedLayout)
        if popover.contentSize != size { applyDashboardSize(size) }
    }
    @objc private func toggleDashboard() {
        if NSApp.currentEvent?.type == .rightMouseUp { showSettings(); return }
        if popover.isShown { popover.performClose(nil); return }
        if let invite = pendingInvite {
            dashboard.invite = invite; pendingInvite = nil
            clickHint.close(); lastImageKey = ""; update()
        }
        dashboard.showingStats = false
        dashboard.selected = quotas.displayedProvider
        dashboard.sync()
        // Opening the popover is a user request; it refreshes even when Claude Code/Codex is not running.
        quotas.refreshVisibleIfDue()
        guard let button = status.button else { return }
        let available = button.window?.screen?.visibleFrame.size ?? NSScreen.main?.visibleFrame.size ?? CGSize(width: 800, height: 600)
        applyDashboardSize(DashboardLayout.size(for: available, expanded: dashboard.expandedLayout))
        popover.animates = false
        popover.show(relativeTo: button.bounds, of: button, preferredEdge: .minY)
        // Focus is applied by popoverDidShow, after the window is attached.
    }
    private func showSettings() {
        popover.performClose(nil)
        guard let button = status.button else { return }
        settingsMenu.popUp(positioning: nil, at: NSPoint(x: 0, y: 0), in: button)
    }
    @objc private func refreshDashboard() {
        if !quotas.enabled && !quotas.tokensEnabled { toggleQuotas(); return }
        quotas.refresh(requested: ProviderSelection.optional.contains(dashboard.selected) ? [dashboard.selected] : quotas.userRequestedProviders); quotas.refreshTokens()
    }
    @objc private func toggleTokenStats() {
        if quotas.tokensEnabled { quotas.setTokensEnabled(false); return }
        popover.performClose(nil)
        NSApp.activate(ignoringOtherApps: true)
        let alert = NSAlert()
        alert.messageText = "Read local input and output totals?"
        alert.informativeText = "The bundled reader will scan Claude and Codex usage logs for today's input/output totals on this Mac. These logs may include multiple provider accounts. No transcript text or raw results are saved by Miso. The reader may update its own usage cache and public model prices.\n\nToken pace is informational. Subscription limit-time estimates use provider quota changes, not guessed token allowances. Gemini and Grok token logs are not supported here yet."
        alert.addButton(withTitle: "Enable token stats")
        alert.addButton(withTitle: "Cancel")
        if alert.runModal() == .alertFirstButtonReturn { quotas.setTokensEnabled(true) }
    }
    func popoverDidShow(_ notification: Notification) {
        catRest.opened(); update()
        // Authentication can return focus to another app. Activate only our already-shown
        // accessory popover, then give its attached window keyboard and mouse focus.
        NSApp.activate()
        DispatchQueue.main.async { [weak self] in
            guard let self, self.popover.isShown else { return }
            self.popover.contentViewController?.view.window?.makeKey()
            if let check = self.pendingPopoverCheck {
                self.pendingPopoverCheck = nil
                check()
            }
        }
    }

    func popoverDidClose(_ notification: Notification) {
        dashboard.invite = nil
        catRest.closed(at: Date()); update()
    }

    private func verifyCondition(_ condition: @autoclosure () -> Bool, _ detail: String = "", line: UInt = #line) {
        guard condition() else {
            FileHandle.standardError.write(Data("UI check failed at main.swift:\(line): \(detail)\n".utf8))
            exit(1)
        }
        verificationCount += 1
    }
    private func verifyQuotaMenu(_ menu: NSMenu) {
        // The UI test suite starts from an empty preference domain and never runs the install-time default.
        self.verifyCondition(!sharing.enabled && !sharing.hasIdentity && !calibration.running && !calibration.transport.hasIdentity && !quotas.enabled, "Test launch reads no accounts, creates no keys and shares nothing")
        let measuredPreview = DashboardState.sample(store: quotas)
        measuredPreview.selected = .claude
        self.verifyCondition(measuredPreview.lanes()[0].1?.usedText == "39%", "Quota uses consumed rather than remaining percentage")
        self.verifyCondition(measuredPreview.limitNotice?.contains("weekly limit") == true, "Calibrated quota movement estimates the earliest pre-reset exhaustion")
        measuredPreview.sampleHistory.clear()
        self.verifyCondition(measuredPreview.limitNotice == "Limit ETA: collecting usage pace", "No ETA is invented before calibration")
        let fixture = measuredPreview.sampleReading!
        measuredPreview.sampleReading = QuotaReading(provider: .claude, capturedAt: fixture.capturedAt, source: "fixture", windows: fixture.windows, lastKnown: false)
        self.verifyCondition(measuredPreview.limitNotice == "Limit ETA: account identity unavailable", "Missing account identity is not mislabeled as collecting history")
        let noReset = fixture.windows.map { QuotaWindow(title: $0.title, used: $0.used, resetsAt: nil, key: $0.key, durationMinutes: $0.durationMinutes) }
        measuredPreview.sampleReading = QuotaReading(provider: .claude, capturedAt: fixture.capturedAt, source: "fixture", windows: noReset, lastKnown: false, scopeKey: "synthetic-account")
        self.verifyCondition(measuredPreview.limitNotice == "Limit ETA: reset time unavailable", "Missing reset metadata cannot produce an exhaustion estimate")
        menuWillOpen(menu)
        self.verifyCondition(menu.items.prefix(3).map(\.title) == ["Wake Miso up", "Coat color", "Animate cat"], "Pet controls lead settings")
        let sections = menu.items.split(whereSeparator: { $0.isSeparatorItem }).map(Array.init)
        self.verifyCondition(sections.count == 5, "Settings have five concise sections")
        self.verifyCondition(sections[1].first?.title == "Show quota beside cat", "Quota display is in the second section")
        self.verifyCondition(sections[3].map(\.title) == ["Open selected provider usage page…", "Selected provider sign-in help…"], "Provider links are the penultimate section")
        self.verifyCondition(sections[4].map(\.title) == ["Check for updates…", "About Miso…", "Quit Miso"], "Update check, About and Quit stay last")
        let removed = Set(["Disconnect live quotas", "Refresh quotas and tokens", "Stop reading local tokens"])
        self.verifyCondition(menu.items.allSatisfy { !removed.contains($0.title) }, "Redundant top-level actions are gone")
        self.verifyCondition(sections[1].map(\.title) == ["Show quota beside cat", "Share usage with throttleindex", "Local token statistics", "Run allowance calibration…"], "Sharing is one plain checkbox; no Data permissions submenu")
        self.verifyCondition(menu.items.allSatisfy { $0.submenu?.title != "Data permissions" && !$0.title.hasPrefix("Data permissions") }, "Data permissions submenu is gone")
        menu.performActionForItem(at: 0)
        self.verifyCondition(!sleeping && catRest.manuallyAwake, "Manual wake still works")
        menuWillOpen(menu)
        self.verifyCondition(menu.items.first?.title == "Let Miso nap", "Manual nap label remains")
        menu.performActionForItem(at: 0)
        self.verifyCondition(sleeping && !catRest.manuallyAwake, "Manual nap still works")
        menuDidClose(menu)
        // The cat and status line show whether Claude or Codex is being watched.
        self.verifyCondition(sleeping && dashboard.activityStatus == "Miso is running · quota access off", "Idle status is plain")
        providersChanged([.claude])
        syncConnectionStatus()
        self.verifyCondition(catRest.manuallyNapped && sleeping, "A nap chosen by the user holds during the session")
        providersChanged([])
        providersChanged([.claude])
        self.verifyCondition(!sleeping, "The next Claude session wakes Miso")
        providersChanged([])
        self.verifyCondition(sleeping, "Miso sleeps when Claude and Codex stop")
        self.verifyCondition(dashboard.visibleTabs == [.codex, .claude])
        self.verifyCondition(dashboard.visibleTabs.map(DashboardState.label) == ["OpenAI", "Claude"])
        self.verifyCondition(ProviderSelection.optional.map(DashboardState.label) == ["Gemini", "Grok"])
        self.verifyCondition(dashboard.lanes().map { $0.0 } == ["5-hour window", "Weekly window"])
        self.verifyCondition(dashboard.lanes().allSatisfy { $0.1 == nil })
        self.verifyCondition(!quotas.enabled && !quotas.geminiBrowserAllowed && !quotas.tokensEnabled)
        self.verifyCondition(quotas.readings.isEmpty && !quotas.refreshing && !quotas.readingTokens)
        self.verifyCondition(popover.contentViewController != nil && status.menu == nil)
        self.verifyCondition(status.button?.image != nil)
        dashboard.select(.grok)
        self.verifyCondition(dashboard.selected == .claude && quotas.displayedProvider == .claude)
        self.verifyCondition(quotas.quotaProvidersForRefresh.isEmpty, "No active provider means no automatic quota requests")
        dashboard.setProviderVisible(.grok, true)
        self.verifyCondition(dashboard.visibleTabs == [.codex, .claude, .grok] && dashboard.selected == .grok && quotas.displayedProvider == .grok)
        self.verifyCondition(QuotaStore(defaults: settings).visibleProviders == [.codex, .claude, .grok])
        dashboard.setProviderVisible(.grok, true)
        self.verifyCondition(dashboard.visibleTabs.filter { $0 == .grok }.count == 1)
        dashboard.setProviderVisible(.gemini, true)
        self.verifyCondition(dashboard.visibleTabs == [.codex, .claude, .gemini, .grok] && dashboard.selected == .gemini)
        self.verifyCondition(!quotas.geminiBrowserAllowed && quotas.quotaProvidersForRefresh.isEmpty)
        for provider in DashboardState.tabs {
            dashboard.select(provider)
            self.verifyCondition(dashboard.selected == provider)
            self.verifyCondition(quotas.displayedProvider == provider)
        }
        dashboard.select(.grok)
        dashboard.setProviderVisible(.grok, false)
        self.verifyCondition(dashboard.selected == .codex && quotas.displayedProvider == .codex)
        self.verifyCondition(!quotas.quotaProvidersForRefresh.contains(.grok))
        dashboard.setProviderVisible(.gemini, false)
        self.verifyCondition(QuotaStore(defaults: settings).visibleProviders == [.codex, .claude])
        self.verifyCondition(!quotas.enabled && !quotas.geminiBrowserAllowed && !quotas.tokensEnabled && quotas.readings.isEmpty)
        dashboard.setProviderVisible(.codex, false)
        self.verifyCondition(dashboard.visibleTabs == [.codex, .claude])
        dashboard.select(.claude)
        guard let button = status.button, let host = dashboardHost else { preconditionFailure("Missing status-item host") }
        let visible = button.window?.screen?.visibleFrame.size ?? NSScreen.main!.visibleFrame.size
        let expected = DashboardLayout.size(for: visible, expanded: dashboard.expandedLayout)
        applyDashboardSize(expected)
        self.verifyCondition(expected.width <= 360 && expected.height <= 316)
        self.verifyCondition((host.view as? DashboardHostingView)?.sizingOptions.isEmpty == true)
        // A second app's status item can be hidden by menu-bar overflow during tests.
        // Use a tiny owned, nonactivating anchor window; production still anchors to the cat.
        let screenFrame = NSScreen.main!.visibleFrame
        let anchorPanel = NSPanel(contentRect: NSRect(x: screenFrame.midX, y: screenFrame.maxY-40, width: 36, height: 24),
                                  styleMask: [.borderless, .nonactivatingPanel], backing: .buffered, defer: false)
        anchorPanel.isReleasedWhenClosed = false
        anchorPanel.level = .statusBar
        anchorPanel.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary]
        let anchor = NSButton(frame: NSRect(x: 0, y: 0, width: 36, height: 24))
        anchor.image = CatArt.image(frame: 0, sleeping: false, palette: 0)
        anchorPanel.contentView = anchor
        anchorPanel.orderFrontRegardless()
        popover.animates = false
        popover.behavior = .applicationDefined // Test only: hold visible while measuring.
        // Measure only after AppKit reports a shown popover, not after an arbitrary delay.
        pendingPopoverCheck = {
            self.verifyCondition(self.catRest.isInspecting && !self.sleeping, "Shown usage wakes Miso")
            host.view.layoutSubtreeIfNeeded()
            guard let window = host.view.window else {
                FileHandle.standardError.write(Data("Popover content is not attached to a window after show\n".utf8))
                exit(1)
            }
            let actual = host.view.bounds.size
            let windowSize = window.frame.size
            window.displayIfNeeded()
            if let bitmap = host.view.bitmapImageRepForCachingDisplay(in: host.view.bounds) {
                host.view.cacheDisplay(in: host.view.bounds, to: bitmap)
                try? bitmap.representation(using: .png, properties: [:])?.write(to: URL(fileURLWithPath: "used-opened.png"))
            }
            self.verifyCondition(abs(actual.width-expected.width) <= 1 && abs(actual.height-expected.height) <= 1,
                         "Opened popover has incorrect content bounds: \(actual)")
            self.verifyCondition(windowSize.width <= expected.width+40 && windowSize.height <= expected.height+60 && windowSize.height < visible.height*0.80,
                         "Opened popover grew beyond its explicit bounds: \(windowSize)")
            print("Opened popover: content \(Int(actual.width))x\(Int(actual.height)); window \(Int(windowSize.width))x\(Int(windowSize.height)); display visible \(Int(visible.width))x\(Int(visible.height)) points")
            self.dashboard.showingStats = true
            let expanded = DashboardLayout.size(for: visible)
            host.view.layoutSubtreeIfNeeded()
            self.verifyCondition(self.popover.isShown && self.popover.contentSize == expanded && host.view.bounds.size == expanded,
                         "Stats must expand the existing popover, not close or replace its window")
            self.dashboard.showingStats = false
            host.view.layoutSubtreeIfNeeded()
            self.verifyCondition(self.popover.isShown && self.popover.contentSize == expected && host.view.bounds.size == expected,
                         "Back to usage must shrink an empty panel and retain the popover")
            print("Stats navigation: \(Int(expected.height)) → \(Int(expanded.height)) → \(Int(expected.height)) points; popover stayed open")
            print("Native provider/dashboard checks passed; no provider or log reads")
            self.verifyInteractiveNavigation(host: host, anchor: anchorPanel)
        }
        popover.show(relativeTo: anchor.bounds, of: anchor, preferredEdge: .minY)
        DispatchQueue.main.asyncAfter(deadline: .now() + 5) {
            if self.pendingPopoverCheck != nil {
                FileHandle.standardError.write(Data("No popoverDidShow event within the bounded UI-test deadline\n".utf8))
                exit(1)
            }
        }
    }

    private func verifyInteractiveNavigation(host: NSViewController, anchor: NSPanel) {
        interactionHost = host; interactionAnchor = anchor
        // Explicit synthetic OpenAI-only sign-in. No account, browser or usage-log reads.
        let fixture = DashboardState.sample(store: quotas).sampleReading!
        dashboard.preview = true
        dashboard.sampleReading = QuotaReading(provider: .codex, capturedAt: Date(), source: "synthetic-click-test",
            windows: fixture.windows, lastKnown: false, scopeKey: "synthetic-codex-click-account")
        dashboard.select(.codex)
        self.verifyCondition((host.view as? DashboardHostingView)?.acceptsFirstMouse(for: nil) == true)
        let start = Date()
        Task { @MainActor in
            let result = await QuotaReader.read(executable: URL(fileURLWithPath: "/bin/sleep"), arguments: ["2"],
                environment: ["PATH": "/usr/bin:/bin"], directory: URL(fileURLWithPath: NSTemporaryDirectory()), timeout: 4)
            self.verifyCondition(result.exitCode == 0 && !result.timedOut)
            self.interactionReaderDone = true
            self.finishInteractionChecks()
        }
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.05) {
            self.verifyCondition(Date().timeIntervalSince(start) < 1, "A slow quota-reader process must not block the UI executor")
            self.interactionHeartbeat = true
        }
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.15) { self.clickProviderStep(0) }
        DispatchQueue.global().asyncAfter(deadline: .now() + 8) {
            FileHandle.standardError.write(Data("Native click test exceeded its deadline\n".utf8))
            exit(1)
        }
    }
    private func clickProviderStep(_ step: Int) {
        guard let host = interactionHost, let window = host.view.window else { preconditionFailure("Missing interaction host") }
        if step == 2 { dashboard.setProviderVisible(.gemini, true) }
        if step == 4 { dashboard.setProviderVisible(.grok, true) }
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.05) {
            @MainActor func picker(in view: NSView) -> NSSegmentedControl? {
                if let segmented = view as? NSSegmentedControl { return segmented }
                for child in view.subviews { if let found = picker(in: child) { return found } }
                return nil
            }
            guard let control = picker(in: host.view) else { preconditionFailure("No native provider control") }
            let targets: [(Int, QuotaProvider)] = [(1, .claude), (0, .codex), (0, .codex), (2, .gemini), (1, .claude), (3, .grok)]
            let (segment, expected) = targets[step]
            print("Control: segments=\(control.segmentCount), labels=\((0..<control.segmentCount).map { control.label(forSegment: $0) ?? "" }), bounds=\(control.bounds), frame=\(control.frame), hidden=\(control.isHiddenOrHasHiddenAncestor)")
            let point = control.convert(NSPoint(x: control.bounds.width * (CGFloat(segment)+0.5)/CGFloat(control.segmentCount), y: control.bounds.midY), to: nil)
            print("Mouse click \(step+1): \(DashboardState.label(expected)); key=\(window.isKeyWindow); enabled=\(control.isEnabled)")
            let contentPoint = window.contentView!.convert(point, from: nil)
            print("Click point=\(point), contentPoint=\(contentPoint), hit=\(String(describing: window.contentView!.hitTest(contentPoint)))")
            let time = ProcessInfo.processInfo.systemUptime
            let down = NSEvent.mouseEvent(with: .leftMouseDown, location: point, modifierFlags: [], timestamp: time,
                windowNumber: window.windowNumber, context: nil, eventNumber: 1, clickCount: 1, pressure: 1)!
            let up = NSEvent.mouseEvent(with: .leftMouseUp, location: point, modifierFlags: [], timestamp: time+0.01,
                windowNumber: window.windowNumber, context: nil, eventNumber: 2, clickCount: 1, pressure: 0)!
            NSApp.postEvent(up, atStart: true)
            control.mouseDown(with: down)
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.10) {
                print("Click result: selected=\(self.dashboard.selected), shown=\(self.popover.isShown), sameHost=\(self.dashboardHost?.view === host.view), key=\(window.isKeyWindow), active=\(NSApp.isActive)")
                let clickedSelection = self.dashboard.selected == expected
                self.verifyCondition(clickedSelection && self.popover.isShown && self.dashboardHost?.view === host.view,
                    "A real native click must select \(expected), retain the host and keep the popover interactive")
                host.view.layoutSubtreeIfNeeded()
                if step <= 1, let bitmap = host.view.bitmapImageRepForCachingDisplay(in: host.view.bounds) {
                    host.view.cacheDisplay(in: host.view.bounds, to: bitmap)
                    try? bitmap.representation(using: .png, properties: [:])?.write(to: URL(fileURLWithPath: step == 0 ? "used-claude.png" : "used-openai.png"))
                }
                if step < 5 { self.clickProviderStep(step+1) }
                else { self.interactionClicksDone = true; self.finishInteractionChecks() }
            }
        }
    }
    private func finishInteractionChecks() {
        guard interactionClicksDone && interactionReaderDone else { return }
        self.verifyCondition(interactionHeartbeat)
        popover.performClose(nil)
        DispatchQueue.main.async {
            self.verifyCondition(!self.catRest.isInspecting && !self.catRest.isSleeping(at: Date()), "Closing starts the awake cooldown")
            self.verifyCondition(self.catRest.isSleeping(at: Date().addingTimeInterval(3)), "Closed usage returns to sleep after cooldown")
            print("\(self.verificationCount) native checks passed: settings order/manual actions, wake/close lifecycle, provider clicks and responsive reader; no account/log reads")
            self.interactionAnchor?.close()
            NSApp.terminate(nil)
        }
    }
    @objc private func toggleQuotas() {
        popover.performClose(nil)
        if quotas.enabled { quotas.setEnabled(false); return }
        NSApp.activate(ignoringOtherApps: true)
        let alert = NSAlert()
        alert.messageText = "Connect real subscription quotas?"
        alert.informativeText = "The bundled open-source CodexBar CLI will contact providers using your existing Claude Code, Codex and Grok sign-ins. It may use their local login files, credential caches or owner CLIs. Provider helpers may read local usage metadata. Miso does not save raw responses or account emails.\n\nThis does not buy credits or run AI prompts. Gemini app browser access stays OFF until you separately approve it. No API-spend estimates are substituted for unavailable quotas.\n\nOn first connection, Miso enables sharing of rounded 5-hour and weekly usage percentages with throttleindex.com. If you previously stopped sharing, that choice is kept. It reports once a day, and every Miso install is counted on the website. No prompts, files, emails or credentials leave your Mac. Turn this off anytime: uncheck Share usage with throttleindex.\n\nYou can disconnect any time. Existing in-flight requests may finish after disconnect, but their results will be discarded."
        alert.addButton(withTitle: "Enable live quotas")
        alert.addButton(withTitle: "Cancel")
        if alert.runModal() == .alertFirstButtonReturn {
            quotas.setEnabled(true)
            // Disclosed in the dialog above. Users can stop or delete from the settings menu.
            if !sharing.enabled, settings.object(forKey: "communitySharingEnabled") == nil, let server = URL(string: CommunityPayload.defaultServer) {
                do { try sharing.enable(server: server, claudePlan: "unknown", codexPlan: "unknown") }
                catch { communityAlert("Local quotas connected; sharing is not connected", error.localizedDescription) }
            }
        }
    }
    func validateMenuItem(_ menuItem: NSMenuItem) -> Bool {
        if menuItem.action == #selector(refreshQuotas) || menuItem.action == #selector(connectGemini) {
            return !quotas.refreshing && !quotas.connectingBrowser
        }
        return true
    }
    @objc private func refreshQuotas() { quotas.refresh(requested: quotas.userRequestedProviders) }
    @objc private func toggleQuotaInBar() { quotas.toggleInBar() }
    @objc private func selectQuotaInBar(_ sender: NSMenuItem) {
        if let id = sender.representedObject as? String, let provider = QuotaProvider(rawValue: id) { quotas.setDisplayed(provider) }
    }
    @objc private func openQuotaDashboard(_ sender: NSMenuItem) {
        if let id = sender.representedObject as? String, let provider = QuotaProvider(rawValue: id), let url = URL(string: provider.dashboard) { NSWorkspace.shared.open(url) }
    }
    @objc private func connectGemini() {
        popover.performClose(nil)
        if quotas.geminiBrowserAllowed { quotas.revokeGemini(); return }
        NSApp.activate(ignoringOtherApps: true)
        let alert = NSAlert()
        alert.messageText = "Allow Gemini browser-session access?"
        alert.informativeText = "First sign in to the intended account at gemini.google.com/usage. The CodexBar helper will read Gemini session cookies from a supported browser and query Gemini's actual app quota. This is not Gemini CLI or API usage.\n\nmacOS may ask for browser Safe Storage Keychain permission. Only approve the expected CodexBarCLI prompt. No cookie values are displayed or saved by Miso. Once allowed, Gemini checks run every five minutes until you disconnect. If browser access is denied or unsupported, quota stays unavailable."
        alert.addButton(withTitle: "Allow Gemini access")
        alert.addButton(withTitle: "Cancel")
        if alert.runModal() == .alertFirstButtonReturn { quotas.connectGeminiBrowser() }
    }
    @objc private func quotaSignInHelp(_ sender: NSMenuItem) {
        guard let id = sender.representedObject as? String, let provider = QuotaProvider(rawValue: id) else { return }
        NSApp.activate(ignoringOtherApps: true)
        let alert = NSAlert()
        alert.messageText = provider.name + " quota connection"
        let instruction: String
        switch provider {
        case .claude: instruction = "Sign in with Claude Code: open `claude` in Terminal and use /login, then confirm /usage works. Miso uses that owner CLI; it does not silently enable direct Claude Keychain access."
        case .codex: instruction = "Run `codex login` in Terminal with your intended subscription account. This reads Codex's default local login, not custom CODEX_HOME profiles. It cannot show every ChatGPT model's remaining messages."
        case .gemini: instruction = "Open gemini.google.com/usage in your intended browser account, then choose Connect Gemini browser session from Miso. Google must expose supported windows for that account. Gemini CLI quotas are not substituted."
        case .grok: instruction = "Run `grok login` in Terminal with your intended subscription account, then refresh. No browser-cookie fallback is enabled for Grok. A balance without a measured usage window stays unavailable."
        }
        alert.informativeText = instruction + "\n\nRefresh every five minutes. Values older than ten minutes, reset-expired windows, missing values and failed refreshes never become a fresh 100%. The dashboard updates after each refresh. Provider endpoints can change."
        alert.addButton(withTitle: "OK")
        alert.runModal()
    }

    /// Fresh installs read quotas and share rounded usage with throttleindex.com from the first launch.
    /// An explicit earlier "off" (quota access or sharing) is kept; nothing is re-enabled behind the user's back.
    private func enableSharingByDefault() {
        if settings.object(forKey: "realQuotasEnabled") == nil { quotas.setEnabled(true) }
        // A collector chosen before first launch (e.g. a local one) is kept; otherwise throttleindex.com.
        if quotas.enabled, settings.object(forKey: "communitySharingEnabled") == nil,
           let server = sharing.endpoint ?? URL(string: CommunityPayload.defaultServer) {
            try? sharing.enable(server: server, claudePlan: "unknown", codexPlan: "unknown")
        }
        guard sharing.enabled, !settings.bool(forKey: "sharingNoticeShown") else { return }
        settings.set(true, forKey: "sharingNoticeShown")
        DispatchQueue.main.asyncAfter(deadline: .now() + 2) { [weak self] in self?.showSharingNotice() }
    }
    private func showSharingNotice() {
        guard NSApp.modalWindow == nil, sharing.enabled else { return }
        NSApp.activate(ignoringOtherApps: true)
        let alert = NSAlert()
        alert.messageText = "Miso shares your usage with throttleindex.com"
        alert.informativeText = "Once a day, Miso sends your Claude and Codex 5-hour and weekly usage, rounded down to 5%, to throttleindex.com, where every Miso member is counted. No prompts, files, emails, account IDs or credentials leave your Mac.\n\nTurn it off anytime: click the cat in the menu bar, then the gear icon, and uncheck Share usage with throttleindex."
        alert.addButton(withTitle: "OK")
        alert.addButton(withTitle: "Turn off sharing")
        if alert.runModal() == .alertSecondButtonReturn { sharing.stop() }
    }
    @objc private func toggleCommunitySharing() {
        if sharing.enabled { sharing.stop(); return }
        // Turning sharing back on also needs fresh readings, so quota access comes on with it.
        if !quotas.enabled { quotas.setEnabled(true) }
        let server = sharing.endpoint ?? URL(string: CommunityPayload.defaultServer)!
        do {
            try sharing.enable(server: server, claudePlan: "unknown", codexPlan: "unknown")
            quotas.refresh(requested: quotas.userRequestedProviders)
        } catch { communityAlert("Sharing stays off", "Miso could not set up its reporting identity: " + error.localizedDescription) }
    }
    private func communityAlert(_ title: String, _ detail: String) {
        NSApp.activate(ignoringOtherApps: true)
        let alert = NSAlert(); alert.messageText = title; alert.informativeText = detail
        alert.addButton(withTitle: "OK"); alert.runModal()
    }
    @objc private func recoverLegacyReports() {
        let alert = NSAlert(); alert.messageText = "Delete reports from an older reporting key?"
        alert.informativeText = "Only use this if you shared before 1.9.3. This explicit recovery may ask macOS to unlock Miso's old reporting key. It does not access provider credentials. The key is retained if deletion fails. Normal reporting never opens that prompt."
        alert.addButton(withTitle: "Recover and delete legacy reports"); alert.addButton(withTitle: "Cancel")
        guard alert.runModal() == .alertFirstButtonReturn else { return }
        Task { do { try await sharing.deleteLegacyReports(); communityAlert("Legacy recovery", sharing.status) }
               catch { communityAlert("Legacy recovery not completed", error.localizedDescription) } }
    }
    @objc private func communityDetails() {
        let version = Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "unknown"
        let otherCopies = ["/Applications/Miso.app", NSHomeDirectory()+"/Applications/Miso.app"].filter {
            $0 != Bundle.main.bundlePath && FileManager.default.fileExists(atPath: $0)
        }
        let providerLines = [QuotaProvider.claude, .codex].map { p in
            let accepted = sharing.lastAccepted(p).map { DateFormatter.localizedString(from: $0, dateStyle: .short, timeStyle: .medium) } ?? "never"
            return "\(p.name): \(quotas.headline(p))\nUpload: \(sharing.providerStatus[p] ?? "no attempt this launch")\nLast accepted: \(accepted)"
        }.joined(separator: "\n\n")
        var lines = ["Version: " + version, "Running: " + Bundle.main.bundlePath]
        lines.append("Other app copies: " + (otherCopies.isEmpty ? "none found" : otherCopies.joined(separator: ", ")))
        lines.append("Local quotas: " + (quotas.enabled ? "on" : "off"))
        lines.append("Website sharing: " + (sharing.enabled ? "on" : "off"))
        lines.append("Token-log statistics: " + (quotas.tokensEnabled ? "on" : "off"))
        lines.append("Collector: " + (sharing.endpoint?.absoluteString ?? "not configured"))
        lines.append("\n" + providerLines)
        lines.append("\nSharing off prevents new uploads; old readings expire separately. Counts mean Miso members (installs that have checked in), not online Macs or verified people.")
        communityAlert("Miso connection details", lines.joined(separator: "\n"))
    }
    @objc private func deleteCommunityReadings() {
        popover.performClose(nil); NSApp.activate(ignoringOtherApps: true)
        let alert = NSAlert(); alert.messageText = "Delete shared quota readings?"
        alert.informativeText = "Sharing will stop. A signed deletion request removes this identity's readings from the configured server. The deletion key is kept if the server cannot confirm, so you can retry. Server backups or reverse-proxy logs require the operator's retention policy."
        alert.addButton(withTitle: "Delete and stop"); alert.addButton(withTitle: "Cancel")
        guard alert.runModal() == .alertFirstButtonReturn else { return }
        sharing.deleteShared { [weak self] success in self?.communityAlert(success ? "Shared readings deleted" : "Deletion not confirmed", success ? "Sharing is off. The local signing identity was removed." : "No deletion was confirmed. Sharing is off and the identity remains so you can retry.") }
    }

    @objc private func toggleAllowanceCalibration() {
        if calibration.running { calibration.stop(); return }
        popover.performClose(nil); NSApp.activate(ignoringOtherApps: true)
        let candidates = [FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent(".local/bin/claude"),
            URL(fileURLWithPath: "/opt/homebrew/bin/claude"), URL(fileURLWithPath: "/usr/local/bin/claude")]
        guard let cli = candidates.first(where: { FileManager.default.isExecutableFile(atPath: $0.path) }),
              let resources = Bundle.main.resourceURL else {
            communityAlert("Calibration unavailable", "Install and sign into Claude Code's default subscription profile first. No CLI is downloaded, no sign-in is started, and no workload runs automatically."); return
        }
        let reader = resources.appendingPathComponent("QuotaReader/CodexBarCLI")
        guard FileManager.default.isExecutableFile(atPath: reader.path) else { communityAlert("Calibration unavailable", "The bundled quota reader is missing. Rebuild or reinstall Miso."); return }
        let alert = NSAlert()
        alert.messageText = "Run an experimental Claude allowance calibration?"
        alert.informativeText = "This is NOT passive tracking. It runs 6 or 12 fixed public sorting tasks using Claude Sonnet 4.5, with tools, MCP, custom hooks and session persistence disabled. It takes roughly 6–15 minutes and CONSUMES YOUR SUBSCRIPTION QUOTA. It may reach a provider limit. A task count is not a token/cost guarantee. No automatic retries or background benchmarks. Stop from the settings menu at any time.\n\nUse the account exclusively for this session: no other Claude Code, browser, desktop or mobile activity. Do not change account, plan or model. Unknown identity/authentication, resets, incomplete task output and insufficient quota movement are rejected. No raw prompts, outputs, files or credentials are uploaded.\n\nOnly after another confirmation: signed, pseudonymous interval quota/task/token/cache counters and declared tier go to your chosen collector for SEVEN DAYS, separately from ordinary quota-sharing consent. A separate Keychain identity links your reports and the collector sees your IP. This estimates effective allowance; it cannot prove official provider limits."
        alert.addButton(withTitle: "Agree and run bounded session"); alert.addButton(withTitle: "Cancel")
        let view = NSView(frame: NSRect(x: 0, y: 0, width: 430, height: 150))
        let label = NSTextField(labelWithString: "Server (throttleindex.com by default; change only if you run your own)")
        label.frame = NSRect(x: 0, y: 127, width: 430, height: 18); view.addSubview(label)
        let url = NSTextField(string: calibration.transport.endpoint?.absoluteString ?? CommunityPayload.defaultServer)
        url.placeholderString = CommunityPayload.defaultServer
        url.frame = NSRect(x: 0, y: 96, width: 430, height: 25); view.addSubview(url)
        let plan = NSPopUpButton(frame: NSRect(x: 0, y: 56, width: 205, height: 26)); plan.addItems(withTitles: ["pro", "max_5x", "max_20x"]); view.addSubview(plan)
        let limit = NSPopUpButton(frame: NSRect(x: 220, y: 56, width: 210, height: 26)); limit.addItems(withTitles: ["6 tasks (lower usage)", "12 tasks (higher usage)"]); view.addSubview(limit)
        let exclusive = NSButton(checkboxWithTitle: "I will not use this Claude account elsewhere during the session.", target: nil, action: nil)
        exclusive.frame = NSRect(x: 0, y: 12, width: 430, height: 32); exclusive.font = NSFont.systemFont(ofSize: 11); view.addSubview(exclusive)
        alert.accessoryView = view; alert.window.initialFirstResponder = url
        guard alert.runModal() == .alertFirstButtonReturn else { return }
        guard exclusive.state == .on, let server = CommunityPayload.endpoint(url.stringValue.trimmingCharacters(in: .whitespacesAndNewlines)) else {
            communityAlert("Calibration stays off", "Explicit exclusive-account confirmation and a trusted HTTPS collector root are required. Loopback HTTP is allowed for local development."); return
        }
        var directory: URL?
        do {
            try calibration.transport.configure(server)
            let work = FileManager.default.temporaryDirectory.appendingPathComponent("relay-cat-calibration-" + UUID().uuidString, isDirectory: true)
            directory = work
            try FileManager.default.createDirectory(at: work, withIntermediateDirectories: false, attributes: [.posixPermissions: 0o700])
            let config = work.appendingPathComponent("reader-config.json")
            let document: [String: Any] = ["version": 1, "providers": [["id": "claude", "enabled": true, "source": "cli", "cookieSource": "off"]], "shareUsageWithCLI": false]
            try JSONSerialization.data(withJSONObject: document).write(to: config, options: [.atomic])
            try FileManager.default.setAttributes([.posixPermissions: 0o600], ofItemAtPath: config.path)
            var environment = QuotaReader.environment(home: FileManager.default.homeDirectoryForCurrentUser, config: config, allowBrowserCookies: false)
            environment["CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC"] = "1"
            environment["DISABLE_AUTOUPDATER"] = "1"
            let configuration = CalibrationConfiguration(cli: cli, reader: reader, directory: work, config: config,
                plan: plan.titleOfSelectedItem ?? "pro", taskLimit: limit.indexOfSelectedItem == 0 ? 6 : 12, environment: environment)
            calibration.start(configuration: configuration, confirm: { [weak self] candidate in self?.confirmCalibration(candidate) ?? false },
                finished: { [weak self] status in self?.communityAlert("Allowance calibration", status) })
        } catch {
            if let directory { try? FileManager.default.removeItem(at: directory) }
            communityAlert("Calibration did not start", (error as? CalibrationFailure)?.message ?? "Unable to prepare the local calibration safely.")
        }
    }
    private func confirmCalibration(_ candidate: CalibrationCandidate) -> Bool {
        NSApp.activate(ignoringOtherApps: true)
        let alert = NSAlert(); alert.messageText = "Upload this measured calibration interval?"
        alert.informativeText = "The fixed workload completed and produced \(candidate.measurements.count) eligible window(s). No raw prompt, output or file will be sent. Signed quota endpoints and aggregate task/token/cache counters are retained for seven days. Public estimates still need historical data and 10 matched installations.\n\nIf any other activity used this Claude account, the evidence is not valid. Confirm again, or discard it. Discarding cannot undo quota already consumed."
        let check = NSButton(checkboxWithTitle: "No other account activity or account/plan change occurred.", target: nil, action: nil)
        check.frame = NSRect(x: 0, y: 0, width: 410, height: 34); check.font = NSFont.systemFont(ofSize: 11)
        alert.accessoryView = check; alert.addButton(withTitle: "Confirm and upload"); alert.addButton(withTitle: "Discard")
        return alert.runModal() == .alertFirstButtonReturn && check.state == .on
    }
    @objc private func calibrationDetails() {
        communityAlert("Allowance calibration", "Running: \(calibration.running ? "yes" : "no")\nServer: \(calibration.transport.endpoint?.absoluteString ?? "not configured")\nStatus: \(calibration.status)\n\nNothing starts automatically. Each bounded session requires consent and a second coverage confirmation before upload. Ordinary quota readings and daily token totals are not calibration evidence. Stop a running session from the settings menu. Delete calibration reports separately from ordinary shared readings.")
    }
    @objc private func deleteCalibrationReports() {
        guard !calibration.running else { communityAlert("Stop calibration first", "Stop the active session and wait for it to finish before deleting its identity."); return }
        let alert = NSAlert(); alert.messageText = "Delete calibration reports?"
        alert.informativeText = "This removes the calibration identity's reports from its configured collector and then its local Keychain key. Failed deletion retains the key for retry. This does not delete ordinary quota reports signed with the separate community key. Operator backups/logs need a separate policy."
        alert.addButton(withTitle: "Delete calibration reports"); alert.addButton(withTitle: "Cancel")
        guard alert.runModal() == .alertFirstButtonReturn else { return }
        Task { [weak self] in
            guard let self else { return }
            do { try await calibration.transport.delete(); communityAlert("Calibration deletion", calibration.transport.status) }
            catch { communityAlert("Deletion not confirmed", (error as? CalibrationFailure)?.message ?? "The signing key is retained so you can retry.") }
        }
    }

    @objc private func quit() {
        if calibration.running {
            calibration.stop()
            DispatchQueue.main.asyncAfter(deadline: .now()+3) { NSApp.terminate(nil) }
        } else { NSApp.terminate(nil) }
    }
}

MainActor.assumeIsolated {
    let app = NSApplication.shared
    let delegate = AppDelegate()
    app.delegate = delegate
    app.run()
}
