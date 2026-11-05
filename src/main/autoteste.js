// Teste de ponta a ponta (npm run testar): abre as duas janelas, clica de verdade no totem
// (eventos de entrada reais), confere o painel e salva capturas de tela.
const fs = require('fs');
const path = require('path');

const espera = (ms) => new Promise((r) => setTimeout(r, ms));

async function rodar({ app, janelas, pasta, log }) {
  fs.mkdirSync(pasta, { recursive: true });
  const totem = janelas.totem.webContents;
  const painel = janelas.painel.webContents;
  const resultados = [];
  const confere = (nome, ok, detalhe = '') => {
    resultados.push({ nome, ok: !!ok, detalhe: String(detalhe) });
    log(`TESTE ${ok ? 'OK ' : 'FALHOU'} ${nome} ${detalhe}`);
  };
  const foto = async (nome, quais = ['totem', 'painel']) => {
    for (const papel of quais) {
      const img = await (papel === 'totem' ? totem : painel).capturePage();
      fs.writeFileSync(path.join(pasta, `${nome}-${papel}.png`), img.toPNG());
    }
  };
  const js = (wc, codigo) => wc.executeJavaScript(codigo);
  const clicar = async (x, y) => {
    x = Math.round(x); y = Math.round(y);
    totem.sendInputEvent({ type: 'mouseMove', x, y });
    totem.sendInputEvent({ type: 'mouseDown', x, y, button: 'left', clickCount: 1 });
    await espera(60);
    totem.sendInputEvent({ type: 'mouseUp', x, y, button: 'left', clickCount: 1 });
  };
  const esperarCondicao = async (codigo, wc, predicado, limite = 6000) => {
    const t0 = Date.now();
    while (Date.now() - t0 < limite) {
      const v = await js(wc, codigo);
      if (predicado(v)) return v;
      await espera(100);
    }
    return js(wc, codigo);
  };
  const livre = (e) => e.tipo && !e.ocupado;
  // pausa todas as animacoes da pagina e fotografa cada instante exato (ms)
  const quadros = async (wc, papel, prefixo, instantes) => {
    await js(wc, 'document.getAnimations().forEach((a) => a.pause())');
    for (const t of instantes) {
      await js(wc, `document.getAnimations().forEach((a) => { a.currentTime = ${t}; })`);
      await espera(120);
      const img = await wc.capturePage();
      fs.writeFileSync(path.join(pasta, `${prefixo}-${String(t).padStart(5, '0')}-${papel}.png`), img.toPNG());
    }
    await js(wc, 'document.getAnimations().forEach((a) => { a.currentTime = 20000; a.play(); })');
  };

  try {
    // 1) abertura
    await esperarCondicao('!!window.__totem && __totem.estado().tipo', totem, Boolean, 10000);
    await esperarCondicao('!!window.__painel && __painel.atual()', painel, Boolean, 10000);
    await espera(2500);
    await foto('01-abertura');
    confere('totem abre no menu', (await js(totem, '__totem.estado().tipo')) === 'menu');
    confere('painel abre no logo', /entrada-logo/.test(await js(painel, '__painel.atual()')));
    confere('janelas abrem em modo janela (nao tela cheia)', !janelas.totem.isFullScreen() && !janelas.painel.isFullScreen());
    confere('janelas movem e redimensionam', janelas.totem.isResizable() && janelas.totem.isMaximizable() && janelas.painel.isResizable());
    confere('cursor do mouse visivel nas duas janelas',
      (await js(totem, 'getComputedStyle(document.body).cursor')) !== 'none' && (await js(painel, 'getComputedStyle(document.body).cursor')) !== 'none');

    // 2) toca em Cultura e Pertencimento: mergulho em varios quadros
    const p1 = await js(totem, '__totem.retanguloDa("cultura-pertencimento")');
    await clicar(p1.x, p1.y);
    await espera(80);
    confere('anel de toque aparece no totem', (await js(totem, 'document.querySelectorAll(".toque").length')) > 0);
    for (const [ms, nome] of [[250, 'a'], [350, 'b'], [350, 'c'], [350, 'd']]) { await espera(ms); await foto(`02-mergulho-${nome}`, ['totem']); }
    const est = await esperarCondicao('__totem.estado()', totem, livre, 5000);
    await espera(300); await foto('03-categoria');
    confere('toque no menu abre a categoria', est.tipo === 'categoria' && est.cat === 'cultura-pertencimento', JSON.stringify(est));
    confere('painel continua no logo', /entrada-logo/.test(await js(painel, '__painel.atual()')));

    // 3) toca em Reconhecimento: cartao entra em partes no painel
    const p2 = await js(totem, '__totem.retanguloDa("reconhecimento")');
    await clicar(p2.x, p2.y);
    const rel = await esperarCondicao('__painel.atual()', painel, (v) => /reconhecimento/.test(v), 4000);
    confere('painel mostra Reconhecimento', /reconhecimento/.test(rel), rel);
    const partes = await js(painel, '__painel.partes()');
    confere('cartao dividido em partes (foto, titulo, texto, icone)',
      ['foto', 'titulo', 'texto', 'icone'].every((t) => partes.includes(t)), partes.join(','));
    let anterior = 0;
    for (const [ms, nome] of [[300, 'a'], [450, 'b'], [450, 'c'], [600, 'd'], [900, 'e']]) {
      await espera(ms); await foto(`04-animacao-${nome}`, ['painel']); anterior += ms;
    }
    await foto('04-reconhecimento');
    confere('totem marca a area escolhida', (await js(totem, '__totem.estado().sel')) === 'reconhecimento');
    const destaque = await js(totem, `(() => { const r = [...document.querySelectorAll('.area[data-id="reconhecimento"] rect')].map((x) => getComputedStyle(x).stroke); return { rotulo: r[0], resto: r.slice(1), legenda: !!document.getElementById('legenda') }; })()`);
    confere('so o nome fica selecionado (resto da area sem destaque) e sem legenda', /255/.test(destaque.rotulo) && destaque.resto.every((v) => !/255/.test(v)) && !destaque.legenda, JSON.stringify(destaque));
    const cena = await js(painel, `(() => { const c = document.querySelector('.cartao').getBoundingClientRect(); return {cw: c.width, ww: innerWidth, ch: c.height, wh: innerHeight, fundo: document.querySelector('.fundo').style.background}; })()`);
    confere('cartao centralizado na tela do painel com fundo da cor da arte', Math.abs(cena.cw - cena.ww) < 3 && /gradient/.test(cena.fundo) && /#fe|#fd|#ff|rgb\(25[0-5]/.test(cena.fundo), JSON.stringify(cena));

    // 4) troca direta para outra area
    const p3 = await js(totem, '__totem.retanguloDa("premiacoes")');
    await clicar(p3.x, p3.y);
    const rel2 = await esperarCondicao('__painel.atual()', painel, (v) => /premiacoes/.test(v), 4000);
    confere('painel troca para Premiacoes', /premiacoes/.test(rel2), rel2);
    await espera(3200); await foto('05-premiacoes', ['painel']);

    // 5) voltar -> menu e logo
    const v = await js(totem, '__totem.voltar()');
    await clicar(v.x + v.width / 2, v.y + v.height / 2);
    for (const [ms, nome] of [[300, 'a'], [350, 'b'], [350, 'c']]) { await espera(ms); await foto(`06-saida-${nome}`, ['totem']); }
    const est2 = await esperarCondicao('__totem.estado()', totem, (e) => e.tipo === 'menu' && !e.ocupado, 5000);
    await espera(1500); await foto('07-menu-de-novo');
    confere('voltar retorna ao menu', est2.tipo === 'menu', JSON.stringify(est2));
    const rel3 = await esperarCondicao('__painel.atual()', painel, (x) => /entrada-logo/.test(x), 4000);
    confere('painel volta ao logo', /entrada-logo/.test(rel3), rel3);

    // 6) Safety: botao "Conheca o HSX" leva ao cartao HSX
    const p4 = await js(totem, '__totem.retanguloDa("safety-security")');
    await clicar(p4.x, p4.y);
    await esperarCondicao('__totem.estado()', totem, (e) => e.tipo === 'categoria' && !e.ocupado, 5000);
    await espera(300);
    const p5 = await js(totem, '__totem.retanguloDa("conheca-hsx")');
    await clicar(p5.x, p5.y);
    const rel4 = await esperarCondicao('__painel.atual()', painel, (x) => /hsx-seguranca/.test(x), 4000);
    confere('Safety: botao Conheca o HSX mostra o cartao HSX', /hsx-seguranca/.test(rel4), rel4);
    await espera(900); await foto('08-safety');
    const p6 = await js(totem, '__totem.retanguloDa("emergencia-medica")');
    await clicar(p6.x, p6.y);
    const rel5 = await esperarCondicao('__painel.atual()', painel, (x) => /painel-corporativo/.test(x), 4000);
    confere('Safety: Emergencia medica mostra o cartao Safety + Security', /painel-corporativo/.test(rel5), rel5);

    // 6b) quadros exatos (animacoes pausadas): mergulho, saida e entrada de cartao no painel
    if (process.argv.some((a) => a === '--quadros')) {
      await js(totem, 'window.__totem.estado()');
      await esperarCondicao('__totem.estado()', totem, livre, 5000);
      const home = await js(totem, '__totem.voltar()');
      await clicar(home.x + home.width / 2, home.y + home.height / 2); // volta ao menu
      await esperarCondicao('__totem.estado()', totem, (e) => e.tipo === 'menu' && !e.ocupado, 6000);
      await espera(500);
      const pm = await js(totem, '__totem.retanguloDa("impacto-social")');
      await clicar(pm.x, pm.y);
      await esperarCondicao('document.getAnimations().length', totem, (n) => n > 3, 4000);
      await quadros(totem, 'totem', 'q-entrar', [0, 250, 500, 700, 900, 1100, 1300, 1500, 1700]);
      await esperarCondicao('__totem.estado()', totem, (e) => e.tipo === 'categoria' && !e.ocupado, 6000);
      await espera(400);
      const v2 = await js(totem, '__totem.voltar()');
      await clicar(v2.x + v2.width / 2, v2.y + v2.height / 2);
      await esperarCondicao('document.getAnimations().length', totem, (n) => n > 3, 4000);
      await quadros(totem, 'totem', 'q-voltar', [0, 250, 500, 700, 900, 1100, 1300, 1500, 1700]);
      await esperarCondicao('__totem.estado()', totem, (e) => e.tipo === 'menu' && !e.ocupado, 6000);
      // cartao entrando no painel (logo -> cartao)
      await esperarCondicao('__totem.estado()', totem, livre, 3000);
      const pc = await js(totem, '__totem.retanguloDa("impacto-social")');
      await clicar(pc.x, pc.y);
      await esperarCondicao('__totem.estado()', totem, (e) => e.tipo === 'categoria' && !e.ocupado, 6000);
      await espera(400);
      const pa = await js(totem, '__totem.retanguloDa("formacao-subsidiada")');
      await clicar(pa.x, pa.y);
      await esperarCondicao('document.getAnimations().length', painel, (n) => n > 4, 4000);
      await quadros(painel, 'painel', 'q-cartao', [0, 150, 300, 450, 600, 750, 900, 1100, 1300, 1600, 1900, 2300, 2800]);
    }

    // 7) maximizar = tela cheia no monitor atual; Esc sai
    janelas.painel.maximize();
    await espera(900);
    confere('maximizar vira tela cheia', janelas.painel.isFullScreen() && !janelas.painel.isMaximized(), `fs=${janelas.painel.isFullScreen()} max=${janelas.painel.isMaximized()}`);
    await foto('09-painel-tela-cheia', ['painel']);
    const cena2 = await js(painel, `(() => { const c = document.querySelector('.cartao').getBoundingClientRect(); return {cw: c.width, ww: innerWidth, ch: c.height, wh: innerHeight}; })()`);
    confere('em tela cheia o cartao se ajusta (mantem proporcao e fundo preenche o resto)', cena2.ch <= cena2.wh + 2 && cena2.cw <= cena2.ww + 2 && (Math.abs(cena2.ch - cena2.wh) < 3 || Math.abs(cena2.cw - cena2.ww) < 3), JSON.stringify(cena2));
    painel.focus();
    painel.sendInputEvent({ type: 'keyDown', keyCode: 'Escape' });
    painel.sendInputEvent({ type: 'keyUp', keyCode: 'Escape' });
    await espera(900);
    confere('Esc sai da tela cheia', !janelas.painel.isFullScreen(), `fs=${janelas.painel.isFullScreen()}`);
  } catch (e) {
    confere('execucao sem excecao', false, e.stack || String(e));
  }

  const falhas = resultados.filter((r) => !r.ok);
  fs.writeFileSync(path.join(pasta, 'resultado.json'), JSON.stringify({ falhas: falhas.length, resultados }, null, 2));
  log(`AUTOTESTE: ${resultados.length - falhas.length}/${resultados.length} ok`);
  app.exit(falhas.length ? 1 : 0);
}

module.exports = { rodar };
