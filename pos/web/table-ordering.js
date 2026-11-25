import { confirmAction } from './confirm-action.js';
import { tableTiming, tableDateTime } from './table-time.js';
import { readTableDefaults, saveTableDefaults } from './table-defaults.js';

export function reconcileTableNodes(parent, desired) {
  const keep = new Set(desired);
  for (const child of [...parent.children]) if (!keep.has(child)) child.remove();
  desired.forEach((child, index) => {
    if (parent.children[index] !== child) parent.insertBefore(child, parent.children[index] || null);
  });
}

export function setupTableOrdering({
  api,
  run,
  editable,
  getPending,
  showQr = () => {},
  printQrDefault = () => false,
}) {
  const $ = (id) => document.getElementById(id);
  const text = (tag, value) => {
    const element = document.createElement(tag);
    element.textContent = value;
    return element;
  };
  let tables = [],
    timer,
    clockTimer,
    refreshing = false,
    configuring = null,
    checkoutTable = null,
    checkoutReady = false;
  let defaults = readTableDefaults(localStorage), checkoutLoadVersion = 0;
  const tableNodes = new Map(), orderNodes = new Map();
  const tableClocks = new Map();
  const pickedZones = (id) => [...$(id).querySelectorAll('input:checked')].map((input) => input.value);
  function duration(hoursId, unlimitedId) {
    if ($(unlimitedId).checked) return 0;
    const value = Number($(hoursId).value);
    if (!Number.isInteger(value) || value < 1 || value > 168) throw new Error('อายุ QR ต้องเป็นจำนวนเต็ม 1–168 ชั่วโมง หรือเลือกไม่จำกัดเวลา');
    return value;
  }
  function setDuration(hoursId, unlimitedId, value) {
    $(unlimitedId).checked = value === 0;
    $(hoursId).value = String(value || 2);
    $(hoursId).disabled = value === 0;
  }
  function updateCheckoutSummary() {
    const zones = pickedZones('checkout-zone-options');
    const limit = $('checkout-qr-unlimited').checked ? 'ไม่จำกัดเวลา' : `${$('checkout-qr-hours').value} ชม.`;
    $('checkout-ordering-summary').textContent = `${zones.join(', ') || 'ไม่เปิดโซนอาหาร'} • ${limit}`;
  }
  for (const [hours, unlimited] of [['checkout-qr-hours', 'checkout-qr-unlimited'], ['zone-qr-hours', 'zone-qr-unlimited'], ['default-qr-hours', 'default-qr-unlimited']]) {
    $(unlimited).onchange = () => { $(hours).disabled = $(unlimited).checked; updateCheckoutSummary(); };
  }
  $('checkout-zone-options').onchange = updateCheckoutSummary;
  $('checkout-qr-hours').oninput = updateCheckoutSummary;
  $('edit-checkout-ordering').onclick = () => {
    if (editable() && checkoutReady) $('checkout-ordering-dialog').showModal();
  };
  $('confirm-checkout-ordering').onclick = run(async () => {
    duration('checkout-qr-hours', 'checkout-qr-unlimited');
    updateCheckoutSummary();
    $('checkout-ordering-dialog').close();
  });
  function updateClocks() {
    if (!$('tables-dialog').open) return;
    for (const { table, row, status, remaining, qr } of tableClocks.values()) {
      const timing = tableTiming(table);
      row.classList.toggle('table-expired', timing.state === 'expired');
      status.textContent = timing.label;
      remaining.textContent = timing.remaining;
      if (qr) qr.disabled = timing.state !== 'active';
    }
  }
  async function loadCheckout() {
    const id = $('table-select').value;
    $('checkout-ordering').hidden = !id;
    if (checkoutTable === id && checkoutReady) return;
    checkoutTable = id;
    const version = ++checkoutLoadVersion;
    checkoutReady = false;
    $('checkout-zone-options').replaceChildren();
    if (!id) return;
    $('checkout-zone-status').textContent = 'กำลังโหลดโซนอาหาร…';
    const zones = await api('ordering-zones');
    if ($('table-select').value !== id || version !== checkoutLoadVersion) return;
    const saved = getPending();
    setDuration('checkout-qr-hours', 'checkout-qr-unlimited', saved?.ordering?.qrHours ?? defaults?.qrHours ?? tables.find((table) => table.id === id)?.qrDurationHours ?? 2);
    $('checkout-print-qr').checked = saved?.printQr ?? defaults?.printQr ?? printQrDefault();
    for (const zone of zones) {
      const label = text('label', '');
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.value = zone;
      input.checked = (saved?.ordering?.zones ?? defaults?.zones ?? []).includes(zone);
      label.append(input, text('span', zone));
      $('checkout-zone-options').append(label);
    }
    $('checkout-zone-status').textContent = zones.length
      ? 'หากไม่เลือกโซน ลูกค้าจะไม่มีเมนูอาหารให้สั่ง'
      : 'ยังไม่มีโซนอาหาร ตั้งค่าได้ผ่านเว็บแอดมิน';
    checkoutReady = true;
    updateCheckoutSummary();
  }
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
    await loadCheckout();
  }
  async function render() {
    if (refreshing) return;
    refreshing = true;
    try {
      const [, orders] = await Promise.all([refresh(), api('table-orders')]);
      const desiredTables = [], desiredOrders = [];
      for (const table of tables) {
        const signature = JSON.stringify(table);
        const previous = tableNodes.get(table.id);
        if (previous?.signature === signature) { desiredTables.push(previous.node); continue; }
        const row = text('div', '');
        if (!table.sessionId) tableClocks.delete(table.id);
        row.className = `table-card dining-table ${table.sessionId ? 'table-occupied' : 'table-vacant'}`;
        row.dataset.tableId = table.id;
        const heading = text('strong', `โต๊ะ ${table.number}`);
        heading.className = 'table-number';
        const status = text('span', tableTiming(table).label);
        status.className = 'table-state';
        row.append(heading, status);
        if (table.sessionId) {
          const times = text('dl', '');
          times.className = 'table-times';
          const remaining = text('dd', '');
          remaining.className = 'table-time-remaining';
          times.append(
            text('dt', 'เริ่มรอบโต๊ะ'),
            text('dd', tableDateTime(table.openedAt)),
            text('dt', 'สิ้นสุดสั่งอาหาร'),
            text('dd', table.qrUnlimited === true && table.qrExpiresAt == null ? 'ไม่จำกัดเวลา' : tableDateTime(table.qrExpiresAt)),
            text('dt', 'เวลาคงเหลือ'),
            remaining,
          );
          row.append(times);
          const clock = { table, row, status, remaining, qr: null };
          tableClocks.set(table.id, clock);
          const actions = text('div', '');
          actions.className = 'table-card-actions';
          if (!table.orderingEnabled) {
            const activate = text('button', 'เลือกโซน / เปิดโต๊ะ');
            activate.className = 'table-activate';
            activate.onclick = run(() =>
              configure({
                tableId: table.id,
                tableNumber: table.number,
                tableSessionId: table.sessionId,
              }),
            );
            actions.append(activate);
          } else {
            const zones = text('p', `โซน: ${table.zones.join(', ') || 'ไม่เปิดโซนอาหาร'}`);
            zones.className = 'table-zones';
            row.append(zones);
            const qr = text('button', 'QR');
            qr.className = 'table-qr-button';
            qr.title = 'ดู / พิมพ์ QR รอบนี้';
            clock.qr = qr;
            qr.onclick = run(async () =>
              showQr(
                await api(`tables/${table.id}/qr`, { sessionId: table.sessionId }),
                false,
                table.id,
              ),
            );
            actions.append(qr);
          }
          const button = text('button', 'ปิดโต๊ะ');
          button.className = 'table-close';
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
          actions.append(button);
          row.append(actions);
        }
        tableNodes.set(table.id, { node: row, signature });
        desiredTables.push(row);
      }
      for (const id of tableNodes.keys()) if (!tables.some((table) => table.id === id)) { tableNodes.delete(id); tableClocks.delete(id); }
      reconcileTableNodes($('table-list'), desiredTables);
      updateClocks();
      if (!orders.length) desiredOrders.push(text('p', 'ไม่มีรายการรอดำเนินการ'));
      for (const order of orders) {
        const signature = JSON.stringify(order);
        const previous = orderNodes.get(order.id);
        if (previous?.signature === signature) { desiredOrders.push(previous.node); continue; }
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
        orderNodes.set(order.id, { node: card, signature });
        desiredOrders.push(card);
      }
      for (const id of orderNodes.keys()) if (!orders.some((order) => order.id === id)) orderNodes.delete(id);
      reconcileTableNodes($('table-orders'), desiredOrders);
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
    setDuration('zone-qr-hours', 'zone-qr-unlimited', defaults?.qrHours ?? tables.find((table) => table.id === sale.tableId)?.qrDurationHours ?? 2);
    $('zone-options').replaceChildren();
    for (const zone of zones) {
      const label = text('label', '');
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.value = zone;
      input.name = 'zone';
      input.checked = defaults?.zones.includes(zone) || false;
      label.append(input, text('span', zone));
      $('zone-options').append(label);
    }
    if (!zones.length)
      $('zone-options').append(text('p', 'ยังไม่มีโซนอาหาร ตั้งค่าโซนได้ผ่านเว็บแอดมิน'));
    updateSelection();
    $('zone-dialog').showModal();
  }
  function updateSelection() {
    const count = $('zone-options').querySelectorAll('input:checked').length;
    $('zone-selection').textContent = count
      ? `เลือกแล้ว ${count} โซน`
      : 'ยังไม่เลือกโซน • หากยืนยัน โต๊ะจะไม่มีเมนูอาหารให้สั่ง';
    $('zone-selection').classList.toggle('zone-selection-empty', count === 0);
  }
  $('zone-options').onchange = updateSelection;
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
        qrHours: duration('zone-qr-hours', 'zone-qr-unlimited'),
      });
      const tableId = configuring.tableId,
        sessionId = configuring.tableSessionId;
      configuring = null;
      $('zone-dialog').close();
      await showQr(await api(`tables/${tableId}/qr`, { sessionId }), true, tableId);
      await refresh();
      if ($('tables-dialog').open) await render();
    } finally {
      $('activate-table').disabled = false;
    }
  });
  $('later-zones').onclick = () => {
    $('zone-dialog').close();
  };
  $('table-select').onchange = run(async () => {
    if (!editable()) {
      $('table-select').value = getPending()?.tableId || '';
      return;
    }
    await loadCheckout();
  });
  $('tables').onclick = run(async () => {
    $('tables-dialog').showModal();
    await render();
  });
  $('refresh-tables').onclick = run(render);
  $('close-tables').onclick = () => $('tables-dialog').close();
  $('table-defaults').onclick = run(async () => {
    const zones = await api('ordering-zones');
    $('default-zone-options').replaceChildren();
    for (const zone of zones) {
      const label = text('label', '');
      const input = document.createElement('input');
      input.type = 'checkbox'; input.value = zone;
      input.checked = defaults?.zones.includes(zone) || false;
      label.append(input, text('span', zone));
      $('default-zone-options').append(label);
    }
    setDuration('default-qr-hours', 'default-qr-unlimited', defaults?.qrHours ?? 2);
    $('default-print-qr').checked = defaults?.printQr ?? printQrDefault();
    $('table-defaults-status').textContent = '';
    $('table-defaults-dialog').showModal();
  });
  $('table-defaults-form').onsubmit = run(async () => {
    const value = { zones: pickedZones('default-zone-options'), qrHours: duration('default-qr-hours', 'default-qr-unlimited'), printQr: $('default-print-qr').checked };
    saveTableDefaults(localStorage, value);
    defaults = value;
    $('table-defaults-dialog').close();
    if (!getPending()) { checkoutReady = false; await loadCheckout(); }
  });
  $('close-table-defaults').onclick = () => $('table-defaults-dialog').close();
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
    checkout() {
      if (!$('table-select').value) return {};
      if (!checkoutReady || checkoutTable !== $('table-select').value)
        throw new Error('กรุณารอโหลดโซนอาหาร หรือเลือกโต๊ะอีกครั้ง');
      const qrHours = duration('checkout-qr-hours', 'checkout-qr-unlimited');
      return {
        ordering: {
          zones: [...$('checkout-zone-options').querySelectorAll('input:checked')].map(
            (input) => input.value,
          ),
          qrHours,
        },
        printQr: $('checkout-print-qr').checked,
      };
    },
    clear() {
      $('table-select').value = '';
      checkoutTable = null;
      checkoutLoadVersion++;
      checkoutReady = false;
      $('checkout-ordering').hidden = true;
    },
    stop() {
      clearInterval(timer);
      clearInterval(clockTimer);
      tableClocks.clear();
      tableNodes.clear();
      orderNodes.clear();
    },
    start() {
      clearInterval(timer);
      clearInterval(clockTimer);
      clockTimer = setInterval(updateClocks, 1000);
      timer = setInterval(() => {
        if ($('tables-dialog').open) run(render)();
      }, 15000);
    },
  };
}
