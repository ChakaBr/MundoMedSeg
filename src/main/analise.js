// Analisa um cartao do painel (PNG) para o painel poder animar "em partes" e preencher a tela da TV
// com a cor do fundo da propria arte. Roda no processo principal (sem canvas) e guarda o resultado em cache.
//
// Resultado (coordenadas em pixels da imagem):
//   { w, h, cores: {topo, base, esq, dir}, partes: [{ t: 'foto'|'titulo'|'texto'|'icone', r: [x1,y1,x2,y2], x: [xi, xf] }] }
//   - cores: cor dominante de cada borda (hex), usada para preencher o que a imagem nao cobre
//   - partes: regioes que NAO se sobrepoem e juntas cobrem a imagem toda
//       foto   : bloco grande de imagem (fotografia/ilustracao)
//       titulo : faixa de texto alto (titulos)      texto: faixa de texto comum
//       icone  : icone + linhas decorativas laranjas ao lado do texto
//     x = intervalo horizontal onde ha tinta na faixa (usado para a varredura do texto)

const fs = require('fs');
const path = require('path');
const { PNG } = require('pngjs');

const VERSAO_ANALISE = 6;

function hex(r, g, b) {
  return '#' + [r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
}

// cor dominante de uma lista de indices de pixel (quantiza em 16 niveis por canal e tira a media do grupo mais comum)
function corDominante(rgb, indices) {
  const grupos = new Map();
  for (const i of indices) {
    const k = ((rgb[i] >> 4) << 8) | ((rgb[i + 1] >> 4) << 4) | (rgb[i + 2] >> 4);
    const g = grupos.get(k);
    if (g) { g.n++; g.r += rgb[i]; g.g += rgb[i + 1]; g.b += rgb[i + 2]; }
    else grupos.set(k, { n: 1, r: rgb[i], g: rgb[i + 1], b: rgb[i + 2] });
  }
  let melhor = null;
  for (const g of grupos.values()) if (!melhor || g.n > melhor.n) melhor = g;
  return melhor ? { r: melhor.r / melhor.n, g: melhor.g / melhor.n, b: melhor.b / melhor.n } : { r: 255, g: 255, b: 255 };
}

function decodificar(buffer) {
  const png = PNG.sync.read(buffer);
  const { width: w, height: h, data } = png;
  const rgb = new Uint8Array(w * h * 4);
  for (let i = 0; i < w * h * 4; i += 4) {
    const a = data[i + 3] / 255; // compoe sobre branco
    rgb[i] = data[i] * a + 255 * (1 - a);
    rgb[i + 1] = data[i + 1] * a + 255 * (1 - a);
    rgb[i + 2] = data[i + 2] * a + 255 * (1 - a);
    rgb[i + 3] = 255;
  }
  return { w, h, rgb };
}

function coresDasBordas(w, h, rgb) {
  const faixa = 4;
  const topo = []; const base = []; const esq = []; const dir = [];
  for (let y = 0; y < faixa; y++) for (let x = 0; x < w; x += 2) { topo.push((y * w + x) * 4); base.push(((h - 1 - y) * w + x) * 4); }
  for (let x = 0; x < faixa; x++) for (let y = 0; y < h; y += 2) { esq.push((y * w + x) * 4); dir.push((y * w + (w - 1 - x)) * 4); }
  const c = (idx) => { const d = corDominante(rgb, idx); return hex(d.r, d.g, d.b); };
  return { topo: c(topo), base: c(base), esq: c(esq), dir: c(dir), _topoRGB: corDominante(rgb, topo) };
}

function analisarPixels({ w, h, rgb }) {
  const cores = coresDasBordas(w, h, rgb);
  const bg = cores._topoRGB;
  delete cores._topoRGB;

  // mascara: pixel diferente do fundo
  const LIM = 48;
  const mascara = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const d = Math.max(Math.abs(rgb[i] - bg.r), Math.abs(rgb[i + 1] - bg.g), Math.abs(rgb[i + 2] - bg.b));
      if (d > LIM) mascara[y * w + x] = 1;
    }
  }
  const cobertura = new Float32Array(h);
  for (let y = 0; y < h; y++) {
    let n = 0;
    for (let x = 0; x < w; x++) n += mascara[y * w + x];
    cobertura[y] = n / w;
  }

  // 1) bloco de foto: faixa de linhas (quase) cheias de tinta, com altura minima
  let fotoY1 = -1;
  const minAltura = Math.round(h * 0.14);
  for (let y = Math.round(h * 0.1); y < h - minAltura; y++) {
    if (cobertura[y] < 0.5) continue;
    let ok = 0;
    for (let k = 0; k < minAltura; k++) if (cobertura[y + k] >= 0.4) ok++;
    if (ok >= minAltura * 0.9) { fotoY1 = y; break; }
  }
  // sobe ate a primeira linha com bastante tinta (borda superior real da foto)
  if (fotoY1 > 0) while (fotoY1 > 0 && cobertura[fotoY1 - 1] >= 0.3) fotoY1--;
  const fimTexto = fotoY1 > 0 ? fotoY1 : h;

  // 2) linha decorativa vertical ao lado do texto (cartoes com icone): coluna com corrida longa de tinta no topo
  let xs = w;
  const limTopo = Math.min(fimTexto, Math.round(h * 0.5));
  const corridaMin = Math.round(h * 0.16);
  for (let x = Math.round(w * 0.55); x < w; x++) {
    let corrida = 0; let maior = 0;
    for (let y = 0; y < limTopo; y++) {
      if (mascara[y * w + x]) { corrida++; if (corrida > maior) maior = corrida; } else corrida = 0;
    }
    if (maior >= corridaMin) { xs = Math.max(0, x - 8); break; }
  }

  // 3) faixas de texto: grupos de linhas com tinta (x < xs), juntando vaos pequenos (pingos do i, acentos)
  const vaoMax = Math.max(3, Math.round(h * 0.005));
  const tinta = new Float32Array(h); // tinta por linha (x < xs)
  for (let y = 0; y < fimTexto; y++) { let n = 0; for (let x = 0; x < xs; x++) n += mascara[y * w + x]; tinta[y] = n; }
  const segs = [];
  let ini = -1; let vazias = 0;
  for (let y = 0; y < fimTexto; y++) {
    if (tinta[y] >= 3) { if (ini < 0) ini = y; vazias = 0; }
    else if (ini >= 0) {
      vazias++;
      if (vazias > vaoMax) { segs.push([ini, y - vazias]); ini = -1; vazias = 0; }
    }
  }
  if (ini >= 0) segs.push([ini, fimTexto - 1 - vazias]);

  // linhas de um paragrafo costumam se tocar (descendente de uma encosta na ascendente da outra):
  // separa cada faixa nos vales da densidade de tinta
  const suave = (y) => ((tinta[y - 1] || 0) + tinta[y] + (tinta[y + 1] || 0)) / 3;
  const minPico = Math.max(14, xs * 0.035);
  const dividir = ([a, b]) => {
    const cortes = [];
    let subindo = true; let pico = suave(a); let vale = Infinity; let valeY = a;
    for (let y = a + 1; y <= b; y++) {
      const v = suave(y);
      if (subindo) {
        if (v >= pico) pico = v;
        else if (v < pico * 0.6 && pico >= minPico) { subindo = false; vale = v; valeY = y; }
      } else if (v <= vale) { vale = v; valeY = y; }
      else if (v > vale * 1.8 + 4) { cortes.push(valeY); subindo = true; pico = v; }
    }
    // faixas pequenas demais (ascendentes, acentos) sao fragmentos de linha: remove a fronteira
    // com MAIS tinta (a que menos parece um espaco entre linhas) ate todas terem tamanho de linha
    const minAlt = Math.round(h * 0.0166);
    const fronteiras = cortes.slice();
    for (;;) {
      const lim = [a, ...fronteiras, b + 1];
      let menor = -1; let altMenor = Infinity;
      for (let i = 0; i < lim.length - 1; i++) {
        const alt = lim[i + 1] - lim[i];
        if (alt < altMenor) { altMenor = alt; menor = i; }
      }
      if (lim.length <= 2 || altMenor >= minAlt) break;
      const esq = menor > 0 ? menor - 1 : -1; // indice em fronteiras da borda esquerda da faixa
      const dir = menor < fronteiras.length ? menor : -1;
      const remover = esq < 0 ? dir : dir < 0 ? esq : (suave(fronteiras[esq]) > suave(fronteiras[dir]) ? esq : dir);
      fronteiras.splice(remover, 1);
    }
    const lim = [a, ...fronteiras, b + 1];
    const partes2 = [];
    for (let i = 0; i < lim.length - 1; i++) partes2.push([lim[i], lim[i + 1] - 1]);
    return partes2;
  };
  const segsOk = segs.flatMap(dividir).filter(([a, b]) => b - a >= 4);

  const alturas = segsOk.map(([a, b]) => b - a + 1).sort((p, q) => p - q);
  const mediana = alturas.length ? alturas[Math.floor(alturas.length / 2)] : 0;

  const partes = [];
  if (fotoY1 > 0) partes.push({ t: 'foto', r: [0, fotoY1, w, h], x: [0, w] });

  segsOk.forEach(([a, b], k) => {
    const prox = segsOk[k + 1];
    const y1 = k === 0 ? 0 : Math.round((segsOk[k - 1][1] + a) / 2) + 1;
    const y2 = prox ? Math.round((b + prox[0]) / 2) : fimTexto - 1;
    let xi = xs; let xf = 0;
    for (let y = a; y <= b; y++) {
      for (let x = 0; x < xs; x++) if (mascara[y * w + x]) { if (x < xi) xi = x; if (x > xf) xf = x; }
    }
    const altura = b - a + 1;
    const titulo = altura >= mediana * 1.6 && altura >= h * 0.028;
    partes.push({ t: titulo ? 'titulo' : 'texto', r: [0, y1, xs, y2 + 1], x: [Math.max(0, xi - 4), Math.min(xs, xf + 6)] });
  });
  if (xs < w) partes.push({ t: 'icone', r: [xs, 0, w, fimTexto], x: [xs, w] });

  // garantia: se nada foi detectado (cartao atipico), uma unica parte com a imagem toda
  if (!partes.length) partes.push({ t: 'texto', r: [0, 0, w, h], x: [0, w] });

  return { w, h, cores, partes };
}

