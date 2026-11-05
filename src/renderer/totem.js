// Totem (tela touch): menu -> categoria (mergulho com zoom) -> toque num tema envia a arte ao painel LED.
(function () {
  'use strict';
  const NS = 'http://www.w3.org/2000/svg';
  const palco = document.getElementById('palco');
  const btnVoltar = document.getElementById('voltar');
  const legenda = document.getElementById('legenda');
  const caixaErro = document.getElementById('erro');

  let C; // conteudo.json
  let cfg;
  let base;
  let L; let A; // largura/altura base das artes
  let cena = null; // cena atual {el, tipo, cat?, origem?, zoom?, areaSel?}
  let ocupado = false;
  let temporizador = null;
  const cache = new Map();

  function relatar(e) {
    const msg = e && e.stack ? e.stack : String(e);
    window.mundo.log('ERRO totem: ' + msg);
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
      cache.set(rel, img.decode().then(() => img).catch(() => img));
    }
    return cache.get(rel);
  }
  function el(tag, classe) { const e = document.createElement(tag); if (classe) e.className = classe; return e; }

  // ---------- geometria das areas ----------
  const areaDe = (f) => (f[2] - f[0]) * (f[3] - f[1]);
  const maiorForma = (area) => area.formas.reduce((m, f) => (areaDe(f) > areaDe(m) ? f : m));
  function origemEZoom(area) {
    const f = maiorForma(area);
    const cx = ((f[0] + f[2]) / 2 / L) * 100;
    const cy = ((f[1] + f[3]) / 2 / A) * 100;
    const larg = (f[2] - f[0]) / L;
    const zoom = Math.min(4.2, Math.max(2.6, 0.9 / larg));
    return { origem: `${cx.toFixed(2)}% ${cy.toFixed(2)}%`, zoom };
  }

  // ---------- construcao das cenas ----------
  function criarCena({ imagem, areas, aoTocar }) {
    const raiz = el('div', 'cena');
    const img = document.createElement('img');
    img.alt = ''; img.draggable = false;
    img.src = url(imagem);
    raiz.appendChild(img);

    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', `0 0 ${L} ${A}`);
    svg.setAttribute('preserveAspectRatio', 'none');
    for (const area of areas) {
      const g = document.createElementNS(NS, 'g');
      g.setAttribute('class', 'area' + (area.pilula ? ' pilula' : ''));
      g.dataset.id = area.id;
      for (const f of area.formas) {
        const r = document.createElementNS(NS, 'rect');
        r.setAttribute('x', f[0]); r.setAttribute('y', f[1]);
        r.setAttribute('width', f[2] - f[0]); r.setAttribute('height', f[3] - f[1]);
        g.appendChild(r);
      }
      if (area.pilula) { // botao visivel (acesso extra), ex.: "Conheca o HSX"
        const f = area.formas[0];
        const t = document.createElementNS(NS, 'text');
        t.setAttribute('x', (f[0] + f[2]) / 2); t.setAttribute('y', (f[1] + f[3]) / 2);
        t.textContent = area.pilula;
        g.appendChild(t);
      }
      const soltar = () => g.classList.remove('pressionada');
      g.addEventListener('pointerdown', () => g.classList.add('pressionada'));
      g.addEventListener('pointerup', soltar);
      g.addEventListener('pointerleave', soltar);
      g.addEventListener('pointercancel', soltar);
      g.addEventListener('click', () => { soltar(); aoTocar(area, g); });
      svg.appendChild(g);
    }
    raiz.appendChild(svg);
    return raiz;
  }

  function cenaMenu() {
    const el0 = criarCena({ imagem: C.menu.imagem, areas: C.menu.areas, aoTocar: (area) => entrarCategoria(area) });
    return { el: el0, tipo: 'menu' };
  }
  function cenaCategoria(cat, origem, zoom) {
    const objeto = { tipo: 'categoria', cat, origem, zoom, areaSel: null, el: null };
    objeto.el = criarCena({ imagem: cat.imagem, areas: cat.areas, aoTocar: (area, g) => escolherArea(objeto, area, g) });
    return objeto;
  }

  // ---------- respiracao suave da cena parada ----------
  function respirar(c) {
    if (!c.el.isConnected) return;
    c.el.style.transformOrigin = '50% 50%';
    c.respiro = c.el.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.018)' }],
      { duration: 22000, direction: 'alternate', iterations: Infinity, easing: 'ease-in-out' });
  }
  function escalaAtual(c) {
    const m = getComputedStyle(c.el).transform;
    const v = m && m !== 'none' ? parseFloat(m.slice(m.indexOf('(') + 1)) : 1;
    return Number.isFinite(v) && v > 0 ? v : 1;
  }

  // ---------- transicao: mergulhar no ambiente / sair dele ----------
  // entrar: a maquete se aproxima do ponto tocado em velocidade crescente (com rastro de movimento),
  //         um clarao e uma vinheta fecham a visao e o ambiente "se abre" a partir do mesmo ponto.
  // voltar: o ambiente recua para o ponto e a maquete vem de um zoom grande, desacelerando ate assentar.
  const SUAVE_SAI = 'cubic-bezier(.62,0,.9,.45)';
  const SUAVE_ENTRA = 'cubic-bezier(.12,.8,.25,1)';

  function rastros(c, qtd) {
    // copias da imagem com atraso: viram o "borrao de movimento radial" no pico da velocidade
    const img = c.el.querySelector('img');
    const lista = [];
    for (let i = 1; i <= qtd; i++) {
      const g = el('div', 'cena fantasma');
      g.appendChild(img.cloneNode(false));
      g.style.zIndex = c.el.style.zIndex;
      palco.insertBefore(g, c.el);
      lista.push(g);
    }
    return lista;
  }

  async function transicao(saindo, entrando, tipo, origem, zoom) {
    const D = cfg.transicaoMs || 1700;
    const Z = zoom;
    const e0 = escalaAtual(saindo);
    saindo.respiro && saindo.respiro.cancel();
    [saindo.el, entrando.el].forEach((x) => { x.style.transformOrigin = origem; });
    saindo.el.style.zIndex = '1';
    entrando.el.style.zIndex = '2';
    entrando.el.style.opacity = '0';
    palco.appendChild(entrando.el);

    const vinheta = el('div', 'vinheta'); vinheta.style.background = `radial-gradient(circle at ${origem}, transparent 22%, rgba(0,0,0,.9) 100%)`;
    const brilho = el('div', 'brilho'); brilho.style.background = `radial-gradient(circle at ${origem}, rgba(255,214,160,.95) 0%, rgba(255,120,20,.55) 16%, rgba(255,106,0,0) 52%)`;
    palco.append(vinheta, brilho);

    const anims = [];
    const anima = (alvo, kf, op) => { const a = alvo.animate(kf, { fill: 'both', ...op }); anims.push(a); return a; };
    let fantasmas = [];

    if (tipo === 'entrar') {
      const dSai = D * 0.72;
      const kfSai = [
        { transform: `scale(${e0})`, opacity: 1, filter: 'brightness(1) blur(0px)' },
        { opacity: 1, offset: 0.55 },
        { transform: `scale(${Z})`, opacity: 0, filter: 'brightness(1.6) blur(6px)' },
      ];
      anima(saindo.el, kfSai, { duration: dSai, easing: SUAVE_SAI });
      fantasmas = rastros(saindo, 3);
      fantasmas.forEach((g, i) => {
        g.style.transformOrigin = origem;
        anima(g, kfSai.map((k) => (k.opacity === 1 ? { ...k, opacity: 0.4 / (i + 1) } : k)), { duration: dSai, delay: 55 * (i + 1), easing: SUAVE_SAI });
      });
      anima(entrando.el, [
        // chega "de dentro": maior que o normal, desfocada e clara, e desacelera ate assentar
        { transform: 'scale(1.3)', opacity: 0, filter: 'blur(9px) brightness(1.6)' },
        { opacity: 1, filter: 'blur(3px) brightness(1.25)', offset: 0.3 },
        { transform: 'scale(1)', opacity: 1, filter: 'brightness(1) blur(0px)' },
      ], { duration: D * 0.6, delay: D * 0.4, easing: SUAVE_ENTRA });
    } else {
      anima(saindo.el, [
        { transform: `scale(${e0})`, opacity: 1, filter: 'brightness(1) blur(0px)' },
        { opacity: 1, offset: 0.3 },
        { transform: 'scale(.42)', opacity: 0, filter: 'brightness(1.4) blur(6px)' },
      ], { duration: D * 0.66, easing: 'cubic-bezier(.45,0,.3,1)' });
      const kfEnt = [
        { transform: `scale(${(Z * 0.9).toFixed(2)})`, opacity: 0, filter: 'blur(7px) brightness(1.5)' },
        { opacity: 1, filter: 'blur(4px) brightness(1.25)', offset: 0.3 },
        { transform: 'scale(1)', opacity: 1, filter: 'blur(0px) brightness(1)' },
      ];
      anima(entrando.el, kfEnt, { duration: D * 0.78, delay: D * 0.22, easing: 'cubic-bezier(.16,.78,.26,1)' });
      fantasmas = rastros(entrando, 2);
      fantasmas.forEach((g, i) => {
        g.style.transformOrigin = origem;
        anima(g, kfEnt.map((k) => (k.opacity === 1 ? { ...k, opacity: 0.28 / (i + 1) } : k)), { duration: D * 0.78, delay: D * 0.22 + 60 * (i + 1), easing: 'cubic-bezier(.16,.78,.26,1)' });
      });
    }
    const pico = tipo === 'entrar' ? 0.5 : 0.35;
    anima(vinheta, [{ opacity: 0 }, { opacity: tipo === 'entrar' ? 0.95 : 0.8, offset: pico }, { opacity: 0 }], { duration: D, easing: 'ease-in-out' });
    anima(brilho, [{ opacity: 0, transform: 'scale(.5)' }, { opacity: tipo === 'entrar' ? 0.8 : 0.45, transform: 'scale(1)', offset: pico + 0.08 }, { opacity: 0, transform: 'scale(1.9)' }],
      { duration: D, easing: 'ease-out' });

    await Promise.all(anims.map((a) => a.finished));
    entrando.el.style.opacity = '';
    entrando.el.style.zIndex = '';
    anims.forEach((a) => a.cancel());
    [vinheta, brilho, ...fantasmas].forEach((x) => x.remove());
    saindo.el.remove();
    respirar(entrando);
  }

  // ---------- navegacao ----------
  async function entrarCategoria(areaMenu) {
    if (ocupado) return;
    const cat = C.categorias.find((c) => c.id === areaMenu.destino);
    if (!cat) return relatar(`categoria nao encontrada: ${areaMenu.destino}`);
    ocupado = true;
    try {
      const { origem, zoom } = origemEZoom(areaMenu);
      await precarregar(cat.imagem);
      const nova = cenaCategoria(cat, origem, zoom);
      mostrarVoltar(true);
      await transicao(cena, nova, 'entrar', origem, zoom);
      cena = nova;
      window.mundo.log(`totem: categoria ${cat.id}`);
    } finally { ocupado = false; }
    marcarAtividade();
  }

  async function voltarAoMenu() {
    if (ocupado || !cena || cena.tipo !== 'categoria') return;
    ocupado = true;
    try {
      const antiga = cena;
      mostrarVoltar(false);
      mostrarLegenda(null);
      window.mundo.navegar({ painel: null });
      await precarregar(C.menu.imagem);
      const menu = cenaMenu();
      await transicao(antiga, menu, 'voltar', antiga.origem, antiga.zoom);
      cena = menu;
      window.mundo.log('totem: menu');
    } finally { ocupado = false; }
    marcarAtividade();
  }

  function escolherArea(objeto, area, g) {
    if (ocupado) return;
    marcarAtividade();
    objeto.el.querySelectorAll('.area.selecionada').forEach((x) => x.classList.remove('selecionada'));
    g.classList.add('selecionada');
    objeto.areaSel = area;
    mostrarLegenda(area.titulo);
    window.mundo.navegar({ painel: area.painel });
    window.mundo.log(`totem: ${objeto.cat.id} / ${area.id} -> painel`);
  }

  function mostrarVoltar(sim) { btnVoltar.classList.toggle('visivel', sim); }
  function mostrarLegenda(titulo) {
    if (titulo) { legenda.innerHTML = 'No painel: <b></b>'; legenda.querySelector('b').textContent = titulo; }
    legenda.classList.toggle('visivel', !!titulo);
  }

  // ---------- anel onde o mouse/dedo toca (ajuda nos testes) ----------
  function marcarToque(ev) {
    if (!cfg.mostrarToques) return;
    const t = el('div', 'toque');
    t.style.left = ev.clientX + 'px'; t.style.top = ev.clientY + 'px';
    document.body.appendChild(t);
    t.addEventListener('animationend', () => t.remove());
    setTimeout(() => t.remove(), 1500);
  }

  // ---------- ociosidade: sem toque, volta ao menu e ao logo ----------
  function marcarAtividade() {
    clearTimeout(temporizador);
    const s = cfg && cfg.ociosidadeSegundos;
    if (!s || s <= 0) return;
    temporizador = setTimeout(reiniciar, s * 1000);
  }
  async function reiniciar() {
    if (cena && cena.tipo === 'categoria') {
      if (ocupado) { setTimeout(reiniciar, 500); return; }
      await voltarAoMenu();
    } else {
      window.mundo.navegar({ painel: null });
    }
  }

  // ---------- inicio ----------
  async function iniciar() {
    const dados = await window.mundo.carregar();
    C = dados.conteudo; cfg = dados.config; base = dados.base;
    L = C.base.largura; A = C.base.altura;
    document.body.classList.toggle('sem-cursor', !!cfg.ocultarCursor);
    document.addEventListener('contextmenu', (e) => e.preventDefault());
    document.addEventListener('pointerdown', (e) => { marcarAtividade(); marcarToque(e); }, true);
    btnVoltar.addEventListener('click', voltarAoMenu);
    window.mundo.aoReiniciar(async () => { await reiniciar(); });

    await precarregar(C.menu.imagem);
    C.categorias.forEach((c) => precarregar(c.imagem));
    const inicial = cenaMenu();
    palco.appendChild(inicial.el);
    cena = inicial;
    respirar(inicial);
    window.mundo.navegar({ painel: null });
    marcarAtividade();
    window.mundo.log(`totem v${dados.versao} pronto: ${C.categorias.length} categorias`);
  }

  // gancho para o autoteste/depuracao
  window.__totem = {
    estado: () => ({ tipo: cena && cena.tipo, ocupado, cat: cena && cena.cat && cena.cat.id, sel: cena && cena.areaSel && cena.areaSel.id }),
    retanguloDa: (id) => {
      const g = palco.querySelector(`.cena:not(.fantasma) .area[data-id="${id}"]`);
      if (!g) return null;
      const bb = g.querySelector('rect').getBoundingClientRect();
      return { x: bb.x + bb.width / 2, y: bb.y + bb.height / 2 };
    },
    voltar: () => btnVoltar.getBoundingClientRect().toJSON(),
  };

  iniciar().catch(relatar);
})();
