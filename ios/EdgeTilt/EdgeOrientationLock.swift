import UIKit

/// iPhone-only interface orientation lock. Contract: `docs/ios-native-bridge.md` `setOrientationLock`.
/// iPad never locks. Safari / PWA cannot call this.
enum EdgeOrientationLock {
  private(set) static var portraitLocked = false
  /// Native-only hold (bet sheet). Separate from the JS lock so dismissing it never clears a web lock.
  private(set) static var sheetPortrait = false

  static func setSheetPortrait(_ on: Bool) {
    let apply = {
      guard UIDevice.current.userInterfaceIdiom == .phone, sheetPortrait != on else { return }
      sheetPortrait = on
      requestGeometry()
      NSLog("EdgeOrientation sheetPortrait=\(sheetPortrait)")
    }
    if Thread.isMainThread {
      apply()
    } else {
      DispatchQueue.main.async(execute: apply)
    }
  }

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
    if portraitLocked || sheetPortrait {
      return .portrait
    }
    return [.portrait, .landscapeLeft, .landscapeRight]
  }

  private static func requestGeometry() {
    let scenes = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }
    let scene = scenes.first(where: { $0.activationState == .foregroundActive }) ?? scenes.first
    guard let scene else { return }
    // iOS 16+ caches the supported mask per view controller; without this, releasing a portrait
    // hold leaves the cached portrait-only mask in place and the phone never rotates back.
    for window in scene.windows {
      var controller = window.rootViewController
      while let current = controller {
        current.setNeedsUpdateOfSupportedInterfaceOrientations()
        controller = current.presentedViewController
      }
    }
    scene.requestGeometryUpdate(.iOS(interfaceOrientations: targetMask())) { error in
      NSLog("EdgeOrientation requestGeometryUpdate \(error.localizedDescription)")
    }
  }

  /// When landscape is allowed again and the phone is physically sideways, ask for that side so it
  /// rotates back now instead of waiting for the next device-orientation change.
  private static func targetMask() -> UIInterfaceOrientationMask {
    let mask = supportedMask
    guard mask.contains(.landscapeLeft) else { return mask }
    UIDevice.current.beginGeneratingDeviceOrientationNotifications()
    switch UIDevice.current.orientation {
    case .landscapeLeft: return .landscapeRight
    case .landscapeRight: return .landscapeLeft
    default: return mask
    }
  }
}
