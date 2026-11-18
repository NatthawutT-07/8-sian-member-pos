export function renderKitchenTicket(root, ticket) {
  const doc = root.ownerDocument;
  const line = (tag, value) => {
    const el = doc.createElement(tag);
    el.textContent = value;
    return el;
  };
  root.classList.add('kitchen-ticket');
  root.replaceChildren(line('h2', `โต๊ะ ${ticket.tableNumber}`));
}
