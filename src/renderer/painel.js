// Painel de LED: so exibe. Mostra o logo ate o totem pedir outra arte; troca com fade + leve zoom.
(function () {
  'use strict';
  const raiz = document.getElementById('painel');
  const caixaErro = document.getElementById('erro');
  let C; let cfg; let base;
  let atual = null; // {el, rel}
  let pedido = 0; // descarta respostas antigas se o totem trocar rapido
  const cache = new Map();

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
      cache.set(rel, img.decode().then(() => true).catch(() => false));
    }
    return cache.get(rel);
  }

  function criarCamada(rel) {
    const el = document.createElement('div');
    el.className = 'camada' + (cfg.painelAjuste === 'cover' ? ' cobrir' : '');
    const fundo = document.createElement('img'); fundo.className = 'fundo'; fundo.alt = ''; fundo.src = url(rel);
    const frente = document.createElement('img'); frente.className = 'frente'; frente.alt = ''; frente.src = url(rel);
    el.append(fundo, frente);
    return el;
  }

  async function mostrar(rel) {
    const alvo = rel || C.painel.logo;
    if (atual && atual.rel === alvo) return;
    const meu = ++pedido;
    await precarregar(alvo);
    if (meu !== pedido) return; // chegou um pedido mais novo enquanto carregava

    const nova = { el: criarCamada(alvo), rel: alvo };
    const velha = atual;
    const dur = cfg.painelTransicaoMs || 900;
    nova.el.style.opacity = '0';
    nova.el.style.zIndex = '2';
    raiz.appendChild(nova.el);
    atual = nova;

    const opc = { duration: dur, easing: 'cubic-bezier(.4,0,.2,1)', fill: 'both' };
    const entra = nova.el.animate([
      { opacity: 0, transform: 'scale(1.07)' },
      { opacity: 1, transform: 'scale(1)' },
    ], opc);
    const sai = velha ? velha.el.animate([
      { opacity: 1, transform: 'scale(1)' },
      { opacity: 0, transform: 'scale(.94)' },
    ], opc) : null;
    await entra.finished;
    if (meu !== pedido) return; // outra troca assumiu: ela limpa as camadas
    nova.el.style.opacity = ''; nova.el.style.zIndex = '';
    entra.cancel();
    if (sai) { sai.cancel(); }
    // remove tudo o que nao for a camada atual (inclui camadas de pedidos interrompidos)
    [...raiz.children].forEach((c) => { if (c !== nova.el) c.remove(); });
  }

  async function iniciar() {
    const dados = await window.mundo.carregar();
    C = dados.conteudo; cfg = dados.config; base = dados.base;
    // aquece as imagens do painel em segundo plano, logo depois de mostrar o logo
    atual = { el: criarCamada(C.painel.logo), rel: C.painel.logo };
    await precarregar(C.painel.logo);
    raiz.appendChild(atual.el);
    window.mundo.aoMostrarNoPainel((rel) => mostrar(rel).catch(relatar));
    window.mundo.pronto('painel');
    window.mundo.log(`painel v${dados.versao} pronto`);
    setTimeout(() => C.categorias.forEach((c) => c.areas.forEach((a) => precarregar(a.painel))), 3000);
  }

  window.__painel = { atual: () => atual && atual.rel };
  iniciar().catch(relatar);
})();
