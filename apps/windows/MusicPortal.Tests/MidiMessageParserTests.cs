using System;
using System.Collections.Generic;
using System.Linq;
using MusicPortal.Midi;
using Xunit;

namespace MusicPortal.Tests;

/// <summary>The same cases as the Android parser's tests (MidiMessageParserTest.kt).</summary>
public class MidiMessageParserTests
{
    private static byte[] Bytes(params int[] values) => values.Select(v => (byte)v).ToArray();

    private static List<int[]> Parse(params int[] values) => new MidiMessageParser().Parse(Bytes(values));

    [Fact]
    public void FramesNoteOnNoteOffAndSustain()
    {
        Assert.Equal(
            new[] { new[] { 0x90, 60, 100 }, new[] { 0x80, 60, 64 }, new[] { 0xB0, 64, 127 } },
            Parse(0x90, 60, 100, 0x80, 60, 64, 0xB0, 64, 127));
    }

    [Fact]
    public void ExpandsRunningStatus()
    {
        // One note-on status, then three data pairs; velocity 0 is a note-off in JS.
        Assert.Equal(
            new[] { new[] { 0x92, 60, 90 }, new[] { 0x92, 64, 80 }, new[] { 0x92, 60, 0 } },
            Parse(0x92, 60, 90, 64, 80, 60, 0));
    }

    [Fact]
    public void IgnoresRealTimeBytesEvenMidMessage()
    {
        Assert.Equal(new[] { new[] { 0x90, 60, 100 } }, Parse(0xF8, 0x90, 0xFE, 60, 0xF8, 100, 0xFE));
    }

    [Fact]
    public void JoinsMessagesSplitAcrossCallbacks()
    {
        var parser = new MidiMessageParser();
        var output = new List<int[]>();
        parser.Parse(Bytes(0x00, 0xB0, 64).AsSpan(1, 2), output); // honours offset/count
        Assert.Empty(output);
        parser.Parse(Bytes(0), output);
        Assert.Equal(new[] { new[] { 0xB0, 64, 0 } }, output);
    }

    [Fact]
    public void SkipsSysexAndDropsUnforwardedChannelMessagesWithoutLosingSync()
    {
        Assert.Equal(
            new[] { new[] { 0x90, 62, 70 } },
            Parse(
                0xF0, 0x7E, 0x7F, 0x06, 0x01, 0xF7, // identity request
                0xC0, 5, // program change: 2 bytes, dropped
                0xE0, 0, 64, // pitch bend, dropped
                0xD0, 30, // channel pressure: 2 bytes, dropped
                0x90, 62, 70));
    }

    [Fact]
    public void OrphanDataBytesAreIgnored()
    {
        // Data before any status, and after a system common message cancels running status.
        Assert.Equal(new[] { new[] { 0x90, 60, 100 } }, Parse(60, 100, 0x90, 60, 100, 0xF3, 1, 61, 100));
    }

    [Fact]
    public void ANewStatusAbandonsATruncatedMessage()
    {
        Assert.Equal(new[] { new[] { 0x80, 61, 0 } }, Parse(0x90, 60, 0x80, 61, 0));
    }

    [Fact]
    public void ReplaysARecordedKeyboardStreamInChunks()
    {
        // A recorded USB keyboard burst (chord with running status, active sensing,
        // sustain pedal), delivered in arbitrary chunk sizes like Windows does.
        var stream = Bytes(0x90, 60, 80, 64, 82, 0xFE, 67, 79, 0xB0, 64, 127, 0x90, 60, 0, 64, 0, 67, 0, 0xB0, 64, 0);
        var expected = new MidiMessageParser().Parse(stream);
        foreach (var chunk in new[] { 1, 2, 3, 5, 7 })
        {
            var parser = new MidiMessageParser();
            var output = new List<int[]>();
            for (var i = 0; i < stream.Length; i += chunk) parser.Parse(stream.AsSpan(i, Math.Min(chunk, stream.Length - i)), output);
            Assert.Equal(expected, output);
        }
        Assert.Equal(8, expected.Count);
    }
}
