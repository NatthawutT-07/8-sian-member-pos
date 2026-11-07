import { confirmAction } from './confirm-action.js';

export function setupTableOrdering({ api, run, editable, getPending }) {
  const $ = (id) => document.getElementById(id);
  const text = (tag, value) => {
    const element = document.createElement(tag);
    element.textContent = value;
    return element;
  };
  let tables = [],
    timer,
    refreshing = false,
    configuring = null;
  async function refresh() {
    const rows = await api('tables');
    const selected = getPending()?.tableId || $('table-select').value;
    tables = rows;
    $('table-select').replaceChildren(new Option('ไม่ระบุโต๊ะ (คิดเงินได้ตามปกติ)', ''));
    for (const table of rows) {
      const option = new Option(
        `โต๊ะ ${table.number}${table.sessionId ? ' • เปิดใช้งาน' : ' • ว่าง'}`,
        table.id,
      );
      option.disabled = !!table.sessionId;
      $('table-select').append(option);
    }
    if (rows.some((row) => row.id === selected)) $('table-select').value = selected;
  }
  async function render() {
    if (refreshing) return;
    refreshing = true;
    try {
      await refresh();
      $('table-list').replaceChildren();
      for (const table of tables) {
        const row = text('div', '');
        row.className = 'table-card';
        row.append(
          text(
            'strong',
            `โต๊ะ ${table.number} • ${table.sessionId ? (table.orderingEnabled ? 'เปิดสั่งอาหาร' : 'ชำระแล้ว • รอเลือกโซน') : 'ปิดสั่งอาหาร'}`,
          ),
        );
        if (table.sessionId) {
          if (!table.orderingEnabled) {
            const activate = text('button', 'เลือกโซน / เปิดโต๊ะ');
            activate.onclick = run(() =>
              configure({
                tableId: table.id,
                tableNumber: table.number,
                tableSessionId: table.sessionId,
              }),
            );
            row.append(activate);
          } else
            row.append(text('p', `โซนที่เปิด: ${table.zones.join(', ') || 'ไม่เปิดโซนอาหาร'}`));
          const button = text('button', 'ลูกค้าออกแล้ว / ปิดสั่งอาหาร');
          button.onclick = run(async () => {
            if (
              !(await confirmAction(
                `ยืนยันปิดสั่งอาหารโต๊ะ ${table.number} และยกเลิกรายการอาหารที่ยังค้างของรอบนี้?`,
              ))
            )
              return;
            button.disabled = true;
            try {
              await api(`tables/${table.id}/close`, { sessionId: table.sessionId });
              await renderAfter();
            } finally {
              button.disabled = false;
            }
          });
          row.append(button);
        }
        $('table-list').append(row);
      }
      $('table-orders').replaceChildren();
      const orders = await api('table-orders');
      if (!orders.length) $('table-orders').append(text('p', 'ไม่มีรายการรอดำเนินการ'));
      for (const order of orders) {
        const card = text('article', '');
        card.className = 'table-card';
        card.append(
          text(
            'h3',
            `โต๊ะ ${order.table.number} • ${new Date(order.createdAt).toLocaleTimeString('th-TH')}`,
          ),
        );
        if (order.table.sessionId !== order.sessionId)
          card.append(text('p', 'รายการจากรอบที่ปิดแล้ว'));
        for (const item of order.items) card.append(text('p', `${item.name} × ${item.quantity}`));
        const done = text('button', 'ดำเนินการแล้ว');
        done.onclick = run(async () => {
          done.disabled = true;
          try {
            await api(`table-orders/${order.id}/complete`, {});
            await renderAfter();
          } finally {
            done.disabled = false;
          }
        });
        card.append(done);
        $('table-orders').append(card);
      }
      $('ordering-status').textContent =
        `อัปเดตล่าสุด ${new Date().toLocaleTimeString('th-TH')} • ${orders.length} รายการรอดำเนินการ`;
    } finally {
      refreshing = false;
    }
  }
  async function renderAfter() {
    refreshing = false;
    await render();
  }
  async function configure(sale) {
    if (!sale.tableId || !sale.tableSessionId) return;
    const zones = await api('ordering-zones');
    configuring = sale;
    $('zone-table').textContent = `โต๊ะ ${sale.tableNumber} • ชำระเงินสำเร็จแล้ว`;
    $('zone-options').replaceChildren();
    for (const zone of zones) {
      const label = text('label', '');
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.value = zone;
      input.name = 'zone';
      label.append(input, document.createTextNode(zone));
      $('zone-options').append(label);
    }
    if (!zones.length)
      $('zone-options').append(text('p', 'ยังไม่มีโซนอาหาร ตั้งค่าโซนได้ผ่านเว็บแอดมิน'));
    $('zone-dialog').showModal();
  }
  $('zone-form').onsubmit = run(async () => {
    if (!configuring) return;
    $('activate-table').disabled = true;
    try {
      const zones = [...$('zone-options').querySelectorAll('input:checked')].map(
        (input) => input.value,
      );
      await api(`tables/${configuring.tableId}/activate`, {
        sessionId: configuring.tableSessionId,
        zones,
      });
      configuring = null;
      $('zone-dialog').close();
      await refresh();
      if ($('tables-dialog').open) await render();
    } finally {
      $('activate-table').disabled = false;
    }
  });
  $('later-zones').onclick = () => {
    $('zone-dialog').close();
  };
  $('table-select').onchange = () => {
    if (!editable()) $('table-select').value = getPending()?.tableId || '';
  };
  $('tables').onclick = run(async () => {
    $('tables-dialog').showModal();
    await render();
  });
  $('refresh-tables').onclick = run(render);
  $('close-tables').onclick = () => $('tables-dialog').close();
  return {
    refresh,
    configure,
    selected() {
      const id = $('table-select').value;
      if (!id) return undefined;
      if (tables.find((table) => table.id === id)?.sessionId)
        throw new Error('โต๊ะนี้เปิดอยู่ กรุณาเลือกโต๊ะว่าง');
      return id;
    },
    clear() {
      $('table-select').value = '';
    },
    stop() {
      clearInterval(timer);
    },
    start() {
      clearInterval(timer);
      timer = setInterval(() => {
        if ($('tables-dialog').open) run(render)();
      }, 15000);
    },
  };
}
