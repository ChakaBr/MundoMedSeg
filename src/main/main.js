// MundoMedSeg - processo principal.
// Duas janelas: TOTEM (tela touch, interativa) e PAINEL (TV LED vertical, so exibe).
// As janelas sao comuns (movem-se para qualquer monitor); maximizar vira tela cheia no monitor atual,
// Esc sai da tela cheia e Alt+F4 fecha. O toque no totem chega aqui e e repassado ao painel.

const { app, BrowserWindow, ipcMain, screen, powerSaveBlocker } = require('electron');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const analise = require('./analise');

const VERSAO = require('../../package.json').version;
const RAIZ = app.isPackaged ? path.dirname(process.execPath) : path.resolve(__dirname, '..', '..');
const PASTA_CONTEUDO = path.join(RAIZ, 'conteudo');
const ARQ_CONFIG = path.join(RAIZ, 'config.json');
const ARQ_LOG = path.join(RAIZ, 'mundomedseg.log');
const ICONE = path.join(__dirname, '..', '..', 'assets', 'icone.ico');

const args = process.argv.slice(1);
const flag = (nome) => args.some((a) => a === `--${nome}` || a.startsWith(`--${nome}=`));
const valorFlag = (nome) => {
  const a = args.find((x) => x.startsWith(`--${nome}=`));
  return a ? a.slice(nome.length + 3) : null;
};
const SEM_CONFIG = flag('autoteste'); // o teste nao le nem grava posicoes

const CONFIG_PADRAO = {
  // volta ao menu + logo depois de tanto tempo sem toque (0 desliga)
  ociosidadeSegundos: 90,
  // duracao do zoom entre telas do totem
  transicaoMs: 1700,
  // duracao da troca de cartao no painel (saida do anterior / fade do fundo)
  painelTransicaoMs: 700,
  // anima cada cartao do painel em partes (foto, titulos, textos, icone). false = so fade
  painelAnimado: true,
  // esconde o cursor do mouse (padrao: visivel, para acompanhar os testes)
  ocultarCursor: false,
  // desenha um anel onde o mouse/dedo toca no totem
  mostrarToques: true,
  // posicao e estado de cada janela (gravado sozinho ao mover/maximizar)
  janelas: { totem: null, painel: null },
};

function log(...partes) {
  const linha = `[${new Date().toISOString()}] ${partes.join(' ')}`;
  console.log(linha);
  try { fs.appendFileSync(ARQ_LOG, linha + '\n'); } catch { /* sem permissao de escrita: segue sem log em arquivo */ }
}

function lerConfig() {
  let lida = {};
  if (!SEM_CONFIG) {
    try { lida = JSON.parse(fs.readFileSync(ARQ_CONFIG, 'utf8')); } catch { /* sem arquivo: usa o padrao */ }
  }
  return { ...CONFIG_PADRAO, ...lida, janelas: { ...CONFIG_PADRAO.janelas, ...(lida.janelas || {}) } };
}
function salvarConfig() {
  if (SEM_CONFIG) return;
  try { fs.writeFileSync(ARQ_CONFIG, JSON.stringify(config, null, 2), 'utf8'); } catch (e) { log('config nao salva:', e.message); }
}

let config;
const janelas = { totem: null, painel: null };
const estado = { painel: null }; // painel: caminho relativo da imagem ou null (logo)

if (!app.requestSingleInstanceLock()) app.quit();

// ---------- posicao das janelas ----------
function visivel(b) {
  if (!b) return false;
  const cx = b.x + b.width / 2; const cy = b.y + b.height / 2;
  return screen.getAllDisplays().some((d) => cx >= d.bounds.x && cx < d.bounds.x + d.bounds.width && cy >= d.bounds.y && cy < d.bounds.y + d.bounds.height);
}

