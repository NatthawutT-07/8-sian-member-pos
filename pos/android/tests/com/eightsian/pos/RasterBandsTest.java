package com.eightsian.pos;

import java.io.ByteArrayOutputStream;
import java.nio.file.*;
import java.util.*;

public final class RasterBandsTest {
    static byte[] decode(byte[] data) {
        ByteArrayOutputStream result = new ByteArrayOutputStream();
        for (int offset = 0; offset < data.length;) {
            if (data[offset] != 29 || data[offset + 1] != 118 || data[offset + 2] != 48 || data[offset + 3] != 0)
                throw new AssertionError("Invalid raster command");
            int width = data[offset + 4] & 255, rows = data[offset + 6] & 255;
            if (width < 1 || width > 72 || rows < 1 || rows > 128) throw new AssertionError("Invalid dimensions");
            offset += 8;
            for (int y = 0; y < rows; y++) {
                result.write(data, offset, width);
                for (int x = width; x < 72; x++) result.write(0);
                offset += width;
            }
        }
        return result.toByteArray();
    }
    static void check(byte[] pixels, int rows) {
        ByteArrayOutputStream output = new ByteArrayOutputStream();
        RasterBands.write(output, pixels, rows);
        if (!Arrays.equals(pixels, decode(output.toByteArray()))) throw new AssertionError("Printed dots moved or changed");
    }
    public static void main(String[] args) throws Exception {
        byte[] compatibility = new byte[72 * 8];
        compatibility[72] = (byte) 128;
        compatibility[2 * 72 + 50] = 15;
        compatibility[3 * 72 + 2] = 16;
        compatibility[6 * 72 + 71] = (byte) 255;
        compatibility[7 * 72] = (byte) 128;
        ByteArrayOutputStream legacy = new ByteArrayOutputStream();
        RasterBands.write(legacy, compatibility, 8);
        byte[] framed = legacy.toByteArray();
        int cursor = 0;
        for (int[] expected : new int[][]{{1, 1}, {51, 3}, {1, 2}, {72, 2}}) {
            if ((framed[cursor + 4] & 255) != expected[0] || (framed[cursor + 6] & 255) != expected[1])
                throw new AssertionError("Android 0.6.18 raster framing changed");
            cursor += 8 + expected[0] * expected[1];
        }
        if (cursor != framed.length) throw new AssertionError("Unexpected raster fragments");
        check(new byte[72 * 128], 128);
        byte[] black = new byte[72 * 128]; Arrays.fill(black, (byte) 255); check(black, 128);
        Random random = new Random(8);
        for (int rows = 1; rows <= 128; rows++) {
            byte[] pixels = new byte[72 * rows];
            for (int y = 0; y < rows; y++) if (y % 3 != 0)
                for (int x = 0; x < random.nextInt(73); x++) pixels[y * 72 + x] = (byte) random.nextInt(256);
            check(pixels, rows);
        }
        for (String file : args) {
            byte[] original = Files.readAllBytes(Path.of(file));
            byte[] commands = Arrays.copyOfRange(original, 5, original.length);
            byte[] pixels = decode(commands);
            ByteArrayOutputStream optimized = new ByteArrayOutputStream();
            for (int top = 0; top < pixels.length / 72; top += 128) {
                int rows = Math.min(128, pixels.length / 72 - top);
                RasterBands.write(optimized, Arrays.copyOfRange(pixels, top * 72, (top + rows) * 72), rows);
            }
            if (!Arrays.equals(pixels, decode(optimized.toByteArray()))) throw new AssertionError("Receipt changed");
            System.out.println(Path.of(file).getFileName() + ": " + original.length + " -> " + (optimized.size() + 5) + " bytes; all dots identical");
        }
        System.out.println("PASS: exact pixels, height, barcode gaps, full-width black and blank rows");
    }
}
