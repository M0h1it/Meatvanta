package com.meatvanta.orders

import android.app.NotificationManager
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

/**
 * Android 14+ lets the user switch "full-screen notifications" off per app. Notifee can't tell us
 * the state, so the Setup screen asks Android directly through this module.
 */
class FullScreenPermissionModule(private val context: ReactApplicationContext) :
    ReactContextBaseJavaModule(context) {

  override fun getName() = "FullScreenPermission"

  /** true when the siren may open over the lock screen (always true below Android 14). */
  @ReactMethod
  fun canUse(promise: Promise) {
    try {
      if (Build.VERSION.SDK_INT >= 34) {
        val manager = context.getSystemService(NotificationManager::class.java)
        promise.resolve(manager.canUseFullScreenIntent())
      } else {
        promise.resolve(true)
      }
    } catch (e: Exception) {
      promise.reject("E_FULL_SCREEN", e.message, e)
    }
  }

  /** Opens THIS app's full-screen-notification page (not the list of all apps). */
  @ReactMethod
  fun openSettings(promise: Promise) {
    val uri = Uri.parse("package:${context.packageName}")
    val attempts = mutableListOf<Intent>()
    if (Build.VERSION.SDK_INT >= 34) {
      attempts.add(Intent(Settings.ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENT, uri))
    }
    attempts.add(
        Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS)
            .putExtra(Settings.EXTRA_APP_PACKAGE, context.packageName))
    attempts.add(Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, uri))

    for (intent in attempts) {
      try {
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        context.startActivity(intent)
        promise.resolve(true)
        return
      } catch (e: Exception) {
        // this phone has no such screen - try the next one
      }
    }
    promise.reject("E_FULL_SCREEN", "Could not open the settings screen.")
  }
}
