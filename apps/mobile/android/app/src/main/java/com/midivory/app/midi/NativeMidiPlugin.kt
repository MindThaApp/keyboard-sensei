package com.midivory.app.midi

import android.Manifest
import android.annotation.SuppressLint
import android.bluetooth.BluetoothManager
import android.bluetooth.le.ScanCallback
import android.bluetooth.le.ScanFilter
import android.bluetooth.le.ScanResult
import android.bluetooth.le.ScanSettings
import android.content.Context
import android.content.pm.PackageManager
import android.media.midi.MidiDevice
import android.media.midi.MidiDeviceInfo
import android.media.midi.MidiManager
import android.media.midi.MidiOutputPort
import android.media.midi.MidiReceiver
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.ParcelUuid
import com.getcapacitor.JSArray
import com.getcapacitor.JSObject
import com.getcapacitor.PermissionState
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import com.getcapacitor.annotation.Permission
import com.getcapacitor.annotation.PermissionCallback
import java.util.UUID

/**
 * Hardware MIDI input for the Android app (the WebView has no Web MIDI).
 *
 * USB keyboards are opened automatically, including ones plugged in later.
 * Bluetooth LE keyboards are found with scanBluetooth() and opened with
 * connectBluetooth(). Every input port's bytes are framed by MidiMessageParser
 * and sent to JS as "midiMessage" events, stamped with the time the system
 * received them (System.nanoTime(), in ms). JS maps that clock onto
 * performance.now() via getClock() (see CapacitorMidiAdapter).
 */
@CapacitorPlugin(
    name = "NativeMidi",
    permissions = [
        // Android 12+: nearby-devices permissions (BLUETOOTH_SCAN is declared
        // neverForLocation in the manifest).
        Permission(alias = NativeMidiPlugin.BLUETOOTH, strings = [Manifest.permission.BLUETOOTH_SCAN, Manifest.permission.BLUETOOTH_CONNECT]),
        // Android 11 and older: BLE scans need location permission.
        Permission(alias = NativeMidiPlugin.LOCATION, strings = [Manifest.permission.ACCESS_FINE_LOCATION]),
    ],
)
class NativeMidiPlugin : Plugin() {
    private class OpenDevice(val device: MidiDevice, val transport: String, val ports: List<MidiOutputPort>)

    private val handler = Handler(Looper.getMainLooper())
    private var midiManager: MidiManager? = null
    private val openDevices = linkedMapOf<Int, OpenDevice>()
    private val pendingOpens = mutableSetOf<Int>()
    private var started = false
    private var scanning = false

    private val deviceCallback = object : MidiManager.DeviceCallback() {
        override fun onDeviceAdded(info: MidiDeviceInfo) {
            if (started) openIfUsable(info)
        }

        override fun onDeviceRemoved(info: MidiDeviceInfo) {
            closeDevice(info.id)
            notifyDevices()
        }
    }

    override fun load() {
        if (context.packageManager.hasSystemFeature(PackageManager.FEATURE_MIDI)) {
            midiManager = context.getSystemService(Context.MIDI_SERVICE) as? MidiManager
        }
    }

    @PluginMethod
    fun isAvailable(call: PluginCall) {
        call.resolve(JSObject().put("available", midiManager != null))
    }

    @PluginMethod
    fun getClock(call: PluginCall) {
        call.resolve(JSObject().put("nowMs", System.nanoTime() / 1_000_000.0))
    }

    @Suppress("DEPRECATION") // getDevices()/registerDeviceCallback(handler) still work on every API level.
    @PluginMethod
    fun start(call: PluginCall) {
        val manager = midiManager ?: return call.reject("This device has no MIDI support.")
        if (!started) {
            started = true
            manager.registerDeviceCallback(deviceCallback, handler)
            manager.devices.forEach { openIfUsable(it) }
        }
        call.resolve(devicesPayload())
    }

