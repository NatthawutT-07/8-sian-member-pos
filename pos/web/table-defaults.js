const key = 'pos-table-defaults';
export function readTableDefaults(storage) {
  try {
    const value = JSON.parse(storage.getItem(key) || 'null');
    if (!value || !Array.isArray(value.zones) || !Number.isInteger(value.qrHours) || value.qrHours < 0 || value.qrHours > 168) return null;
    return { zones: [...new Set(value.zones.filter((zone) => typeof zone === 'string'))], qrHours: value.qrHours, printQr: value.printQr === true };
  } catch { return null; }
}
export function saveTableDefaults(storage, value) {
  if (!Array.isArray(value.zones) || !Number.isInteger(value.qrHours) || value.qrHours < 0 || value.qrHours > 168)
    throw new Error('กรุณาตรวจโซนและอายุ QR');
  storage.setItem(key, JSON.stringify(value));
}
