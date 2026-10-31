import Foundation
import CoreGraphics

/// One sizing policy shared by SwiftUI, AppKit, snapshots, and tests.
enum DashboardLayout {
    static let preferredSize = CGSize(width: 360, height: 316)
    static let emptyHeight: CGFloat = 180
    static func size(for visible: CGSize, expanded: Bool = true) -> CGSize {
        CGSize(width: min(preferredSize.width, max(1, floor(visible.width - 24))),
               height: min(expanded ? preferredSize.height : emptyHeight, max(1, floor(visible.height * 0.60))))
    }
}
