// MundoMedSeg - processo principal.
// Abre duas janelas, uma por monitor: TOTEM (tela touch, interativa) e PAINEL (LED, so exibe).
// O toque no totem chega aqui e e repassado ao painel.

const { app, BrowserWindow, ipcMain, screen, powerSaveBlocker } = require('electron');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

const VERSAO = require('../../package.json').version;
const RAIZ = app.isPackaged ? path.dirname(process.execPath) : path.resolve(__dirname, '..', '..');
const PASTA_CONTEUDO = path.join(RAIZ, 'conteudo');
const ARQ_CONFIG = path.join(RAIZ, 'config.json');
const ARQ_LOG = path.join(RAIZ, 'mundomedseg.log');

const args = process.argv.slice(1);
const flag = (nome) => args.some((a) => a === `--${nome}` || a.startsWith(`--${nome}=`));
const valorFlag = (nome) => {
  const a = args.find((x) => x.startsWith(`--${nome}=`));
  return a ? a.slice(nome.length + 3) : null;
};

const CONFIG_PADRAO = {
  // id do monitor (veja o log ao abrir ou use Ctrl+Shift+S para trocar). null = automatico.
  telas: { totem: null, painel: null },
  // volta ao menu + logo depois de tanto tempo sem toque (0 desliga)
  ociosidadeSegundos: 90,
  // duracao do zoom entre telas do totem
  transicaoMs: 1000,
  // duracao da troca de imagem no painel LED
  painelTransicaoMs: 900,
  // como a imagem (retrato) cabe no painel: "contain" (inteira) ou "cover" (preenche cortando)
  painelAjuste: 'contain',
  // esconde o cursor do mouse nas janelas em tela cheia
  ocultarCursor: true,
};

function log(...partes) {
  const linha = `[${new Date().toISOString()}] ${partes.join(' ')}`;
  console.log(linha);
  try { fs.appendFileSync(ARQ_LOG, linha + '\n'); } catch { /* sem permissao de escrita: segue sem log em arquivo */ }
}

function lerConfig() {
  let lida = {};
  try { lida = JSON.parse(fs.readFileSync(ARQ_CONFIG, 'utf8')); } catch { /* sem arquivo: usa o padrao */ }
  return { ...CONFIG_PADRAO, ...lida, telas: { ...CONFIG_PADRAO.telas, ...(lida.telas || {}) } };
}
function salvarConfig(cfg) {
  try { fs.writeFileSync(ARQ_CONFIG, JSON.stringify(cfg, null, 2), 'utf8'); } catch (e) { log('config nao salva:', e.message); }
}

let config;
let janelas = { totem: null, painel: null };
let estado = { painel: null }; // painel: caminho relativo da imagem ou null (logo)
let modoJanela = false;

if (!app.requestSingleInstanceLock()) {
  app.quit();
}

// ---------- escolha dos monitores ----------
function escolherTelas() {
  const todas = screen.getAllDisplays();
  log('monitores:', todas.map((d) => `id=${d.id} ${d.bounds.width}x${d.bounds.height}@${d.bounds.x},${d.bounds.y} toque=${d.touchSupport}${d.id === screen.getPrimaryDisplay().id ? ' (principal)' : ''}`).join(' | '));
  if (todas.length < 2 || modoJanela) return null;

  const porId = (id) => todas.find((d) => d.id === id);
  let totem = porId(config.telas.totem);
  let painel = porId(config.telas.painel);
  if (!totem) totem = todas.find((d) => d.touchSupport === 'available') || screen.getPrimaryDisplay();
  if (!painel || painel.id === totem.id) painel = todas.find((d) => d.id !== totem.id);
  return { totem, painel };
}

function trocarTelas() {
  const atual = escolherTelas();
  if (!atual) return;
  config.telas = { totem: atual.painel.id, painel: atual.totem.id };
  salvarConfig(config);
  log('telas trocadas: totem ->', config.telas.totem, 'painel ->', config.telas.painel);
  posicionar();
}

// ---------- janelas ----------
function criarJanela(papel) {
  const w = new BrowserWindow({
    show: false,
    frame: false,
    backgroundColor: '#000000',
    autoHideMenuBar: true,
    title: papel === 'totem' ? 'Mundo Med+ Seg - Totem' : 'Mundo Med+ Seg - Painel LED',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: false,
      spellcheck: false,
    },
  });
  w.setMenuBarVisibility(false);
  w.webContents.setZoomFactor(1);
  w.webContents.on('before-input-event', (ev, input) => atalho(ev, input));
  w.webContents.on('render-process-gone', (_e, d) => {
    log(`${papel}: processo de render caiu (${d.reason}); recarregando`);
    setTimeout(() => { if (!w.isDestroyed()) w.reload(); }, 1000);
  });
  w.webContents.on('console-message', (_e, nivel, msg, linha, fonte) => {
    if (nivel >= 2) log(`${papel} console[${nivel}]: ${msg} (${path.basename(fonte || '')}:${linha})`);
  });
  w.on('unresponsive', () => log(`${papel}: janela sem resposta`));
  w.loadFile(path.join(__dirname, '..', 'renderer', `${papel}.html`));
  w.once('ready-to-show', () => w.show());
  w.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  w.webContents.on('will-navigate', (e) => e.preventDefault());
  return w;
}

