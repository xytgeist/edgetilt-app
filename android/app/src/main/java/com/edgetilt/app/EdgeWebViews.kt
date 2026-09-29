package com.edgetilt.app

import android.webkit.WebSettings
import androidx.webkit.UserAgentMetadata
import androidx.webkit.WebSettingsCompat
import androidx.webkit.WebViewFeature

object EdgeWebViews {
  /**
   * Google refuses OAuth in embedded WebViews and spots them by the "; wv" UA marker, the
   * `X-Requested-With: <package>` header, and the "Android WebView" Sec-CH-UA brand. Present as Chrome instead.
   */
  fun presentAsChrome(settings: WebSettings, extraUaToken: String? = null) {
    val chromeUa = settings.userAgentString.replace("; wv", "").replace(Regex("Version/\\S+ "), "")
    settings.userAgentString = if (extraUaToken == null) chromeUa else "$chromeUa $extraUaToken"

    if (WebViewFeature.isFeatureSupported(WebViewFeature.REQUESTED_WITH_HEADER_ALLOW_LIST)) {
      WebSettingsCompat.setRequestedWithHeaderOriginAllowList(settings, emptySet())
    }
    if (WebViewFeature.isFeatureSupported(WebViewFeature.USER_AGENT_METADATA)) {
      val current = WebSettingsCompat.getUserAgentMetadata(settings)
      val brands = current.brandVersionList.map { bv ->
        if (bv.brand != "Android WebView") {
          bv
        } else {
          UserAgentMetadata.BrandVersion.Builder()
            .setBrand("Google Chrome")
            .setMajorVersion(bv.majorVersion)
            .setFullVersion(bv.fullVersion)
            .build()
        }
      }
      WebSettingsCompat.setUserAgentMetadata(
        settings,
        UserAgentMetadata.Builder(current).setBrandVersionList(brands).build(),
      )
    }
  }
}
