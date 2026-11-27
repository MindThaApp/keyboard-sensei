using System;

namespace MusicPortal.Midi;

/// <summary>Pure helpers for device ids, names and timestamps (no WinRT types, so they are unit-tested).</summary>
public static class MidiDeviceInfo
{
    /// <summary>
    /// "bluetooth" for BLE MIDI (Windows device ids for BLE MIDI ports contain
    /// BTHLE), "usb" for USB ports, else "other" (virtual ports, network MIDI).
    /// </summary>
    public static string Transport(string deviceId)
    {
        if (deviceId.Contains("BTHLE", StringComparison.OrdinalIgnoreCase)) return "bluetooth";
        if (deviceId.Contains("USB", StringComparison.OrdinalIgnoreCase)) return "usb";
        return "other";
    }

    /// <summary>The name shown when the classic Windows MIDI stack has the port open in another app.</summary>
    public static string InUseName(string name) => $"{name} (in use by another app)";

    /// <summary>
    /// A message's time on the host clock. Windows stamps MIDI input relative to
    /// when the port was opened; the result is never later than when the message
    /// arrived, so a bad stamp can only make a note early by the callback delay.
    /// </summary>
    public static double HostTimestampMs(double portOpenedAtMs, TimeSpan messageTimestamp, double receivedAtMs)
    {
        var stamped = portOpenedAtMs + messageTimestamp.TotalMilliseconds;
        if (double.IsNaN(stamped) || stamped < portOpenedAtMs) return receivedAtMs;
        return Math.Min(stamped, receivedAtMs);
    }
}
