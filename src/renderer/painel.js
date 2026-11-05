// Painel (TV LED vertical): so exibe. Mostra o logo ate o totem pedir um cartao; cada cartao entra
// em partes (foto, titulos, textos, icone) e a tela e preenchida com a cor de fundo da propria arte.
(function () {
  'use strict';
  const raiz = document.getElementById('painel');
  const caixaErro = document.getElementById('erro');
  let C; let cfg; let base;
  let atual = null; // {el, rel, w, h, cores, fundo, cartao}
  let pedido = 0; // descarta respostas antigas se o totem trocar rapido
  const cache = new Map();

  const SAIDA = 'cubic-bezier(.5,0,.75,0)';
  const ENTRADA = 'cubic-bezier(.16,.84,.3,1)';

  function relatar(e) {
    const msg = e && e.stack ? e.stack : String(e);
    window.mundo.log('ERRO painel: ' + msg);
    caixaErro.textContent = msg; caixaErro.style.display = 'block';
    setTimeout(() => { caixaErro.style.display = 'none'; }, 8000);
  }
  window.addEventListener('error', (e) => relatar(e.error || e.message));
  window.addEventListener('unhandledrejection', (e) => relatar(e.reason));

  const url = (rel) => base + rel.split('/').map(encodeURIComponent).join('/');
  function precarregar(rel) {
    if (!cache.has(rel)) {
      const img = new Image();
      img.src = url(rel);
      cache.set(rel, img.decode().then(() => ({ w: img.naturalWidth, h: img.naturalHeight })).catch(() => ({ w: 1086, h: 1448 })));
    }
    return cache.get(rel);
  }

  // ---------- layout: cartao inteiro dentro da tela; o que sobra e preenchido com a borda da propria arte ----------
  // A faixa de 3 linhas (ou colunas) da borda da imagem e esticada ate a borda da tela e suavizada:
  // fundo branco continua branco; foto escura na base continua escura, sem "tarja".
  const LINHAS_BORDA = 3;
  function posicionarBorda(b, lado, cw, ch, lw, lh, s) {
    const vertical = lado === 'topo' || lado === 'base';
    const gap = vertical ? (ch - lh) / 2 : (cw - lw) / 2;
    const k = gap / (LINHAS_BORDA * s);
    const raio = Math.max(8, Math.round((vertical ? cw : ch) * 0.02));
    b.div.style.display = 'block';
    b.img.style.filter = `blur(${raio}px)`;
    if (vertical) {
      const larg = lw * 1.12;
      Object.assign(b.div.style, { left: '0px', width: cw + 'px', height: gap + 'px', top: lado === 'topo' ? '0px' : ch - gap + 'px' });
      Object.assign(b.img.style, { width: larg + 'px', height: lh + 'px', left: (cw - larg) / 2 + 'px', top: lado === 'topo' ? '0px' : 'auto', bottom: lado === 'base' ? '0px' : 'auto', right: 'auto',
        transformOrigin: lado === 'topo' ? '0 0' : '0 100%', transform: `scale(1, ${k})` });
    } else {
      const alt = lh * 1.12;
      Object.assign(b.div.style, { top: '0px', height: ch + 'px', width: gap + 'px', left: lado === 'esq' ? '0px' : cw - gap + 'px' });
      Object.assign(b.img.style, { height: alt + 'px', width: lw + 'px', top: (ch - alt) / 2 + 'px', left: lado === 'esq' ? '0px' : 'auto', right: lado === 'dir' ? '0px' : 'auto', bottom: 'auto',
        transformOrigin: lado === 'esq' ? '0 0' : '100% 0', transform: `scale(${k}, 1)` });
    }
  }
  function layout(cena) {
    const cw = window.innerWidth; const ch = window.innerHeight;
    const s = Math.min(cw / cena.w, ch / cena.h);
    const lw = cena.w * s; const lh = cena.h * s;
    Object.assign(cena.cartao.style, { width: lw + 'px', height: lh + 'px', left: (cw - lw) / 2 + 'px', top: (ch - lh) / 2 + 'px', background: cena.cores.topo });
    const c = cena.cores;
    const sobraVertical = cw / ch < cena.w / cena.h;
    cena.fundo.style.background = sobraVertical
      ? `linear-gradient(to bottom, ${c.topo} 0 50%, ${c.base} 50% 100%)`
      : `linear-gradient(to right, ${c.esq} 0 50%, ${c.dir} 50% 100%)`;
    for (const b of Object.values(cena.bordas)) b.div.style.display = 'none';
    const gapV = (ch - lh) / 2; const gapH = (cw - lw) / 2;
    if (sobraVertical && gapV > 1) { posicionarBorda(cena.bordas.topo, 'topo', cw, ch, lw, lh, s); posicionarBorda(cena.bordas.base, 'base', cw, ch, lw, lh, s); }
    else if (!sobraVertical && gapH > 1) { posicionarBorda(cena.bordas.esq, 'esq', cw, ch, lw, lh, s); posicionarBorda(cena.bordas.dir, 'dir', cw, ch, lw, lh, s); }
  }
  window.addEventListener('resize', () => { if (atual) layout(atual); });

  // ---------- montagem do cartao ----------
  function criarParte(rel, w, h, r) {
    const [x1, y1, x2, y2] = r;
    const parte = document.createElement('div');
    parte.className = 'parte';
    Object.assign(parte.style, { left: (x1 / w) * 100 + '%', top: (y1 / h) * 100 + '%', width: ((x2 - x1) / w) * 100 + '%', height: ((y2 - y1) / h) * 100 + '%' });
    const img = document.createElement('img');
    img.alt = ''; img.draggable = false; img.src = url(rel);
    Object.assign(img.style, {
      width: (w / (x2 - x1)) * 100 + '%',
      left: -(x1 / (x2 - x1)) * 100 + '%',
      top: -(y1 / (y2 - y1)) * 100 + '%',
    });
    parte.appendChild(img);
    return { parte, img };
  }

  function criarCena(rel, dim, an, ehLogo) {
    const w = (an && an.w) || dim.w; const h = (an && an.h) || dim.h;
    const cores = (an && an.cores) || (ehLogo ? { topo: '#000', base: '#000', esq: '#000', dir: '#000' } : { topo: '#fff', base: '#fff', esq: '#fff', dir: '#fff' });
    const el = document.createElement('div'); el.className = 'cena';
    const fundo = document.createElement('div'); fundo.className = 'fundo';
    const bordas = {};
    for (const lado of ['topo', 'base', 'esq', 'dir']) {
      const div = document.createElement('div'); div.className = 'borda';
      const im = document.createElement('img'); im.alt = ''; im.draggable = false; im.src = url(rel);
      div.appendChild(im); fundo.appendChild(div);
      bordas[lado] = { div, img: im };
    }
    const cartao = document.createElement('div'); cartao.className = 'cartao';
    el.append(fundo, cartao);
    const cena = { el, rel, w, h, cores, fundo, bordas, cartao, partes: [], ehLogo };

    const fatiar = !ehLogo && cfg.painelAnimado && an && an.partes && an.partes.length > 0;
    if (fatiar) {
      for (const p of an.partes) {
        const { parte, img } = criarParte(rel, w, h, p.r);
        cartao.appendChild(parte);
        cena.partes.push({ ...p, el: parte, img });
      }
    } else {
      const { parte, img } = criarParte(rel, w, h, [0, 0, w, h]);
      cartao.appendChild(parte);
      cena.partes.push({ t: 'unica', r: [0, 0, w, h], x: [0, w], el: parte, img });
    }
    layout(cena);
    return cena;
  }

  // ---------- animacoes de entrada ----------
  function varredura(p, atraso, dur) {
    // "escreve" a faixa da esquerda para a direita, comecando onde o texto comeca
    const larg = p.r[2] - p.r[0];
    const ini = Math.max(0, Math.min(100, ((p.x[0] - p.r[0]) / larg) * 100));
    return p.el.animate([
      { clipPath: `inset(0 ${100 - ini}% 0 0)`, opacity: 0, transform: 'translateX(-2.5%)' },
      { opacity: 1, offset: 0.25 },
      { clipPath: 'inset(0 0% 0 0)', opacity: 1, transform: 'translateX(0)' },
    ], { duration: dur, delay: atraso, easing: ENTRADA, fill: 'both' });
  }

  function animarEntrada(cena, inicio) {
    let fim = inicio;
    const marca = (d) => { if (d > fim) fim = d; };

    if (cena.ehLogo || cena.partes[0].t === 'unica') {
      const p = cena.partes[0];
      p.el.animate([{ opacity: 0, transform: 'scale(1.08)' }, { opacity: 1, transform: 'scale(1)' }],
        { duration: 1500, delay: inicio, easing: ENTRADA, fill: 'both' });
      if (cena.ehLogo) {
        // o logo "respira" enquanto espera alguem tocar no totem
        p.img.animate([{ transform: 'scale(1)', filter: 'brightness(1)' }, { transform: 'scale(1.04)', filter: 'brightness(1.1)' }],
          { duration: 7000, delay: inicio + 1500, direction: 'alternate', iterations: Infinity, easing: 'ease-in-out', fill: 'forwards' });
      }
      marca(inicio + 1500);
      return fim;
    }

    const fotos = cena.partes.filter((p) => p.t === 'foto');
    const titulos = cena.partes.filter((p) => p.t === 'titulo');
    const textos = cena.partes.filter((p) => p.t === 'texto');
    const icones = cena.partes.filter((p) => p.t === 'icone');

    if (!fotos.length) {
      // cartao so de texto: de cima para baixo, uma faixa por vez
      const ordem = cena.partes.filter((p) => p.t !== 'icone');
      const passo = Math.min(210, 1700 / Math.max(1, ordem.length));
      ordem.forEach((p, i) => { const d = inicio + 150 + i * passo; varredura(p, d, p.t === 'titulo' ? 800 : 600); marca(d + 800); });
      icones.forEach((p) => { p.el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 700, delay: inicio + 150, fill: 'both' }); });
      return fim;
    }

    // 1) a imagem: abre do centro para as bordas, vindo de um zoom e com foco
    fotos.forEach((p) => {
      p.el.animate([
        { opacity: 0, clipPath: 'inset(47% 0 47% 0)' },
        { opacity: 1, clipPath: 'inset(0% 0 0% 0)' },
      ], { duration: 1100, delay: inicio, easing: ENTRADA, fill: 'both' });
      p.img.animate([
        { transform: 'scale(1.25)', filter: 'blur(12px) brightness(1.25)' },
        { transform: 'scale(1)', filter: 'blur(0px) brightness(1)' },
      ], { duration: 1600, delay: inicio, easing: ENTRADA, fill: 'both' });
      // depois de assentar, a foto respira devagar
      p.img.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.05)' }],
        { duration: 15000, delay: inicio + 1600, direction: 'alternate', iterations: Infinity, easing: 'ease-in-out', fill: 'forwards' });
      marca(inicio + 1600);
    });

    // 2) depois os titulos, 3) os textos linha a linha, 4) icone e fios decorativos desenhados de cima para baixo
    let t = inicio + 550;
    titulos.forEach((p, i) => { const d = t + i * 190; varredura(p, d, 800); marca(d + 800); });
    t += titulos.length * 190 + 200;
    const passoTexto = Math.min(110, 900 / Math.max(1, textos.length));
    textos.forEach((p, i) => { const d = t + i * passoTexto; varredura(p, d, 600); marca(d + 600); });
    const dIcone = inicio + 750 + (titulos.length ? 190 : 0);
    icones.forEach((p) => {
      p.el.animate([{ opacity: 0, clipPath: 'inset(0 0 100% 0)' }, { opacity: 1, clipPath: 'inset(0 0 0% 0)' }],
        { duration: 1100, delay: dIcone, easing: ENTRADA, fill: 'both' });
      p.img.animate([{ transform: 'scale(.9)' }, { transform: 'scale(1)' }],
        { duration: 1100, delay: dIcone, easing: ENTRADA, fill: 'both' });
      marca(dIcone + 1100);
    });
    return fim;
  }

  // ---------- troca de cena ----------
  async function mostrar(msg) {
    const rel = (msg && msg.imagem) || C.painel.logo;
    if (atual && atual.rel === rel) return;
    const meu = ++pedido;
    const dim = await precarregar(rel);
    if (meu !== pedido) return; // chegou um pedido mais novo enquanto carregava

    const ehLogo = !(msg && msg.imagem);
    const nova = criarCena(rel, dim, msg && msg.analise, ehLogo);
    const velha = atual;
    nova.el.style.zIndex = '2';
    raiz.appendChild(nova.el);
    atual = nova;

    const dur = cfg.painelTransicaoMs || 700;
    // o fundo novo cobre o antigo; o cartao antigo recua e some enquanto o novo se monta
    // o fundo novo se abre em circulo a partir do centro (sem passar por cinza) e cobre o antigo
    const fundoNovo = nova.fundo.animate([{ clipPath: 'circle(0% at 50% 52%)' }, { clipPath: 'circle(150% at 50% 52%)' }],
      { duration: Math.round(dur * 1.15), easing: 'cubic-bezier(.45,0,.2,1)', fill: 'both' });
    const saida = velha ? velha.cartao.animate([
      { opacity: 1, transform: 'scale(1)' },
      { opacity: 0, transform: 'scale(.94)' },
    ], { duration: Math.round(dur * 0.65), easing: SAIDA, fill: 'both' }) : null;
    const fim = animarEntrada(nova, velha ? Math.round(dur * 0.45) : 100);
    nova.fimMs = fim;
    nova.iniciouEm = performance.now();

    await fundoNovo.finished;
    if (meu !== pedido) return; // outra troca assumiu: ela limpa as cenas
    fundoNovo.cancel();
    if (saida) saida.cancel();
    nova.el.style.zIndex = '';
    [...raiz.children].forEach((c) => { if (c !== nova.el) c.remove(); });
  }

  async function iniciar() {
    const dados = await window.mundo.carregar();
    C = dados.conteudo; cfg = dados.config; base = dados.base;
    document.body.classList.toggle('sem-cursor', !!cfg.ocultarCursor);
    window.mundo.aoMostrarNoPainel((msg) => mostrar(msg).catch(relatar));
    window.mundo.pronto('painel'); // o principal responde com o estado atual (logo + analise)
    window.mundo.log(`painel v${dados.versao} pronto`);
    setTimeout(() => C.categorias.forEach((c) => c.areas.forEach((a) => precarregar(a.painel))), 3000);
  }

  window.__painel = {
    atual: () => atual && atual.rel,
    partes: () => (atual ? atual.partes.map((p) => p.t) : []),
    terminouEm: () => (atual && atual.fimMs ? atual.fimMs : 0),
    cena: () => atual,
  };
  iniciar().catch(relatar);
})();
