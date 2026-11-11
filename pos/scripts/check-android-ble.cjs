const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const workspace = path.dirname(root);
const localJdk = path.join(workspace, '.tmp/android-tools/jdk');
const javaHome = process.env.JAVA_HOME || path.join(localJdk, fs.readdirSync(localJdk)[0]);
const output = path.join(workspace, '.tmp/android-ble-tests');
fs.mkdirSync(output, { recursive: true });
const { rasterBands } = require('../desktop/escpos.cjs');
const parity = [];
for (let band = 0; band < 3; band++) {
  const pixels = Buffer.alloc(72 * 128);
  for (let y = 0; y < 128; y++) {
    const width = y % 11 === 0 ? 72 : y % 5 === 0 ? 0 : (y + band * 7) % 60;
    for (let x = 0; x < width; x++) pixels[y * 72 + x] = (x * 13 + y * 7) & 255;
  }
  parity.push(rasterBands(pixels, 128));
}
const parityPath = path.join(output, 'raster-parity.bin');
fs.writeFileSync(parityPath, Buffer.concat([Buffer.from([27, 64, 27, 97, 0]), ...parity]));
execFileSync(
  path.join(javaHome, 'bin/javac.exe'),
  [
    '-encoding',
    'UTF-8',
    '-d',
    output,
    path.join(root, 'android/app/src/main/java/com/eightsian/pos/BlePackets.java'),
    path.join(root, 'android/tests/com/eightsian/pos/BlePacketsTest.java'),
    path.join(root, 'android/app/src/main/java/com/eightsian/pos/RasterBands.java'),
    path.join(root, 'android/tests/com/eightsian/pos/RasterBandsTest.java'),
  ],
  { stdio: 'inherit' },
);
execFileSync(
  path.join(javaHome, 'bin/java.exe'),
  ['-cp', output, 'com.eightsian.pos.BlePacketsTest'],
  { stdio: 'inherit' },
);
const samples = ['receipt', 'barcode', 'shift-report', 'kitchen']
  .map((name) => path.join(workspace, '.tmp/pos-hardware', `${name}.bin`))
  .filter((file) => fs.existsSync(file));
execFileSync(
  path.join(javaHome, 'bin/java.exe'),
  ['-cp', output, 'com.eightsian.pos.RasterBandsTest', ...samples, parityPath],
  { stdio: 'inherit' },
);
