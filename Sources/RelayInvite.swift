import AppKit
import SwiftUI

/// A tiny "click me, hooman" tag under the waving menu-bar cat. It never takes clicks or focus, and fades on its own.
@MainActor
final class ClickMeHint {
    private var panel: NSPanel?
    private var hideTimer: Timer?
    static let visibleFor: TimeInterval = 12

    func show(under anchor: NSRect?) {
        close()
        guard let anchor else { return }
        let host = NSHostingView(rootView: ClickMeTag())
        let size = host.fittingSize
        let panel = NSPanel(contentRect: NSRect(origin: .zero, size: size), styleMask: [.borderless, .nonactivatingPanel], backing: .buffered, defer: false)
        panel.level = .statusBar
        panel.backgroundColor = .clear
        panel.isOpaque = false
        panel.hasShadow = true
        panel.ignoresMouseEvents = true
        panel.hidesOnDeactivate = false
        panel.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary, .transient]
        panel.contentView = host
        let screen = NSScreen.main?.visibleFrame ?? anchor
        let x = min(max(anchor.midX - size.width / 2, screen.minX + 6), screen.maxX - size.width - 6)
        panel.setFrameOrigin(NSPoint(x: x, y: anchor.minY - size.height - 2))
        panel.alphaValue = 0
        panel.orderFrontRegardless()
        NSAnimationContext.runAnimationGroup { $0.duration = 0.35; panel.animator().alphaValue = 1 }
        self.panel = panel
        hideTimer = Timer.scheduledTimer(withTimeInterval: Self.visibleFor, repeats: false) { [weak self] _ in
            MainActor.assumeIsolated { self?.fadeOut() }
        }
    }

    private func fadeOut() {
        guard let panel else { return }
        NSAnimationContext.runAnimationGroup({ $0.duration = 0.6; panel.animator().alphaValue = 0 }, completionHandler: { [weak self] in
            MainActor.assumeIsolated { self?.close() }
        })
    }

    func close() {
        hideTimer?.invalidate(); hideTimer = nil
        panel?.orderOut(nil); panel = nil
    }
}

private struct ClickMeTag: View {
    var body: some View {
        VStack(spacing: 0) {
            Triangle().fill(.regularMaterial).frame(width: 10, height: 5)
            Text("click me, hooman")
                .font(.system(size: 11, weight: .medium, design: .rounded))
                .padding(.horizontal, 9).padding(.vertical, 4)
                .background(Capsule().fill(.regularMaterial))
        }
        .padding(4)
        .accessibilityLabel("Click Miso")
    }
}

/// Shown inside the usage window, at its usual size, only after the person clicks the waving cat.
struct RelayInviteContent: View {
    let notice: LimitNudge.Notice
    let palette: Int
    let accent: Color
    let muted: Color
    let open: () -> Void
    let dismiss: () -> Void
    @State private var start = Date()

    /// Waves for about two seconds, then smiles and blinks, with a small wave again every eight seconds.
    private func frame(at date: Date) -> Int {
        if NSWorkspace.shared.accessibilityDisplayShouldReduceMotion { return 4 }
        let t = date.timeIntervalSince(start)
        let step = Int(t / 0.22)
        if t < 2.2 { return step % 4 }
        let idle = (t - 2.2).truncatingRemainder(dividingBy: 8)
        if idle > 6.6 { return step % 4 }
        return idle.truncatingRemainder(dividingBy: 4) < 0.16 ? 5 : 4
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Spacer(minLength: 0)
            TimelineView(.periodic(from: .now, by: 0.11)) { context in
                Image(nsImage: CatArt.greeting(frame: frame(at: context.date), palette: palette))
                    .interpolation(.none).resizable().frame(width: 75, height: 65)
                    .accessibilityLabel("Miso smiling and waving")
            }
            Text("hiya hooman!").font(.system(size: 17, weight: .semibold, design: .rounded))
            Text("\(notice.line) I have something for you :)")
                .font(.system(size: 13)).fixedSize(horizontal: false, vertical: true)
            Text("Relay can pick up your active context and finish this task in a cloud micro-VM.")
                .font(.system(size: 13)).foregroundStyle(muted).fixedSize(horizontal: false, vertical: true)
            Button(action: open) {
                Text("Finish in Relay Cloud Sandbox")
                    .font(.system(size: 13, weight: .semibold)).foregroundStyle(.black.opacity(0.85))
                    .frame(maxWidth: .infinity).padding(.vertical, 9)
                    .background(RoundedRectangle(cornerRadius: 9, style: .continuous).fill(accent))
            }
            .buttonStyle(.plain).padding(.top, 4)
            .keyboardShortcut(.defaultAction)
            HStack { Spacer(); Button("Dismiss", action: dismiss).buttonStyle(.plain).font(.system(size: 11)).foregroundStyle(muted); Spacer() }
            Spacer(minLength: 0)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
        .onAppear { start = Date() }
        .accessibilityElement(children: .contain).accessibilityLabel("Miso has something to tell you")
    }
}

private struct Triangle: Shape {
    func path(in rect: CGRect) -> Path {
        var p = Path()
        p.move(to: CGPoint(x: rect.minX, y: rect.maxY))
        p.addLine(to: CGPoint(x: rect.midX, y: rect.minY))
        p.addLine(to: CGPoint(x: rect.maxX, y: rect.maxY))
        p.closeSubpath()
        return p
    }
}
