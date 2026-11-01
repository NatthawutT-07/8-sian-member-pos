package com.eightsian.pos;

import java.util.Arrays;

/** ATT writes use MTU minus three bytes, capped to the printer's existing Windows profile. */
final class BlePackets {
    interface Writer { void write(byte[] packet) throws Exception; }
    static int packetBytes(int mtu) { return Math.min(180, Math.max(20, mtu - 3)); }
    static int send(byte[] bytes, int mtu, Writer writer) throws Exception {
        if (bytes.length < 1 || bytes.length > 2000000) throw new IllegalArgumentException("Invalid print job size");
        int size = packetBytes(mtu);
        int packets = 0;
        for (int offset = 0; offset < bytes.length; offset += size) {
            if (Thread.currentThread().isInterrupted()) throw new InterruptedException("Print cancelled");
            writer.write(Arrays.copyOfRange(bytes, offset, Math.min(offset + size, bytes.length)));
            packets++;
        }
        return packets;
    }
}
