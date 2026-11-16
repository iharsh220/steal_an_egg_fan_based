// macOS only (Vision framework, macOS 14+). Apple's "lift subject from background" —
// the same engine as long-pressing a photo on iPhone — saves one mask PNG per detected subject.
//
//   swift scripts/lift-subject.swift <image> <out-prefix>
//   → <out-prefix>-mask-1.png, -mask-2.png, … (white = subject), and prints each mask's bounding box
//
// Used by `npm run archangel:masks`. The masks are kept in egg-source/masks/ so the Node step
// (scripts/extract-archangel.mjs) also works on Windows/Linux without re-running this.

import AppKit
import CoreImage
import Vision

let args = CommandLine.arguments
guard args.count >= 3 else { print("usage: swift lift-subject.swift <image> <out-prefix>"); exit(2) }
let url = URL(fileURLWithPath: args[1])
let prefix = args[2]

let handler = VNImageRequestHandler(url: url)
let request = VNGenerateForegroundInstanceMaskRequest()
do { try handler.perform([request]) } catch { print("Vision failed: \(error)"); exit(1) }
guard let result = request.results?.first else { print("No subject found"); exit(1) }

let ctx = CIContext()
print("instances: \(result.allInstances.count)")
for inst in result.allInstances {
  do {
    let buffer = try result.generateScaledMaskForImage(forInstances: IndexSet(integer: inst), from: handler)
    let image = CIImage(cvPixelBuffer: buffer)
    guard let cg = ctx.createCGImage(image, from: image.extent, format: .L8, colorSpace: CGColorSpaceCreateDeviceGray()) else { continue }
    let rep = NSBitmapImageRep(cgImage: cg)
    let out = URL(fileURLWithPath: "\(prefix)-mask-\(inst).png")
    try rep.representation(using: .png, properties: [:])?.write(to: out)
    print("mask \(inst): \(cg.width)x\(cg.height) → \(out.path)")
  } catch {
    print("mask \(inst) failed: \(error)")
  }
}
