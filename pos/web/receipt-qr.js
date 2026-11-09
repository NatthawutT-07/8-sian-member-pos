import { create } from './vendor/qrcode.js';

export function receiptCode(sale) {
  return sale.id ? `8SR-${sale.id}` : null;
}

export function renderReceiptQr(doc, sale) {
  if (!sale.tableId && !sale.tableNumber) return null;
  const value = receiptCode(sale);
  if (!value) return null;
  const { modules } = create(value, { errorCorrectionLevel: 'H' });
  const ns = 'http://www.w3.org/2000/svg';
  const svg = doc.createElementNS(ns, 'svg');
  const size = modules.size + 8; // Four white modules on every edge.
  // Fill the 272px receipt column using whole pixels per module. The thermal
  // renderer doubles this size, keeping every square on whole printer dots.
  const moduleSize = Math.max(1, Math.floor(264 / size));
  const pixels = String(size * moduleSize);
  svg.setAttribute('viewBox', `0 0 ${size} ${size}`);
  svg.setAttribute('width', pixels);
  svg.setAttribute('height', pixels);
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', `QR ใบเสร็จ ${sale.receiptNumber || sale.id}`);
  svg.setAttribute('shape-rendering', 'crispEdges');
  const background = doc.createElementNS(ns, 'rect');
  background.setAttribute('width', String(size));
  background.setAttribute('height', String(size));
  background.setAttribute('fill', '#fff');
  const path = doc.createElementNS(ns, 'path');
  let data = '';
  for (let y = 0; y < modules.size; y++)
    for (let x = 0; x < modules.size; x++)
      if (modules.get(y, x)) data += `M${x + 4} ${y + 4}h1v1h-1z`;
  path.setAttribute('d', data);
  path.setAttribute('fill', '#000');
  svg.append(background, path);
  const block = doc.createElement('div');
  block.className = 'receipt-qr';
  const label = doc.createElement('p');
  label.textContent = 'สแกน QR ที่ POS เพื่อเปิด / พิมพ์ใบเสร็จซ้ำ';
  block.append(svg, label);
  return block;
}
