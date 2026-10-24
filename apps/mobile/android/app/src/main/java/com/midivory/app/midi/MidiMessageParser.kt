package com.midivory.app.midi

/**
 * Frames a raw MIDI byte stream (one per input port) into complete channel
 * messages. android.media.midi hands over whatever bytes arrived, so one callback
 * can hold several messages, a message can be split across callbacks, keyboards
 * use running status (a note-on status byte followed by many data pairs), and
 * real-time bytes (clock 0xF8, active sensing 0xFE) can appear anywhere, even
 * between the data bytes of another message.
 *
 * Only note off (0x8n), note on (0x9n) and control change (0xBn) are emitted;
 * other channel messages are framed (to stay in sync) and dropped.
 */
class MidiMessageParser {
    private var runningStatus = 0
    private var expectedLength = 0
    private val pending = IntArray(3)
    private var pendingCount = 0
    private var inSysex = false

    fun parse(bytes: ByteArray, offset: Int, count: Int, out: MutableList<IntArray>) {
        for (index in offset until offset + count) feed(bytes[index].toInt() and 0xFF, out)
    }

    fun parse(bytes: ByteArray): List<IntArray> = mutableListOf<IntArray>().also { parse(bytes, 0, bytes.size, it) }

    private fun feed(byte: Int, out: MutableList<IntArray>) {
        when {
            // Real-time: a single byte that never disturbs the message around it.
            byte >= 0xF8 -> return
            byte == 0xF0 -> {
                inSysex = true
                clearStatus()
            }
            byte == 0xF7 -> inSysex = false
            // System common (song position, tune request, ...): cancels running
            // status; its data bytes are then ignored as orphans.
            byte >= 0xF0 -> {
                inSysex = false
                clearStatus()
            }
            byte >= 0x80 -> {
                inSysex = false
                runningStatus = byte
                val command = byte and 0xF0
                expectedLength = if (command == 0xC0 || command == 0xD0) 2 else 3
                pending[0] = byte
                pendingCount = 1
            }
            else -> {
                if (inSysex || runningStatus == 0) return
                if (pendingCount == 0) {
                    pending[0] = runningStatus
                    pendingCount = 1
                }
                pending[pendingCount++] = byte
                if (pendingCount == expectedLength) {
                    if (isForwarded(runningStatus)) out.add(pending.copyOf(expectedLength))
                    pendingCount = 0
                }
            }
        }
    }

    private fun clearStatus() {
        runningStatus = 0
        pendingCount = 0
    }

    private fun isForwarded(status: Int): Boolean {
        val command = status and 0xF0
        return command == 0x80 || command == 0x90 || command == 0xB0
    }
}
