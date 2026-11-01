import { renderReceipt, formatMemberPhone } from './receipt.js';
import { setupHardwareUI, outputPaidSale } from './hardware-ui.js';
import { renderShiftReport } from './shift-receipt.js';

const $ = (id) => document.getElementById(id);
const money = (n) =>
  new Intl.NumberFormat('th-TH', { style: 'currency', currency: 'THB' }).format(n / 100);
const text = (tag, value, cls) => {
  const el = document.createElement(tag);
  el.textContent = value;
  if (cls) el.className = cls;
  return el;
};
let products = [],
  cart = [],
  memberSelection = null,
  memberCandidate = null,
  scanning = false,
  busy = false,
  shift = null,
  activeUserId = null,
  paymentMethod = 'CASH',
  cashReceived = '',
  productGroup = 'MAIN',
  couponBusy = false,
  couponTimer = null,
  draft = { key: crypto.randomUUID(), coupon: null },
  pending = null,
  currentReceipt = null,
  currentShiftReport = null;
setupHardwareUI({ products: () => products });
try {
  pending = JSON.parse(localStorage.getItem('pos-pending') || 'null');
} catch {
  localStorage.removeItem('pos-pending');
}
function notice(message = '') {
  $('notice').textContent = message;
  for (const el of document.querySelectorAll('[data-dialog-notice]')) el.textContent = message;
}
async function api(path, body, method = 'POST') {
  const response = await fetch(`/api/pos/${path}`, {
    method: body === undefined ? 'GET' : method,
    credentials: 'same-origin',
    headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await response.json();
  if (!response.ok) {
    if (response.status === 401) showLogin();
    throw Object.assign(new Error(data.message || 'ทำรายการไม่สำเร็จ'), {
      status: response.status,
    });
  }
  return data;
}
const run = (fn) => async (event) => {
  event?.preventDefault();
  try {
    notice();
    await fn(event);
  } catch (error) {
    notice(error.message || 'เชื่อมต่อไม่ได้ กรุณาลองใหม่');
  }
};
function showLogin() {
  document.body.classList.remove('pos-active');
  for (const dialog of document.querySelectorAll('dialog[open]')) dialog.close();
  $('login').hidden = false;
  $('register').hidden = true;
  $('operator').textContent = '';
  $('shift-panel').hidden = true;
  for (const id of ['daily-report', 'history', 'shift-reports', 'hardware', 'logout'])
    $(id).hidden = true;
}
async function start(user) {
  products = await api('products');
  $('operator').textContent = `${user.displayName || user.username} • USER`;
  activeUserId = user.id;
  try {
    draft = JSON.parse(localStorage.getItem(`pos-draft:${activeUserId}`)) || {
      key: crypto.randomUUID(),
      coupon: null,
    };
  } catch {
    draft = { key: crypto.randomUUID(), coupon: null };
  }
  if (draft.coupon && !pending) {
    const member = draft.coupon.member;
    if (member?.phone) memberSelection = { memberPhone: member.phone };
    showMember(member);
    scheduleCouponExpiry();
  }
  if (pending) {
    paymentMethod = pending.method;
    $('received').value = (pending.receivedSatang / 100).toFixed(2);
  }
  $('login').hidden = true;
  $('register').hidden = false;
  document.body.classList.add('pos-active');
  $('shift-panel').hidden = false;
  for (const id of ['daily-report', 'history', 'shift-reports', 'hardware', 'logout'])
    $(id).hidden = false;
  await refreshShift();
  renderProducts();
  renderCart();
  $('scan').focus();
  if (pending)
    notice('มีบิลที่ยังไม่ได้รับผลยืนยัน กดยืนยันอีกครั้งเพื่อตรวจและบันทึกบิลเดิม ห้ามรับเงินซ้ำ');
}
function renderProducts() {
  $('products').replaceChildren();
  for (const product of products.filter((p) => p.active && (p.group || 'MAIN') === productGroup)) {
    const button = text('button', '', 'product');
    if (product.group === 'DISCOUNT') button.classList.add('category-discount');
    if (product.group === 'PROMOTION') button.classList.add('category-promotion');
    button.append(text('b', product.name), text('span', money(product.priceSatang)));
    button.onclick = () => add(product);
    $('products').append(button);
  }
  if (!$('products').children.length)
    $('products').append(text('p', 'ยังไม่มีรายการในกลุ่มนี้ • ตั้งค่าได้ในเว็บแอดมิน'));
}
function editable() {
  if (couponBusy) {
    notice('กำลังตรวจสอบคูปอง กรุณารอสักครู่');
    return false;
  }
  if (busy || pending) {
    notice('กรุณายืนยันผลบิลค้างก่อนเปลี่ยนรายการ เพื่อป้องกันการรับเงินซ้ำ');
    return false;
  }
  return true;
}
function add(product) {
  if (!editable()) return;
  const line = cart.find((i) => i.product.id === product.id);
  if (product.group === 'DISCOUNT' && subtotal() + product.priceSatang < 0) {
    notice('ส่วนลดมากกว่ายอดสินค้า กรุณาเพิ่มสินค้าก่อน');
    return;
  }
  if (product.group === 'DISCOUNT' && draft.coupon) {
    notice('นำคูปองออกก่อนเพิ่มรายการส่วนลด');
    return;
  }
  if (line) {
    if (product.group === 'DISCOUNT') {
      notice('ส่วนลดนี้เลือกได้ครั้งเดียวต่อบิล');
      return;
    }
    if (line.quantity >= 999) return;
    line.quantity++;
  } else {
    if (cart.length >= 100) return;
    cart.push({ product, quantity: 1 });
  }
  renderCart();
}
function subtotal() {
  return cart.reduce((sum, i) => sum + i.product.priceSatang * i.quantity, 0);
}
function couponIssue() {
  if (!draft.coupon) return '';
  if (new Date(draft.coupon.expiresAt).getTime() <= Date.now())
    return 'การจองคูปองหมดอายุ กรุณาสแกนใหม่';
  if (cart.some((i) => i.product.group === 'DISCOUNT')) return 'คูปองใช้ร่วมกับรายการส่วนลดไม่ได้';
  if (subtotal() < draft.coupon.minSubtotalSatang)
    return `ยอดขั้นต่ำสำหรับคูปอง ${money(draft.coupon.minSubtotalSatang)}`;
  return '';
}
function couponDiscount() {
  return draft.coupon && !couponIssue()
    ? Math.min(draft.coupon.discountSatang, Math.max(0, subtotal()))
    : 0;
}
function total() {
  return subtotal() - couponDiscount();
}
function renderCart() {
  const scrollTop = $('cart').scrollTop;
  $('cart').replaceChildren();
  cart.forEach((item, index) => {
    const row = text('div', '', 'cart-row'),
      desc = text('div', item.product.name, 'description');
    desc.append(text('small', `${money(item.product.priceSatang)} × ${item.quantity}`));
    row.append(desc);
    for (const [label, delta] of [
      ['−', -1],
      ['+', 1],
    ]) {
      const button = text('button', label);
      button.disabled = delta > 0 && item.product.group === 'DISCOUNT';
      button.onclick = () => {
        if (!editable()) return;
        item.quantity += delta;
        if (item.quantity <= 0) cart.splice(index, 1);
        item.quantity = Math.min(999, item.quantity);
        renderCart();
      };
      row.append(button);
    }
    row.append(text('b', money(item.product.priceSatang * item.quantity)));
    $('cart').append(row);
  });
  if (draft.coupon) {
    const row = text('div', '', 'cart-row coupon-row');
    row.append(
      text('div', `คูปอง: ${draft.coupon.title}`, 'description'),
      text('b', `−${money(couponDiscount())}`),
    );
    $('cart').append(row);
  }
  $('coupon-summary').hidden = !draft.coupon;
  $('coupon-status').textContent = draft.coupon
    ? couponIssue() || `${draft.coupon.title} • ลด ${money(couponDiscount())}`
    : '';
  $('coupon-status').classList.toggle('invalid', !!couponIssue());
  if (!cart.length) $('cart').append(text('p', pending ? '' : ''));
  if (subtotal() < 0)
    $('cart').append(
      text('p', 'ส่วนลดเกินยอดสินค้า กรุณานำส่วนลดออกหรือเพิ่มสินค้า', 'cart-error'),
    );
  const displayedTotal = pending ? pending.expectedTotalSatang : total();
  $('total').textContent = money(displayedTotal);
  $('cart').scrollTop = scrollTop;
  if (paymentMethod === 'TRANSFER') $('received').value = (displayedTotal / 100).toFixed(2);
  $('cash-entry').hidden = paymentMethod !== 'CASH';
  $('transfer-note').hidden = paymentMethod !== 'TRANSFER';
  $('received').disabled = busy || !!pending;
  for (const button of document.querySelectorAll('[data-payment-method]')) {
    button.setAttribute('aria-pressed', String(button.dataset.paymentMethod === paymentMethod));
    button.disabled = busy || !!pending;
  }
  $('change').textContent =
    `เงินทอน ${money(Math.max(0, Math.round(Number($('received').value) * 100) - displayedTotal))}`;
  $('pay').disabled =
    busy ||
    couponBusy ||
    (!pending && (!!couponIssue() || total() < 0)) ||
    (!cart.length && !pending) ||
    (!shift && !pending);
  $('pay').textContent = pending ? 'ตรวจผล / ยืนยันบิลเดิมอีกครั้ง' : 'ยืนยันรับเงินและปิดบิล';
}
$('login-form').onsubmit = run(async (event) => {
  const form = new FormData(event.target);
  const user = await api('login', Object.fromEntries(form));
  event.target.reset();
  await start(user);
});
$('logout').onclick = run(async () => {
  if (busy) return;
  if (pending && localStorage.getItem('pos-pending-user') === activeUserId && !editable()) return;
  if (couponBusy) return;
  await releaseCoupon();
  await api('logout', {});
  cart = [];
  clearMember();
  paymentMethod = 'CASH';
  cashReceived = '';
  $('received').value = '';
  showLogin();
});
for (const button of document.querySelectorAll('[data-group]'))
  button.onclick = () => {
    productGroup = button.dataset.group;
    for (const item of document.querySelectorAll('[data-group]'))
      item.setAttribute('aria-pressed', String(item === button));
    renderProducts();
  };
$('scan-form').onsubmit = run(async () => {
  if (scanning || !editable()) return;
  const code = $('scan').value.trim();
  if (!code) return;
  if (/^88\d{30}$/.test(code)) {
    $('scan').value = '';
    await applyCoupon(code);
    return;
  }
  scanning = true;
  const button = $('scan-form').querySelector('button');
  button.disabled = true;
  try {
    const result = await api('scan', { code });
    if (!editable()) return;
    $('scan').value = '';
    if (result.type === 'PRODUCT') add(result.product);
    else {
      memberCandidate = result;
      $('member-candidate').textContent =
        `สมาชิก #${result.member.memberNumber} • ${result.member.firstName}${result.member.phone ? `\nเบอร์สมาชิก: ${formatMemberPhone(result.member.phone)}` : ''}`;
      $('member-dialog').showModal();
    }
  } finally {
    scanning = false;
    button.disabled = false;
    if (!$('member-dialog').open) {
      $('scan').focus();
      if ($('scan').value) $('scan').select();
    }
  }
});
$('confirm-member').onclick = () => {
  if (!memberCandidate || !editable()) return;
  if (draft.coupon) {
    notice('นำคูปองออกก่อนเปลี่ยนสมาชิก');
    return;
  }
  memberSelection = memberCandidate.selection;
  showMember(memberCandidate.member);
  memberCandidate = null;
  $('member-dialog').close();
  $('scan').focus();
  notice('ผูกสมาชิกกับบิลแล้ว จะสะสมครั้งเมื่อปิดบิลสำเร็จ');
};
function showMember(member) {
  if (!member) return;
  $('member').textContent = `สมาชิก #${member.memberNumber} • ${member.firstName}`;
  $('member-phone').textContent = member.phone
    ? `เบอร์สมาชิก: ${formatMemberPhone(member.phone)}`
    : '';
  $('member-phone').hidden = !member.phone;
  $('remove-member').hidden = false;
}
$('cancel-member').onclick = () => {
  memberCandidate = null;
  $('member-dialog').close();
  $('scan').focus();
};
$('member-dialog').addEventListener('cancel', () => {
  memberCandidate = null;
});
function clearMember() {
  memberSelection = null;
  memberCandidate = null;
  $('member').textContent = 'ลูกค้าทั่วไป';
  $('member-phone').textContent = '';
  $('member-phone').hidden = true;
  $('remove-member').hidden = true;
}
$('remove-member').onclick = () => {
  if (draft.coupon) {
    notice('นำคูปองออกก่อนเปลี่ยนสมาชิก');
    return;
  }
  if (editable()) clearMember();
};
$('clear').onclick = run(async () => {
  if (!editable()) return;
  await releaseCoupon();
  cart = [];
  clearMember();
  $('received').value = '';
  cashReceived = '';
  renderCart();
});
function saveDraft() {
  localStorage.setItem(`pos-draft:${activeUserId}`, JSON.stringify(draft));
}
function scheduleCouponExpiry() {
  clearTimeout(couponTimer);
  if (draft.coupon)
    couponTimer = setTimeout(
      renderCart,
      Math.max(0, new Date(draft.coupon.expiresAt).getTime() - Date.now() + 50),
    );
}
async function applyCoupon(code) {
  if (!editable()) return;
  if (!/^88\d{30}$/.test(code))
    throw new Error('กรอกรหัสคูปอง 32 หลักจากหน้าสมาชิก หรือยิงบาร์โค้ดคูปอง');
  if (!shift || !cart.length) throw new Error('เปิดร้านและเพิ่มสินค้าก่อนใช้คูปอง');
  saveDraft();
  couponBusy = true;
  renderCart();
  try {
    const result = await api('coupons/reserve', {
      billKey: draft.key,
      code,
      items: cart.map((i) => ({ productId: i.product.id, quantity: i.quantity })),
      ...(memberSelection || {}),
    });
    draft.coupon = result;
    saveDraft();
    scheduleCouponExpiry();
    if (!memberSelection && result.member?.phone)
      memberSelection = { memberPhone: result.member.phone };
    showMember(result.member);
    notice(`เพิ่มคูปอง ${result.title} แล้ว`);
  } finally {
    couponBusy = false;
    renderCart();
  }
}
async function releaseCoupon() {
  if (!draft.coupon) return;
  await api('coupons/release', { billKey: draft.key, reservationId: draft.coupon.reservationId });
  draft.coupon = null;
  saveDraft();
  clearTimeout(couponTimer);
  renderCart();
}
$('coupon-form').onsubmit = run(async () => {
  const code = $('coupon-code').value.trim();
  $('coupon-code').value = '';
  await applyCoupon(code);
  $('coupon-code').focus();
});
$('remove-coupon').onclick = run(async () => {
  if (editable()) await releaseCoupon();
});
$('received').oninput = renderCart;
for (const button of document.querySelectorAll('[data-payment-method]')) {
  button.onclick = () => {
    if (!editable()) return;
    const nextMethod = button.dataset.paymentMethod;
    if (nextMethod === paymentMethod) return;
    if (paymentMethod === 'CASH') cashReceived = $('received').value;
    paymentMethod = nextMethod;
    if (paymentMethod === 'CASH') $('received').value = cashReceived;
    renderCart();
  };
}
$('pay').onclick = run(async () => {
  if (busy) return;
  if (
    pending &&
    localStorage.getItem('pos-pending-user') &&
    localStorage.getItem('pos-pending-user') !== activeUserId
  )
    throw new Error('มีบิลค้างของพนักงานอีกบัญชี กรุณาออกแล้วเข้าบัญชีที่ส่งบิลเดิม');
  if (!pending) {
    if (!shift) throw new Error('กรุณาเปิดร้านก่อนคิดเงิน');
    if (!cart.length) return;
    const receivedSatang = Math.round(Number($('received').value) * 100);
    if (!Number.isSafeInteger(receivedSatang) || receivedSatang < total())
      throw new Error('กรุณากรอกยอดรับเงินให้ครบ');
    if (couponIssue() || total() < 0) throw new Error(couponIssue() || 'ส่วนลดเกินยอดสินค้า');
    pending = {
      key: draft.key,
      shiftId: shift.id,
      items: cart.map((i) => ({ productId: i.product.id, quantity: i.quantity })),
      method: paymentMethod,
      receivedSatang,
      expectedTotalSatang: total(),
      ...(memberSelection || {}),
      ...(draft.coupon ? { couponReservationId: draft.coupon.reservationId } : {}),
    };
    // Store before sending: a network failure must reuse the same key and payload.
    try {
      localStorage.setItem('pos-pending-user', activeUserId);
      localStorage.setItem('pos-pending', JSON.stringify(pending));
    } catch {
      pending = null;
      throw new Error('บันทึกข้อมูลบิลค้างไม่ได้ กรุณาเปิดพื้นที่จัดเก็บในแอป');
    }
  }
  busy = true;
  renderCart();
  try {
    const sale = await api('checkout', pending);
    pending = null;
    localStorage.removeItem('pos-pending');
    localStorage.removeItem('pos-pending-user');
    draft = { key: crypto.randomUUID(), coupon: null };
    saveDraft();
    clearTimeout(couponTimer);
    cart = [];
    clearMember();
    $('received').value = '';
    cashReceived = '';
    receipt(sale);
    $('receipt-notice').textContent = window.posHardware
      ? 'บันทึกชำระแล้ว กำลังส่งคำสั่งอุปกรณ์…'
      : '';
    $('print').disabled = true;
    try {
      $('receipt-notice').textContent = await outputPaidSale(sale);
    } finally {
      $('print').disabled = false;
    }
    await refreshShift();
  } catch (error) {
    // Validation rejects have no payment committed. Network and conflict errors retain the key.
    if (error.status === 400) {
      pending = null;
      localStorage.removeItem('pos-pending');
      localStorage.removeItem('pos-pending-user');
    }
    notice(error.message);
    throw error;
  } finally {
    busy = false;
    renderCart();
  }
});
function receipt(sale) {
  currentReceipt = sale;
  currentShiftReport = null;
  $('print').textContent = 'พิมพ์ใบเสร็จ';
  $('receipt-notice').textContent = '';
  renderReceipt($('receipt'), sale);
  if (!$('receipt-dialog').open) $('receipt-dialog').showModal();
}
$('print').onclick = run(async () => {
  if ($('print').disabled) return;
  if (window.posHardware) {
    if (!currentReceipt && !currentShiftReport) return;
    $('print').disabled = true;
    $('receipt-notice').textContent = 'กำลังพิมพ์ใบเสร็จ…';
    try {
      const result = currentShiftReport
        ? await window.posHardware.printShiftReport({ shiftId: currentShiftReport.shift.id })
        : await window.posHardware.printReceipt({ saleId: currentReceipt.id });
      $('receipt-notice').textContent =
        result.warning || 'เครื่องรับข้อมูลแล้ว กรุณาตรวจใบเสร็จ • การพิมพ์ซ้ำไม่เปิดลิ้นชัก';
    } catch (error) {
      $('receipt-notice').textContent = error.message;
    } finally {
      $('print').disabled = false;
    }
    return;
  }
  const logo = $('receipt').querySelector('img');
  if (logo) {
    try {
      await logo.decode();
    } catch {
      throw new Error('โหลดโลโก้ไม่สำเร็จ กรุณาลองพิมพ์อีกครั้ง');
    }
  }
  await document.fonts.ready;
  window.print();
});
$('close-receipt').onclick = () => {
  $('receipt-dialog').close();
  $('scan').focus();
};
$('history').onclick = run(async () => {
  $('history-title').textContent = 'บิลล่าสุด 50 รายการ';
  const sales = await api('sales');
  $('sales').replaceChildren();
  for (const sale of sales) {
    const button = text(
      'button',
      `${new Date(sale.createdAt).toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' })} • ${money(sale.totalSatang)} • ${sale.receiptNumber || sale.id}`,
    );
    button.onclick = () => {
      $('history-dialog').close();
      receipt(sale);
    };
    $('sales').append(button);
  }
  $('history-dialog').showModal();
});
$('close-history').onclick = () => $('history-dialog').close();
async function showClosedShiftReport(id, automatic = false) {
  const report = await api(`shifts/${encodeURIComponent(id)}/report`);
  currentReceipt = null;
  currentShiftReport = report;
  renderShiftReport($('receipt'), report);
  $('print').textContent = 'พิมพ์สรุปปิดกะ';
  $('receipt-notice').textContent = '';
  if (!$('receipt-dialog').open) $('receipt-dialog').showModal();
  if (!automatic || !window.posHardware) return;
  $('print').disabled = true;
  $('receipt-notice').textContent = 'ปิดกะแล้ว กำลังพิมพ์สรุป…';
  try {
    const result = await window.posHardware.printShiftReport({ shiftId: id, automatic: true });
    $('receipt-notice').textContent =
      result.warning ||
      (result.skipped
        ? 'ปิดกะแล้ว หากยังไม่มีใบสรุป ให้เลือกเครื่องพิมพ์แล้วกดพิมพ์สรุปปิดกะ'
        : 'ส่งใบสรุปปิดกะแล้ว กรุณาตรวจที่เครื่องพิมพ์');
  } catch (error) {
    $('receipt-notice').textContent =
      `ปิดกะเรียบร้อยแล้ว แต่พิมพ์ไม่สำเร็จ: ${error.message} • พิมพ์ซ้ำจากสรุปกะได้`;
  } finally {
    $('print').disabled = false;
  }
}
$('shift-reports').onclick = run(async () => {
  const rows = await api('shifts/closed');
  $('history-title').textContent = 'สรุปกะที่ปิดแล้ว';
  $('sales').replaceChildren();
  if (!rows.length) $('sales').append(text('p', 'ยังไม่มีกะที่ปิดแล้ว'));
  for (const row of rows) {
    const button = text(
      'button',
      `กะ ${row.businessDate} • ปิด ${new Date(row.closedAt).toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' })}`,
    );
    button.onclick = run(async () => {
      $('history-dialog').close();
      await showClosedShiftReport(row.id);
    });
    $('sales').append(button);
  }
  $('history-dialog').showModal();
});
async function refreshShift() {
  const state = await api('shift');
  shift = state.shift;
  $('shift-status').textContent = shift
    ? `เปิดร้านแล้ว • รอบวันที่ ${shift.businessDate}`
    : 'ร้านปิดอยู่ • เปิดร้านก่อนเริ่มรับเงิน';
  $('shift-summary').textContent = shift
    ? `เงินตั้งต้น ${money(shift.openingCashSatang)} | ${state.summary.billCount} บิล | ยอดขาย ${money(state.summary.totalSatang)} | เงินสดที่ควรมี ${money(shift.openingCashSatang + state.summary.cashSatang)}`
    : '';
  $('open-store').hidden = !!shift;
  $('close-store').hidden = !shift;
  renderCart();
  return state;
}
let closingShiftId = null;
$('open-store').onclick = () => {
  if (editable()) $('open-dialog').showModal();
};
$('cancel-open').onclick = () => $('open-dialog').close();
$('open-form').onsubmit = run(async (event) => {
  const button = event.target.querySelector('button');
  button.disabled = true;
  try {
    const data = new FormData(event.target);
    const openingCashSatang = Math.round(Number(data.get('openingCash')) * 100);
    let request = JSON.parse(localStorage.getItem('pos-open-request') || 'null');
    if (
      request &&
      (request.openingCashSatang !== openingCashSatang || request.userId !== activeUserId)
    )
      throw new Error('มีคำขอเปิดร้านค้าง กรุณาใช้บัญชีและยอดเงินตั้งต้นเดิม');
    if (!request) {
      request = { key: crypto.randomUUID(), openingCashSatang, userId: activeUserId };
      localStorage.setItem('pos-open-request', JSON.stringify(request));
    }
    await api('shift/open', { key: request.key, openingCashSatang: request.openingCashSatang });
    localStorage.removeItem('pos-open-request');
    $('open-dialog').close();
    event.target.reset();
    await refreshShift();
    notice('เปิดร้านเรียบร้อย เริ่มคิดเงินได้');
  } finally {
    button.disabled = false;
  }
});
$('close-store').onclick = run(async () => {
  if (!editable()) return;
  if (cart.length) throw new Error('กรุณาปิดบิลปัจจุบันหรือล้างบิลก่อนปิดร้าน');
  await releaseCoupon();
  const state = await refreshShift();
  if (!state.shift) return;
  closingShiftId = state.shift.id;
  $('closing-summary').textContent =
    `${state.summary.billCount} บิล • เงินสดขาย ${money(state.summary.cashSatang)} • โอน ${money(state.summary.transferSatang)} • เงินสดที่ควรมี ${money(state.shift.openingCashSatang + state.summary.cashSatang)}`;
  $('close-dialog').showModal();
});
$('cancel-close').onclick = () => $('close-dialog').close();
$('close-form').onsubmit = run(async (event) => {
  const button = event.target.querySelector('button');
  button.disabled = true;
  try {
    const data = new FormData(event.target);
    const result = await api('shift/close', {
      shiftId: closingShiftId,
      countedCashSatang: Math.round(Number(data.get('countedCash')) * 100),
    });
    $('close-dialog').close();
    event.target.reset();
    await refreshShift();
    notice(
      `ปิดร้านแล้ว • ยอดขาย ${money(result.summary.totalSatang)} • เงินสดขาด/เกิน ${money(result.shift.cashDifferenceSatang)}`,
    );
    try {
      await showClosedShiftReport(result.shift.id, true);
    } catch (error) {
      notice(
        `ปิดกะเรียบร้อยแล้ว แต่โหลดใบสรุปไม่ได้: ${error.message} • เปิดจากเมนูสรุปกะเพื่อพิมพ์ซ้ำได้`,
      );
    }
  } finally {
    button.disabled = false;
  }
});
async function report() {
  const result = await api(`reports/daily?date=${encodeURIComponent($('report-date').value)}`);
  $('report-content').replaceChildren(
    text('p', `จำนวนบิล ${result.summary.billCount}`),
    text('p', `ยอดขายเงินสด ${money(result.summary.cashSatang)}`),
    text('p', `ยอดโอน ${money(result.summary.transferSatang)}`),
    text('h3', `รายรับรวม ${money(result.summary.totalSatang)}`),
    text('p', 'ยอดขายนับตามเวลาชำระ 00:00–24:00 เวลาไทย ไม่รวมเงินสดตั้งต้น'),
  );
  for (const row of result.shifts)
    $('report-content').append(
      text(
        'p',
        row.closedAt
          ? `รอบ ${row.id.slice(0, 8)} ปิดแล้ว • เงินสดที่ควรมี ${money(row.expectedCashSatang)} • นับจริง ${money(row.countedCashSatang)} • ขาด/เกิน ${money(row.cashDifferenceSatang)}`
          : `รอบ ${row.id.slice(0, 8)} ยังเปิดอยู่`,
      ),
    );
}
$('daily-report').onclick = run(async () => {
  $('report-date').value = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Bangkok',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
  await report();
  $('report-dialog').showModal();
});
$('report-form').onsubmit = run(report);
$('close-report').onclick = () => $('report-dialog').close();
for (const id of ['open-dialog', 'close-dialog', 'report-dialog', 'member-dialog']) {
  const message = text('p', '', 'dialog-notice');
  message.setAttribute('data-dialog-notice', '');
  message.setAttribute('role', 'status');
  $(id).prepend(message);
}
showLogin();
run(async () => start(await api('me')))();
