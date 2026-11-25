const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const assert = require('node:assert/strict');
app.disableHardwareAcceleration();
app.setPath('userData', path.resolve(__dirname, '../../.tmp/table-layout/electron'));
app.on('window-all-closed', () => {});
app.whenReady().then(async () => {
  const root = path.resolve(__dirname, '..');
  const output = path.resolve(root, '../.tmp/table-layout');
  fs.mkdirSync(output, { recursive: true });
  const source = fs.readFileSync(path.join(root, 'web/index.html'), 'utf8');
  const dialog = source.match(/<dialog id="tables-dialog"[\s\S]*?<\/dialog>/)[0];
  const styles = ['style.css', 'cashier-layout.css', 'table-layout.css'].map(name =>
    `<link rel="stylesheet" href="${pathToFileURL(path.join(root, 'web', name))}">`).join('');
  const fixture = path.join(output, 'preview.html');
  fs.writeFileSync(fixture, `<meta charset="utf-8">${styles}${dialog}`);
  try {
    for (const [width, height] of [[1340, 800], [800, 1280], [1280, 800], [600, 960], [360, 640]]) {
      const win = new BrowserWindow({ width, height, useContentSize: true, show: false });
      await win.loadFile(fixture);
      win.webContents.debugger.attach('1.3');
      await win.webContents.debugger.sendCommand('Emulation.setDeviceMetricsOverride', {
        width, height, deviceScaleFactor: 1, mobile: false,
      });
      const result = await win.webContents.executeJavaScript(`(() => {
        const d = document.querySelector('dialog');
        document.querySelector('#table-list').innerHTML = Array.from({length:60}, (_, i) =>
          '<article class="table-card dining-table table-occupied"><strong class="table-number">โต๊ะ '+(i+1)+'</strong><span class="table-state">ชำระแล้ว • กำลังใช้งาน</span><dl class="table-times"><dt>เปิดโต๊ะ</dt><dd>25/11 12:00</dd><dt>เหลือเวลา</dt><dd class="table-time-remaining">01:23:45</dd></dl><p class="table-zones">อาหารทะเล / เครื่องดื่ม</p><div class="table-card-actions"><button>พิมพ์ QR</button><button>ปิดโต๊ะ</button></div></article>').join('');
        document.querySelector('#table-orders').innerHTML = '<article class="table-card"><h3>โต๊ะ 60</h3><p>รายการอาหารรอดำเนินการ</p></article>'.repeat(20);
        d.showModal();
        const scroller = document.querySelector(innerWidth <= 620 ? '.tables-content' : '.tables-panel');
        scroller.scrollTop = scroller.scrollHeight;
        const orderScroller = document.querySelector(innerWidth <= 620 ? '.tables-content' : '.table-orders-panel');
        orderScroller.scrollTop = orderScroller.scrollHeight;
        const last = document.querySelector('#table-list').lastElementChild.getBoundingClientRect();
        const box = scroller.getBoundingClientRect();
        return {scroll:scroller.scrollTop, ordersScroll:orderScroller.scrollTop,
          overflowX:d.scrollWidth > d.clientWidth, cardWidth:document.querySelector('.dining-table').offsetWidth,
          lastVisible:innerWidth <= 620 || (last.bottom <= box.bottom + 1 && last.bottom > box.top),
          dialogBottom:d.getBoundingClientRect().bottom, viewport:innerHeight};
      })()`);
      assert.ok(result.scroll > 0, `tables cannot scroll: ${width}`);
      assert.ok(result.ordersScroll > 0, `orders cannot scroll: ${width}`);
      assert.ok(result.lastVisible, `last table is clipped: ${width}`);
      assert.ok(!result.overflowX, `horizontal overflow: ${width}`);
      assert.ok(result.dialogBottom <= result.viewport, `dialog outside viewport: ${width}`);
      assert.ok(result.cardWidth < 220 || width <= 400, `table too large: ${width}`);
      await win.webContents.capturePage().then(img => fs.writeFileSync(path.join(output, `${width}x${height}.png`), img.toPNG()));
      console.log(`PASS ${width}x${height}`, result);
      win.destroy();
    }
    app.exit(0);
  } catch (error) { console.error(error); app.exit(1); }
});
