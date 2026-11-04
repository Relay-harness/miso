import AppKit
import Foundation

struct MisoUpdate: Sendable { let version: String; let page: URL }
enum MisoUpdateChecker {
    static let releases = URL(string: "https://api.github.com/repos/Relay-harness/miso/releases?per_page=20")!
    static func newer(_ candidate: String, than current: String) -> Bool {
        func parts(_ value: String) -> [Int] { value.trimmingCharacters(in: CharacterSet(charactersIn: "v")).split(separator: ".").map { Int($0) ?? 0 } }
        let a=parts(candidate), b=parts(current); for i in 0..<max(a.count,b.count) { let x=i<a.count ? a[i]:0, y=i<b.count ? b[i]:0; if x != y { return x > y } }; return false
    }
    static func check(completion: @escaping (MisoUpdate?) -> Void) {
        var request=URLRequest(url: releases); request.setValue("Miso update check",forHTTPHeaderField:"User-Agent"); request.timeoutInterval=8
        URLSession.shared.dataTask(with: request) { data,response,_ in
            guard let data, let http=response as? HTTPURLResponse, http.statusCode == 200,
                  let releases=try? JSONSerialization.jsonObject(with:data) as? [[String:Any]],
                  let current=Bundle.main.object(forInfoDictionaryKey:"CFBundleShortVersionString") as? String else { return DispatchQueue.main.async { completion(nil) } }
            let candidates=releases.compactMap { object -> MisoUpdate? in
                guard object["draft"] as? Bool != true, let tag=object["tag_name"] as? String,
                      let pageText=object["html_url"] as? String, let page=URL(string:pageText), newer(tag,than:current) else { return nil }
                return MisoUpdate(version:tag.trimmingCharacters(in:CharacterSet(charactersIn:"v")),page:page)
            }
            let update=candidates.max { !newer($0.version,than:$1.version) }
            DispatchQueue.main.async { completion(update) }
        }.resume()
    }
}
