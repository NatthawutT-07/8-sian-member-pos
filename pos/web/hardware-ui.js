const $ = (id) => document.getElementById(id);

export function setupHardwareUI({ products, role = () => 'USER' }) {
  const bridge = window.posHardware;
  let working = false;
  const status = (value) => {
    $('hardware-status').textContent = value;
  };
  const controls = () => $('hardware-controls').querySelectorAll('button, input, select');
  async function work(fn) {
    if (working) return;
    working = true;
    controls().forEach((control) => {
      control.disabled = true;
    });
    status('กำลังติดต่ออุปกรณ์… หากกำลังพิมพ์ กรุณารอจนส่งข้อมูลครบ');
    try {
      await fn();
    } catch (error) {
      status(error.message);
    } finally {
      working = false;
      controls().forEach((control) => {
        control.disabled = false;
      });
    }
  }
  const sent = (result) => {
    const timing = Number.isFinite(result.totalMs)
      ? ` • ส่งข้อมูล ${(result.totalMs / 1000).toFixed(1)} วินาที`
      : '';
    status((result.warning || 'เครื่องพิมพ์รับข้อมูลแล้ว กรุณาตรวจผลที่เครื่องจริง') + timing);
  };
  const showSettings = ({ settings }) => {
    for (const [id, key] of [
      ['auto-print', 'autoPrint'],
      ['auto-drawer', 'autoDrawer'],
      ['cut-paper', 'cut'],
    ])
      $(id).checked = settings[key];
    $('drawer-pin').value = String(settings.drawerPin);
    $('hardware-device').textContent = settings.deviceName || 'ยังไม่ได้เลือกเครื่องพิมพ์';
  };
  $('hardware').onclick = async () => {
    const chef = role() === 'CHEF';
    $('print-barcode').closest('fieldset').hidden = chef;
    $('open-drawer').closest('fieldset').hidden = chef;
    $('auto-drawer').closest('label').hidden = chef;
    $('drawer-pin').closest('label').hidden = chef;
    $('hardware-dialog').showModal();
    $('hardware-controls').hidden = !bridge;
    $('hardware-browser-note').hidden = !!bridge;
    if (!bridge) return;
    await work(async () => {
      showSettings(await bridge.status());
      const select = $('barcode-product');
      select.replaceChildren();
      for (const product of products().filter((item) => item.active && item.group !== 'DISCOUNT')) {
        const option = document.createElement('option');
        option.value = product.id;
        option.textContent = `${product.name} • ${product.barcode}`;
        select.append(option);
      }
      status('พร้อมตั้งค่า • ค้นหาและเชื่อมต่อเพื่อทดสอบเครื่องพิมพ์');
    });
  };
  $('close-hardware').onclick = () => $('hardware-dialog').close();
  $('find-printers').onclick = () =>
    work(async () => {
      const result = await bridge.list();
      const select = $('printer-device');
      select.replaceChildren();
      for (const device of result.devices) {
        const option = document.createElement('option');
        option.value = device.id;
        option.textContent = device.name;
        select.append(option);
      }
      status(
        result.devices.length
          ? 'เลือกเครื่องแล้วกดเชื่อมต่อ'
          : 'ไม่พบเครื่องพิมพ์ เปิดเครื่องและ Bluetooth ของอุปกรณ์ แล้วค้นหาอีกครั้ง',
      );
    });
  $('connect-printer').onclick = () =>
    work(async () => {
      showSettings(await bridge.connect({ deviceId: $('printer-device').value }));
      status('เชื่อมต่อสำเร็จและบันทึกเครื่องนี้แล้ว สามารถพิมพ์ทดสอบได้');
    });
  $('save-hardware').onclick = () =>
    work(async () => {
      showSettings(
        await bridge.configure({
          autoPrint: $('auto-print').checked,
          autoDrawer: $('auto-drawer').checked,
          cut: $('cut-paper').checked,
          drawerPin: Number($('drawer-pin').value),
        }),
      );
      status('บันทึกการตั้งค่าแล้ว');
    });
  $('test-printer').onclick = () => work(async () => sent(await bridge.testPrint()));
  $('print-barcode').onclick = () =>
    work(async () => {
      if (!$('barcode-product').value) throw new Error('เลือกสินค้าที่ต้องการพิมพ์บาร์โค้ดก่อน');
      sent(await bridge.printBarcode({ productId: $('barcode-product').value }));
    });
  $('open-drawer').onclick = () =>
    work(async () => sent(await bridge.openDrawer({ reason: $('drawer-reason').value })));
}

export async function outputPaidSale(sale) {
  if (!window.posHardware) return '';
  try {
    const result = await window.posHardware.afterSale({ saleId: sale.id });
    if (result.errors?.length)
      return `บันทึกชำระแล้ว • ${result.errors.join(' • ')} • พิมพ์ซ้ำจากบิลเดิมได้ ห้ามรับเงินซ้ำ`;
    return (
      result.warning || (result.skipped ? '' : 'ส่งคำสั่งอุปกรณ์แล้ว กรุณาตรวจใบเสร็จและลิ้นชัก')
    );
  } catch (error) {
    return `บันทึกชำระแล้ว แต่อุปกรณ์ยังไม่พร้อม: ${error.message} • พิมพ์ซ้ำจากบิลเดิมได้`;
  }
}
