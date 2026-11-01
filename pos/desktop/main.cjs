const { app, BrowserWindow, dialog, ipcMain } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { apiOrigin, createApiClient } = require('./api-client.cjs');
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
    fs.writeFileSync(configPath, JSON.stringify({ apiUrl: 'https://api.8sianracha.com' }, null, 2));
  let origin;
  try {
    origin = apiOrigin(JSON.parse(fs.readFileSync(configPath, 'utf8')));
  } catch {
    await dialog.showMessageBox({
      type: 'error',
      message: 'ตั้งค่า apiUrl เป็น HTTPS origin ของ backend ใน ' + configPath,
    });
    return app.quit();
  }
  const requestApi = createApiClient(origin);
  const page = pathToFileURL(path.join(__dirname, '../web/index.html'));
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
      const result = await requestApi(route, body);
      if (!result.ok) throw new Error(result.data.message || 'ตรวจสอบสิทธิ์ POS ไม่สำเร็จ');
      return result.data;
    },
    transport: bluetooth,
    render: (input) => renderPrint(BrowserWindow, input),
  });
  ipcMain.handle('pos:api', async (event, route, body, method) => {
    if (!isTrustedFrame(event, win, page))
      return { ok: false, status: 403, data: { message: 'หน้านี้ไม่มีสิทธิ์เรียก POS' } };
    try {
      return await requestApi(route, body, method);
    } catch {
      return {
        ok: false,
        status: 0,
        data: { message: 'เชื่อมต่อ backend ไม่สำเร็จ ตรวจอินเทอร์เน็ตและการตั้งค่า server' },
      };
    }
  });
  ipcMain.handle('pos:hardware', async (event, action, input) => {
    if (!isTrustedFrame(event, win, page))
      return { ok: false, error: 'หน้านี้ไม่มีสิทธิ์ควบคุมอุปกรณ์' };
    try {
      return { ok: true, value: await hardware(action, input) };
    } catch (error) {
      return { ok: false, error: error.message };
    }
  });
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (event, url) => {
    if (url !== page.href) event.preventDefault();
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
  await win.loadFile(path.join(__dirname, '../web/index.html'));
});
app.on('window-all-closed', () => app.quit());
