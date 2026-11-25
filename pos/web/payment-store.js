export function recoveryPayments(storage) {
  const records = JSON.parse(storage.getItem('pos-payment-recovery') || '[]');
  if (!Array.isArray(records)) throw new Error('รายการตรวจบิลบนเครื่องไม่ถูกต้อง');
  return records;
}

export function archivePayment(storage, payload, userId) {
  if (!payload) return;
  if (typeof payload.key !== 'string' || typeof payload.shiftId !== 'string' || !Array.isArray(payload.items)) {
    storage.setItem('pos-invalid-payment-backup', JSON.stringify(payload));
  } else {
    const records = recoveryPayments(storage);
    if (!records.some((entry) => entry.payload.key === payload.key))
      records.push({ payload, userId, archivedAt: new Date().toISOString() });
    // Never erase the active payment until a durable recovery copy exists.
    storage.setItem('pos-payment-recovery', JSON.stringify(records));
  }
  storage.removeItem('pos-pending');
  storage.removeItem('pos-pending-user');
}

export function forgetRecovery(storage, key) {
  storage.setItem('pos-payment-recovery', JSON.stringify(recoveryPayments(storage).filter((entry) => entry.payload.key !== key)));
}

export function withDeadline(promise, milliseconds = 25000) {
  let timer;
  const deadline = new Promise((_, reject) => {
    timer = setTimeout(() => reject(Object.assign(new Error('การเชื่อมต่อใช้เวลานานเกินไป กรุณาตรวจผลบิลเดิม ห้ามรับเงินซ้ำ'), { code: 'POS_TIMEOUT' })), milliseconds);
  });
  return Promise.race([promise, deadline]).finally(() => clearTimeout(timer));
}
