export function renderKitchenTicket(root, ticket) {
  const doc = root.ownerDocument;
  const line = (tag, value) => {
    const el = doc.createElement(tag);
    el.textContent = value;
    return el;
  };
  root.classList.add('kitchen-ticket');
  root.replaceChildren(
    line('h2', `โต๊ะ ${ticket.tableNumber}`),
    line(
      'p',
      `ออเดอร์ ${ticket.id.slice(-8)} • ${new Date(ticket.createdAt).toLocaleTimeString('th-TH', { timeZone: 'Asia/Bangkok', hour: '2-digit', minute: '2-digit', hour12: false })}`,
    ),
  );
  const list = doc.createElement('div');
  for (const item of ticket.items) {
    const row = doc.createElement('div');
    row.className = 'kitchen-ticket-line';
    row.append(line('span', item.name), line('strong', `× ${item.quantity}`));
    list.append(row);
  }
  root.append(list);
}