function posicionar() {
  const telas = escolherTelas();
  for (const papel of ['totem', 'painel']) {
    const w = janelas[papel];
    if (!w || w.isDestroyed()) continue;
    w.setFullScreen(false);
    if (telas) {
      const b = telas[papel].bounds;
      w.setBounds(b);
      w.setAlwaysOnTop(!flag('semtopo'), 'screen-saver');
      w.setFullScreen(true);
    } else {
      // um monitor so (ou --janela): duas janelas lado a lado para teste
      const area = screen.getPrimaryDisplay().workArea;
      const altura = Math.min(area.height - 40, 760);
      if (papel === 'totem') {
        w.setBounds({ x: area.x + 10, y: area.y + 10, width: Math.min(1100, area.width - 540), height: Math.round(altura * 0.8) });
      } else {
        w.setBounds({ x: area.x + Math.min(1100, area.width - 540) + 20, y: area.y + 10, width: 520, height: altura });
      }
      w.setAlwaysOnTop(false);
      w.setResizable(true);
    }
  }
}

function enviar(papel, canal, dados) {
  const w = janelas[papel];
  if (w && !w.isDestroyed() && !w.webContents.isLoading()) w.webContents.send(canal, dados);
}

function reiniciarTudo() {
  estado.painel = null;
  enviar('painel', 'painel:mostrar', estado.painel);
  enviar('totem', 'totem:reiniciar');
}

function atalho(ev, input) {
  if (input.type !== 'keyDown') return;
  const ctrlShift = input.control && input.shift;
  const k = input.key.toLowerCase();
  if (ctrlShift && k === 'q') { ev.preventDefault(); log('encerrado pelo atalho'); app.quit(); }
  else if (ctrlShift && k === 's') { ev.preventDefault(); trocarTelas(); }
  else if (ctrlShift && k === 'r') { ev.preventDefault(); reiniciarTudo(); }
  else if (input.key === 'F12') { ev.preventDefault(); BrowserWindow.getFocusedWindow()?.webContents.toggleDevTools(); }
  else if (input.key === 'F11' && modoJanela) { ev.preventDefault(); const w = BrowserWindow.getFocusedWindow(); w?.setFullScreen(!w.isFullScreen()); }
}

// ---------- IPC ----------
ipcMain.handle('carregar', () => {
  const conteudo = JSON.parse(fs.readFileSync(path.join(PASTA_CONTEUDO, 'conteudo.json'), 'utf8'));
  let base = pathToFileURL(PASTA_CONTEUDO).href;
  if (!base.endsWith('/')) base += '/';
  return {
    conteudo,
    base,
    versao: VERSAO,
    config: { ...config, ocultarCursor: config.ocultarCursor && !modoJanela },
    estado,
  };
});

ipcMain.on('navegar', (_e, msg) => {
  if (msg && Object.prototype.hasOwnProperty.call(msg, 'painel')) {
    estado.painel = typeof msg.painel === 'string' ? msg.painel : null;
    log('painel ->', estado.painel || 'logo');
    enviar('painel', 'painel:mostrar', estado.painel);
  }
});
ipcMain.on('log', (_e, texto) => log('renderer:', String(texto).slice(0, 500)));
ipcMain.on('pronto', (_e, papel) => {
  if (papel === 'painel') enviar('painel', 'painel:mostrar', estado.painel);
});

// ---------- inicio ----------
app.on('second-instance', () => {
  for (const w of Object.values(janelas)) w && !w.isDestroyed() && w.show();
});
app.on('window-all-closed', () => app.quit());

app.whenReady().then(() => {
  config = lerConfig();
  modoJanela = flag('janela');
  log(`MundoMedSeg v${VERSAO} iniciando (${app.isPackaged ? 'empacotado' : 'desenvolvimento'}) conteudo=${PASTA_CONTEUDO}`);
  if (!fs.existsSync(path.join(PASTA_CONTEUDO, 'conteudo.json'))) {
    log('ERRO: conteudo/conteudo.json nao encontrado. Rode "npm run gerar-conteudo".');
    app.exit(2);
    return;
  }
  powerSaveBlocker.start('prevent-display-sleep');
  janelas.totem = criarJanela('totem');
  janelas.painel = criarJanela('painel');
  posicionar();
  screen.on('display-added', posicionar);
  screen.on('display-removed', posicionar);

  const pasta = valorFlag('autoteste');
  if (pasta) require('./autoteste').rodar({ app, janelas, pasta, log, enviar, estado });
});
