using System;
using System.Collections.Generic;

namespace MusicPortal.Midi;

/// <summary>
/// Frames a raw MIDI byte stream (one per input port) into complete channel
/// messages. A port's callback can hold several messages, a message can be split
/// across callbacks, keyboards use running status (one note-on status byte then
/// many data pairs), and real-time bytes (clock 0xF8, active sensing 0xFE) can
/// appear anywhere, even between the data bytes of another message.
///
/// Only note off (0x8n), note on (0x9n) and control change (0xBn) are emitted;
/// other channel messages are framed (to stay in sync) and dropped.
///
/// A port of the Android parser (apps/mobile/.../midi/MidiMessageParser.kt);
/// both are tested against the same cases.
/// </summary>
public sealed class MidiMessageParser
{
    private int runningStatus;
    private int expectedLength;
    private readonly int[] pending = new int[3];
    private int pendingCount;
    private bool inSysex;

    public void Parse(ReadOnlySpan<byte> bytes, List<int[]> output)
    {
        foreach (var value in bytes) Feed(value, output);
    }

    public List<int[]> Parse(ReadOnlySpan<byte> bytes)
    {
        var output = new List<int[]>();
        Parse(bytes, output);
        return output;
    }

    private void Feed(int value, List<int[]> output)
    {
        if (value >= 0xF8)
        {
            // Real-time: a single byte that never disturbs the message around it.
            return;
        }
        if (value == 0xF0)
        {
            inSysex = true;
            ClearStatus();
            return;
        }
        if (value == 0xF7)
        {
            inSysex = false;
            return;
        }
        if (value >= 0xF0)
        {
            // System common (song position, tune request, ...): cancels running
            // status; its data bytes are then ignored as orphans.
            inSysex = false;
            ClearStatus();
            return;
        }
        if (value >= 0x80)
        {
            inSysex = false;
            runningStatus = value;
            var command = value & 0xF0;
            expectedLength = command == 0xC0 || command == 0xD0 ? 2 : 3;
            pending[0] = value;
            pendingCount = 1;
            return;
        }
        if (inSysex || runningStatus == 0) return;
        if (pendingCount == 0)
        {
            pending[0] = runningStatus;
            pendingCount = 1;
        }
        pending[pendingCount++] = value;
        if (pendingCount == expectedLength)
        {
            if (IsForwarded(runningStatus)) output.Add(pending[..expectedLength]);
            pendingCount = 0;
        }
    }

    private void ClearStatus()
    {
        runningStatus = 0;
        pendingCount = 0;
    }

    private static bool IsForwarded(int status)
    {
        var command = status & 0xF0;
        return command == 0x80 || command == 0x90 || command == 0xB0;
    }
}
