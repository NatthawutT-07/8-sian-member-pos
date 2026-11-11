package com.eightsian.pos;

import java.io.ByteArrayOutputStream;

/** Trim only white right margins and encode blank rows at one-byte width.
 * GS v 0 advances by the supplied height, so every printed dot stays in place. */
final class RasterBands {
    static void write(ByteArrayOutputStream output, byte[] pixels, int rows) {
        if (rows < 1 || rows > 128 || pixels.length != rows * 72)
            throw new IllegalArgumentException("Invalid raster band");
        int[] widths = new int[rows];
        for (int y = 0; y < rows; y++) {
            for (int x = 71; x >= 0; x--) {
                if (pixels[y * 72 + x] != 0) { widths[y] = x + 1; break; }
            }
        }
        // Restore the 0.6.18 Android framing while diagnosing printers that
        // acknowledge Bluetooth writes without producing paper output.
        for (int top = 0; top < rows;) {
            boolean blank = widths[top] == 0;
            int end = top + 1, width = Math.max(1, widths[top]);
            while (end < rows && (widths[end] == 0) == blank) {
                width = Math.max(width, widths[end]);
                end++;
            }
            byte[] header = {29, 118, 48, 0, (byte) width, 0, (byte) (end - top), 0};
            output.write(header, 0, header.length);
            for (int y = top; y < end; y++) output.write(pixels, y * 72, width);
            top = end;
        }
    }
}
