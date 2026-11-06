const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const workspace = path.dirname(root);
const localJdk = path.join(workspace, '.tmp/android-tools/jdk');
const javaHome = process.env.JAVA_HOME || path.join(localJdk, fs.readdirSync(localJdk)[0]);
const output = path.join(workspace, '.tmp/android-ble-tests');
fs.mkdirSync(output, { recursive: true });
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
execFileSync(path.join(javaHome, 'bin/java.exe'),
  ['-cp', output, 'com.eightsian.pos.RasterBandsTest', ...samples], { stdio: 'inherit' });