    @PluginMethod
    fun stop(call: PluginCall) {
        stopAll()
        call.resolve()
    }

    @PluginMethod
    fun listDevices(call: PluginCall) {
        call.resolve(devicesPayload())
    }

    @PluginMethod
    fun scanBluetooth(call: PluginCall) {
        val alias = bluetoothAlias()
        if (getPermissionState(alias) != PermissionState.GRANTED) {
            requestPermissionForAlias(alias, call, "bluetoothPermissionCallback")
            return
        }
        runScan(call)
    }

    @PermissionCallback
    private fun bluetoothPermissionCallback(call: PluginCall) {
        if (getPermissionState(bluetoothAlias()) == PermissionState.GRANTED) {
            runScan(call)
        } else {
            call.reject("Bluetooth permission is needed to find wireless MIDI keyboards.")
        }
    }

    @SuppressLint("MissingPermission") // checked by scanBluetooth before calling
    private fun runScan(call: PluginCall) {
        val adapter = (context.getSystemService(Context.BLUETOOTH_SERVICE) as? BluetoothManager)?.adapter
            ?: return call.reject("This device has no Bluetooth.")
        if (!adapter.isEnabled) return call.reject("Turn Bluetooth on, then search again.")
        val scanner = adapter.bluetoothLeScanner ?: return call.reject("Bluetooth LE scanning is unavailable.")
        if (scanning) return call.reject("A Bluetooth search is already running.")

        val found = linkedMapOf<String, String>()
        val callback = object : ScanCallback() {
            override fun onScanResult(callbackType: Int, result: ScanResult) {
                val name = result.scanRecord?.deviceName ?: result.device.name ?: "Bluetooth MIDI keyboard"
                found[result.device.address] = name
            }

            override fun onScanFailed(errorCode: Int) {
                scanning = false
                call.reject("Bluetooth search failed (code $errorCode).")
            }
        }
        val filter = ScanFilter.Builder().setServiceUuid(ParcelUuid(BLE_MIDI_SERVICE)).build()
        val settings = ScanSettings.Builder().setScanMode(ScanSettings.SCAN_MODE_LOW_LATENCY).build()
        try {
            scanning = true
            scanner.startScan(listOf(filter), settings, callback)
        } catch (error: SecurityException) {
            scanning = false
            return call.reject("Bluetooth permission was refused.")
        }
        val timeoutMs = (call.getInt("timeoutMs") ?: 8000).coerceIn(1000, 30_000).toLong()
        handler.postDelayed({
            if (!scanning) return@postDelayed
            scanning = false
            try {
                scanner.stopScan(callback)
            } catch (_: SecurityException) {
            }
            val devices = JSArray()
            found.forEach { (address, name) -> devices.put(JSObject().put("address", address).put("name", name)) }
            call.resolve(JSObject().put("devices", devices))
        }, timeoutMs)
    }

    @SuppressLint("MissingPermission") // BLUETOOTH_CONNECT was granted for the scan that found the address
    @PluginMethod
    fun connectBluetooth(call: PluginCall) {
        val manager = midiManager ?: return call.reject("This device has no MIDI support.")
        val address = call.getString("address") ?: return call.reject("address is required")
        val adapter = (context.getSystemService(Context.BLUETOOTH_SERVICE) as? BluetoothManager)?.adapter
            ?: return call.reject("This device has no Bluetooth.")
        if (getPermissionState(bluetoothAlias()) != PermissionState.GRANTED) {
            return call.reject("Bluetooth permission is needed to connect.")
        }
        val bluetoothDevice = try {
            adapter.getRemoteDevice(address)
        } catch (_: IllegalArgumentException) {
            return call.reject("Not a Bluetooth address: $address")
        }
        manager.openBluetoothDevice(bluetoothDevice, { device ->
            if (device == null) {
                call.reject("Couldn't open that Bluetooth keyboard. Make sure it is on and not connected to another device.")
            } else {
                attach(device, "bluetooth")
                call.resolve(JSObject().put("device", describe(device.info, "bluetooth")))
            }
        }, handler)
    }

