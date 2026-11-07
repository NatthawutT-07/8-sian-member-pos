export function renderKitchenTicket(root, ticket) {
  const doc = root.ownerDocument;
  const line = (tag, value) => {
    const el = doc.createElement(tag);
    el.textContent = value;
    return el;
  };
  root.classList.add('kitchen-ticket');
  root.replaceChildren(line('h2', `โต๊ะ ${ticket.tableNumber}`));
  const list = doc.createElement('div');
  for (const item of ticket.items) {
    const row = doc.createElement('div');
    row.className = 'kitchen-ticket-line';
    row.append(line('span', item.name), line('strong', `× ${item.quantity}`));
    list.append(row);
  }
  root.append(list);
}
