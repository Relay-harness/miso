import Foundation
var checks = 0
func check(_ condition: @autoclosure () -> Bool, _ message: String) {
    guard condition() else { fatalError("FAIL: " + message) }
    checks += 1; print("PASS: " + message)
}
let suite = "org.relayharness.relay-cat.invitation-test-" + UUID().uuidString
let defaults = UserDefaults(suiteName: suite)!
defer { defaults.removePersistentDomain(forName: suite) }
let consentKeys = ["communitySharingEnabled", "communityConsentVersion", "communityIdentityCreated", "communityServer", "realQuotasEnabled", "localTokenStatsEnabled", "calibrationIdentityCreated", "calibrationServer"]
check(ContributionInvitation.shouldOffer(in: defaults, alreadyContributing: false), "first updated launch can invite")
check(!ContributionInvitation.shouldOffer(in: defaults, alreadyContributing: true), "existing contributors are not asked again")
check(ContributionInvitation.isDismissalKey(36), "Return is a decline key")
check(ContributionInvitation.isDismissalKey(53), "Escape is a decline key")
check(ContributionInvitation.isDismissalKey(76), "numeric Enter is a decline key")
check(!ContributionInvitation.isDismissalKey(49), "explicit Space activation is not silently reinterpreted")
for choice in ContributionInvitation.Choice.allCases {
    defaults.removePersistentDomain(forName: suite)
    ContributionInvitation.record(choice, in: defaults)
    check(!ContributionInvitation.shouldOffer(in: defaults, alreadyContributing: false), "review or dismissal is remembered: " + choice.rawValue)
    check(defaults.string(forKey: "contributionInvitationChoice") == choice.rawValue, "only the explicit local choice is stored")
    check(consentKeys.allSatisfy { defaults.object(forKey: $0) == nil }, "invitation never grants quota access, sharing or calibration consent")
    let reopened = UserDefaults(suiteName: suite)!
    check(!ContributionInvitation.shouldOffer(in: reopened, alreadyContributing: false), "choice survives reopening preferences")
}
defaults.removePersistentDomain(forName: suite)
defaults.set(true, forKey: "communitySharingEnabled")
defaults.set(1, forKey: "communityConsentVersion")
ContributionInvitation.record(.notNow, in: defaults)
check(defaults.bool(forKey: "communitySharingEnabled") && defaults.integer(forKey: "communityConsentVersion") == 1, "invitation never silently changes existing sharing consent")
print("\(checks) invitation checks passed. No account, Keychain, subprocess or network access.")