// posicao inicial (primeira vez): totem no monitor principal, painel no segundo (ou ao lado, em 9:16)
function boundsPadrao(papel) {
  const todos = screen.getAllDisplays();
  const principal = screen.getPrimaryDisplay();
  const outro = todos.find((d) => d.id !== principal.id);
  if (papel === 'totem') {
    const wa = principal.workArea;
    const largura = Math.min(1100, wa.width - 40);
    return { x: wa.x + 20, y: wa.y + 20, width: largura, height: Math.round((largura * 9) / 16) + 40 };
  }
  if (outro) {
    const wa = outro.workArea;
    const altura = Math.min(wa.height - 80, 900);
    const largura = Math.round((altura * 9) / 16);
    return { x: wa.x + Math.round((wa.width - largura) / 2), y: wa.y + 20, width: largura, height: altura };
  }
  const wa = principal.workArea;
  const totemLargura = Math.min(1100, wa.width - 40);
  const altura = Math.min(wa.height - 40, 820);
  const largura = Math.round((altura * 9) / 16);
  return { x: Math.min(wa.x + 20 + totemLargura + 16, wa.x + wa.width - largura - 10), y: wa.y + 20, width: largura, height: altura };
}

let agendado = {};
function guardarJanela(papel, extra = {}) {
  clearTimeout(agendado[papel]);
  agendado[papel] = setTimeout(() => {
    const w = janelas[papel];
    if (!w || w.isDestroyed()) return;
    const atual = config.janelas[papel] || {};
    const novo = { ...atual, ...extra };
    if (!w.isFullScreen() && !w.isMinimized()) novo.bounds = w.getBounds();
    novo.telaCheia = w.isFullScreen();
    config.janelas[papel] = novo;
    salvarConfig();
  }, 400);
}

