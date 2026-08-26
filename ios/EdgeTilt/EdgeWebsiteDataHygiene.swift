import Foundation
import WebKit

/// Clears service worker registrations on cold launch so `push-sw.js` cannot stick in
/// the IPA. HTTP disk/memory cache is preserved ... wiping it every launch forced full
/// re-downloads and main-thread image decode (WEBP) that stalled WKWebView taps.
enum EdgeWebsiteDataHygiene {
  /// Boot-only: drop SW control surface. Disk/memory cache intentionally kept.
  static let bootHygieneTypes: Set<String> = [
    WKWebsiteDataTypeServiceWorkerRegistrations,
  ]

  /// Run once before the first navigation of a cold launch.
  static func clearServiceWorkersAndCaches(from store: WKWebsiteDataStore = .default(),
                                           completion: @escaping () -> Void) {
    store.removeData(
      ofTypes: bootHygieneTypes,
      modifiedSince: Date.distantPast,
      completionHandler: completion
    )
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
