const { contextBridge, ipcRenderer } = require('electron');
const actions = [
  'status',
  'list',
  'connect',
  'configure',
  'testPrint',
  'printReceipt',
  'printShiftReport',
  'printBarcode',
  'openDrawer',
  'afterSale',
];
contextBridge.exposeInMainWorld(
  'posHardware',
  Object.fromEntries(
    actions.map((action) => [
      action,
      async (input = {}) => {
        const result = await ipcRenderer.invoke('pos:hardware', action, input);
        if (!result.ok) throw new Error(result.error);
        return result.value;
      },
    ]),
  ),
);
