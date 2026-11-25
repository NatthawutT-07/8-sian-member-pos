const preferenceKey = 'chef-order-sound';

export function createOrderAlert(source, onStatus = () => {}, options = {}) {
  let enabled = false, audio = null, seen = null;
  const storage = () => options.storage ?? globalThis.localStorage;
  try { enabled = storage()?.getItem(preferenceKey) === 'on'; } catch {}
  const report = (message) => onStatus(enabled, message);
  const save = () => {
    try { storage()?.setItem(preferenceKey, enabled ? 'on' : 'off'); } catch {}
  };
  async function play() {
    if (!audio) {
      audio = options.createAudio ? options.createAudio(source) : new Audio(source);
      audio.preload = 'auto';
      audio.volume = 0.7;
    }
    audio.currentTime = 0;
    await audio.play();
  }
  return {
    get enabled() { return enabled; },
    async enable() {
      // Called directly by a tap so browsers/WebView can unlock audio playback.
      await play();
      enabled = true;
      save();
      report('เปิดเสียงออเดอร์ใหม่แล้ว');
    },
    disable() {
      enabled = false;
      audio?.pause();
      save();
      report('ปิดเสียงแจ้งเตือนแล้ว');
    },
    async test() {
      await play();
      report('เสียงตัวอย่าง: แจ้งเตือนออเดอร์ใหม่');
    },
    observe(orders) {
      const ids = orders.map((order) => order.id);
      if (seen === null) { seen = new Set(ids); return 0; }
      const fresh = ids.filter((id) => !seen.has(id));
      for (const id of ids) seen.add(id);
      // One chime per batch, never repeated by polling or a temporary disappearance.
      if (fresh.length && enabled)
        void play().catch(() => report('เล่นเสียงไม่ได้ กรุณากดทดสอบเสียง และตรวจระดับเสียงของเครื่อง'));
      return fresh.length;
    },
    reset() { seen = null; audio?.pause(); },
    dispose() { seen = null; audio?.pause(); audio = null; },
  };
}
