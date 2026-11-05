// Totem (tela touch): menu -> categoria (zoom) -> toque numa area envia a arte ao painel LED.
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
  let L, A; // largura/altura base das artes
  let cena = null; // cena atual {el, tipo, cat?, origem?, areaSel?}
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

  // ---------- geometria das areas ----------
  const areaDe = (f) => (f[2] - f[0]) * (f[3] - f[1]);
  const maiorForma = (area) => area.formas.reduce((m, f) => (areaDe(f) > areaDe(m) ? f : m));
  function origemEZoom(area) {
    const f = maiorForma(area);
    const cx = ((f[0] + f[2]) / 2 / L) * 100;
    const cy = ((f[1] + f[3]) / 2 / A) * 100;
    const larg = (f[2] - f[0]) / L;
    const zoom = Math.min(3.6, Math.max(2.2, 0.85 / larg));
    return { origem: `${cx.toFixed(2)}% ${cy.toFixed(2)}%`, zoom };
  }

  // ---------- construcao das cenas ----------
  function criarCena({ imagem, areas, aoTocar }) {
    const el = document.createElement('div');
    el.className = 'cena';
    const img = document.createElement('img');
    img.alt = ''; img.draggable = false;
    img.src = url(imagem);
    el.appendChild(img);

    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', `0 0 ${L} ${A}`);
    svg.setAttribute('preserveAspectRatio', 'none');
    for (const area of areas) {
      const g = document.createElementNS(NS, 'g');
      g.setAttribute('class', 'area');
      g.dataset.id = area.id;
      for (const f of area.formas) {
        const r = document.createElementNS(NS, 'rect');
        r.setAttribute('x', f[0]); r.setAttribute('y', f[1]);
        r.setAttribute('width', f[2] - f[0]); r.setAttribute('height', f[3] - f[1]);
        g.appendChild(r);
      }
      const soltar = () => g.classList.remove('pressionada');
      g.addEventListener('pointerdown', () => g.classList.add('pressionada'));
      g.addEventListener('pointerup', soltar);
      g.addEventListener('pointerleave', soltar);
      g.addEventListener('pointercancel', soltar);
      g.addEventListener('click', () => { soltar(); aoTocar(area, g); });
      svg.appendChild(g);
    }
    el.appendChild(svg);
    return el;
  }

  function cenaMenu() {
    const el = criarCena({
      imagem: C.menu.imagem,
      areas: C.menu.areas,
      aoTocar: (area) => entrarCategoria(area),
    });
    return { el, tipo: 'menu' };
  }

  function cenaCategoria(cat, origem, zoom) {
    const objeto = { tipo: 'categoria', cat, origem, zoom, areaSel: null, el: null };
    objeto.el = criarCena({
      imagem: cat.imagem,
      areas: cat.areas,
      aoTocar: (area, g) => escolherArea(objeto, area, g),
    });
    return objeto;
  }

  // ---------- transicao com zoom ----------
  // 'entrar': a cena que sai cresce ate estourar e a nova "emerge" do ponto tocado.
  // 'voltar': o inverso (a cena atual encolhe para o ponto e a anterior vem de um zoom grande).
  async function transicao(saindo, entrando, tipo, origem, zoom) {
    const dur = cfg.transicaoMs || 1000;
    saindo.el.style.transformOrigin = origem;
    entrando.el.style.transformOrigin = origem;
    entrando.el.style.zIndex = '2';
    saindo.el.style.zIndex = '1';
    entrando.el.style.opacity = '0';
    palco.appendChild(entrando.el);

    let kfSai; let kfEnt;
    if (tipo === 'entrar') {
      kfSai = [
        { transform: 'scale(1)', opacity: 1 },
        { transform: `scale(${(zoom * 0.6).toFixed(2)})`, opacity: 0.85, offset: 0.55 },
        { transform: `scale(${zoom})`, opacity: 0 },
      ];
      kfEnt = [
        { transform: 'scale(0.35)', opacity: 0 },
        { transform: 'scale(0.62)', opacity: 0.55, offset: 0.5 },
        { transform: 'scale(1)', opacity: 1 },
      ];
    } else {
      kfSai = [
        { transform: 'scale(1)', opacity: 1 },
        { transform: 'scale(0.62)', opacity: 0.55, offset: 0.5 },
        { transform: 'scale(0.35)', opacity: 0 },
      ];
      kfEnt = [
        { transform: `scale(${zoom})`, opacity: 0 },
        { transform: `scale(${(zoom * 0.6).toFixed(2)})`, opacity: 0.85, offset: 0.45 },
        { transform: 'scale(1)', opacity: 1 },
      ];
    }
    const opcoes = { duration: dur, easing: 'cubic-bezier(.55,.05,.25,1)', fill: 'both' };
    const a1 = saindo.el.animate(kfSai, opcoes);
    const a2 = entrando.el.animate(kfEnt, opcoes);
    await Promise.all([a1.finished, a2.finished]);
    entrando.el.style.opacity = '';
    entrando.el.style.zIndex = '';
    a2.cancel();
    saindo.el.remove();
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
      cat.areas.forEach((a) => precarregar(a.painel)); // aquece o painel (cache de disco/decodificacao)
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
    if (titulo) legenda.innerHTML = 'No painel: <b></b>';
    if (titulo) legenda.querySelector('b').textContent = titulo;
    legenda.classList.toggle('visivel', !!titulo);
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
    document.addEventListener('pointerdown', marcarAtividade, true);
    btnVoltar.addEventListener('click', voltarAoMenu);
    window.mundo.aoReiniciar(async () => { await reiniciar(); });

    await precarregar(C.menu.imagem);
    C.categorias.forEach((c) => precarregar(c.imagem));
    const inicial = cenaMenu();
    palco.appendChild(inicial.el);
    cena = inicial;
    window.mundo.navegar({ painel: null });
    marcarAtividade();
    window.mundo.log(`totem v${dados.versao} pronto: ${C.categorias.length} categorias`);
  }

  // gancho para o autoteste/depuracao
  window.__totem = {
    estado: () => ({ tipo: cena && cena.tipo, ocupado, cat: cena && cena.cat && cena.cat.id, sel: cena && cena.areaSel && cena.areaSel.id }),
    retanguloDa: (id) => {
      const g = palco.querySelector(`.area[data-id="${id}"]`);
      if (!g) return null;
      const m = g.querySelector('rect');
      const bb = m.getBoundingClientRect();
      return { x: bb.x + bb.width / 2, y: bb.y + bb.height / 2 };
    },
    voltar: () => btnVoltar.getBoundingClientRect().toJSON(),
  };

  iniciar().catch(relatar);
})();
