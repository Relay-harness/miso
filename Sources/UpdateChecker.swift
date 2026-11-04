import AppKit
import Foundation

struct MisoUpdate: Sendable { let version: String; let page: URL }
enum MisoUpdateResult: Sendable { case current, available(MisoUpdate), unavailable(String) }
enum MisoUpdateChecker {
    static let releases = URL(string: "https://api.github.com/repos/Relay-harness/miso/releases?per_page=20")!
    static func components(_ raw: String) -> [Int]? {
        let value = raw.hasPrefix("v") ? String(raw.dropFirst()) : raw
        let parts = value.split(separator: ".", omittingEmptySubsequences: false)
        guard (2...3).contains(parts.count), parts.allSatisfy({ !$0.isEmpty && $0.allSatisfy(\.isNumber) }) else { return nil }
        let numbers = parts.compactMap { Int($0) }; return numbers.count == parts.count ? numbers : nil
    }
    static func newer(_ candidate: String, than current: String) -> Bool {
        guard let a = components(candidate), let b = components(current) else { return false }
        for i in 0..<max(a.count,b.count) { let x=i<a.count ? a[i]:0, y=i<b.count ? b[i]:0; if x != y { return x > y } }
        return false
    }
    static func parse(_ data: Data, current: String) -> MisoUpdateResult {
        guard components(current) != nil, let list = try? JSONSerialization.jsonObject(with: data) as? [[String:Any]] else { return .unavailable("Invalid update response") }
        let candidates = list.compactMap { row -> MisoUpdate? in
            guard row["draft"] as? Bool != true, let tag = row["tag_name"] as? String, components(tag) != nil,
                  let text = row["html_url"] as? String, let page = URL(string: text), page.scheme == "https", page.host == "github.com",
                  page.path.hasPrefix("/Relay-harness/miso/releases/tag/"), newer(tag, than: current) else { return nil }
            return MisoUpdate(version: tag.hasPrefix("v") ? String(tag.dropFirst()) : tag, page: page)
        }
        guard let latest = candidates.max(by: { newer($1.version, than: $0.version) }) else { return .current }
        return .available(latest)
    }
    static func check(completion: @escaping (MisoUpdateResult) -> Void) {
        var request = URLRequest(url: releases); request.setValue("Miso update check",forHTTPHeaderField:"User-Agent"); request.timeoutInterval=8
        URLSession.shared.dataTask(with: request) { data,response,_ in
            let result: MisoUpdateResult
            if let data, let http=response as? HTTPURLResponse, http.statusCode == 200,
               let current=Bundle.main.object(forInfoDictionaryKey:"CFBundleShortVersionString") as? String {
                result = parse(data, current: current)
            } else { result = .unavailable("Could not check GitHub. Check your connection and retry.") }
            DispatchQueue.main.async { completion(result) }
        }.resume()
    }
}
