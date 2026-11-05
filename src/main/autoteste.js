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
    resultados.push({ nome, ok: !!ok, detalhe });
    log(`TESTE ${ok ? 'OK ' : 'FALHOU'} ${nome} ${detalhe}`);
  };
  const foto = async (nome) => {
    for (const [papel, wc] of [['totem', totem], ['painel', painel]]) {
      const img = await wc.capturePage();
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
  const esperarCondicao = async (codigoWc, wc, predicado, limite = 6000) => {
    const t0 = Date.now();
    while (Date.now() - t0 < limite) {
      const v = await js(wc, codigoWc);
      if (predicado(v)) return v;
      await espera(100);
    }
    return js(wc, codigoWc);
  };

  try {
    // 1) abertura: menu no totem e logo no painel
    await esperarCondicao('!!window.__totem && __totem.estado().tipo', totem, Boolean, 10000);
    await espera(1200);
    await foto('01-abertura');
    confere('totem abre no menu', (await js(totem, '__totem.estado().tipo')) === 'menu');
    confere('painel abre no logo', /entrada-logo/.test(await js(painel, '__painel.atual()')));

    // 2) toca em Cultura e Pertencimento -> zoom -> tela da categoria; painel continua no logo
    const p1 = await js(totem, '__totem.retanguloDa("cultura-pertencimento")');
    await clicar(p1.x, p1.y);
    await espera(200); await foto('02-zoom-a');
    await espera(250); await foto('02-zoom-b');
    await espera(250); await foto('02-zoom-c');
    const est = await esperarCondicao('__totem.estado()', totem, (e) => e.tipo === 'categoria' && !e.ocupado, 4000);
    await espera(200); await foto('03-categoria');
    confere('toque no menu abre a categoria', est.tipo === 'categoria' && est.cat === 'cultura-pertencimento', JSON.stringify(est));
    confere('painel continua no logo', /entrada-logo/.test(await js(painel, '__painel.atual()')));

    // 3) toca em Reconhecimento -> painel muda
    const p2 = await js(totem, '__totem.retanguloDa("reconhecimento")');
    await clicar(p2.x, p2.y);
    const rel = await esperarCondicao('__painel.atual()', painel, (v) => /reconhecimento/.test(v), 4000);
    await espera(1300); await foto('04-reconhecimento');
    confere('painel mostra Reconhecimento', /reconhecimento/.test(rel), rel);
    confere('totem marca a area escolhida', (await js(totem, '__totem.estado().sel')) === 'reconhecimento');

    // 4) toca em outra area (troca direta)
    const p3 = await js(totem, '__totem.retanguloDa("premiacoes")');
    await clicar(p3.x, p3.y);
    const rel2 = await esperarCondicao('__painel.atual()', painel, (v) => /premiacoes/.test(v), 4000);
    confere('painel troca para Premiacoes', /premiacoes/.test(rel2), rel2);
    await espera(1200);

    // 5) voltar -> menu e logo
    const v = await js(totem, '__totem.voltar()');
    await clicar(v.x + v.width / 2, v.y + v.height / 2);
    await espera(250); await foto('05-voltar-a');
    await espera(300); await foto('05-voltar-b');
    const est2 = await esperarCondicao('__totem.estado()', totem, (e) => e.tipo === 'menu' && !e.ocupado, 4000);
    await espera(1200); await foto('06-menu-de-novo');
    confere('voltar retorna ao menu', est2.tipo === 'menu', JSON.stringify(est2));
    const rel3 = await esperarCondicao('__painel.atual()', painel, (x) => /entrada-logo/.test(x), 4000);
    confere('painel volta ao logo', /entrada-logo/.test(rel3), rel3);

    // 6) segue interagindo: outra categoria
    const p4 = await js(totem, '__totem.retanguloDa("tecnologia-indicadores")');
    await clicar(p4.x, p4.y);
    const est3 = await esperarCondicao('__totem.estado()', totem, (e) => e.tipo === 'categoria' && !e.ocupado, 4000);
    confere('continua a interacao em outra categoria', est3.cat === 'tecnologia-indicadores', JSON.stringify(est3));
  } catch (e) {
    confere('execucao sem excecao', false, e.stack || String(e));
  }

  const falhas = resultados.filter((r) => !r.ok);
  fs.writeFileSync(path.join(pasta, 'resultado.json'), JSON.stringify({ falhas: falhas.length, resultados }, null, 2));
  log(`AUTOTESTE: ${resultados.length - falhas.length}/${resultados.length} ok`);
  app.exit(falhas.length ? 1 : 0);
}

module.exports = { rodar };
