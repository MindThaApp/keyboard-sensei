package com.midivory.app.mic

import android.Manifest
import android.content.Intent
import android.net.Uri
import android.provider.Settings
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import com.getcapacitor.annotation.Permission

/**
 * Microphone permission for mic grading, the tuner and the piano check.
 *
 * The web app shows its own explanation first, then calls requestPermissions()
 * (built into Capacitor for the "microphone" alias) BEFORE getUserMedia, so the
 * system prompt always follows the explanation. Once RECORD_AUDIO is held, the
 * Capacitor bridge grants the WebView's audio-capture request by itself
 * (BridgeWebChromeClient.onPermissionRequest). Audio never leaves the WebView:
 * this plugin only handles the permission and never reads the mic.
 *
 * checkPermissions() reports "denied" once the learner has refused for good; the
 * app then offers openAppSettings() instead of a prompt that Android would no
 * longer show.
 */
@CapacitorPlugin(
    name = "MicPermission",
    permissions = [
        Permission(alias = MicPermissionPlugin.MICROPHONE, strings = [Manifest.permission.RECORD_AUDIO]),
    ],
)
class MicPermissionPlugin : Plugin() {
    /** Opens this app's page in system settings, where a refused permission can be turned back on. */
    @PluginMethod
    fun openAppSettings(call: PluginCall) {
        val intent = Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.fromParts("package", context.packageName, null))
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        try {
            context.startActivity(intent)
            call.resolve(JSObject().put("opened", true))
        } catch (e: Exception) {
            call.resolve(JSObject().put("opened", false))
        }
    }

    companion object {
        const val MICROPHONE = "microphone"
    }
}
