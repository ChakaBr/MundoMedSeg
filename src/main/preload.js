const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('mundo', {
  carregar: () => ipcRenderer.invoke('carregar'),
  navegar: (msg) => ipcRenderer.send('navegar', msg),
  pronto: (papel) => ipcRenderer.send('pronto', papel),
  log: (texto) => ipcRenderer.send('log', texto),
  aoMostrarNoPainel: (fn) => ipcRenderer.on('painel:mostrar', (_e, imagem) => fn(imagem)),
  aoReiniciar: (fn) => ipcRenderer.on('totem:reiniciar', () => fn()),
});
