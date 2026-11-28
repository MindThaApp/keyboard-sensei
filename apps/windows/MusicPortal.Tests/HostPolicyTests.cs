using System;
using System.Collections.Generic;
using System.IO;
using MusicPortal;
using MusicPortal.Midi;
using Xunit;

namespace MusicPortal.Tests;

public class HostPolicyTests
{
    private readonly HostPolicy policy = new("https://api.example.test/api");

    [Fact]
    public void TheAppOriginIsFixed()
    {
        // Local storage and IndexedDB are keyed by this origin: never change it.
        Assert.Equal("https://app.musicportal.invalid/", HostPolicy.AppOrigin.ToString());
    }

    [Theory]
    [InlineData("https://app.musicportal.invalid/", true)]
    [InlineData("https://app.musicportal.invalid/lessons/lesson-01", true)]
    [InlineData("https://api.example.test/auth/google/callback", true)]
    [InlineData("about:blank", true)]
    [InlineData("http://app.musicportal.invalid/", false)]
    [InlineData("https://app.musicportal.invalid:8443/", false)]
    [InlineData("https://evil.example/", false)]
    [InlineData("https://app.musicportal.invalid.evil.example/", false)]
    [InlineData("file:///C:/Windows/win.ini", false)]
    [InlineData("javascript:alert(1)", false)]
    public void LocksNavigationToTheAppAndTheApi(string uri, bool allowed)
    {
        Assert.Equal(allowed, policy.MayNavigate(uri));
    }

    [Fact]
    public void WithoutAnApiUrlOnlyTheAppNavigates()
    {
        var local = new HostPolicy(null);
        Assert.True(local.MayNavigate("https://app.musicportal.invalid/learn"));
        Assert.False(local.MayNavigate("https://api.example.test/"));
    }

    [Theory]
    [InlineData("https://example.org/privacy", true)]
    [InlineData("mailto:support@example.org", true)]
    [InlineData("https://app.musicportal.invalid/learn", false)]
    [InlineData("ms-settings:privacy-microphone", false)]
    [InlineData("file:///C:/", false)]
    [InlineData("not a uri", false)]
    public void OpensOnlyWebAndMailLinksExternally(string uri, bool allowed)
    {
        Assert.Equal(allowed, HostPolicy.MayOpenExternally(uri));
    }

    [Theory]
    [InlineData("Microphone", "https://app.musicportal.invalid/tune", true)]
    [InlineData("MidiSystemExclusiveMessages", "https://app.musicportal.invalid/", true)]
    [InlineData("UnknownPermission", "https://app.musicportal.invalid/", true)]
    [InlineData("Microphone", "https://evil.example/", false)]
    [InlineData("Camera", "https://app.musicportal.invalid/", false)]
    [InlineData("Geolocation", "https://app.musicportal.invalid/", false)]
    [InlineData("Microphone", null, false)]
    public void GrantsMicAndMidiOnlyToTheApp(string kind, string? uri, bool granted)
    {
        Assert.Equal(granted, HostPolicy.Grants(kind, uri));
    }

    [Fact]
    public void ServesFilesAndFallsBackToIndexForRoutes()
    {
        var root = Path.Combine(Path.GetTempPath(), "mp-web-root");
        var existing = new HashSet<string>(StringComparer.OrdinalIgnoreCase)
        {
            Path.GetFullPath(Path.Combine(root, "index.html")),
            Path.GetFullPath(Path.Combine(root, "assets", "index-abc.js")),
        };
        string? Resolve(string path) => HostPolicy.ResolveFile(root, new Uri(HostPolicy.AppOrigin, path), existing.Contains);
        var index = Path.Combine(Path.GetFullPath(root), "index.html");

        Assert.Equal(index, Resolve("/"));
        Assert.Equal(index, Resolve("/learn"));
        Assert.Equal(index, Resolve("/lessons/lesson-01"));
        Assert.Equal(Path.GetFullPath(Path.Combine(root, "assets", "index-abc.js")), Resolve("/assets/index-abc.js"));
        Assert.Null(Resolve("/assets/missing.js"));
        Assert.Null(HostPolicy.ResolveFile(root, new Uri("https://evil.example/learn"), existing.Contains));
    }

    [Fact]
    public void AnnouncesTheHostToThePage()
    {
        var script = HostPolicy.HostScript("1.2.3.0", midiBridge: true);
        Assert.Contains("__musicPortalHost", script);
        Assert.Contains("\"platform\":\"windows\"", script);
        Assert.Contains("\"version\":\"1.2.3.0\"", script);
        Assert.Contains("\"midiBridge\":true", script);
        Assert.Contains("\"protocol\":1", script);
    }
}

public class MidiDeviceInfoTests
{
    [Theory]
    [InlineData(@"\\?\SWD#MMDEVAPI#MIDII_1234.BTHLEDevice#{6f8f7d64}", "bluetooth")]
    [InlineData(@"\\?\SWD#MMDEVAPI#MIDII_ABCD.P_0000#USB#VID_0499&PID_1617", "usb")]
    [InlineData(@"\\?\SWD#MMDEVAPI#MIDII_LOOPBACK", "other")]
    public void ClassifiesTransport(string id, string transport)
    {
        Assert.Equal(transport, MidiDeviceInfo.Transport(id));
    }

    [Fact]
    public void MarksPortsHeldByAnotherApp()
    {
        Assert.Equal("Digital Piano (in use by another app)", MidiDeviceInfo.InUseName("Digital Piano"));
    }

    [Fact]
    public void StampsMessagesOnTheHostClockNeverLaterThanArrival()
    {
        // Port opened at 1000 ms; message stamped 250 ms after opening; arrived at 1252 ms.
        Assert.Equal(1250, MidiDeviceInfo.HostTimestampMs(1000, TimeSpan.FromMilliseconds(250), 1252));
        // A stamp ahead of arrival is clamped to arrival.
        Assert.Equal(1100, MidiDeviceInfo.HostTimestampMs(1000, TimeSpan.FromMilliseconds(500), 1100));
        // A negative stamp falls back to arrival.
        Assert.Equal(1300, MidiDeviceInfo.HostTimestampMs(1000, TimeSpan.FromMilliseconds(-5), 1300));
    }

    [Fact]
    public void HostClockSamplesMapThroughConstantOffset()
    {
        // The page maps host timestamps with NativeClockSync (packages/midi-engine):
        // a host stamp minus the measured offset lands on the page clock. Simulate
        // one bracketed sample and check a later message maps correctly.
        double pageBefore = 4999, hostNow = 1200, pageAfter = 5001;
        var offset = hostNow - (pageBefore + pageAfter) / 2;
        var stamped = MidiDeviceInfo.HostTimestampMs(1000, TimeSpan.FromMilliseconds(400), 1405);
        Assert.Equal(5200, stamped - offset);
    }
}
