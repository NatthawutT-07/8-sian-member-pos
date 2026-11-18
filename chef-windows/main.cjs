const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('node:path');
let main, printing = false;
const escape = (value) => String(value).replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
app.whenReady().then(() => {
  main = new BrowserWindow({ width: 1280, height: 900, webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true } });
  main.setTitle('8 เซียน · พิมพ์ตรง ES-9910UB');
  main.webContents.on('page-title-updated', (event) => { event.preventDefault(); main.setTitle('8 เซียน · พิมพ์ตรง ES-9910UB'); });
  main.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  main.webContents.on('will-navigate', (event, url) => { if (new URL(url).origin !== 'https://8sianracha.com') event.preventDefault(); });
  main.loadURL('https://8sianracha.com/chef');
});
ipcMain.handle('chef-print', async (event, ticket) => {
  if (event.sender !== main.webContents || event.senderFrame !== main.webContents.mainFrame || new URL(event.senderFrame.url).origin !== 'https://8sianracha.com') throw new Error('Unauthorized print source');
  if (printing) throw new Error('เครื่องพิมพ์กำลังรับงาน กรุณารอสักครู่');
  if (!ticket || !Array.isArray(ticket.items) || ticket.items.length > 500 || JSON.stringify(ticket).length > 100000) throw new Error('ข้อมูลใบอาหารไม่ถูกต้อง');
  printing = true;
  let output;
  try {
    const printers = await main.webContents.getPrintersAsync();
    const printer = printers.find((p) => p.name === 'ES-9910UB');
    if (!printer) throw new Error('ไม่พบไดรเวอร์ ES-9910UB ใน Windows');
    output = new BrowserWindow({ show: false, width: 303, height: 114, webPreferences: { sandbox: true, nodeIntegration: false } });
    const html = `<html lang="th"><meta charset="utf-8"><style>@page{size:80mm 30mm;margin:0}*{box-sizing:border-box}body{width:80mm;height:30mm;display:grid;place-items:center;margin:0;padding:2mm;color:black;font-family:Tahoma,sans-serif}h2{font-size:32pt;font-weight:800;line-height:1.2;text-align:center;overflow-wrap:anywhere;margin:0}</style><h2>โต๊ะ ${escape(ticket.tableNumber)}</h2></html>`;
    await output.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
    await output.webContents.executeJavaScript('document.fonts.ready.then(() => true)');
    await new Promise((resolve, reject) => output.webContents.print({ silent: true, deviceName: printer.name, printBackground: true, margins: { marginType: 'none' }, pageSize: { width: 80000, height: 30000 } }, (ok, reason) => ok ? resolve() : reject(new Error(reason))));
    return { warning: 'ส่งใบอาหารเข้า ES-9910UB แล้ว กรุณาตรวจที่เครื่อง' };
  } finally { output?.destroy(); printing = false; }
});
app.on('window-all-closed', () => app.quit());