    override fun handleOnDestroy() {
        stopAll()
        super.handleOnDestroy()
    }

    // --- device handling (main thread) ---

    private fun openIfUsable(info: MidiDeviceInfo) {
        val manager = midiManager ?: return
        // Bluetooth devices are opened only through connectBluetooth(); virtual
        // devices are other apps' software ports, not keyboards.
        if (info.type != MidiDeviceInfo.TYPE_USB || info.outputPortCount == 0) return
        if (openDevices.containsKey(info.id) || !pendingOpens.add(info.id)) return
        manager.openDevice(info, { device ->
            pendingOpens.remove(info.id)
            if (device != null && started) attach(device, "usb") else device?.close()
        }, handler)
    }

    private fun attach(device: MidiDevice, transport: String) {
        val info = device.info
        closeDevice(info.id)
        val ports = (0 until info.outputPortCount).mapNotNull { index ->
            device.openOutputPort(index)?.also { it.connect(PortReceiver(info.id.toString())) }
        }
        openDevices[info.id] = OpenDevice(device, transport, ports)
        notifyDevices()
    }

    private fun closeDevice(id: Int) {
        openDevices.remove(id)?.let { open ->
            open.ports.forEach { runCatching { it.close() } }
            runCatching { open.device.close() }
        }
    }

    @Suppress("DEPRECATION")
    private fun stopAll() {
        if (started) runCatching { midiManager?.unregisterDeviceCallback(deviceCallback) }
        started = false
        openDevices.keys.toList().forEach { closeDevice(it) }
        pendingOpens.clear()
    }

    private fun notifyDevices() {
        notifyListeners("devicesChanged", devicesPayload())
    }

    private fun devicesPayload(): JSObject {
        val devices = JSArray()
        openDevices.values.forEach { devices.put(describe(it.device.info, it.transport)) }
        return JSObject().put("devices", devices)
    }

    private fun describe(info: MidiDeviceInfo, transport: String): JSObject {
        val properties = info.properties
        val name = properties.getString(MidiDeviceInfo.PROPERTY_NAME)
            ?: properties.getString(MidiDeviceInfo.PROPERTY_PRODUCT)
            ?: "MIDI keyboard"
        val result = JSObject().put("id", info.id.toString()).put("name", name).put("transport", transport)
        properties.getString(MidiDeviceInfo.PROPERTY_MANUFACTURER)?.let { result.put("manufacturer", it) }
        return result
    }

    private fun bluetoothAlias() = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) BLUETOOTH else LOCATION

    /** Receives one output port's bytes on a MIDI thread and forwards complete messages. */
    private inner class PortReceiver(private val deviceId: String) : MidiReceiver() {
        private val parser = MidiMessageParser()

        override fun onSend(msg: ByteArray, offset: Int, count: Int, timestamp: Long) {
            val messages = mutableListOf<IntArray>()
            parser.parse(msg, offset, count, messages)
            if (messages.isEmpty()) return
            // The framework stamps arrival with System.nanoTime(); 0 means unstamped.
            val nanos = if (timestamp > 0) timestamp else System.nanoTime()
            val array = JSArray()
            messages.forEach { message -> array.put(JSArray().apply { message.forEach { put(it) } }) }
            notifyListeners(
                "midiMessage",
                JSObject().put("deviceId", deviceId).put("timestampMs", nanos / 1_000_000.0).put("messages", array),
            )
        }
    }

    companion object {
        const val BLUETOOTH = "bluetooth"
        const val LOCATION = "location"

        /** The Bluetooth LE MIDI service (MIDI Association BLE-MIDI spec). */
        val BLE_MIDI_SERVICE: UUID = UUID.fromString("03B80E5A-EDE8-4B33-A751-6CE34EC4C700")
    }
}
