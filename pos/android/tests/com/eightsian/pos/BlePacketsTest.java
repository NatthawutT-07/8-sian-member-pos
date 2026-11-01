package com.eightsian.pos;

import java.io.ByteArrayOutputStream;
import java.util.Arrays;

public final class BlePacketsTest {
    public static void main(String[] args) throws Exception {
        byte[] receipt = new byte[72000];
        for (int i = 0; i < receipt.length; i++) receipt[i] = (byte) (i % 251);
        for (int mtu : new int[]{23, 64, 185, 517}) {
            ByteArrayOutputStream received = new ByteArrayOutputStream();
            int count = BlePackets.send(receipt, mtu, packet -> {
                if (packet.length > mtu - 3 || packet.length > 180) throw new AssertionError("Oversized ATT payload");
                received.write(packet);
            });
            if (!Arrays.equals(receipt, received.toByteArray())) throw new AssertionError("Receipt data changed");
            if (count != (int) Math.ceil(receipt.length / (double) BlePackets.packetBytes(mtu))) throw new AssertionError("Packet count");
        }
        int oldCount = BlePackets.send(receipt, 23, packet -> {});
        int newCount = BlePackets.send(receipt, 185, packet -> {});
        if (oldCount != 3600 || newCount != 400) throw new AssertionError("Expected 9x fewer acknowledgements at MTU 185");
        int[] writes = {0};
        try {
            BlePackets.send(receipt, 185, packet -> { if (++writes[0] == 3) throw new Exception("Printer disconnected"); });
            throw new AssertionError("Failure was ignored");
        } catch (Exception expected) {
            if (!expected.getMessage().equals("Printer disconnected") || writes[0] != 3) throw expected;
        }
        byte[] shortCommand = new byte[]{27, 64, 27, 112, 48, 100, (byte) 250};
        if (BlePackets.send(shortCommand, 23, packet -> {
            if (!Arrays.equals(shortCommand, packet)) throw new AssertionError("Drawer pulse changed");
        }) != 1) throw new AssertionError("Drawer command split");
        System.out.println("PASS: exact bytes and ATT limits at MTU 23/64/185/517, 3600 -> 400 writes, failure stops without retry, drawer unchanged");
    }
}
