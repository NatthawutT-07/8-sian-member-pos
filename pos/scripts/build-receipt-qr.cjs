// Regenerate the offline browser bundle using the workspace qrcode dependency.
const path = require('node:path');
const fs = require('node:fs');
require('esbuild').buildSync({
  stdin: { contents: "export { create } from 'qrcode/lib/core/qrcode.js';", resolveDir: path.resolve(__dirname, '../..') },
  bundle: true,
  platform: 'browser',
  format: 'esm',
  minify: true,
  outfile: path.resolve(__dirname, '../web/vendor/qrcode.js'),
});
fs.copyFileSync(require.resolve('qrcode/license'), path.resolve(__dirname, '../web/vendor/qrcode.LICENSE'));
