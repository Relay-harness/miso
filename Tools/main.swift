import AppKit
import Foundation

func png(_ image: NSImage, at path: String, size: Int? = nil) throws {
    let width = size ?? Int(image.size.width)
    let height = size ?? Int(image.size.height)
    let rep = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: width, pixelsHigh: height, bitsPerSample: 8, samplesPerPixel: 4, hasAlpha: true, isPlanar: false, colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0)!
    NSGraphicsContext.saveGraphicsState()
    NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: rep)
    NSGraphicsContext.current?.imageInterpolation = .none
    image.draw(in: NSRect(x: 0, y: 0, width: width, height: height))
    NSGraphicsContext.restoreGraphicsState()
    try rep.representation(using: .png, properties: [:])!.write(to: URL(fileURLWithPath: path))
}
let root = CommandLine.arguments[1]
let preview = NSImage(size: NSSize(width: 864, height: 360), flipped: false) { _ in
    NSColor(calibratedWhite: 0.94, alpha: 1).setFill()
    NSRect(x: 0, y: 180, width: 864, height: 180).fill()
    NSColor(calibratedWhite: 0.10, alpha: 1).setFill()
    NSRect(x: 0, y: 0, width: 864, height: 180).fill()
    NSGraphicsContext.current?.imageInterpolation = .none
    for row in 0..<2 { for coat in 0..<3 { for asleep in 0..<2 {
        let image = CatArt.image(frame: 1, sleeping: asleep == 1, palette: coat)
        image.draw(in: NSRect(x: coat*288 + asleep*132 + 12, y: row*180+40, width: 108, height: 66))
    } } }
    return true
}
try png(preview, at: root + "/preview.png")
let icon = NSImage(size: NSSize(width: 1024, height: 1024), flipped: false) { _ in
    NSColor(srgbRed: 0.10, green: 0.20, blue: 0.23, alpha: 1).setFill()
    NSBezierPath(roundedRect: NSRect(x: 30, y: 30, width: 964, height: 964), xRadius: 210, yRadius: 210).fill()
    NSGraphicsContext.current?.imageInterpolation = .none
    CatArt.image(frame: 0, sleeping: false, palette: 0).draw(in: NSRect(x: 44, y: 226, width: 936, height: 572))
    return true
}
let iconset = root + "/build/Miso.iconset"
try FileManager.default.createDirectory(atPath: iconset, withIntermediateDirectories: true)
for base in [16,32,128,256,512] {
    try png(icon, at: iconset + "/icon_\(base)x\(base).png", size: base)
    try png(icon, at: iconset + "/icon_\(base)x\(base)@2x.png", size: base*2)
}
for coat in 0..<3 { for asleep in [false,true] { for frame in 0..<8 {
    let image = CatArt.image(frame: frame, sleeping: asleep, palette: coat)
    precondition(image.size == NSSize(width: 36, height: 22))
    precondition(!image.isTemplate)
    var rect = NSRect(origin: .zero, size: image.size)
    precondition(image.cgImage(forProposedRect: &rect, context: nil, hints: nil) != nil)
} } }
print("48 sprite variants rendered; sizes, template flags and rasterization verified")
