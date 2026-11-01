const { spawn } = require('node:child_process');
const path = require('node:path');

function bluetooth(request) {
  if (process.platform !== 'win32')
    return Promise.reject(new Error('รองรับ Bluetooth ใน Windows เท่านั้น'));
  return new Promise((resolve, reject) => {
    const powershell = path.join(
      process.env.SystemRoot || 'C:\\Windows',
      'System32',
      'WindowsPowerShell',
      'v1.0',
      'powershell.exe',
    );
    // The script is bundled outside asar. No shell interpolation, command-line data or temp receipt files.
    const script = path.join(__dirname.replace('app.asar', 'app.asar.unpacked'), 'bluetooth.ps1');
    const child = spawn(powershell, ['-NoLogo', '-NoProfile', '-NonInteractive', '-File', script], {
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let output = '',
      settled = false;
    const finish = (error, result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      error ? reject(error) : resolve(result);
    };
    const timer = setTimeout(
      () => {
        child.kill();
        finish(new Error('หมดเวลาส่งข้อมูล อาจพิมพ์ได้บางส่วน ตรวจเครื่องก่อนพิมพ์ซ้ำ'));
      },
      request.action === 'write' ? 240000 : 45000,
    );
    child.on('error', (error) => finish(error));
    child.stdin.on('error', () => {});
    child.stdout.on('data', (chunk) => {
      output += chunk.toString('utf8');
      if (output.length > 100000) {
        child.kill();
        finish(new Error('ข้อมูลอุปกรณ์ไม่ถูกต้อง'));
      }
    });
    child.stderr.resume();
    child.on('close', () => {
      try {
        const result = JSON.parse(output.trim());
        if (!result.ok)
          throw new Error(
            `เชื่อมต่อ/ส่งข้อมูลไม่สำเร็จ (${result.error}) ส่งแล้ว ${result.bytesSent || 0} ไบต์ กรุณาตรวจเครื่องก่อนลองใหม่`,
          );
        finish(null, result);
      } catch (error) {
        finish(new Error(error.message || 'เรียก Windows Bluetooth ไม่สำเร็จ'));
      }
    });
    child.stdin.end(JSON.stringify(request));
  });
}
module.exports = { bluetooth };
