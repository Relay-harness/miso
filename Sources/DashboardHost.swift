import AppKit
import SwiftUI

@MainActor
final class DashboardHostingView: NSHostingView<RelayCatDashboard> {
    override func acceptsFirstMouse(for event: NSEvent?) -> Bool { true }
}
