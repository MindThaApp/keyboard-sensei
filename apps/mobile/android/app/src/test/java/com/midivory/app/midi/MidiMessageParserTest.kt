package com.midivory.app.midi

import org.junit.Assert.assertEquals
import org.junit.Test

class MidiMessageParserTest {
    private fun bytes(vararg values: Int) = ByteArray(values.size) { values[it].toByte() }

    private fun List<IntArray>.asLists() = map { it.toList() }

    @Test
    fun framesNoteOnNoteOffAndSustain() {
        val messages = MidiMessageParser().parse(bytes(0x90, 60, 100, 0x80, 60, 64, 0xB0, 64, 127))
        assertEquals(listOf(listOf(0x90, 60, 100), listOf(0x80, 60, 64), listOf(0xB0, 64, 127)), messages.asLists())
    }

    @Test
    fun expandsRunningStatus() {
        // One note-on status, then three data pairs; velocity 0 is a note-off in JS.
        val messages = MidiMessageParser().parse(bytes(0x92, 60, 90, 64, 80, 60, 0))
        assertEquals(listOf(listOf(0x92, 60, 90), listOf(0x92, 64, 80), listOf(0x92, 60, 0)), messages.asLists())
    }

    @Test
    fun ignoresRealTimeBytesEvenMidMessage() {
        val messages = MidiMessageParser().parse(bytes(0xF8, 0x90, 0xFE, 60, 0xF8, 100, 0xFE))
        assertEquals(listOf(listOf(0x90, 60, 100)), messages.asLists())
    }

    @Test
    fun joinsMessagesSplitAcrossCallbacks() {
        val parser = MidiMessageParser()
        val out = mutableListOf<IntArray>()
        val first = bytes(0x00, 0xB0, 64)
        parser.parse(first, 1, 2, out) // honours offset/count
        assertEquals(0, out.size)
        parser.parse(bytes(0), 0, 1, out)
        assertEquals(listOf(listOf(0xB0, 64, 0)), out.asLists())
    }

    @Test
    fun skipsSysexAndDropsUnforwardedChannelMessagesWithoutLosingSync() {
        val messages = MidiMessageParser().parse(
            bytes(
                0xF0, 0x7E, 0x7F, 0x06, 0x01, 0xF7, // identity request
                0xC0, 5, // program change: 2 bytes, dropped
                0xE0, 0, 64, // pitch bend, dropped
                0xD0, 30, // channel pressure: 2 bytes, dropped
                0x90, 62, 70,
            ),
        )
        assertEquals(listOf(listOf(0x90, 62, 70)), messages.asLists())
    }

    @Test
    fun orphanDataBytesAreIgnored() {
        // Data before any status, and after a system common message cancels running status.
        val messages = MidiMessageParser().parse(bytes(60, 100, 0x90, 60, 100, 0xF3, 1, 61, 100))
        assertEquals(listOf(listOf(0x90, 60, 100)), messages.asLists())
    }

    @Test
    fun aNewStatusAbandonsATruncatedMessage() {
        val messages = MidiMessageParser().parse(bytes(0x90, 60, 0x80, 61, 0))
        assertEquals(listOf(listOf(0x80, 61, 0)), messages.asLists())
    }
}
