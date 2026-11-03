import Foundation

/// The invitation is not data-sharing consent. Only local onboarding choices are stored here.
enum ContributionInvitation {
    static let version = 1
    enum Choice: String, CaseIterable { case reviewCalibration, reviewQuotaSharing, notNow, alreadyContributing }
    static func shouldOffer(in defaults: UserDefaults, alreadyContributing: Bool) -> Bool {
        !alreadyContributing && defaults.integer(forKey: "contributionInvitationVersion") < version
    }
    static func isDismissalKey(_ code: UInt16) -> Bool { [36, 53, 76].contains(code) }
    static func record(_ choice: Choice, in defaults: UserDefaults) {
        defaults.set(version, forKey: "contributionInvitationVersion")
        defaults.set(choice.rawValue, forKey: "contributionInvitationChoice")
    }
}
