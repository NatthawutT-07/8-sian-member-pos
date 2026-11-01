import { renderReceipt } from '../web/receipt.js';
import { renderShiftReport } from '../web/shift-receipt.js';
import { renderKitchenTicket } from '../web/kitchen-ticket.js';

const root = document.getElementById('receipt');
const canvas = document.getElementById('barcode');
window.preparePrint = async ({ kind, sale, product, code, report, ticket }) => {
  root.replaceChildren();
  root.classList.remove('kitchen-ticket');
  canvas.hidden = ['shift', 'kitchen'].includes(kind);
  if (['shift', 'kitchen'].includes(kind)) {
    if (kind === 'kitchen') renderKitchenTicket(root, ticket);
    else renderShiftReport(root, report);
    await Promise.all([...root.querySelectorAll('img')].map((image) => image.decode()));
    await document.fonts.ready;
    return Math.ceil(document.getElementById('paper').getBoundingClientRect().height);
  } else if (kind === 'barcode') {
    const name = document.createElement('h2');
    name.className = 'label-name';
    name.textContent = product.name;
    const price = document.createElement('p');
    price.className = 'label-price';
    price.textContent = `${(product.priceSatang / 100).toFixed(2)} บาท`;
    root.append(name, price);
  } else {
    renderReceipt(root, sale);
    if (kind === 'test') {
      const note = document.createElement('p');
      note.className = 'test-note';
      note.textContent = 'ใบทดสอบ • ไม่ใช่รายการขาย\nกระดาษ 78–80 มม. / พื้นที่พิมพ์ 72 มม.';
      root.append(note);
    }
  }
  const unit = code.moduleWidth;
  canvas.width = (code.bits.length + 2 * code.quietModules) * unit;
  canvas.height = 120;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = 'white';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = 'black';
  for (let i = 0; i < code.bits.length; i++)
    if (code.bits[i] === '1') ctx.fillRect((i + code.quietModules) * unit, 0, unit, 80);
  ctx.font = '22px monospace';
  ctx.textAlign = 'center';
  ctx.fillText(code.value, canvas.width / 2, 110);
  await Promise.all([...root.querySelectorAll('img')].map((image) => image.decode()));
  await document.fonts.ready;
  return Math.ceil(document.getElementById('paper').getBoundingClientRect().height);
};
