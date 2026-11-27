package com.midivory.app

import android.os.Bundle
import com.getcapacitor.BridgeActivity
import com.midivory.app.mic.MicPermissionPlugin
import com.midivory.app.midi.NativeMidiPlugin

class MainActivity : BridgeActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        // Local plugins must be registered before the bridge starts.
        registerPlugin(NativeMidiPlugin::class.java)
        registerPlugin(MicPermissionPlugin::class.java)
        super.onCreate(savedInstanceState)
    }
}
