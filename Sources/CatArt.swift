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
    /// Miso facing you, smiling with happy closed eyes and waving one paw. A 30 × 26 grid; frames 0-3 wave, 4 rests, 5 blinks.
    static func greeting(frame: Int, palette: Int) -> NSImage {
        let coats: [[NSColor]] = [
            [color(0xECA34E), color(0xB9652C), color(0xFFE2AC)],
            [color(0xA8B6C6), color(0x6D7F95), color(0xE8EEF5)],
            [color(0x53596C), color(0x33394A), color(0xB8C1D6)]
        ]
        let coat = coats[max(0, min(2, palette))]
        let width = 30, height = 26
        var cells: [Int: Int] = [:]
        func rect(_ x: Int, _ y: Int, _ w: Int, _ h: Int, _ shade: Int = 0) {
            for row in y..<(y+h) { for col in x..<(x+w) where col >= 0 && col < width && row >= 0 && row < height { cells[row*width+col] = shade } }
        }
        func dot(_ x: Int, _ y: Int, _ shade: Int) { rect(x, y, 1, 1, shade) }
        let f = ((frame % 6) + 6) % 6
        // Body, sitting, with a pale belly and a tail curling round the front.
        rect(7, 15, 11, 8); rect(6, 17, 13, 6); rect(9, 16, 7, 7, 2)
        rect(17, 21, 5, 2, 1); rect(20, 19, 2, 2, 1)
        rect(7, 22, 3, 2); rect(14, 22, 3, 2)
        // Head with pointed ears.
        rect(5, 6, 15, 9); rect(4, 8, 17, 5)
        for (row, from, to) in [(1, 6, 6), (2, 6, 7), (3, 5, 8), (4, 5, 9), (5, 5, 10)] { rect(from, row, to-from+1, 1); rect(24-to, row, to-from+1, 1) }
        dot(6, 3, 3); dot(6, 4, 3); dot(18, 3, 3); dot(18, 4, 3)
        rect(10, 6, 1, 2, 1); rect(12, 6, 1, 3, 1); rect(14, 6, 1, 2, 1)
        // Happy closed eyes, rosy cheeks and a small open smile.
        if f == 5 { rect(7, 10, 3, 1, 4); rect(15, 10, 3, 1, 4) }
        else { dot(7, 10, 4); dot(8, 9, 4); dot(9, 10, 4); dot(15, 10, 4); dot(16, 9, 4); dot(17, 10, 4) }
        rect(5, 12, 2, 1, 3); rect(18, 12, 2, 1, 3)
        dot(12, 11, 3)
        dot(10, 12, 4); dot(11, 13, 4); dot(12, 12, 4); dot(13, 13, 4); dot(14, 12, 4); dot(12, 13, 3)
        // Left paw resting. Like a lucky cat: a short thick foreleg and a round mitt with toe beans, rocking up and down.
        // No thin shapes or marks near the paw, so it can never read as a finger.
        rect(6, 18, 3, 3)
        if f < 4 {
            let lift = f == 1 || f == 3 ? 2 : 0
            rect(18, 14, 5, 4); rect(20, 11+lift, 5, 5-lift)
            rect(22, 6+lift, 5, 1); rect(21, 7+lift, 7, 4); rect(22, 11+lift, 5, 1)
            dot(22, 7+lift, 3); dot(24, 7+lift, 3); dot(26, 7+lift, 3)
            rect(23, 9+lift, 3, 2, 3)
        } else {
            rect(18, 17, 3, 3)
        }
        return render(cells, width: width, height: height, coat: coat, label: "Miso smiling and waving")
    }

    /// The menu-bar size of the same greeting: Miso turns to face you and waves. A 30 × 22 grid; frames 0-3 wave, 4 rests.
    static func menuWave(frame: Int, palette: Int) -> NSImage {
        let coats: [[NSColor]] = [
            [color(0xECA34E), color(0xB9652C), color(0xFFE2AC)],
            [color(0xA8B6C6), color(0x6D7F95), color(0xE8EEF5)],
            [color(0x53596C), color(0x33394A), color(0xB8C1D6)]
        ]
        let coat = coats[max(0, min(2, palette))]
        let width = 30, height = 22
        var cells: [Int: Int] = [:]
        func rect(_ x: Int, _ y: Int, _ w: Int, _ h: Int, _ shade: Int = 0) {
            for row in y..<(y+h) { for col in x..<(x+w) where col >= 0 && col < width && row >= 0 && row < height { cells[row*width+col] = shade } }
        }
        func dot(_ x: Int, _ y: Int, _ shade: Int) { rect(x, y, 1, 1, shade) }
        let f = ((frame % 5) + 5) % 5
        // Body with belly, feet and tail.
        rect(6, 12, 11, 7); rect(9, 13, 5, 6, 2)
        rect(6, 19, 3, 2); rect(14, 19, 3, 2); rect(16, 17, 4, 2, 1)
        // Head with pointed ears.
        rect(5, 4, 13, 8); rect(4, 6, 15, 4)
        for (row, from, to) in [(0, 6, 6), (1, 5, 7), (2, 5, 8), (3, 5, 9)] { rect(from, row, to-from+1, 1); rect(22-to, row, to-from+1, 1) }
        dot(6, 2, 3); dot(16, 2, 3)
        // Happy closed eyes, cheeks and a little smile.
        dot(7, 7, 4); dot(8, 6, 4); dot(9, 7, 4); dot(13, 7, 4); dot(14, 6, 4); dot(15, 7, 4)
        dot(5, 9, 3); dot(17, 9, 3)
        dot(11, 8, 3); dot(10, 9, 4); dot(11, 10, 4); dot(12, 9, 4)
        // Resting paw, and a short thick foreleg ending in a round mitt that rocks up and down, clear of the head.
        rect(7, 15, 3, 3)
        if f < 4 {
            let lift = f == 1 || f == 3 ? 1 : 0
            rect(16, 12, 5, 3); rect(19, 9+lift, 4, 4-lift)
            rect(21, 4+lift, 3, 1); rect(20, 5+lift, 5, 3); rect(21, 8+lift, 3, 1)
            rect(21, 6+lift, 3, 1, 3)
        } else {
            rect(15, 15, 3, 3)
        }
        return render(cells, width: width, height: height, coat: coat, label: "Miso waving at you")
    }

    private static func render(_ pixels: [Int: Int], width: Int, height: Int, coat: [NSColor], label: String) -> NSImage {
        let outline = color(0x252937)
        let image = NSImage(size: NSSize(width: width, height: height), flipped: false) { _ in
            NSGraphicsContext.current?.imageInterpolation = .none
            NSGraphicsContext.current?.shouldAntialias = false
            func paint(_ x: Int, _ y: Int, _ c: NSColor) { c.setFill(); NSRect(x: x, y: height-1-y, width: 1, height: 1).fill() }
            for key in pixels.keys {
                let x = key % width, y = key / width
                for (dx, dy) in [(-1,0),(1,0),(0,-1),(0,1)] {
                    let nx = x+dx, ny = y+dy
                    if nx >= 0 && nx < width && ny >= 0 && ny < height && pixels[ny*width+nx] == nil { paint(nx, ny, outline) }
                }
            }
            for (key, shade) in pixels {
                let c: NSColor
                switch shade { case 0,1,2: c = coat[shade]; case 3: c = color(0xED929B); default: c = outline }
                paint(key % width, key / width, c)
            }
            return true
        }
        image.isTemplate = false
        image.accessibilityDescription = label
        return image
    }
    private static func color(_ hex: UInt32) -> NSColor {
        NSColor(srgbRed: CGFloat((hex >> 16) & 255)/255,
                green: CGFloat((hex >> 8) & 255)/255,
                blue: CGFloat(hex & 255)/255, alpha: 1)
    }
}
