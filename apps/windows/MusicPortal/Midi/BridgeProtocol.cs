using System.Collections.Generic;
using System.Linq;
using System.Text.Json;
using System.Text.Json.Nodes;

namespace MusicPortal.Midi;

/// <summary>A MIDI input as the page sees it (matches NativeMidiDevice in packages/midi-engine).</summary>
public sealed record MidiDevice(string Id, string Name, string Transport);

/// <summary>A request from the page: { type: "request", id, method, params? }.</summary>
public sealed record BridgeRequest(int Id, string Method);

/// <summary>Asks the host to open a fixed Windows Settings page: { type: "openSettings", page }.</summary>
public sealed record OpenSettingsRequest(string Page);

/// <summary>
/// The JSON protocol between the page and the host, version 1. The page side is
/// packages/midi-engine/src/windows.ts; the two must change together.
/// </summary>
public static class BridgeProtocol
{
    public const int Version = 1;

    public static readonly IReadOnlySet<string> Methods = new HashSet<string>
    {
        "midi.isAvailable", "midi.start", "midi.stop", "midi.list", "clock.now",
    };

    /// <summary>Only these pages can be opened, never an arbitrary URI from the page.</summary>
    public static readonly IReadOnlyDictionary<string, string> SettingsPages = new Dictionary<string, string>
    {
        ["privacy-microphone"] = "ms-settings:privacy-microphone",
        ["bluetooth"] = "ms-settings:bluetooth",
    };

    /// <summary>Parses one message from the page; null for anything unknown or malformed.</summary>
    public static object? Parse(string json)
    {
        JsonNode? node;
        try
        {
            node = JsonNode.Parse(json);
        }
        catch (JsonException)
        {
            return null;
        }
        if (node is not JsonObject message) return null;
        var type = Text(message, "type");
        if (type == "request")
        {
            var method = Text(message, "method");
            if (method is null || !Methods.Contains(method)) return null;
            if (message["id"] is not JsonValue idValue || !idValue.TryGetValue<int>(out var id)) return null;
            return new BridgeRequest(id, method);
        }
        if (type == "openSettings")
        {
            var page = Text(message, "page");
            return page is not null && SettingsPages.ContainsKey(page) ? new OpenSettingsRequest(page) : null;
        }
        return null;
    }

    public static string Ok(int id, JsonNode? result) =>
        new JsonObject { ["type"] = "response", ["id"] = id, ["ok"] = true, ["result"] = result ?? new JsonObject() }.ToJsonString();

    public static string Error(int id, string error) =>
        new JsonObject { ["type"] = "response", ["id"] = id, ["ok"] = false, ["error"] = error }.ToJsonString();

    public static JsonObject Devices(IEnumerable<MidiDevice> devices) => new()
    {
        ["devices"] = new JsonArray(devices
            .Select(device => (JsonNode)new JsonObject
            {
                ["id"] = device.Id,
                ["name"] = device.Name,
                ["transport"] = device.Transport,
            })
            .ToArray()),
    };

    public static string DevicesChanged(IEnumerable<MidiDevice> devices) =>
        new JsonObject { ["type"] = "event", ["event"] = "devicesChanged", ["data"] = Devices(devices) }.ToJsonString();

    /// <summary>One batch of channel messages from one device, stamped on the host clock.</summary>
    public static string MidiMessage(string deviceId, double timestampMs, IEnumerable<int[]> messages) =>
        new JsonObject
        {
            ["type"] = "event",
            ["event"] = "midiMessage",
            ["data"] = new JsonObject
            {
                ["deviceId"] = deviceId,
                ["timestampMs"] = timestampMs,
                ["messages"] = new JsonArray(messages
                    .Select(m => (JsonNode)new JsonArray(m.Select(b => (JsonNode)JsonValue.Create(b)!).ToArray()))
                    .ToArray()),
            },
        }.ToJsonString();

    public static JsonObject Clock(double nowMs) => new() { ["nowMs"] = nowMs };

    public static JsonObject Available(bool available) => new() { ["available"] = available };

    private static string? Text(JsonObject message, string key) =>
        message[key] is JsonValue value && value.TryGetValue<string>(out var text) ? text : null;
}
