import AppKit
import CoreGraphics
import SwiftUI

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
    private lazy var sharing = CommunitySharing(defaults: settings)
    private lazy var calibration = CalibrationCoordinator(defaults: settings)
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
    private var messageUntil = Date.distantPast
    private var palette: Int { settings.integer(forKey: "palette") }
    private var animate: Bool { settings.object(forKey: "animate") as? Bool ?? true }
    private var sound: Bool { settings.object(forKey: "sound") as? Bool ?? true }
    private var sleeping: Bool { catRest.isSleeping(at: Date()) }

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
            self?.dashboard.sync()
        }
        quotas.onFreshReading = { [weak self] reading in self?.sharing.submit(reading) }
        quotas.refreshIfDue()
        update()
        if CommandLine.arguments.contains("--verify-quota-menu") {
            // A shown-window test must run after AppKit completes launch and attaches the status item.
            DispatchQueue.main.async { self.verifyQuotaMenu(menu) }
            return
        }
        timer = Timer(timeInterval: 0.25, target: self, selector: #selector(tick), userInfo: nil, repeats: true)
        RunLoop.main.add(timer!, forMode: .common)
        NSWorkspace.shared.notificationCenter.addObserver(self, selector: #selector(tick), name: NSWorkspace.didWakeNotification, object: nil)
        // After launch, ask once. Test mode returned above and never presents onboarding.
        DispatchQueue.main.async { [weak self] in self?.offerContributionInvitation() }
    }

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
        quotas.refreshIfDue()
        update()
    }

    private func update() {
        let now = Date()
        let motion = animate && !NSWorkspace.shared.accessibilityDisplayShouldReduceMotion
        let activeFrame = motion ? frame : 0
        let asleep = sleeping
        let key = "\(activeFrame)-\(asleep)-\(palette)"
        if lastImageKey != key {
            status.button?.image = CatArt.image(frame: activeFrame, sleeping: asleep, palette: palette)
            lastImageKey = key
        }
        let focusText = clock.isRunning ? " " + (clock.isPaused ? "Ⅱ " : "") + clock.label(at: now) : ""
        status.button?.title = focusText + quotas.barText(at: now)
        let mood = asleep ? "sleeping" : "keeping you company"
        let description = "Relay Cat is \(mood)" + (clock.isRunning ? " · \(clock.phase == .focus ? "Focus" : "Break") \(clock.label(at: now))" : "")
        status.button?.toolTip = now < messageUntil ? message : description
        status.button?.setAccessibilityLabel(description + (quotas.enabled ? " · " + quotas.displayedProvider.name + " " + quotas.headline(quotas.displayedProvider) : ""))
    }

    func menuWillOpen(_ menu: NSMenu) {
        menuOpen = true
        menu.removeAllItems()
        let nap = add(menu, sleeping ? "Wake Relay Cat up" : "Let Relay Cat nap", #selector(toggleNap(_:)))
        nap.tag = sleeping ? 1 : 0 // Follow the displayed action even if the cooldown ends while the menu is open.
        let colors = NSMenu(title: "Coat color")
        for (index, name) in ["Ginger", "Silver", "Midnight"].enumerated() {
            let item = add(colors, name, #selector(setPalette(_:)))
            item.tag = index; item.state = palette == index ? .on : .off
        }
        let coat = NSMenuItem(title: "Coat color", action: nil, keyEquivalent: "")
        coat.submenu = colors; menu.addItem(coat)
        add(menu, "Animate cat", #selector(toggleAnimation)).state = animate ? .on : .off
        menu.addItem(.separator())
        add(menu, "Show quota beside cat", #selector(toggleQuotaInBar)).state = quotas.showInBar ? .on : .off
        // Keep revocation available without repeating connection/refresh commands in the top-level menu.
        let permissions = NSMenu(title: "Data permissions")
        add(permissions, "Live quota access", #selector(toggleQuotas)).state = quotas.enabled ? .on : .off
        add(permissions, "Local token statistics", #selector(toggleTokenStats)).state = quotas.tokensEnabled ? .on : .off
        add(permissions, "Contribute to global dashboard…", #selector(reviewDashboardContribution))
        add(permissions, "Share community quota signals…", #selector(toggleCommunitySharing)).state = sharing.enabled ? .on : .off
        add(permissions, "Community sharing details…", #selector(communityDetails))
        add(permissions, calibration.running ? "Stop allowance calibration" : "Run allowance calibration…", #selector(toggleAllowanceCalibration))
        add(permissions, "Allowance calibration status…", #selector(calibrationDetails))
        if calibration.transport.hasIdentity { add(permissions, "Delete calibration reports…", #selector(deleteCalibrationReports)) }
        if sharing.hasIdentity { add(permissions, "Delete my shared readings…", #selector(deleteCommunityReadings)) }
        if quotas.enabled && quotas.visibleProviders.contains(.gemini) {
            add(permissions, "Gemini browser access", #selector(connectGemini)).state = quotas.geminiBrowserAllowed ? .on : .off
        }
        let access = NSMenuItem(title: "Data permissions…", action: nil, keyEquivalent: "")
        access.submenu = permissions; menu.addItem(access)
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
        add(menu, "About Relay Cat…", #selector(about))
        add(menu, "Quit Relay Cat", #selector(quit), key: "q")
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
    @objc private func toggleAnimation() { settings.set(!animate, forKey: "animate"); update() }
    @objc private func toggleSound() { settings.set(!sound, forKey: "sound") }
    @objc private func about() {
        NSApp.activate(ignoringOtherApps: true)
        let alert = NSAlert()
        alert.messageText = "Meet Relay Cat"
        alert.informativeText = "A tiny, original pixel cat for your menu bar.\n\nRelay Cat naps after 90 seconds of inactivity, or during a five-minute focus break.\n\nOptional real subscription quotas use the bundled CodexBar reader and your existing sign-ins. No API-cost estimates are shown as quota. Gemini browser access requires separate consent. No raw quota responses or account emails are saved by Relay Cat.\n\nNo advertising analytics or keyboard recording. Community quota sharing is off by default and requires separate consent. OpenAI and Claude tabs, optional Gemini and Grok, quota pace forecasts and optional local token stats. Version 1.9.0 · Independent of Mac Pet."
        alert.addButton(withTitle: "Lovely")
        alert.runModal()
    }

    private func dashboardView(size: CGSize) -> RelayCatDashboard {
        RelayCatDashboard(model: dashboard, actions: DashboardActions(
            enable: { [weak self] in self?.toggleQuotas() },
            refresh: { [weak self] in self?.refreshDashboard() },
            gemini: { [weak self] in self?.connectGemini() },
            tokens: { [weak self] in self?.toggleTokenStats() },
            settings: { [weak self] in self?.showSettings() },
            close: { [weak self] in self?.popover.performClose(nil) },
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
        dashboard.showingStats = false
        dashboard.selected = quotas.displayedProvider
        dashboard.sync()
        quotas.refreshIfDue()
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
        quotas.refresh(); quotas.refreshTokens()
    }
    @objc private func toggleTokenStats() {
        if quotas.tokensEnabled { quotas.setTokensEnabled(false); return }
        popover.performClose(nil)
        NSApp.activate(ignoringOtherApps: true)
        let alert = NSAlert()
        alert.messageText = "Read local input and output totals?"
        alert.informativeText = "The bundled reader will scan Claude and Codex usage logs for today's input/output totals on this Mac. These logs may include multiple provider accounts. No transcript text or raw results are saved by Relay Cat. The reader may update its own usage cache and public model prices.\n\nToken pace is informational. Subscription limit-time estimates use provider quota changes, not guessed token allowances. Gemini and Grok token logs are not supported here yet."
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
        self.verifyCondition(ContributionInvitation.shouldOffer(in: settings, alreadyContributing: false), "First updated launch offers contribution without granting consent")
        let invitation = contributionInvitationAlert()
        self.verifyCondition(invitation.buttons.map(\.title) == ["Not now", "Review quota sharing…", "Review Claude calibration…"], "Invitation offers separate review paths and a clear decline")
        self.verifyCondition(invitation.buttons[0].keyEquivalent == "\r" && invitation.buttons.dropFirst().allSatisfy { $0.keyEquivalent.isEmpty }, "Return defaults to Not now, never contribution")
        self.verifyCondition(invitation.informativeText.contains("throttleindex.com") && invitation.informativeText.contains("uses subscription quota"), "Invitation discloses collector availability and workload cost")
        invitation.layout()
        if let view = invitation.window.contentView {
            view.layoutSubtreeIfNeeded()
            if let bitmap = view.bitmapImageRepForCachingDisplay(in: view.bounds) {
                view.cacheDisplay(in: view.bounds, to: bitmap)
                try? bitmap.representation(using: .png, properties: [:])?.write(to: URL(fileURLWithPath: "contribution-invitation.png"))
            }
        }
        ContributionInvitation.record(.notNow, in: settings)
        self.verifyCondition(!ContributionInvitation.shouldOffer(in: settings, alreadyContributing: false), "Declining prevents repeated automatic invitations")
        self.verifyCondition(!sharing.enabled && !sharing.hasIdentity && !calibration.running && !calibration.transport.hasIdentity && !quotas.enabled, "Invitation rendering and decline do not read accounts, create keys, share, or start a benchmark")
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
        self.verifyCondition(menu.items.prefix(3).map(\.title) == ["Wake Relay Cat up", "Coat color", "Animate cat"], "Pet controls lead settings")
        let sections = menu.items.split(whereSeparator: { $0.isSeparatorItem }).map(Array.init)
        self.verifyCondition(sections.count == 5, "Settings have five concise sections")
        self.verifyCondition(sections[1].first?.title == "Show quota beside cat", "Quota display is in the second section")
        self.verifyCondition(sections[3].map(\.title) == ["Open selected provider usage page…", "Selected provider sign-in help…"], "Provider links are the penultimate section")
        self.verifyCondition(sections[4].map(\.title) == ["About Relay Cat…", "Quit Relay Cat"], "About and Quit stay last")
        let removed = Set(["Disconnect live quotas", "Refresh quotas and tokens", "Stop reading local tokens"])
        self.verifyCondition(menu.items.allSatisfy { !removed.contains($0.title) }, "Redundant top-level actions are gone")
        let permissions = sections[1].last?.submenu
        self.verifyCondition(permissions?.items.map(\.title) == ["Live quota access", "Local token statistics", "Contribute to global dashboard…", "Share community quota signals…", "Community sharing details…", "Run allowance calibration…", "Allowance calibration status…"], "Revocation remains in Data permissions")
        self.verifyCondition(permissions?.items.allSatisfy { $0.state == .off } == true, "Data permissions remain opt-in")
        menu.performActionForItem(at: 0)
        self.verifyCondition(!sleeping && catRest.manuallyAwake, "Manual wake still works")
        menuWillOpen(menu)
        self.verifyCondition(menu.items.first?.title == "Let Relay Cat nap", "Manual nap label remains")
        menu.performActionForItem(at: 0)
        self.verifyCondition(sleeping && !catRest.manuallyAwake, "Manual nap still works")
        menuDidClose(menu)
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
        self.verifyCondition(quotas.quotaProvidersForRefresh == [.codex, .claude])
        dashboard.setProviderVisible(.grok, true)
        self.verifyCondition(dashboard.visibleTabs == [.codex, .claude, .grok] && dashboard.selected == .grok && quotas.displayedProvider == .grok)
        self.verifyCondition(QuotaStore(defaults: settings).visibleProviders == [.codex, .claude, .grok])
        dashboard.setProviderVisible(.grok, true)
        self.verifyCondition(dashboard.visibleTabs.filter { $0 == .grok }.count == 1)
        dashboard.setProviderVisible(.gemini, true)
        self.verifyCondition(dashboard.visibleTabs == [.codex, .claude, .gemini, .grok] && dashboard.selected == .gemini)
        self.verifyCondition(!quotas.geminiBrowserAllowed && quotas.quotaProvidersForRefresh == [.codex, .claude, .grok])
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
            self.verifyCondition(self.catRest.isInspecting && !self.sleeping, "Shown usage wakes Relay Cat")
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
        alert.informativeText = "The bundled open-source CodexBar CLI will contact providers using your existing Claude Code, Codex and Grok sign-ins. It may use their local login files, credential caches or owner CLIs. Provider helpers may read local usage metadata. Relay Cat does not save raw responses or account emails.\n\nThis does not buy credits or run AI prompts. Gemini app browser access stays OFF until you separately approve it. No API-spend estimates are substituted for unavailable quotas.\n\nYou can disconnect any time. Existing in-flight requests may finish after disconnect, but their results will be discarded."
        alert.addButton(withTitle: "Enable live quotas")
        alert.addButton(withTitle: "Cancel")
        if alert.runModal() == .alertFirstButtonReturn { quotas.setEnabled(true) }
    }
    func validateMenuItem(_ menuItem: NSMenuItem) -> Bool {
        if menuItem.action == #selector(refreshQuotas) || menuItem.action == #selector(connectGemini) {
            return !quotas.refreshing && !quotas.connectingBrowser
        }
        return true
    }
    @objc private func refreshQuotas() { quotas.refresh() }
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
        alert.informativeText = "First sign in to the intended account at gemini.google.com/usage. The CodexBar helper will read Gemini session cookies from a supported browser and query Gemini's actual app quota. This is not Gemini CLI or API usage.\n\nmacOS may ask for browser Safe Storage Keychain permission. Only approve the expected CodexBarCLI prompt. No cookie values are displayed or saved by Relay Cat. Once allowed, Gemini checks run every five minutes until you disconnect. If browser access is denied or unsupported, quota stays unavailable."
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
        case .claude: instruction = "Sign in with Claude Code: open `claude` in Terminal and use /login, then confirm /usage works. Relay Cat uses that owner CLI; it does not silently enable direct Claude Keychain access."
        case .codex: instruction = "Run `codex login` in Terminal with your intended subscription account. This reads Codex's default local login, not custom CODEX_HOME profiles. It cannot show every ChatGPT model's remaining messages."
        case .gemini: instruction = "Open gemini.google.com/usage in your intended browser account, then choose Connect Gemini browser session from Relay Cat. Google must expose supported windows for that account. Gemini CLI quotas are not substituted."
        case .grok: instruction = "Run `grok login` in Terminal with your intended subscription account, then refresh. No browser-cookie fallback is enabled for Grok. A balance without a measured usage window stays unavailable."
        }
        alert.informativeText = instruction + "\n\nRefresh every five minutes. Values older than ten minutes, reset-expired windows, missing values and failed refreshes never become a fresh 100%. The dashboard updates after each refresh. Provider endpoints can change."
        alert.addButton(withTitle: "OK")
        alert.runModal()
    }

    private var alreadyContributing: Bool { sharing.enabled || sharing.hasIdentity || calibration.transport.hasIdentity }
    private func contributionInvitationAlert() -> NSAlert {
        let alert = NSAlert()
        alert.messageText = "Help Miso’s global dashboard?"
        alert.informativeText = "Help people compare Claude and Codex subscription allowances.\n\nClaude calibration runs a fixed workload and uses subscription quota. Basic quota sharing sends coarse usage and reset readings; those alone cannot prove allowance changes.\n\nNothing starts until you review and confirm separately. Contributing is optional.\n\nResults appear on throttleindex.com. You can choose Not now."
        // Fail closed: AppKit's default/abort response is the decline action.
        alert.addButton(withTitle: "Not now")
        alert.addButton(withTitle: "Review quota sharing…")
        alert.addButton(withTitle: "Review Claude calibration…")
        alert.buttons[0].keyEquivalent = "\r"
        alert.buttons[1].keyEquivalent = ""
        alert.buttons[2].keyEquivalent = ""
        return alert
    }
    private func runContributionInvitation(_ alert: NSAlert) -> NSApplication.ModalResponse {
        // AppKit can remap modal abort/keyboard responses. Intercept dismissal keys
        // only for this synchronous invitation and normalize them to Not now.
        var declinedByKeyboard = false
        let monitor = NSEvent.addLocalMonitorForEvents(matching: .keyDown) { event in
            if ContributionInvitation.isDismissalKey(event.keyCode) {
                declinedByKeyboard = true
                NSApp.stopModal(withCode: .alertFirstButtonReturn)
                return nil
            }
            return event
        }
        defer { if let monitor { NSEvent.removeMonitor(monitor) } }
        let response = alert.runModal()
        return declinedByKeyboard ? .alertFirstButtonReturn : response
    }
    private func offerContributionInvitation() {
        guard NSApp.modalWindow == nil, !calibration.running else { return }
        if alreadyContributing {
            ContributionInvitation.record(.alreadyContributing, in: settings)
            return
        }
        guard ContributionInvitation.shouldOffer(in: settings, alreadyContributing: false) else { return }
        reviewDashboardContribution()
    }
    @objc private func reviewDashboardContribution() {
        guard !calibration.running else {
            communityAlert("Calibration is running", "Stop or finish the current calibration before reviewing contribution options.")
            return
        }
        popover.performClose(nil)
        NSApp.activate(ignoringOtherApps: true)
        let response = runContributionInvitation(contributionInvitationAlert())
        let choice: ContributionInvitation.Choice
        switch response {
        case .alertThirdButtonReturn: choice = .reviewCalibration
        case .alertSecondButtonReturn: choice = .reviewQuotaSharing
        default: choice = .notNow
        }
        ContributionInvitation.record(choice, in: settings)
        // These existing flows still require their full, independent consent and configuration.
        switch choice {
        case .reviewCalibration: toggleAllowanceCalibration()
        case .reviewQuotaSharing:
            if sharing.enabled { communityDetails() } else { toggleCommunitySharing() }
        case .notNow, .alreadyContributing: break
        }
    }

    @objc private func toggleCommunitySharing() {
        if sharing.enabled { sharing.stop(); return }
        popover.performClose(nil); NSApp.activate(ignoringOtherApps: true)
        let alert = NSAlert()
        alert.messageText = "Share quota signals with the community?"
        alert.informativeText = "Off by default. Only fresh Claude/Codex five-hour and weekly quota percentages, rounded DOWN to 5%, plus reset/observation times rounded to five minutes, and your declared plan will be sent about every five minutes.\n\nNo email, account ID, provider token, prompts, files, or token logs are sent. A random signing identity stays in this Mac's Keychain. The server can link your submissions and sees your network address: pseudonymous, not untraceable. Readings expire after 48 hours; public cohorts need at least 5 installations. Signatures do not prove provider truth.\n\nEnter a server you trust. Stop sharing anytime; use Delete my shared readings to remove prior reports. Changing server requires deleting the previous identity first."
        alert.addButton(withTitle: "Agree and share"); alert.addButton(withTitle: "Cancel")
        let view = NSView(frame: NSRect(x: 0, y: 0, width: 390, height: 136))
        let urlLabel = NSTextField(labelWithString: "Server (throttleindex.com by default; change only if you run your own)")
        urlLabel.frame = NSRect(x: 0, y: 113, width: 390, height: 18); view.addSubview(urlLabel)
        let url = NSTextField(string: sharing.endpoint?.absoluteString ?? CommunityPayload.defaultServer)
        url.placeholderString = CommunityPayload.defaultServer
        url.frame = NSRect(x: 0, y: 82, width: 390, height: 26); view.addSubview(url)
        let claude = NSPopUpButton(frame: NSRect(x: 180, y: 43, width: 210, height: 26)); claude.addItems(withTitles: ["unknown", "pro", "max", "team", "enterprise"])
        let codex = NSPopUpButton(frame: NSRect(x: 180, y: 6, width: 210, height: 26)); codex.addItems(withTitles: ["unknown", "plus", "pro", "team", "enterprise"])
        let claudeLabel = NSTextField(labelWithString: "Claude plan (declared)"); claudeLabel.frame = NSRect(x: 0, y: 47, width: 177, height: 18)
        let codexLabel = NSTextField(labelWithString: "Codex plan (declared)"); codexLabel.frame = NSRect(x: 0, y: 10, width: 177, height: 18)
        [claudeLabel, codexLabel, claude, codex].forEach { view.addSubview($0) }
        alert.accessoryView = view; alert.window.initialFirstResponder = url
        guard alert.runModal() == .alertFirstButtonReturn else { return }
        guard let server = CommunityPayload.endpoint(url.stringValue.trimmingCharacters(in: .whitespacesAndNewlines)) else {
            communityAlert("Sharing stays off", "Use an HTTPS server root without credentials, query, or path. HTTP is accepted only for local development."); return
        }
        do {
            try sharing.enable(server: server, claudePlan: claude.titleOfSelectedItem ?? "unknown", codexPlan: codex.titleOfSelectedItem ?? "unknown")
            if quotas.enabled { quotas.refresh() }
            communityAlert("Community sharing enabled", "Only fresh supported quota windows will be sent. Open Data permissions → Community sharing details to see the transport status. Existing downloads are not retroactively opted in.")
        } catch { communityAlert("Sharing stays off", "Unable to configure signing identity or server. If changing server, delete previously shared readings first. Check macOS Keychain access.") }
    }
    private func communityAlert(_ title: String, _ detail: String) {
        NSApp.activate(ignoringOtherApps: true)
        let alert = NSAlert(); alert.messageText = title; alert.informativeText = detail
        alert.addButton(withTitle: "OK"); alert.runModal()
    }
    @objc private func communityDetails() {
        communityAlert("Community quota sharing", "Sharing: \(sharing.enabled ? "on" : "off")\nServer: \(sharing.endpoint?.absoluteString ?? "not configured")\nStatus: \(sharing.status)\n\nLocal quota reads and community sharing require separate consent. Failed quota reads, stale/expired values, model-specific/file-upload limits without supported measured windows, and Gemini/Grok data are not uploaded. No file contents are inspected. OpenAI quota means Codex subscription windows, not every ChatGPT model. Your signing key never leaves this Mac.")
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
        guard FileManager.default.isExecutableFile(atPath: reader.path) else { communityAlert("Calibration unavailable", "The bundled quota reader is missing. Rebuild or reinstall Relay Cat."); return }
        let alert = NSAlert()
        alert.messageText = "Run an experimental Claude allowance calibration?"
        alert.informativeText = "This is NOT passive tracking. It runs 6 or 12 fixed public sorting tasks using Claude Sonnet 4.5, with tools, MCP, custom hooks and session persistence disabled. It takes roughly 6–15 minutes and CONSUMES YOUR SUBSCRIPTION QUOTA. It may reach a provider limit. A task count is not a token/cost guarantee. No automatic retries or background benchmarks. Stop in Data permissions at any time.\n\nUse the account exclusively for this session: no other Claude Code, browser, desktop or mobile activity. Do not change account, plan or model. Unknown identity/authentication, resets, incomplete task output and insufficient quota movement are rejected. No raw prompts, outputs, files or credentials are uploaded.\n\nOnly after another confirmation: signed, pseudonymous interval quota/task/token/cache counters and declared tier go to your chosen collector for SEVEN DAYS, separately from ordinary quota-sharing consent. A separate Keychain identity links your reports and the collector sees your IP. This estimates effective allowance; it cannot prove official provider limits."
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
        communityAlert("Allowance calibration", "Running: \(calibration.running ? "yes" : "no")\nServer: \(calibration.transport.endpoint?.absoluteString ?? "not configured")\nStatus: \(calibration.status)\n\nNothing starts automatically. Each bounded session requires consent and a second coverage confirmation before upload. Ordinary quota readings and daily token totals are not calibration evidence. Stop a running session from Data permissions. Delete calibration reports separately from ordinary shared readings.")
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
