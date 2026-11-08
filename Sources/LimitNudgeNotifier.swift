import AppKit
@preconcurrency import UserNotifications

/// Shows the 95% notice with an "Open relayevals.com" button. Clicking the notice or the button opens the site.
final class LimitNudgeNotifier: NSObject, UNUserNotificationCenterDelegate, @unchecked Sendable {
    static let category = "miso-limit-nudge"
    static let openAction = "open-relayevals"
    private let center = UNUserNotificationCenter.current()

    override init() {
        super.init()
        center.delegate = self
        let open = UNNotificationAction(identifier: Self.openAction, title: "Open relayevals.com", options: [.foreground])
        center.setNotificationCategories([UNNotificationCategory(identifier: Self.category, actions: [open], intentIdentifiers: [], options: [])])
    }

    /// Asks for permission the first time a notice is due, so nobody gets a prompt before it matters.
    func post(_ notice: LimitNudge.Notice) {
        center.requestAuthorization(options: [.alert, .sound]) { [center] granted, _ in
            guard granted else { return }
            let content = UNMutableNotificationContent()
            content.title = notice.title
            content.body = notice.body
            content.sound = .default
            content.categoryIdentifier = Self.category
            center.add(UNNotificationRequest(identifier: notice.id, content: content, trigger: nil))
        }
    }

    func userNotificationCenter(_ center: UNUserNotificationCenter, willPresent notification: UNNotification,
                                withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void) {
        completionHandler([.banner, .sound])
    }

    func userNotificationCenter(_ center: UNUserNotificationCenter, didReceive response: UNNotificationResponse,
                                withCompletionHandler completionHandler: @escaping () -> Void) {
        let ours = response.notification.request.content.categoryIdentifier == Self.category
        if ours && [Self.openAction, UNNotificationDefaultActionIdentifier].contains(response.actionIdentifier) {
            DispatchQueue.main.async { NSWorkspace.shared.open(LimitNudge.url) }
        }
        completionHandler()
    }
}
