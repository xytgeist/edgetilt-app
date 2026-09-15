import Foundation
import WebKit

/// Clears service worker registrations (and related caches) so the shell always
/// loads a fresh live site instead of a sticky `push-sw.js` control surface.
enum EdgeWebsiteDataHygiene {
  static let serviceWorkerTypes: Set<String> = [
    WKWebsiteDataTypeServiceWorkerRegistrations,
    WKWebsiteDataTypeDiskCache,
    WKWebsiteDataTypeMemoryCache,
  ]

  /// Run once before the first navigation of a cold launch.
  /// Simulator WebKit (iOS 27 especially) can sit forever in `removeData` for
  /// service-worker types, which used to block `webView.load` on a black screen.
  /// Device still clears, but we never wait more than `clearTimeoutSeconds`.
  static func clearServiceWorkersAndCaches(from store: WKWebsiteDataStore = .default(),
                                           completion: @escaping () -> Void) {
    #if targetEnvironment(simulator)
    NSLog("EdgeWebView skip SW hygiene on Simulator")
    completion()
    #else
    var finished = false
    let once = {
      DispatchQueue.main.async {
        guard !finished else { return }
        finished = true
        completion()
      }
    }
    store.removeData(
      ofTypes: serviceWorkerTypes,
      modifiedSince: Date.distantPast,
      completionHandler: once
    )
    DispatchQueue.main.asyncAfter(deadline: .now() + 2) {
      once()
    }
    #endif
  }

  /// JS companion for `EdgeNative.bustServiceWorker` after the page is up.
  static let unregisterScript = """
  (async function () {
    var unregistered = 0;
    if (navigator.serviceWorker && navigator.serviceWorker.getRegistrations) {
      var regs = await navigator.serviceWorker.getRegistrations();
      for (var i = 0; i < regs.length; i++) {
        try {
          var ok = await regs[i].unregister();
          if (ok) unregistered++;
        } catch (e) {}
      }
    }
    var cacheKeysDeleted = 0;
    if (window.caches && caches.keys) {
      var keys = await caches.keys();
      for (var j = 0; j < keys.length; j++) {
        try {
          var deleted = await caches.delete(keys[j]);
          if (deleted) cacheKeysDeleted++;
        } catch (e) {}
      }
    }
    return { ok: true, unregistered: unregistered, cacheKeysDeleted: cacheKeysDeleted };
  })();
  """
}
