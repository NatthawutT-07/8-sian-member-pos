import { Buffer } from 'buffer';
import { createHardware } from '../../desktop/hardware.cjs';
import { barcode } from '../../desktop/escpos.cjs';

const pending = new Map();
let sequence = 0;
window.__posNativeResult = (id, result) => {
  const job = pending.get(id);
  if (!job) return;
  pending.delete(id);
  result.ok ? job.resolve(result.value) : job.reject(new Error(result.error));
};
function native(action, input = {}) {
  return new Promise((resolve, reject) => {
    const id = ++sequence;
    pending.set(id, { resolve, reject });
    window.PosNative.postMessage(JSON.stringify({ id, action, input }));
  });
}
let config;
// Resolve settings before allowing hardware operations; no saved session/password in JS.
const ready = native('settings').then((value) => {
  config = value;
});
window.posApi = {
  request: (route, body, method = 'POST') => native('api', { route, body, method }),
};
const request = async (route, body) => {
  const result = await window.posApi.request(route, body);
  if (!result.ok) throw new Error(result.data.message || 'เชื่อมต่อ POS ไม่สำเร็จ');
  return result.data;
};
const hardware = createHardware({
  request,
  readSettings: () => config,
  saveSettings: (value) => {
    config = value;
    void native('saveSettings', value).catch(console.error);
  },
  transport: (input) => native('transport', input),
  render: async (input) => {
    const data = { ...input };
    if (data.kind === 'test')
      data.sale = {
        id: 'test',
        receiptNumber: '2611010000001',
        cashierDisplayName: 'ทดสอบภาษาไทย',
        items: [{ name: 'หมูกระทะ', priceSatang: 19900, quantity: 1 }],
        totalSatang: 19900,
        method: 'CASH',
        receivedSatang: 20000,
        changeSatang: 100,
        createdAt: new Date().toISOString(),
      };
    if (!['shift', 'kitchen'].includes(data.kind))
      data.code = barcode(data.kind === 'barcode' ? data.product.barcode : data.sale.receiptNumber);
    return Buffer.from(await native('render', data), 'base64');
  },
});
window.posHardware = Object.fromEntries(
  [
    'status',
    'list',
    'connect',
    'configure',
    'testPrint',
    'printReceipt',
    'printKitchenTicket',
    'printShiftReport',
    'printBarcode',
    'openDrawer',
    'afterSale',
  ].map((action) => [
    action,
    async (input = {}) => {
      await ready;
      return hardware(action, input);
    },
  ]),
);
