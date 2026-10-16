package com.edgetilt.app

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.widget.RemoteViews

/**
 * Home-screen widget mirroring the live bankroll / poker session notification.
 * Updated from [EdgeLiveBankroll.sync] / [EdgeLiveBankroll.clear] (no polling).
 */
class EdgeLiveSessionWidget : AppWidgetProvider() {
  override fun onUpdate(context: Context, appWidgetManager: AppWidgetManager, appWidgetIds: IntArray) {
    for (id in appWidgetIds) {
      appWidgetManager.updateAppWidget(id, buildViews(context))
    }
  }

  companion object {
    private const val PREFS = "edge_live_session_widget"
    private const val KEY_ACTIVE = "active"
    private const val KEY_TITLE = "title"
    private const val KEY_TEXT = "text"
    private const val KEY_TAB = "tab"

    fun persistLive(ctx: Context, title: String, text: String, tab: String) {
      ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
        .putBoolean(KEY_ACTIVE, true)
        .putString(KEY_TITLE, title)
        .putString(KEY_TEXT, text)
        .putString(KEY_TAB, tab)
        .apply()
      refreshAll(ctx)
    }

    fun persistIdle(ctx: Context) {
      ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
        .putBoolean(KEY_ACTIVE, false)
        .remove(KEY_TITLE)
        .remove(KEY_TEXT)
        .putString(KEY_TAB, "bankroll")
        .apply()
      refreshAll(ctx)
    }

    fun refreshAll(ctx: Context) {
      val mgr = AppWidgetManager.getInstance(ctx) ?: return
      val ids = mgr.getAppWidgetIds(ComponentName(ctx, EdgeLiveSessionWidget::class.java))
      if (ids.isEmpty()) return
      val views = buildViews(ctx)
      for (id in ids) mgr.updateAppWidget(id, views)
    }

    private fun buildViews(ctx: Context): RemoteViews {
      val prefs = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
      val active = prefs.getBoolean(KEY_ACTIVE, false)
      val title =
        if (active) prefs.getString(KEY_TITLE, null)?.trim().orEmpty().ifEmpty { "Live session" }
        else ctx.getString(R.string.widget_live_idle_title)
      val text =
        if (active) prefs.getString(KEY_TEXT, null)?.trim().orEmpty().ifEmpty { "In play" }
        else ctx.getString(R.string.widget_live_idle_text)
      val tab = prefs.getString(KEY_TAB, "bankroll")?.trim().orEmpty().ifEmpty { "bankroll" }
        .let { if (it == "poker-bankroll") it else "bankroll" }

      val views = RemoteViews(ctx.packageName, R.layout.widget_live_session)
      views.setTextViewText(R.id.widget_title, title)
      views.setTextViewText(R.id.widget_text, text)
      views.setOnClickPendingIntent(R.id.widget_root, openBankrollPendingIntent(ctx, tab))
      return views
    }

    private fun openBankrollPendingIntent(ctx: Context, tab: String): PendingIntent {
      val openUri =
        Uri.parse(BuildConfig.BASE_URL.trimEnd('/') + "/").buildUpon()
          .appendQueryParameter("tab", tab)
          .build()
      val intent = Intent(ctx, MainActivity::class.java).apply {
        action = Intent.ACTION_VIEW
        data = openUri
        putExtra(EdgeLiveBankroll.EXTRA_OPEN_TAB, tab)
        flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
      }
      return PendingIntent.getActivity(
        ctx,
        72001 + tab.hashCode(),
        intent,
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
      )
    }
  }
}
