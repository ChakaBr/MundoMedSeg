// Dentro do Electron, window.mundo vem do preload. Fora dele (abrindo as paginas num navegador
// servindo a pasta do projeto) esta ponte imita a API usando BroadcastChannel - serve so para teste.
(function () {
  if (window.mundo) return;
  const canal = new BroadcastChannel('mundomedseg');
  let ultimoPainel = null;
  const ouvintes = { mostrar: [], reiniciar: [] };
  canal.onmessage = (ev) => {
    const m = ev.data;
    if (m.tipo === 'painel') { ultimoPainel = m.imagem; ouvintes.mostrar.forEach((f) => f(m.imagem)); }
    else if (m.tipo === 'reiniciar') ouvintes.reiniciar.forEach((f) => f());
    else if (m.tipo === 'pronto' && m.papel === 'painel') canal.postMessage({ tipo: 'painel', imagem: ultimoPainel });
  };
  window.mundo = {
    carregar: async () => {
      const url = new URL('../../conteudo/', document.baseURI);
      const conteudo = await (await fetch(new URL('conteudo.json', url))).json();
      return { conteudo, base: url.href, versao: 'web', config: { ocultarCursor: false, ociosidadeSegundos: 90, transicaoMs: 1000, painelTransicaoMs: 900, painelAjuste: 'contain' }, estado: { painel: ultimoPainel } };
    },
    navegar: (msg) => { if ('painel' in msg) { ultimoPainel = msg.painel; canal.postMessage({ tipo: 'painel', imagem: msg.painel }); } },
    pronto: (papel) => canal.postMessage({ tipo: 'pronto', papel }),
    log: (t) => console.log('[mundo]', t),
    aoMostrarNoPainel: (fn) => ouvintes.mostrar.push(fn),
    aoReiniciar: (fn) => ouvintes.reiniciar.push(fn),
  };
})();
