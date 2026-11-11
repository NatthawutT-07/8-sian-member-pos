import { renderQrCode } from './receipt-qr.js';

export function renderTableQr(root, qr) {
  const doc = root.ownerDocument;
  if (
    !qr.url ||
    !qr.qrExpiresAt ||
    !Number.isFinite(new Date(qr.qrExpiresAt).getTime()) ||
    new Date(qr.qrExpiresAt).getTime() <= Date.now()
  )
    throw new Error('QR นี้หมดอายุหรือถูกยกเลิกแล้ว');
  const title = doc.createElement('h2');
  title.textContent = `สั่งอาหาร • โต๊ะ ${qr.tableNumber}`;
  const block = doc.createElement('div');
  block.className = 'receipt-qr';
  block.append(renderQrCode(doc, qr.url));
  const expiry = doc.createElement('p');
  expiry.textContent = `ใช้ได้ถึง ${new Date(qr.qrExpiresAt).toLocaleString('th-TH')}`;
  const hint = doc.createElement('p');
  hint.textContent = 'QR สำหรับรอบนี้เท่านั้น เมื่อหมดอายุหรือปิดโต๊ะจะใช้ไม่ได้';
  root.replaceChildren(title, block, expiry, hint);
}
