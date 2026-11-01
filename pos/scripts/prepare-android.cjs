const fs = require('node:fs');
const path = require('node:path');
const esbuild = require('esbuild');
const root = path.resolve(__dirname, '..');
const output = path.join(root, 'android/app/src/main/assets');
fs.mkdirSync(output, { recursive: true });
fs.cpSync(path.join(root, 'web'), path.join(output, 'web'), { recursive: true });
fs.mkdirSync(path.join(output, 'desktop'), { recursive: true });
for (const name of ['print.html', 'print.css', 'print-renderer.js'])
  fs.copyFileSync(path.join(root, 'desktop', name), path.join(output, 'desktop', name));
const index = path.join(output, 'web/index.html');
fs.writeFileSync(
  index,
  fs
    .readFileSync(index, 'utf8')
    .replace(
      '<script src="./app.js"',
      '<script src="./android-bridge.js"></script>\n    <script src="./app.js"',
    ),
);
esbuild
  .build({
    entryPoints: [path.join(root, 'android/bridge/index.js')],
    outfile: path.join(output, 'web/android-bridge.js'),
    bundle: true,
    platform: 'browser',
    target: 'chrome90',
    format: 'iife',
    inject: [path.join(root, 'android/bridge/buffer-shim.js')],
    alias: { 'node:crypto': path.join(root, 'android/bridge/crypto-shim.js') },
  })
  .catch(() => process.exit(1));