// ---------- cache em memoria + arquivo ----------
const memoria = new Map();
let cacheArquivo = null;
let arquivoCache = null;

function carregarCacheArquivo() {
  if (cacheArquivo) return;
  cacheArquivo = {};
  try {
    const j = JSON.parse(fs.readFileSync(arquivoCache, 'utf8'));
    if (j.versao === VERSAO_ANALISE) cacheArquivo = j.itens || {};
  } catch { /* sem cache ainda */ }
}
let salvarEm = null;
function salvarCacheArquivo() {
  clearTimeout(salvarEm);
  salvarEm = setTimeout(() => {
    try { fs.writeFileSync(arquivoCache, JSON.stringify({ versao: VERSAO_ANALISE, itens: cacheArquivo })); } catch { /* pasta somente leitura: segue so com memoria */ }
  }, 1500);
}

// pastaConteudo: onde estao as imagens; rel: caminho relativo (como no conteudo.json)
function analisar(pastaConteudo, rel) {
  if (memoria.has(rel)) return memoria.get(rel);
  arquivoCache = path.join(pastaConteudo, 'analise-cache.json');
  carregarCacheArquivo();
  const caminho = path.join(pastaConteudo, rel);
  const st = fs.statSync(caminho);
  const chave = `${st.size}:${Math.round(st.mtimeMs)}`;
  const guardado = cacheArquivo[rel];
  if (guardado && guardado.chave === chave) { memoria.set(rel, guardado.res); return guardado.res; }
  const res = analisarPixels(decodificar(fs.readFileSync(caminho)));
  memoria.set(rel, res);
  cacheArquivo[rel] = { chave, res };
  salvarCacheArquivo();
  return res;
}

module.exports = { analisar, analisarPixels, decodificar };
