const money = (value) =>
  (value / 100).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const date = (value) =>
  new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Bangkok',
    dateStyle: 'short',
    timeStyle: 'medium',
    hourCycle: 'h23',
  }).format(new Date(value));

export function renderShiftReport(root, report) {
  const { shift, summary, items } = report;
  const doc = root.ownerDocument;
  const text = (tag, value, cls) => {
    const el = doc.createElement(tag);
    el.textContent = value;
    if (cls) el.className = cls;
    return el;
  };
  const brand = text('div', '', 'receipt-brand');
  const logo = doc.createElement('img');
  logo.src = new URL('./images/logo.png', import.meta.url).href;
  logo.className = 'receipt-logo';
  logo.alt = '8 เซียน';
  brand.append(logo, text('h2', '8 เซียนราชาหมูกระทะ สาขาติวานนท์', 'receipt-shop'));
  root.replaceChildren(brand, text('h3', 'ใบสรุปรายได้ปิดกะ', 'receipt-title'));
  const meta = text('div', '', 'receipt-meta');
  meta.append(
    text('p', `กะวันที่: ${shift.businessDate}`),
    text('p', `รหัสกะ: ${shift.id}`),
    text('p', `เปิด: ${date(shift.openedAt)}`),
    text('p', `ผู้เปิด: ${shift.openedByName}`),
    text('p', `ปิด: ${date(shift.closedAt)}`),
    text('p', `ผู้ปิด: ${shift.closedByName}`),
  );
  root.append(meta);
  const line = (label, value, cls = '') => {
    const row = text('div', '', `receipt-line ${cls}`);
    row.append(text('span', label), text('strong', value));
    root.append(row);
  };
  line('จำนวนบิลทั้งหมด', `${summary.billCount} บิล`);
  line(`เงินสด (${summary.cashBillCount} บิล)`, money(summary.cashSatang));
  line(`เงินโอน (${summary.transferBillCount} บิล)`, money(summary.transferSatang));
  line('รายได้รวมทั้งกะ', `${money(summary.totalSatang)} บาท`, 'receipt-grand-total');
  root.append(text('h3', 'รายการขายในกะ', 'receipt-title'));
  const table = doc.createElement('table');
  table.className = 'receipt-items';
  const heading = table.createTHead().insertRow();
  for (const [label, cls] of [
    ['รายการ', 'shift-item-name'],
    ['จำนวน', 'shift-item-quantity'],
    ['ยอด', 'shift-item-amount'],
  ])
    heading.append(text('th', label, cls));
  const body = table.createTBody();
  for (const item of items) {
    const row = body.insertRow();
    const name = text('td', '', 'shift-item-name');
    name.append(
      text('span', item.name),
      text('small', `@ ${money(item.priceSatang)}`, 'shift-unit-price'),
    );
    row.append(
      name,
      text('td', String(item.quantity), 'shift-item-quantity'),
      text('td', money(item.totalSatang), 'shift-item-amount'),
    );
  }
  root.append(table);
  if (!items.length) root.append(text('p', 'ไม่มีรายการขายในกะนี้'));
  line('ยอดรายการก่อนคูปอง', money(summary.subtotalSatang));
  line('ส่วนลดคูปอง', `−${money(summary.discountSatang)}`);
  line('ยอดขายสุทธิ', money(summary.totalSatang));
  root.append(text('h3', 'ตรวจนับเงินสด', 'receipt-title'));
  line('เงินสดตั้งต้น', money(shift.openingCashSatang));
  line('ยอดขายเงินสดสุทธิ', money(summary.cashSatang));
  line('เงินสดที่ควรมี', money(shift.expectedCashSatang));
  line('เงินสดนับจริง', money(shift.countedCashSatang));
  line(
    'เงินสดเกิน / ขาด',
    `${shift.cashDifferenceSatang > 0 ? '+' : ''}${money(shift.cashDifferenceSatang)}`,
  );
  root.append(
    text(
      'p',
      'รายได้คิดจากยอดขายสุทธิ ไม่รวมเงินสดตั้งต้น\nเงินโอนไม่รวมอยู่ในเงินสดที่ควรมี',
      'receipt-loyalty',
    ),
  );
}
