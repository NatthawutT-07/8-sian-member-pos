const { randomUUID } = require('node:crypto');
const { finishPrint, drawerPulse } = require('./escpos.cjs');

const DEFAULTS = Object.freeze({
  deviceId: '',
  deviceName: '',
  autoPrint: true,
  autoDrawer: false,
  cut: true,
  drawerPin: 2,
});

function normalizeSettings(value = {}) {
  const result = { ...DEFAULTS };
  for (const key of ['deviceId', 'deviceName'])
    if (typeof value[key] === 'string' && value[key].length <= 300) result[key] = value[key];
  for (const key of ['autoPrint', 'autoDrawer', 'cut'])
    if (typeof value[key] === 'boolean') result[key] = value[key];
  if ([2, 5].includes(value.drawerPin)) result.drawerPin = value.drawerPin;
  return result;
}

function createHardware({ request, transport, render, readSettings, saveSettings }) {
  let busy = false;
  let discovered = new Map();
  const settings = () => normalizeSettings(readSettings());
  const requireDevice = () => {
    const config = settings();
    if (!config.deviceId) throw new Error('เลือกเครื่องพิมพ์ในเมนูอุปกรณ์ก่อน');
    return config;
  };
  async function transmit(operation, payload, reason, saleId, shiftId, orderId) {
    const config = requireDevice();
    const event = {
      jobId: randomUUID(),
      operation,
      status: 'REQUESTED',
      reason,
      deviceName: config.deviceName,
      ...(saleId ? { saleId } : {}),
      ...(shiftId ? { shiftId } : {}),
      ...(orderId ? { orderId } : {}),
    };
    // Refuse a drawer/print action if the operator cannot be authenticated and audited.
    await request('hardware/events', event);
    try {
      const result = await transport({
        action: 'write',
        deviceId: config.deviceId,
        base64: payload.toString('base64'),
      });
      let warning = '';
      try {
        await request('hardware/events', { ...event, status: 'SENT' });
      } catch {
        warning = 'ส่งข้อมูลแล้ว แต่บันทึกผลบนเซิร์ฟเวอร์ไม่ได้ กรุณาตรวจเครื่องก่อนทำซ้ำ';
      }
      return { ...result, warning };
    } catch (error) {
      try {
        await request('hardware/events', { ...event, status: 'FAILED_OR_UNKNOWN' });
      } catch {}
      throw error;
    }
  }
  async function printSale(sale) {
    const payload = finishPrint(await render({ kind: 'receipt', sale }), settings().cut);
    return transmit('PRINT_RECEIPT', payload, 'พิมพ์ใบเสร็จ', sale.id);
  }
  const actions = {
    async status() {
      return { settings: settings(), busy };
    },
    async list() {
      const result = await transport({ action: 'list' });
      discovered = new Map(result.devices.map((device) => [device.id, device]));
      return result;
    },
    async connect({ deviceId }) {
      const device = discovered.get(deviceId);
      if (!device) throw new Error('กรุณาค้นหาและเลือกเครื่องพิมพ์อีกครั้ง');
      const result = await transport({ action: 'probe', deviceId });
      if (!result.connected) throw new Error('เครื่องพิมพ์ยังไม่เชื่อมต่อ');
      saveSettings({ ...settings(), deviceId, deviceName: device.name });
      return { ...result, settings: settings() };
    },
    async configure(input) {
      const config = settings();
      for (const key of ['autoPrint', 'autoDrawer', 'cut']) {
        if (typeof input[key] !== 'boolean') throw new Error('การตั้งค่าไม่ถูกต้อง');
        config[key] = input[key];
      }
      if (![2, 5].includes(input.drawerPin)) throw new Error('ขาลิ้นชักไม่ถูกต้อง');
      config.drawerPin = input.drawerPin;
      saveSettings(config);
      return { settings: config };
    },
    async testPrint() {
      return transmit(
        'TEST_PRINT',
        finishPrint(await render({ kind: 'test' }), settings().cut),
        'ทดสอบเครื่องพิมพ์',
      );
    },
    async printReceipt({ saleId }) {
      if (typeof saleId !== 'string' || saleId.length > 100) throw new Error('เลขบิลไม่ถูกต้อง');
      return printSale(await request(`sales/${encodeURIComponent(saleId)}`));
    },
    async printKitchenTicket({ orderId }) {
      if (typeof orderId !== 'string' || !/^[a-zA-Z0-9-]{1,100}$/.test(orderId))
        throw new Error('รหัสออเดอร์ไม่ถูกต้อง');
      const ticket = await request(`kitchen/orders/${orderId}/ticket`);
      return transmit(
        'PRINT_KITCHEN',
        finishPrint(await render({ kind: 'kitchen', ticket }), settings().cut, 1),
        'พิมพ์ใบแนบอาหาร',
        undefined,
        undefined,
        orderId,
      );
    },
    async printShiftReport({ shiftId, automatic = false }) {
      if (
        typeof shiftId !== 'string' ||
        !shiftId ||
        shiftId.length > 100 ||
        typeof automatic !== 'boolean'
      )
        throw new Error('รหัสกะไม่ถูกต้อง');
      if (automatic && !settings().deviceId) return { skipped: true };
      const report = await request(`shifts/${encodeURIComponent(shiftId)}/report`);
      if (!report.shift?.closedAt) throw new Error('กะนี้ยังไม่ปิด');
      if (automatic && !(await request('hardware/shift-claim', { shiftId })).claimed)
        return { skipped: true };
      return transmit(
        'PRINT_SHIFT',
        finishPrint(await render({ kind: 'shift', report }), settings().cut),
        'พิมพ์สรุปปิดกะ',
        undefined,
        shiftId,
      );
    },
    async printBarcode({ productId }) {
      const products = await request('products');
      const product = products.find(
        (item) => item.id === productId && item.active && item.group !== 'DISCOUNT',
      );
      if (!product) throw new Error('ไม่พบสินค้าที่เปิดขาย');
      return transmit(
        'PRINT_BARCODE',
        finishPrint(await render({ kind: 'barcode', product }), settings().cut),
        'พิมพ์บาร์โค้ดสินค้า',
      );
    },
    async openDrawer({ reason }) {
      if (typeof reason !== 'string' || !reason.trim() || reason.trim().length > 120)
        throw new Error('ระบุเหตุผลเปิดลิ้นชัก ไม่เกิน 120 ตัวอักษร');
      return transmit('OPEN_DRAWER', drawerPulse(settings().drawerPin), reason.trim());
    },
    async afterSale({ saleId }) {
      const config = settings();
      if (!config.deviceId || (!config.autoPrint && !config.autoDrawer)) return { skipped: true };
      if (typeof saleId !== 'string' || saleId.length > 100) throw new Error('เลขบิลไม่ถูกต้อง');
      const sale = await request(`sales/${encodeURIComponent(saleId)}`);
      const claim = await request('hardware/claim', { saleId });
      if (!claim.claimed) return { skipped: true };
      const errors = [],
        warnings = [];
      // Open after the durable paid sale, independently of a later printing failure.
      if (config.autoDrawer && claim.cash && sale.method === 'CASH') {
        try {
          const result = await transmit(
            'OPEN_DRAWER',
            drawerPulse(config.drawerPin),
            'รับชำระเงินสด',
            sale.id,
          );
          if (result.warning) warnings.push(result.warning);
        } catch (error) {
          errors.push(`ลิ้นชัก: ${error.message}`);
        }
      }
      if (config.autoPrint) {
        try {
          const result = await printSale(sale);
          if (result.warning) warnings.push(result.warning);
        } catch (error) {
          errors.push(`ใบเสร็จ: ${error.message}`);
        }
      }
      return { errors, warning: warnings.join(' • ') };
    },
  };
  return async function handle(action, input = {}) {
    if (
      !Object.hasOwn(actions, action) ||
      !input ||
      typeof input !== 'object' ||
      Array.isArray(input)
    )
      throw new Error('คำสั่งอุปกรณ์ไม่ถูกต้อง');
    const user = await request('me');
    if (
      user.role === 'CHEF' &&
      !['status', 'list', 'connect', 'configure', 'testPrint', 'printKitchenTicket'].includes(
        action,
      )
    )
      throw new Error('บัญชีพ่อครัวไม่มีสิทธิ์ใช้งานคำสั่งนี้');
    if (action === 'status') return actions.status();
    if (busy) throw new Error('อุปกรณ์กำลังทำงาน กรุณารอให้เสร็จก่อน');
    busy = true;
    try {
      return await actions[action](input);
    } finally {
      busy = false;
    }
  };
}
module.exports = { createHardware, normalizeSettings, DEFAULTS };
