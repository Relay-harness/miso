import AppKit

/// Original procedural pixel art. Coordinates are a 36 × 22 logical pixel grid.
enum CatArt {
    static func image(frame: Int, sleeping: Bool, palette: Int) -> NSImage {
        let coats: [[NSColor]] = [
            [color(0xECA34E), color(0xB9652C), color(0xFFE2AC)],
            [color(0xA8B6C6), color(0x6D7F95), color(0xE8EEF5)],
            [color(0x53596C), color(0x33394A), color(0xB8C1D6)]
        ]
        let coat = coats[max(0, min(2, palette))]
        let outline = color(0x252937)
        var cells: [Int: Int] = [:]
        func rect(_ x: Int, _ y: Int, _ w: Int, _ h: Int, _ shade: Int = 0) {
            for row in y..<(y+h) { for col in x..<(x+w) {
                if col >= 0 && col < 36 && row >= 0 && row < 22 { cells[row*36+col] = shade }
            } }
        }
        let f = ((frame % 8) + 8) % 8
        if sleeping {
            let breath = f < 4 ? 0 : 1
            rect(11, 12-breath, 16, 7+breath)
            rect(14, 10-breath, 10, 2)
            rect(8, 13, 8, 6)
            rect(8, 10, 3, 4); rect(13, 11, 3, 3)
            rect(9, 11, 1, 2, 3)
            rect(24, 15, 5, 3, 1); rect(21, 18, 7, 2, 1)
            rect(19, 16, 3, 3, 2)
            rect(9, 16, 2, 1, 4); rect(13, 16, 2, 1, 4)
            rect(11, 18, 2, 1, 2)
            // A tiny drifting z, drawn in pixels rather than a font.
            let zY = f < 4 ? 5 : 3
            rect(27, zY, 4, 1, 2); rect(29, zY+1, 1, 1, 2)
            rect(28, zY+2, 1, 1, 2); rect(27, zY+3, 4, 1, 2)
        } else {
            let step = f % 4
            let bob = (step == 1 || step == 3) ? 1 : 0
            rect(15, 9+bob, 12, 8)
            rect(18, 8+bob, 6, 2)
            rect(7, 6+bob, 11, 9)
            rect(6, 8+bob, 13, 5)
            rect(7, 3+bob, 3, 4); rect(14, 3+bob, 3, 4)
            rect(8, 4+bob, 1, 2, 3); rect(15, 4+bob, 1, 2, 3)
            rect(10, 12+bob, 6, 3, 2)
            rect(17, 14+bob, 8, 3, 2)
            rect(18, 9+bob, 2, 3, 1); rect(23, 9+bob, 2, 3, 1)
            rect(11, 6+bob, 2, 2, 1)
            // Opposite paw pairs move in a four-beat walk.
            rect(step < 2 ? 8 : 10, 16, 3, step == 1 ? 3 : 4)
            rect(step < 2 ? 14 : 12, 16, 3, step == 3 ? 3 : 4)
            rect(step < 2 ? 21 : 23, 16, 3, step == 3 ? 3 : 4)
            rect(step < 2 ? 26 : 24, 16, 2, step == 1 ? 3 : 4)
            let sway = f < 4 ? 0 : 1
            rect(27, 10+bob, 3, 5)
            rect(29, 6+sway, 2, 6)
            rect(27, 5+sway, 3, 2)
            rect(27, 5+sway, 1, 2, 2)
            let blink = f == 6
            rect(8, 9+bob, blink ? 2 : 1, 1, 4)
            rect(15, 9+bob, blink ? 2 : 1, 1, 4)
            rect(12, 11+bob, 1, 1, 3)
            rect(11, 13+bob, 3, 1, 4)
        }
        let pixels = cells
        let image = NSImage(size: NSSize(width: 36, height: 22), flipped: false) { _ in
            NSGraphicsContext.current?.imageInterpolation = .none
            NSGraphicsContext.current?.shouldAntialias = false
            func paint(_ x: Int, _ y: Int, _ c: NSColor) {
                c.setFill()
                NSRect(x: x, y: 21-y, width: 1, height: 1).fill()
            }
            // One-pixel silhouette makes all coats legible on light and dark bars.
            for key in pixels.keys {
                let x = key % 36, y = key / 36
                for (dx,dy) in [(-1,0),(1,0),(0,-1),(0,1)] {
                    let nx = x+dx, ny = y+dy
                    if nx >= 0 && nx < 36 && ny >= 0 && ny < 22 && pixels[ny*36+nx] == nil {
                        paint(nx, ny, outline)
                    }
                }
            }
            for (key, shade) in pixels {
                let c: NSColor
                switch shade {
                case 0,1,2: c = coat[shade]
                case 3: c = color(0xED929B)
                default: c = outline
                }
                paint(key % 36, key / 36, c)
            }
            return true
        }
        image.isTemplate = false
        image.accessibilityDescription = sleeping ? "Sleeping pixel cat" : "Walking pixel cat"
        return image
    }
    private static func color(_ hex: UInt32) -> NSColor {
        NSColor(srgbRed: CGFloat((hex >> 16) & 255)/255,
                green: CGFloat((hex >> 8) & 255)/255,
                blue: CGFloat(hex & 255)/255, alpha: 1)
    }
}