function criarJanela(papel) {
  const salvo = config.janelas[papel];
  const bounds = salvo && visivel(salvo.bounds) ? salvo.bounds : boundsPadrao(papel);
  const w = new BrowserWindow({
    ...bounds,
    show: false,
    frame: true,
    resizable: true,
    maximizable: true,
    fullscreenable: true,
    minWidth: 240,
    minHeight: 240,
    backgroundColor: '#000000',
    autoHideMenuBar: true,
    icon: fs.existsSync(ICONE) ? ICONE : undefined,
    title: papel === 'totem' ? 'Mundo Med+ Seg - Totem (touch)' : 'Mundo Med+ Seg - Painel LED',
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
  w.removeMenu();
  w.webContents.on('before-input-event', (ev, input) => atalho(ev, input, w));
  w.webContents.on('render-process-gone', (_e, d) => {
    log(`${papel}: processo de render caiu (${d.reason}); recarregando`);
    setTimeout(() => { if (!w.isDestroyed()) w.reload(); }, 1000);
  });
  w.webContents.on('console-message', (e) => {
    if (e.level === 'error' || e.level === 'warning') log(`${papel} console[${e.level}]: ${e.message}`);
  });
  w.on('unresponsive', () => log(`${papel}: janela sem resposta`));

  // maximizar = tela cheia no monitor onde a janela esta
  w.on('maximize', () => setImmediate(() => {
    if (w.isDestroyed()) return;
    w.unmaximize();
    w.setFullScreen(true);
  }));
  w.on('enter-full-screen', () => { w.setMenuBarVisibility(false); guardarJanela(papel); });
  w.on('leave-full-screen', () => guardarJanela(papel));
  w.on('resize', () => guardarJanela(papel));
  w.on('move', () => guardarJanela(papel));
  w.on('closed', () => { janelas[papel] = null; });

  w.loadFile(path.join(__dirname, '..', 'renderer', `${papel}.html`));
  w.once('ready-to-show', () => {
    w.show();
    if (salvo && salvo.telaCheia && !flag('janela')) w.setFullScreen(true);
  });
  w.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  w.webContents.on('will-navigate', (e) => e.preventDefault());
  return w;
}

function garantirVisiveis() {
  for (const papel of ['totem', 'painel']) {
    const w = janelas[papel];
    if (!w || w.isDestroyed() || w.isFullScreen()) continue;
    if (!visivel(w.getBounds())) w.setBounds(boundsPadrao(papel));
  }
}

function enviar(papel, canal, dados) {
  const w = janelas[papel];
  if (w && !w.isDestroyed() && !w.webContents.isLoading()) w.webContents.send(canal, dados);
}

function montarPainel() {
  const rel = estado.painel;
  let an = null;
  try { an = analise.analisar(PASTA_CONTEUDO, rel || logoDoPainel()); } catch (e) { log('analise falhou:', e.message); }
  return { imagem: rel, analise: an };
}
function logoDoPainel() {
  try { return JSON.parse(fs.readFileSync(path.join(PASTA_CONTEUDO, 'conteudo.json'), 'utf8')).painel.logo; } catch { return null; }
}
function atualizarPainel() { enviar('painel', 'painel:mostrar', montarPainel()); }

function reiniciarTudo() {
  estado.painel = null;
  atualizarPainel();
  enviar('totem', 'totem:reiniciar');
}

function atalho(ev, input, w) {
  if (input.type !== 'keyDown') return;
  const ctrlShift = input.control && input.shift;
  const k = input.key.toLowerCase();
  if (ctrlShift && k === 'q') { ev.preventDefault(); log('encerrado pelo atalho'); app.quit(); }
  else if (ctrlShift && k === 'r') { ev.preventDefault(); reiniciarTudo(); }
  else if (input.alt && input.key === 'F4') { ev.preventDefault(); log('Alt+F4'); app.quit(); }
  else if (input.key === 'Escape' && w.isFullScreen()) { ev.preventDefault(); w.setFullScreen(false); }
  else if (input.key === 'F11') { ev.preventDefault(); w.setFullScreen(!w.isFullScreen()); }
  else if (input.key === 'F12') { ev.preventDefault(); w.webContents.toggleDevTools(); }
}

// ---------- IPC ----------
ipcMain.handle('carregar', () => {
  const conteudo = JSON.parse(fs.readFileSync(path.join(PASTA_CONTEUDO, 'conteudo.json'), 'utf8'));
  let base = pathToFileURL(PASTA_CONTEUDO).href;
  if (!base.endsWith('/')) base += '/';
  return { conteudo, base, versao: VERSAO, config, estado };
});

ipcMain.on('navegar', (_e, msg) => {
  if (msg && Object.prototype.hasOwnProperty.call(msg, 'painel')) {
    estado.painel = typeof msg.painel === 'string' ? msg.painel : null;
    log('painel ->', estado.painel || 'logo');
    atualizarPainel();
  }
});
ipcMain.on('log', (_e, texto) => log('renderer:', String(texto).slice(0, 500)));
ipcMain.on('pronto', (_e, papel) => { if (papel === 'painel') atualizarPainel(); });

// aquece o cache de analise dos cartoes em segundo plano (uma imagem por vez, sem travar a interface)
function aquecerAnalises() {
  let lista = [];
  try {
    const c = JSON.parse(fs.readFileSync(path.join(PASTA_CONTEUDO, 'conteudo.json'), 'utf8'));
    lista = [c.painel.logo, ...c.categorias.flatMap((cat) => cat.areas.map((a) => a.painel))];
  } catch { return; }
  const proximo = () => {
    const rel = lista.shift();
    if (!rel) return;
    try { analise.analisar(PASTA_CONTEUDO, rel); } catch (e) { log('analise falhou:', rel, e.message); }
    setTimeout(proximo, 60);
  };
  setTimeout(proximo, 2500);
}

// ---------- inicio ----------
app.on('second-instance', () => {
  for (const w of Object.values(janelas)) if (w && !w.isDestroyed()) { if (w.isMinimized()) w.restore(); w.focus(); }
});
app.on('window-all-closed', () => app.quit());

app.whenReady().then(() => {
  config = lerConfig();
  log(`MundoMedSeg v${VERSAO} iniciando (${app.isPackaged ? 'empacotado' : 'desenvolvimento'}) conteudo=${PASTA_CONTEUDO}`);
  log('monitores:', screen.getAllDisplays().map((d) => `id=${d.id} ${d.bounds.width}x${d.bounds.height}@${d.bounds.x},${d.bounds.y} esc=${d.scaleFactor}`).join(' | '));
  if (!fs.existsSync(path.join(PASTA_CONTEUDO, 'conteudo.json'))) {
    log('ERRO: conteudo/conteudo.json nao encontrado. Rode "npm run gerar-conteudo".');
    app.exit(2);
    return;
  }
  powerSaveBlocker.start('prevent-display-sleep');
  janelas.totem = criarJanela('totem');
  janelas.painel = criarJanela('painel');
  screen.on('display-removed', garantirVisiveis);
  screen.on('display-metrics-changed', garantirVisiveis);
  aquecerAnalises();

  const pasta = valorFlag('autoteste');
  if (pasta) require('./autoteste').rodar({ app, janelas, pasta, log, screen });
});
