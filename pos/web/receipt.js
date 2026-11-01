const money = (n) =>
  (n / 100).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const formatMemberPhone = (value) =>
  /^\d{10}$/.test(value || '') ? value.replace(/^(\d{3})(\d{3})(\d{4})$/, '$1-$2-$3') : value || '';

export function renderReceipt(root, sale) {
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
  logo.alt = 'โลโก้ 8 เซียนราชาหมูกระทะ';
  logo.width = 100;
  logo.height = 100;
  logo.className = 'receipt-logo';
  const title = text('h2', '8 เซียนราชาหมูกระทะ สาขาติวานนท์', 'receipt-shop');
  brand.append(
    logo,
    title,
    text('p', '8/37 ถนนติวานนท์ ปากเกร็ด นนทบุรี 11120', 'receipt-address'),
    text('p', 'โทร 0923363626', 'receipt-phone'),
  );
  root.replaceChildren(brand, text('h3', 'ใบเสร็จรับเงิน', 'receipt-title'));
  const meta = text('div', '', 'receipt-meta');
  meta.append(
    text('p', `พนักงาน: ${sale.cashierDisplayName || 'ไม่ระบุ (บิลเก่า)'}`),
    text('p', `เลขที่บิล: ${sale.receiptNumber || sale.id}`),
  );
  if (sale.memberPhone)
    meta.append(
      text('p', `เบอร์สมาชิก: ${formatMemberPhone(sale.memberPhone)}`, 'receipt-member-phone'),
    );
  root.append(meta);
  const table = doc.createElement('table');
  table.className = 'receipt-items';
  const head = table.createTHead().insertRow();
  for (const [label, cls] of [
    ['รายการ', 'receipt-item-name'],
    ['ราคา', 'receipt-price'],
    ['จำนวน', 'receipt-quantity'],
    ['รวม', 'receipt-amount'],
  ])
    head.append(text('th', label, cls));
  const body = table.createTBody();
  for (const item of sale.items) {
    const row = body.insertRow();
    const name = text('td', item.name, 'receipt-item-name');
    row.append(
      name,
      text('td', money(item.priceSatang), 'receipt-price'),
      text('td', String(item.quantity), 'receipt-quantity'),
      text('td', money(item.priceSatang * item.quantity), 'receipt-amount'),
    );
  }
  root.append(table);
  function line(label, value, cls = '') {
    const el = text('div', '', `receipt-line ${cls}`);
    el.append(text('span', label), text('strong', value));
    root.append(el);
  }
  if (sale.discountSatang > 0) {
    line('ยอดก่อนส่วนลด', money(sale.subtotalSatang));
    line(`คูปอง: ${sale.couponTitle || 'ส่วนลด'}`, `−${money(sale.discountSatang)}`);
  }
  line('รวมทั้งสิ้น', `${money(sale.totalSatang)} บาท`, 'receipt-grand-total');
  line('การชำระ', sale.method === 'CASH' ? 'เงินสด' : 'โอนเงิน');
  if (sale.method === 'CASH') {
    line('รับเงิน', money(sale.receivedSatang));
    line('เงินทอน', money(sale.changeSatang));
  } else line('ชำระแล้ว', money(sale.totalSatang));
  if (sale.memberId) root.append(text('p', 'บันทึกสะสมการมาทาน 1 ครั้งแล้ว', 'receipt-loyalty'));
  const footer = text('div', '', 'receipt-footer');
  footer.append(text('p', 'ขอบพระคุณที่มาอุดหนุน', 'receipt-thanks'));
  const date = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Bangkok',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  })
    .format(new Date(sale.createdAt))
    .replace(', ', ' เวลา ');
  const time = text('time', `วันที่ ${date}`, 'receipt-time');
  time.dateTime = new Date(sale.createdAt).toISOString();
  footer.append(time);
  root.append(footer);
}
