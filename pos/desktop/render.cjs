const path = require('node:path');
const { WIDTH, barcode, raster } = require('./escpos.cjs');

function testSale() {
  return {
    id: 'test',
    receiptNumber: '2611010000001',
    cashierDisplayName: 'ทดสอบภาษาไทย',
    items: [
      { name: 'บุฟเฟต์หมูกระทะ • ผู้ใหญ่', priceSatang: 29900, quantity: 2 },
      { name: 'น้ำดื่ม', priceSatang: 2000, quantity: 1 },
    ],
    totalSatang: 61800,
    method: 'CASH',
    receivedSatang: 70000,
    changeSatang: 8200,
    createdAt: new Date().toISOString(),
  };
}

async function renderPrint(BrowserWindow, input, { previewPath } = {}) {
  const data = { ...input };
  if (data.kind === 'test') data.sale = testSale();
  if (!['shift', 'kitchen'].includes(data.kind))
    data.code = barcode(data.kind === 'barcode' ? data.product.barcode : data.sale.receiptNumber);
  const win = new BrowserWindow({
    width: WIDTH,
    height: 1000,
    show: false,
    useContentSize: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      backgroundThrottling: false,
    },
  });
  try {
    win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    win.webContents.setZoomFactor(1);
    await win.loadFile(path.join(__dirname, 'print.html'));
    const height = await win.webContents.executeJavaScript(
      `window.preparePrint(${JSON.stringify(data)})`,
    );
    if (!Number.isInteger(height) || height < 1 || height > 24000)
      throw new Error('ใบเสร็จยาวเกินกำหนด กรุณาแบ่งรายการ');
    const bands = [];
    // Capture in view-sized strips so long receipts do not depend on maximum window dimensions.
    for (let top = 0; top < height; top += 800) {
      const rows = Math.min(800, height - top);
      await win.webContents.executeJavaScript(
        `document.getElementById('paper').style.transform = 'translateY(-${top}px)'`,
      );
      await new Promise((resolve) => setTimeout(resolve, 50));
      const image = (
        await win.webContents.capturePage(
          { x: 0, y: 0, width: WIDTH, height: rows },
          { stayHidden: true },
        )
      ).resize({ width: WIDTH, height: rows });
      bands.push(image.toBitmap());
    }
    const pixels = Buffer.concat(bands);
    if (previewPath) {
      const { nativeImage } = require('electron');
      require('node:fs').writeFileSync(
        previewPath,
        nativeImage.createFromBitmap(pixels, { width: WIDTH, height }).toPNG(),
      );
    }
    return raster(pixels, WIDTH, height);
  } finally {
    win.destroy();
  }
}
module.exports = { renderPrint, testSale };
