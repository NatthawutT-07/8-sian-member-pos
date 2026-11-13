const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('node:path');
let main, printing = false;
const escape = (value) => String(value).replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
app.whenReady().then(() => {
  main = new BrowserWindow({ width: 1280, height: 900, webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true } });
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
    output = new BrowserWindow({ show: false, width: 303, height: 100, webPreferences: { sandbox: true, nodeIntegration: false } });
    const html = `<html lang="th"><meta charset="utf-8"><style>@page{margin:0}*{box-sizing:border-box}body{width:80mm;margin:0;padding:3mm;color:black;font:13px sans-serif}h2{font-size:18px;margin:0 0 4px}p{margin:3px 0}ul{padding:0;margin:6px 0;list-style:none}li{display:flex;gap:8px;padding:3px 0;border-bottom:1px solid #ddd}span{flex:1;overflow-wrap:anywhere}</style><h2>โต๊ะ ${escape(ticket.tableNumber)}</h2><p>#${escape(String(ticket.id).slice(-8))}</p><ul>${ticket.items.map((i) => `<li><span>${escape(i.name)}</span><b>× ${escape(i.quantity)}</b></li>`).join('')}</ul></html>`;
    await output.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
    const height = await output.webContents.executeJavaScript('document.fonts.ready.then(() => Math.ceil(document.documentElement.scrollHeight * 25400 / 96))');
    if (height > 500000) throw new Error('ใบอาหารยาวเกิน 500 มม.');
    await new Promise((resolve, reject) => output.webContents.print({ silent: true, deviceName: printer.name, printBackground: true, margins: { marginType: 'none' }, pageSize: { width: 80000, height: Math.max(20000, height) } }, (ok, reason) => ok ? resolve() : reject(new Error(reason))));
    return { warning: 'ส่งใบอาหารเข้า ES-9910UB แล้ว กรุณาตรวจที่เครื่อง' };
  } finally { output?.destroy(); printing = false; }
});
app.on('window-all-closed', () => app.quit());
