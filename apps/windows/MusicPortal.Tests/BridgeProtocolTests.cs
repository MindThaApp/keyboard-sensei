using System;
using System.Text.Json.Nodes;
using MusicPortal.Midi;
using Xunit;

namespace MusicPortal.Tests;

public class BridgeProtocolTests
{
    [Theory]
    [InlineData("midi.isAvailable")]
    [InlineData("midi.start")]
    [InlineData("midi.stop")]
    [InlineData("midi.list")]
    [InlineData("clock.now")]
    public void ParsesEveryRequestThePageSends(string method)
    {
        var parsed = BridgeProtocol.Parse($$"""{"type":"request","id":7,"method":"{{method}}"}""");
        Assert.Equal(new BridgeRequest(7, method), parsed);
    }

    [Theory]
    [InlineData("not json")]
    [InlineData("[]")]
    [InlineData("""{"type":"request","id":1,"method":"shell.exec"}""")]
    [InlineData("""{"type":"request","id":"x","method":"midi.start"}""")]
    [InlineData("""{"type":"request","method":"midi.start"}""")]
    [InlineData("""{"type":"openSettings","page":"ms-settings:privacy-webcam"}""")]
    [InlineData("""{"type":"something"}""")]
    public void RejectsUnknownOrMalformedMessages(string json)
    {
        Assert.Null(BridgeProtocol.Parse(json));
    }

    [Fact]
    public void OpensOnlyFixedSettingsPages()
    {
        Assert.Equal(new OpenSettingsRequest("privacy-microphone"), BridgeProtocol.Parse("""{"type":"openSettings","page":"privacy-microphone"}"""));
        Assert.Equal("ms-settings:privacy-microphone", BridgeProtocol.SettingsPages["privacy-microphone"]);
    }

    [Fact]
    public void BuildsResponsesThePageUnderstands()
    {
        var ok = JsonNode.Parse(BridgeProtocol.Ok(3, BridgeProtocol.Clock(1234.5)))!;
        Assert.Equal("response", (string?)ok["type"]);
        Assert.Equal(3, (int?)ok["id"]);
        Assert.True((bool?)ok["ok"]);
        Assert.Equal(1234.5, (double?)ok["result"]!["nowMs"]);

        var error = JsonNode.Parse(BridgeProtocol.Error(4, "Native MIDI is not available"))!;
        Assert.False((bool?)error["ok"]);
        Assert.Equal("Native MIDI is not available", (string?)error["error"]);

        var empty = JsonNode.Parse(BridgeProtocol.Ok(5, null))!;
        Assert.NotNull(empty["result"]);
    }

    [Fact]
    public void BuildsDeviceAndMessageEvents()
    {
        var devices = JsonNode.Parse(BridgeProtocol.DevicesChanged(new[] { new MidiDevice("usb-1", "Digital Piano", "usb") }))!;
        Assert.Equal("event", (string?)devices["type"]);
        Assert.Equal("devicesChanged", (string?)devices["event"]);
        var device = devices["data"]!["devices"]![0]!;
        Assert.Equal("usb-1", (string?)device["id"]);
        Assert.Equal("Digital Piano", (string?)device["name"]);
        Assert.Equal("usb", (string?)device["transport"]);

        var message = JsonNode.Parse(BridgeProtocol.MidiMessage("usb-1", 51.25, new[] { new[] { 0x90, 60, 90 }, new[] { 0xB0, 64, 127 } }))!;
        Assert.Equal("midiMessage", (string?)message["event"]);
        Assert.Equal(51.25, (double?)message["data"]!["timestampMs"]);
        Assert.Equal("[[144,60,90],[176,64,127]]", message["data"]!["messages"]!.ToJsonString());
    }

    [Fact]
    public void ProtocolVersionMatchesThePage()
    {
        // packages/midi-engine/src/windows.ts WINDOWS_BRIDGE_PROTOCOL_VERSION
        Assert.Equal(1, BridgeProtocol.Version);
    }
}
