using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Diagnostics;
using System.Linq;
using System.Runtime.InteropServices.WindowsRuntime;
using System.Threading;
using System.Threading.Tasks;
using Windows.Devices.Enumeration;
using Windows.Devices.Midi;

namespace MusicPortal.Midi;

/// <summary>
/// Native MIDI input (spec 8.3). Watches MIDI input ports with a DeviceWatcher
/// (USB, and Bluetooth LE MIDI keyboards once paired in Windows Settings), opens
/// each one, frames its bytes and forwards channel messages to the page.
///
/// Uses the WinRT Windows.Devices.Midi API. Where Windows MIDI Services is
/// installed it serves this API too, which makes ports multi-client; on the
/// classic stack a port held by another app cannot be opened, and is listed as
/// "in use" instead of silently missing.
///
/// Events are raised on background threads; <see cref="Post"/> must marshal to the UI thread.
/// </summary>
public sealed class MidiBridge : IDisposable
{
    private sealed class OpenPort(MidiInPort port, double openedAtMs) : IDisposable
    {
        public MidiInPort Port { get; } = port;
        public double OpenedAtMs { get; } = openedAtMs;
        public MidiMessageParser Parser { get; } = new();
        public void Dispose() => Port.Dispose();
    }

    private readonly Stopwatch clock = Stopwatch.StartNew();
    private readonly ConcurrentDictionary<string, MidiDevice> devices = new();
    private readonly ConcurrentDictionary<string, OpenPort> ports = new();
    private readonly SemaphoreSlim gate = new(1, 1);
    private readonly Action<string> post;
    private DeviceWatcher? watcher;
    private TaskCompletionSource enumerated = new(TaskCreationOptions.RunContinuationsAsynchronously);
    private bool started;

    /// <param name="post">Sends one JSON message to the page (marshalled to the UI thread by the caller).</param>
    public MidiBridge(Action<string> post) => this.post = post;

    private void Post(string json) => post(json);

    /// <summary>The host's monotonic clock in ms (the page maps it with NativeClockSync).</summary>
    public double NowMs => clock.Elapsed.TotalMilliseconds;

    public IReadOnlyList<MidiDevice> Devices => devices.Values.OrderBy(device => device.Name, StringComparer.CurrentCultureIgnoreCase).ToList();

    public async Task<IReadOnlyList<MidiDevice>> StartAsync()
    {
        if (!started)
        {
            started = true;
            enumerated = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
            watcher = DeviceInformation.CreateWatcher(MidiInPort.GetDeviceSelector());
            watcher.Added += (_, info) => _ = OpenAsync(info.Id, info.Name);
            watcher.Removed += (_, update) => Close(update.Id);
            watcher.Updated += (_, _) => { };
            watcher.EnumerationCompleted += (_, _) => enumerated.TrySetResult();
            watcher.Start();
        }
        // Devices present at start are reported in the start reply; later ones as events.
        await Task.WhenAny(enumerated.Task, Task.Delay(TimeSpan.FromSeconds(3)));
        await gate.WaitAsync();
        gate.Release();
        return Devices;
    }

    public void Stop()
    {
        started = false;
        if (watcher is not null)
        {
            if (watcher.Status is DeviceWatcherStatus.Started or DeviceWatcherStatus.EnumerationCompleted) watcher.Stop();
            watcher = null;
        }
        foreach (var id in ports.Keys.ToList()) Close(id, notify: false);
        devices.Clear();
    }

    private async Task OpenAsync(string id, string name)
    {
        await gate.WaitAsync();
        try
        {
            if (!started || ports.ContainsKey(id)) return;
            MidiInPort? port = null;
            try
            {
                port = await MidiInPort.FromIdAsync(id);
            }
            catch (Exception error)
            {
                Trace.WriteLine($"MIDI port {id} failed to open: {error.Message}");
            }
            var transport = MidiDeviceInfo.Transport(id);
            if (port is null)
            {
                // The classic stack refuses a port another app holds open.
                devices[id] = new MidiDevice(id, MidiDeviceInfo.InUseName(name), transport);
            }
            else
            {
                var open = new OpenPort(port, NowMs);
                port.MessageReceived += (_, args) => Forward(id, open, args.Message);
                ports[id] = open;
                devices[id] = new MidiDevice(id, name, transport);
            }
        }
        finally
        {
            gate.Release();
        }
        Post(BridgeProtocol.DevicesChanged(Devices));
    }

    private void Close(string id, bool notify = true)
    {
        if (ports.TryRemove(id, out var open)) open.Dispose();
        var removed = devices.TryRemove(id, out _);
        if (notify && removed) Post(BridgeProtocol.DevicesChanged(Devices));
    }

    private void Forward(string id, OpenPort open, IMidiMessage message)
    {
        var receivedAt = NowMs;
        var bytes = message.RawData.ToArray();
        List<int[]> framed;
        lock (open.Parser) framed = open.Parser.Parse(bytes);
        if (framed.Count == 0) return;
        var timestamp = MidiDeviceInfo.HostTimestampMs(open.OpenedAtMs, message.Timestamp, receivedAt);
        Post(BridgeProtocol.MidiMessage(id, timestamp, framed));
    }

    public void Dispose()
    {
        Stop();
        gate.Dispose();
    }
}
