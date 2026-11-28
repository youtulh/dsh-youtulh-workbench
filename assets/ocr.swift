import Foundation
import Vision
import ImageIO
import CoreGraphics

// usage: ocr <out.jsonl> <image...>
let args = CommandLine.arguments
guard args.count >= 3 else { print("usage: ocr out.jsonl img..."); exit(1) }
let outPath = args[1]
FileManager.default.createFile(atPath: outPath, contents: nil)
let handle = FileHandle(forWritingAtPath: outPath)!

func esc(_ s: String) -> String {
    var r = ""
    for c in s.unicodeScalars {
        switch c {
        case "\"": r += "\\\""
        case "\\": r += "\\\\"
        case "\n": r += "\\n"
        case "\t": r += "\\t"
        default:
            if c.value < 0x20 { r += String(format: "\\u%04x", c.value) } else { r.unicodeScalars.append(c) }
        }
    }
    return r
}

for path in args.dropFirst(2) {
    let url = URL(fileURLWithPath: path)
    guard let src = CGImageSourceCreateWithURL(url as CFURL, nil),
          let cg = CGImageSourceCreateImageAtIndex(src, 0, nil) else { continue }
    let req = VNRecognizeTextRequest()
    req.recognitionLevel = .accurate
    req.recognitionLanguages = ["zh-Hans", "en-US"]
    req.usesLanguageCorrection = false
    let handler = VNImageRequestHandler(cgImage: cg, options: [:])
    do { try handler.perform([req]) } catch { continue }
    for obs in (req.results ?? []) {
        guard let top = obs.topCandidates(1).first else { continue }
        let bb = obs.boundingBox
        let line = "{\"file\":\"\(esc(url.lastPathComponent))\",\"text\":\"\(esc(top.string))\",\"x\":\(bb.minX),\"y\":\(bb.minY),\"w\":\(bb.width),\"h\":\(bb.height),\"conf\":\(top.confidence)}\n"
        handle.write(line.data(using: .utf8)!)
    }
}
try? handle.close()
