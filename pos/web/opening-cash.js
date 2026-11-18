export const cashDenominations = [1000, 500, 100, 50, 10, 5, 2, 1];

export function openingCashTotal(counts) {
  let total = 0;
  for (const denomination of cashDenominations) {
    const raw = String(counts[denomination] ?? '').trim();
    if (raw && !/^\d+$/.test(raw)) throw new Error('กรอกจำนวนธนบัตรหรือเหรียญเป็นจำนวนเต็มตั้งแต่ 0');
    const count = Number(raw);
    if (!Number.isSafeInteger(count) || count > 1000000)
      throw new Error('จำนวนธนบัตรหรือเหรียญไม่ถูกต้อง');
    total += denomination * count * 100;
  }
  if (!Number.isSafeInteger(total) || total > 100000000)
    throw new Error('เงินสดตั้งต้นต้องไม่เกิน 1,000,000 บาท');
  return total;
}

export function setupOpeningCash(form, container, totalInput) {
  for (const denomination of cashDenominations) {
    const label = document.createElement('label');
    label.textContent = `${denomination.toLocaleString('th-TH')} บาท`;
    const input = document.createElement('input');
    input.name = `cashCount${denomination}`;
    input.type = 'number';
    input.min = '0';
    input.max = '1000000';
    input.step = '1';
    input.inputMode = 'numeric';
    input.placeholder = '0';
    input.setAttribute('aria-label', `จำนวนธนบัตรหรือเหรียญ ${denomination.toLocaleString('th-TH')} บาท`);
    label.append(input);
    container.append(label);
  }
  const counts = () => Object.fromEntries(cashDenominations.map((value) => [value, form.elements[`cashCount${value}`].value]));
  const update = () => {
    try {
      const total = openingCashTotal(counts());
      totalInput.value = (total / 100).toFixed(2);
      container.querySelector('input').setCustomValidity('');
    } catch (error) {
      totalInput.value = '';
      container.querySelector('input').setCustomValidity(error.message);
    }
  };
  container.addEventListener('input', update);
  update();
  return {
    counts,
    reset: update,
    restore(request) {
      if (request.openingCashCounts) {
        for (const value of cashDenominations) form.elements[`cashCount${value}`].value = request.openingCashCounts[value] || '';
        update();
      } else {
        // Older pending requests stored only the total; keep their exact retry amount.
        for (const value of cashDenominations) form.elements[`cashCount${value}`].value = '';
        totalInput.value = (request.openingCashSatang / 100).toFixed(2);
      }
    },
  };
}
