const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('posApi', {
  request: (route, body, method) => ipcRenderer.invoke('pos:api', route, body, method),
});
const actions = [
  'status',
  'list',
  'connect',
  'configure',
  'testPrint',
  'testText',
  'printReceipt',
  'printTableQr',
  'printKitchenTicket',
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
