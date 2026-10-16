package com.edgetilt.app

import android.app.Activity
import android.app.Dialog
import android.graphics.Color
import android.graphics.Outline
import android.graphics.drawable.ColorDrawable
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.view.ViewOutlineProvider
import android.view.WindowManager

/** Login sheet docked to the bottom of the screen, with the app dimmed behind it. */
object EdgeBottomDialog {
  fun show(activity: Activity, content: View, onCancel: () -> Unit): Dialog {
    val density = activity.resources.displayMetrics.density
    val radius = 22f * density
    content.clipToOutline = true
    content.outlineProvider = object : ViewOutlineProvider() {
      override fun getOutline(view: View, outline: Outline) {
        // Bottom edge sits on the screen, so only the top corners read as rounded.
        outline.setRoundRect(0, 0, view.width, view.height + radius.toInt(), radius)
      }
    }
    val dialog = Dialog(activity, android.R.style.Theme_Translucent_NoTitleBar)
    dialog.setContentView(content)
    dialog.setCancelable(true)
    dialog.setCanceledOnTouchOutside(true)
    dialog.setOnCancelListener { onCancel() }
    val height = (activity.resources.displayMetrics.heightPixels * 0.92f).toInt()
    dialog.window?.apply {
      setGravity(Gravity.BOTTOM)
      setLayout(ViewGroup.LayoutParams.MATCH_PARENT, height)
      setBackgroundDrawable(ColorDrawable(Color.TRANSPARENT))
      addFlags(WindowManager.LayoutParams.FLAG_DIM_BEHIND)
      setDimAmount(0.45f)
      setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE)
    }
    dialog.show()
    dialog.window?.setLayout(ViewGroup.LayoutParams.MATCH_PARENT, height)
    dialog.window?.setGravity(Gravity.BOTTOM)
    return dialog
  }
}
