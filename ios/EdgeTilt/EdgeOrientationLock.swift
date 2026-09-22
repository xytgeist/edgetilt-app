import UIKit

/// iPhone-only interface orientation lock. Contract: `docs/ios-native-bridge.md` `setOrientationLock`.
/// iPad never locks. Safari / PWA cannot call this.
enum EdgeOrientationLock {
  private(set) static var portraitLocked = false

  static func setPortraitLocked(_ locked: Bool, completion: (([String: Any]) -> Void)? = nil) {
    let apply = {
      guard UIDevice.current.userInterfaceIdiom == .phone else {
        completion?(["ok": true, "locked": false, "skipped": "ipad"])
        return
      }
      if portraitLocked == locked {
        completion?(["ok": true, "locked": portraitLocked, "unchanged": true])
        return
      }
      portraitLocked = locked
      requestGeometry()
      NSLog("EdgeOrientation portraitLocked=\(portraitLocked)")
      completion?(["ok": true, "locked": portraitLocked])
    }
    if Thread.isMainThread {
      apply()
    } else {
      DispatchQueue.main.async(execute: apply)
    }
  }

  /// Main-frame navigation drops JS lock counts. Clear native so landscape works again.
  static func reset() {
    let apply = {
      guard portraitLocked else { return }
      portraitLocked = false
      requestGeometry()
      NSLog("EdgeOrientation reset")
    }
    if Thread.isMainThread {
      apply()
    } else {
      DispatchQueue.main.async(execute: apply)
    }
  }

  static var supportedMask: UIInterfaceOrientationMask {
    if UIDevice.current.userInterfaceIdiom != .phone {
      return .all
    }
    if portraitLocked {
      return .portrait
    }
    return [.portrait, .landscapeLeft, .landscapeRight]
  }

  private static func requestGeometry() {
    let scenes = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }
    let scene = scenes.first(where: { $0.activationState == .foregroundActive }) ?? scenes.first
    guard let scene else { return }
    scene.requestGeometryUpdate(.iOS(interfaceOrientations: supportedMask)) { error in
      NSLog("EdgeOrientation requestGeometryUpdate \(error.localizedDescription)")
    }
  }
}
