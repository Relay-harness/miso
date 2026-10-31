import AppKit
import SwiftUI

MainActor.assumeIsolated {
    let app = NSApplication.shared
    app.setActivationPolicy(.accessory)
    let defaults = UserDefaults(suiteName: "org.relayharness.miso-track.design-preview")!
    defaults.removePersistentDomain(forName: "org.relayharness.miso-track.design-preview")
    let store = QuotaStore(defaults: defaults)
    if CommandLine.arguments.contains("--all-providers") {
        store.setProviderVisible(.gemini, true); store.setProviderVisible(.grok, true)
    }
    let model = CommandLine.arguments.contains("--empty") ? DashboardState(store: store) : DashboardState.sample(store: store)
    let actions = DashboardActions(enable: {}, refresh: {}, gemini: {}, tokens: {}, settings: {}, close: {})
    let smallDisplay = CommandLine.arguments.contains("--small")
    model.showingStats = CommandLine.arguments.contains("--stats")
    let size = DashboardLayout.size(for: smallDisplay ? CGSize(width: 600, height: 300) : CGSize(width: 1470, height: 856), expanded: model.expandedLayout)
    let root = MisoDashboard(model: model, actions: actions, panelSize: size)
        .environment(\.colorScheme, CommandLine.arguments.contains("--dark") ? .dark : .light)
    let host = NSHostingView(rootView: root)
    host.frame = NSRect(origin: .zero, size: size)
    let window = NSWindow(contentRect: host.frame, styleMask: .borderless, backing: .buffered, defer: false)
    window.contentView = host
    window.displayIfNeeded()
    host.layoutSubtreeIfNeeded()
    guard let bitmap = host.bitmapImageRepForCachingDisplay(in: host.bounds) else { fatalError("No snapshot bitmap") }
    host.cacheDisplay(in: host.bounds, to: bitmap)
    let destination = CommandLine.arguments[1]
    try! bitmap.representation(using: .png, properties: [:])!.write(to: URL(fileURLWithPath: destination))
    print("Rendered original dashboard to " + destination)
}
