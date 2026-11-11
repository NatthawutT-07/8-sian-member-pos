export function tableTiming(table, now = Date.now()) {
  if (!table.sessionId) return { state: 'vacant', label: 'ว่าง', remaining: '—' };
  const end = table.qrExpiresAt ? new Date(table.qrExpiresAt).getTime() : NaN;
  if ((Number.isFinite(end) && end <= now) || (table.orderingEnabled && !Number.isFinite(end)))
    return { state: 'expired', label: 'หมดเวลา • รอปิดโต๊ะ', remaining: '00:00:00' };
  if (!table.orderingEnabled)
    return { state: 'pending', label: 'รอเลือกโซน', remaining: 'ยังไม่เริ่ม' };
  const seconds = Math.max(0, Math.ceil((end - now) / 1000));
  const remaining = [Math.floor(seconds / 3600), Math.floor((seconds % 3600) / 60), seconds % 60]
    .map((value) => String(value).padStart(2, '0'))
    .join(':');
  return { state: 'active', label: 'เปิดสั่งอาหาร', remaining };
}

export function tableDateTime(value) {
  if (!value || !Number.isFinite(new Date(value).getTime())) return '—';
  return new Date(value).toLocaleString('th-TH', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}
