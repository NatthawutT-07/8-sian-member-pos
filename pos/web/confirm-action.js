// Use an HTML dialog: Android WebView does not provide window.confirm by default.
export function confirmAction(message) {
  return new Promise((resolve) => {
    const dialog = document.createElement('dialog');
    dialog.id = 'confirm-action-dialog';
    const title = document.createElement('h2');
    title.id = 'confirm-action-title';
    title.textContent = 'ยืนยันปิดโต๊ะ';
    dialog.setAttribute('aria-labelledby', title.id);
    const description = document.createElement('p');
    description.textContent = message;
    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.textContent = 'ยกเลิก';
    cancel.id = 'cancel-action';
    const confirm = document.createElement('button');
    confirm.type = 'button';
    confirm.textContent = 'ยืนยันปิดโต๊ะ';
    confirm.id = 'confirm-action';
    confirm.className = 'primary';
    cancel.onclick = () => dialog.close('cancel');
    confirm.onclick = () => dialog.close('confirm');
    dialog.addEventListener('close', () => {
      const accepted = dialog.returnValue === 'confirm';
      dialog.remove();
      resolve(accepted);
    }, { once: true });
    dialog.append(title, description, cancel, confirm);
    document.body.append(dialog);
    dialog.showModal();
    cancel.focus();
  });
}
