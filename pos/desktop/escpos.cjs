const JsBarcode = require('jsbarcode');

const WIDTH = 576; // 72 mm at 8 dots/mm, for the measured 78–80 mm roll.

function barcode(value) {
  if (typeof value !== 'string' || !/^[\x20-\x7e]{1,100}$/.test(value))
    throw new Error('บาร์โค้ด CODE128 ต้องเป็นตัวเลขหรือตัวอักษรภาษาอังกฤษ');
  const target = {};
  JsBarcode(target, value, { format: 'CODE128', displayValue: false });
  const bits = target.encodings.map((part) => part.data).join('');
  if ((bits.length + 20) * 2 > WIDTH - 32)
    throw new Error('รหัสบาร์โค้ดยาวเกินพื้นที่ 72 มม. กรุณาใช้รหัสสินค้าที่สั้นลง');
  return { value, bits, moduleWidth: 2, quietModules: 10 };
}

function raster(bgra, width, height) {
  if (
    width !== WIDTH ||
    !Number.isInteger(height) ||
    height < 1 ||
    height > 24000 ||
    bgra.length !== width * height * 4
  )
    throw new Error('ขนาดภาพใบเสร็จไม่ถูกต้อง');
  const stride = width / 8;
  const commands = [Buffer.from([27, 64, 27, 97, 0])];
  // Short bands avoid overflowing the printer's image buffer.
  for (let top = 0; top < height; top += 128) {
    const rows = Math.min(128, height - top);
    const pixels = Buffer.alloc(stride * rows);
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < width; x++) {
        const i = ((top + y) * width + x) * 4;
        const gray = (bgra[i] * 114 + bgra[i + 1] * 587 + bgra[i + 2] * 299) / 1000;
        const onWhite = 255 - ((255 - gray) * bgra[i + 3]) / 255;
        // Retain more antialiased edges of Thai glyphs without widening solid barcode bars.
        if (onWhite < 200) pixels[y * stride + (x >> 3)] |= 0x80 >> (x & 7);
      }
    }
    commands.push(rasterBands(pixels, rows));
  }
  return Buffer.concat(commands);
}

// Minimize bytes without changing a single dot or advancing fewer rows. Each
// segment may omit only its white right margin; blank rows still retain height.
function rasterBands(pixels, rows) {
  const stride = WIDTH / 8;
  if (!Number.isInteger(rows) || rows < 1 || rows > 128 || pixels.length !== rows * stride)
    throw new Error('ขนาดช่วงภาพไม่ถูกต้อง');
  const widths = Array(rows).fill(0);
  for (let y = 0; y < rows; y++)
    for (let x = stride - 1; x >= 0; x--)
      if (pixels[y * stride + x]) {
        widths[y] = x + 1;
        break;
      }
  const cost = Array(rows + 1).fill(Infinity),
    split = [],
    segmentWidth = [];
  cost[0] = 0;
  for (let end = 1; end <= rows; end++) {
    let width = 1;
    for (let start = end - 1; start >= 0; start--) {
      width = Math.max(width, widths[start]);
      const candidate = cost[start] + 8 + width * (end - start);
      if (candidate <= cost[end]) {
        cost[end] = candidate;
        split[end] = start;
        segmentWidth[end] = width;
      }
    }
  }
  const segments = [];
  for (let end = rows; end > 0; end = split[end])
    segments.push({ start: split[end], end, width: segmentWidth[end] });
  const output = [];
  for (const { start, end, width } of segments.reverse()) {
    output.push(Buffer.from([29, 118, 48, 0, width, 0, end - start, 0]));
    for (let y = start; y < end; y++) output.push(pixels.subarray(y * stride, y * stride + width));
  }
  return Buffer.concat(output);
}

function finishPrint(imageBytes, cut = true, feedLines = 4) {
  return Buffer.concat([
    imageBytes,
    Buffer.from([27, 100, feedLines]),
    ...(cut ? [Buffer.from([29, 86, 1])] : []),
  ]);
}

function drawerPulse(pin = 2) {
  if (![2, 5].includes(pin)) throw new Error('ขาลิ้นชักต้องเป็น 2 หรือ 5');
  // Verified on this JP80H + WORREX drawer: initialize, ASCII pin selector, 200 ms ON / 500 ms OFF.
  return Buffer.from([27, 64, 27, 112, pin === 2 ? 48 : 49, 100, 250]);
}

module.exports = { WIDTH, barcode, raster, rasterBands, finishPrint, drawerPulse };
