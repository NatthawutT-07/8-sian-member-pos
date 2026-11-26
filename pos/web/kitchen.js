import { renderKitchenTicket } from './kitchen-ticket.js';
import { confirmAction } from './confirm-action.js';
import { createOrderAlert } from './order-alert.js';

export function setupKitchen({ api, run, notice }) {
  const $ = (id) => document.getElementById(id);
  const sound = createOrderAlert(new URL('./order-alert.wav', import.meta.url).href, (enabled, message) => {
    $('kitchen-sound').setAttribute('aria-pressed', String(enabled));
    $('kitchen-sound').textContent = enabled ? 'ปิดเสียงออเดอร์' : 'เปิดเสียงออเดอร์';
    $('kitchen-sound-status').textContent = message;
  });
  $('kitchen-sound').setAttribute('aria-pressed', String(sound.enabled));
  $('kitchen-sound').textContent = sound.enabled ? 'ปิดเสียงออเดอร์' : 'เปิดเสียงออเดอร์';
  $('kitchen-sound-status').textContent = sound.enabled ? 'กดทดสอบเสียงเพื่อให้เครื่องพร้อมแจ้งเตือน' : 'เปิดเสียงเพื่อแจ้งเตือนออเดอร์ใหม่';
  $('kitchen-sound').onclick = async () => {
    try { if (sound.enabled) sound.disable(); else await sound.enable(); }
    catch { $('kitchen-sound-status').textContent = 'เปิดเสียงไม่ได้ กรุณาลองอีกครั้งและตรวจระดับเสียงของเครื่อง'; }
  };
  $('kitchen-test-sound').onclick = async () => {
    try { await sound.test(); }
    catch { $('kitchen-sound-status').textContent = 'เล่นเสียงไม่ได้ กรุณาลองอีกครั้งและตรวจระดับเสียงของเครื่อง'; }
  };
  const el = (tag, value, cls) => {
    const node = document.createElement(tag);
    node.textContent = value;
    if (cls) node.className = cls;
    return node;
  };
  let timer,
    active = false,
    loading = false,
    working = false,
    summary = null,
    currentTicket = null;
  async function showSummary(tableId, sessionId) {
    const result = await api(`kitchen/tables/${tableId}/${sessionId}/summary`);
    if (!active) return;
    summary = { tableId, sessionId };
    const completedItems = result.items
      .map((item) => ({ ...item, quantity: item.completed ?? item.quantity }))
      .filter((item) => item.quantity > 0);
    const completedQuantity = completedItems.reduce((sum, item) => sum + item.quantity, 0);
    $('kitchen-summary-title').textContent = `อาหารที่สำเร็จแล้ว • โต๊ะ ${result.tableNumber}`;
    $('kitchen-summary-meta').textContent =
      `บิล ${result.receiptNumber || '—'} • สำเร็จรวม ${completedQuantity} หน่วย`;
    const rows = completedItems.map((item) => {
      const row = el('div', '', 'kitchen-summary-row');
      row.append(el('strong', item.name), el('span', `สำเร็จแล้ว ${item.quantity}`));
      return row;
    });
    $('kitchen-summary-items').replaceChildren(
      ...(rows.length ? rows : [el('p', 'ยังไม่มีอาหารที่ทำสำเร็จในรอบนี้')]),
    );
    if (!$('kitchen-summary-dialog').open) $('kitchen-summary-dialog').showModal();
  }
  async function printOrder(id) {
    const ticket = await api(`kitchen/orders/${id}/ticket`);
    if (window.posHardware?.printKitchenTicket) {
      const result = await window.posHardware.printKitchenTicket({ orderId: id });
      notice(result.warning || 'ส่งใบแนบอาหารเข้าเครื่องพิมพ์แล้ว กรุณาตรวจที่เครื่อง');
    } else {
      currentTicket = ticket;
      renderKitchenTicket($('kitchen-ticket-preview'), ticket);
      $('kitchen-ticket-dialog').showModal();
    }
  }
  const work = (fn) =>
    run(async () => {
      if (working) return;
      working = true;
      try {
        await fn();
      } finally {
        working = false;
      }
    });
  const cancelOrder = (order, item) => run(async () => {
    if (working) return;
    working = true;
    try {
      const message = item
        ? `ยกเลิก ${item.name} × ${item.quantity} ของโต๊ะ ${order.table.number}?`
        : `ยกเลิกทั้งใบออเดอร์ของโต๊ะ ${order.table.number}?`;
      if (!(await confirmAction(message, { title: 'ยืนยันยกเลิกอาหาร', confirmText: 'ยืนยันยกเลิก' }))) return;
      await api(`kitchen/orders/${order.id}/cancel`, {
        sessionId: order.sessionId,
        ...(item ? { menuItemId: item.menuItemId } : {}),
      });
      if (currentTicket?.id === order.id) {
        currentTicket = null;
        $('kitchen-ticket-dialog').close();
      }
      notice(item ? 'ยกเลิกรายการอาหารแล้ว' : 'ยกเลิกออเดอร์ทั้งใบแล้ว');
    } finally {
      working = false;
      await refresh();
    }
  });
  async function refresh() {
    if (!active || loading || working) return;
    loading = true;
    try {
      const [orders, tables] = await Promise.all([api('kitchen/orders'), api('kitchen/tables')]);
      if (!active) return;
      sound.observe(orders);
      const selected = $('kitchen-table').value;
      $('kitchen-table').replaceChildren(new Option('เลือกโต๊ะที่ยังมีลูกค้า', ''));
      for (const table of tables)
        $('kitchen-table').append(
          new Option(`โต๊ะ ${table.number}`, `${table.id}/${table.sessionId}`),
        );
      if (tables.some((table) => `${table.id}/${table.sessionId}` === selected))
        $('kitchen-table').value = selected;
      if (summary && !$('kitchen-summary-dialog').open) summary = null;
      if (summary) {
        if (
          !tables.some(
            (table) => table.id === summary.tableId && table.sessionId === summary.sessionId,
          )
        ) {
          summary = null;
          $('kitchen-summary-dialog').close();
          notice('โต๊ะปิดแล้ว ยอดสั่งของรอบเดิมถูกรีเซ็ต');
        } else await showSummary(summary.tableId, summary.sessionId);
      }
      if (
        currentTicket &&
        !tables.some(
          (table) =>
            table.id === currentTicket.tableId && table.sessionId === currentTicket.sessionId,
        )
      ) {
        currentTicket = null;
        $('kitchen-ticket-dialog').close();
      }
      const cards = document.createDocumentFragment();
      for (const [index, order] of orders.entries()) {
        const card = el('article', '', 'kitchen-order');
        const header = el('div', '', 'kitchen-order-heading');
        header.append(
          el('h2', `โต๊ะ ${order.table.number}`),
          el(
            'span',
            `ลำดับ ${index + 1} • ${new Date(order.createdAt).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`,
          ),
        );
        card.append(header, el('p', `ออเดอร์ ${order.id.slice(-8)}`, 'hint'));
        for (const item of order.items) {
          const row = el('div', '', 'kitchen-order-item');
          const placeholder = el('span', 'ไม่มีรูป', 'kitchen-item-image kitchen-item-placeholder');
          let imageUrl;
          try {
            const url = new URL(item.imageUrl, location.href);
            if (item.imageUrl && (url.protocol === 'https:' || url.origin === location.origin)
              && url.pathname.startsWith('/api/ordering-images/')) imageUrl = url.href;
          } catch {}
          if (imageUrl) {
            const image = document.createElement('img');
            image.className = 'kitchen-item-image';
            image.alt = item.name;
            image.width = 36;
            image.height = 36;
            image.loading = 'lazy';
            image.decoding = 'async';
            image.onerror = () => image.replaceWith(placeholder);
            image.src = imageUrl;
            row.append(image);
          } else row.append(placeholder);
          row.append(el('span', item.name), el('strong', `× ${item.quantity}`));
          const remove = el('button', 'ยกเลิก', 'kitchen-cancel-item');
          remove.setAttribute('aria-label', `ยกเลิก ${item.name} โต๊ะ ${order.table.number}`);
          remove.onclick = cancelOrder(order, item);
          row.append(remove);
          card.append(row);
        }
        const actions = el('div', '', 'kitchen-order-actions');
        const total = el('button', 'ยอดอาหารสำเร็จ');
        total.onclick = work(() => showSummary(order.tableId, order.sessionId));
        const print = el('button', 'พิมพ์ใบอาหาร');
        print.onclick = work(() => printOrder(order.id));
        const done = el('button', 'สำเร็จแล้ว', 'primary');
        // Completion owns its refresh so the card disappears as soon as the server confirms.
        done.onclick = run(async () => {
          if (working) return;
          working = true;
          done.disabled = true;
          try {
            await api(`kitchen/orders/${order.id}/complete`, {});
          } finally {
            working = false;
            done.disabled = false;
            await refresh();
          }
        });
        const cancel = el('button', 'ยกเลิกทั้งใบ', 'kitchen-cancel-order');
        cancel.onclick = cancelOrder(order);
        actions.append(total, print, cancel, done);
        card.append(actions);
        cards.append(card);
      }
      if (!orders.length)
        cards.append(el('p', 'ยังไม่มีออเดอร์รอทำ', 'kitchen-empty'));
      const board = $('kitchen-orders');
      const scrollLeft = board.scrollLeft;
      board.replaceChildren(cards);
      board.scrollLeft = scrollLeft;
      $('kitchen-status').textContent =
        `${orders.length} ออเดอร์รอทำ • เก่าไปใหม่ • อัปเดต ${new Date().toLocaleTimeString('th-TH')}`;
    } finally {
      loading = false;
    }
  }
  $('kitchen-refresh').onclick = run(refresh);
  $('kitchen-summary').onclick = work(async () => {
    const value = $('kitchen-table').value;
    if (!value) throw new Error('เลือกโต๊ะก่อนดูยอดสะสม');
    const [tableId, sessionId] = value.split('/');
    await showSummary(tableId, sessionId);
  });
  $('close-kitchen-summary').onclick = () => {
    summary = null;
    $('kitchen-summary-dialog').close();
  };
  $('close-kitchen-ticket').onclick = () => {
    currentTicket = null;
    $('kitchen-ticket-dialog').close();
  };
  $('print-kitchen-preview').onclick = work(async () => {
    if (!currentTicket) return;
    await api(`kitchen/orders/${currentTicket.id}/ticket`);
    document.body.classList.add('kitchen-print');
    try {
      window.print();
    } finally {
      document.body.classList.remove('kitchen-print');
    }
  });
  return {
    async start() {
      sound.reset();
      active = true;
      clearInterval(timer);
      timer = setInterval(() => run(refresh)(), 5000);
      await refresh();
    },
    stop() {
      sound.reset();
      active = false;
      clearInterval(timer);
      summary = null;
      currentTicket = null;
      $('kitchen-orders').replaceChildren();
    },
  };
}
