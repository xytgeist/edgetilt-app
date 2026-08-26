import CoreLocation
import Foundation

/// App-level location authorization for WKWebView `navigator.geolocation`.
/// Web page prompts still appear per-origin; this unlocks the native gate.
final class EdgeLocationManager: NSObject, CLLocationManagerDelegate {
  static let shared = EdgeLocationManager()

  private let manager = CLLocationManager()

  private override init() {
    super.init()
    manager.delegate = self
  }

  func configure() {
    // Delegate must be set before authorization requests.
  }

  var isAuthorized: Bool {
    switch manager.authorizationStatus {
    case .authorizedAlways, .authorizedWhenInUse:
      return true
    default:
      return false
    }
  }

  /// Request When In Use if undetermined. Safe to call repeatedly.
  func ensureWhenInUseAuthorization() {
    switch manager.authorizationStatus {
    case .notDetermined:
      manager.requestWhenInUseAuthorization()
    default:
      break
    }
  }

  /// WKWebView geolocation delegate: grant only when app already has location access.
  func webViewMayGrantGeolocation() -> Bool {
    ensureWhenInUseAuthorization()
    return isAuthorized
  }
}
