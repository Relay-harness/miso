import AppKit
import SwiftUI

@MainActor
final class DashboardHostingView: NSHostingView<MisoDashboard> {
    override func acceptsFirstMouse(for event: NSEvent?) -> Bool { true }
}
