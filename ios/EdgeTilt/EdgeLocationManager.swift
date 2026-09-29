import CoreLocation
import Foundation

/// App-level location for the web app. WKWebView has no public geolocation permission hook, so the
/// bridge bootstrap replaces `navigator.geolocation` with `currentPosition` (one iOS prompt, remembered).
final class EdgeLocationManager: NSObject, CLLocationManagerDelegate {
  static let shared = EdgeLocationManager()

  private let manager = CLLocationManager()
  private var waiting: [(Result<CLLocation, LocationError>) -> Void] = []
  private var authWaiting: [(String) -> Void] = []

  enum LocationError: Error {
    case denied
    case unavailable(String)

    var code: Int {
      switch self {
      case .denied: return 1
      case .unavailable: return 2
      }
    }

    var message: String {
      switch self {
      case .denied: return "Location permission denied"
      case .unavailable(let detail): return detail
      }
    }
  }

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

  /// Post-sign-in ask from web. Completes with `granted` / `denied` once the member decides (or at once if already decided).
  func requestWhenInUse(completion: @escaping (String) -> Void) {
    DispatchQueue.main.async { [self] in
      guard manager.authorizationStatus == .notDetermined else {
        completion(Self.statusString(manager.authorizationStatus))
        return
      }
      authWaiting.append(completion)
      manager.requestWhenInUseAuthorization()
    }
  }

  private static func statusString(_ status: CLAuthorizationStatus) -> String {
    switch status {
    case .authorizedAlways, .authorizedWhenInUse: return "granted"
    case .denied, .restricted: return "denied"
    default: return "prompt"
    }
  }

  /// One fix for the web shim. Reuses a cached fix younger than `maximumAge`; waits out a first-time prompt.
  func currentPosition(
    highAccuracy: Bool,
    maximumAge: TimeInterval,
    completion: @escaping (Result<CLLocation, LocationError>) -> Void
  ) {
    DispatchQueue.main.async { [self] in
      if let cached = manager.location, maximumAge > 0, -cached.timestamp.timeIntervalSinceNow <= maximumAge {
        completion(.success(cached))
        return
      }
      switch manager.authorizationStatus {
      case .denied, .restricted:
        completion(.failure(.denied))
        return
      default:
        break
      }
      manager.desiredAccuracy = highAccuracy ? kCLLocationAccuracyBest : kCLLocationAccuracyHundredMeters
      waiting.append(completion)
      if manager.authorizationStatus == .notDetermined {
        manager.requestWhenInUseAuthorization()
      } else if waiting.count == 1 {
        manager.requestLocation()
      }
    }
  }

  private func finish(_ result: Result<CLLocation, LocationError>) {
    let callbacks = waiting
    waiting.removeAll()
    callbacks.forEach { $0(result) }
  }

  // MARK: - CLLocationManagerDelegate

  func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
    if manager.authorizationStatus != .notDetermined, !authWaiting.isEmpty {
      let status = Self.statusString(manager.authorizationStatus)
      let callbacks = authWaiting
      authWaiting.removeAll()
      callbacks.forEach { $0(status) }
    }
    guard !waiting.isEmpty else { return }
    switch manager.authorizationStatus {
    case .authorizedAlways, .authorizedWhenInUse:
      manager.requestLocation()
    case .denied, .restricted:
      finish(.failure(.denied))
    default:
      break
    }
  }

  func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
    guard let last = locations.last else { return }
    finish(.success(last))
  }

  func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
    if let clError = error as? CLError, clError.code == .denied {
      finish(.failure(.denied))
    } else {
      finish(.failure(.unavailable(error.localizedDescription)))
    }
  }
}
