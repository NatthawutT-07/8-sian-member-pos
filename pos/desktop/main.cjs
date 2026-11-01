const { app, BrowserWindow, dialog, ipcMain } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { bluetooth } = require('./bluetooth.cjs');
const { createHardware, normalizeSettings } = require('./hardware.cjs');
const { renderPrint } = require('./render.cjs');
const { isTrustedFrame } = require('./trusted-frame.cjs');

const singleInstance = app.requestSingleInstanceLock();
if (!singleInstance) app.quit();
app.on('second-instance', () => {
  const win = BrowserWindow.getAllWindows()[0];
  if (win) {
    if (win.isMinimized()) win.restore();
    win.focus();
  }
});

app.whenReady().then(async () => {
  if (!singleInstance) return;
  const configPath = path.join(app.getPath('userData'), 'server.json');
  if (!fs.existsSync(configPath))
    fs.writeFileSync(configPath, JSON.stringify({ url: 'http://localhost:3001/pos/' }, null, 2));
  let server;
  try {
    server = new URL(JSON.parse(fs.readFileSync(configPath, 'utf8')).url);
    if (
      server.pathname !== '/pos/' ||
      server.search ||
      server.hash ||
      server.username ||
      server.password ||
      !(
        server.protocol === 'https:' ||
        (server.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(server.hostname))
      )
    )
      throw new Error('Invalid URL');
  } catch {
    await dialog.showMessageBox({
      type: 'error',
      message: `ตั้งค่า URL แบบ HTTPS ที่ลงท้าย /pos/ ใน ${configPath}`,
    });
    return app.quit();
  }
  const win = new BrowserWindow({
    width: 1280,
    height: 850,
    minWidth: 800,
    minHeight: 600,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      partition: 'persist:pos',
      preload: path.join(__dirname, 'preload.cjs'),
    },
  });
  win.removeMenu();
  const hardwarePath = path.join(app.getPath('userData'), 'hardware.json');
  const hardware = createHardware({
    readSettings: () => {
      try {
        return normalizeSettings(JSON.parse(fs.readFileSync(hardwarePath, 'utf8')));
      } catch {
        return normalizeSettings();
      }
    },
    saveSettings: (value) => {
      fs.writeFileSync(`${hardwarePath}.tmp`, JSON.stringify(normalizeSettings(value), null, 2));
      fs.renameSync(`${hardwarePath}.tmp`, hardwarePath);
    },
    request: async (route, body) => {
      const response = await win.webContents.session.fetch(
        new URL(`/api/pos/${route}`, server).href,
        {
          method: body === undefined ? 'GET' : 'POST',
          credentials: 'include',
          redirect: 'error',
          headers: {
            Origin: server.origin,
            ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
          },
          body: body === undefined ? undefined : JSON.stringify(body),
          signal: AbortSignal.timeout(15000),
        },
      );
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'ตรวจสอบสิทธิ์ POS ไม่สำเร็จ');
      return data;
    },
    transport: bluetooth,
    render: (input) => renderPrint(BrowserWindow, input),
  });
  ipcMain.handle('pos:hardware', async (event, action, input) => {
    if (!isTrustedFrame(event, win, server))
      return { ok: false, error: 'หน้านี้ไม่มีสิทธิ์ควบคุมอุปกรณ์' };
    try {
      return { ok: true, value: await hardware(action, input) };
    } catch (error) {
      return { ok: false, error: error.message };
    }
  });
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (event, url) => {
    const target = new URL(url);
    if (target.origin !== server.origin || !target.pathname.startsWith('/pos/'))
      event.preventDefault();
  });
  win.webContents.session.setPermissionRequestHandler((_contents, _permission, callback) =>
    callback(false),
  );
  win.webContents.on('did-fail-load', (_event, code) => {
    if (code !== -3)
      dialog.showMessageBox(win, {
        type: 'error',
        message: `เชื่อมต่อ POS ไม่สำเร็จ ตรวจอินเทอร์เน็ตและ URL ใน ${configPath}`,
      });
  });
  await win.loadURL(server.href);
});
app.on('window-all-closed', () => app.quit());
