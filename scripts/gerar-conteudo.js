// Gera conteudo/ a partir da pasta de artes "MED+ SEG":
//  - copia as imagens com nomes sem acento/espaco
//  - escreve conteudo/conteudo.json (menu, categorias, areas de toque, imagens do painel LED)
//
// Uso: node scripts/gerar-conteudo.js [pasta-das-artes]
// Depois de gerado, conteudo.json pode ser ajustado a mao (areas de toque, textos, imagens).
//
// Areas de toque: "formas" = lista de retangulos [x1, y1, x2, y2] em pixels da imagem (1672x941).
// A MAIOR forma e o ponto de origem do zoom na transicao.

const fs = require('fs');
const path = require('path');

const RAIZ = path.resolve(__dirname, '..');
const ORIGEM = path.resolve(process.argv[2] || path.join(RAIZ, '..', 'MED+ SEG'));
const DESTINO = path.join(RAIZ, 'conteudo');

const LARGURA = 1672;
const ALTURA = 941;

// pasta de origem -> categoria. Cada area aponta para a imagem que vai ao painel LED.
// "arquivo" casa por prefixo (normalizado, sem acento) do nome do arquivo na pasta.
const CATEGORIAS = [
  {
    id: 'safety-security', numero: 1, pasta: 'SAFETY SECURITY', titulo: 'Safety + Security',
    tela: 'SAFETY SECURITY',
    areas: [
      { id: 'emergencia-medica', titulo: 'Emergência médica', led: 'Painel corporativo', formas: [[60, 320, 320, 352], [0, 380, 700, 700]] },
      { id: 'combate-incendio', titulo: 'Combate ao incêndio', led: 'Painel corporativo', formas: [[550, 220, 820, 252], [580, 270, 1500, 500]] },
      { id: 'avsec', titulo: 'AVSEC', led: 'Formacao AVSEC que', formas: [[1500, 540, 1672, 572], [700, 500, 1672, 850]] },
      // acessos extras: tocar no titulo da tela mostra o panorama; o botao visivel leva ao cartao HSX
      { id: 'panorama', titulo: 'Safety + Security', led: 'Painel corporativo', formas: [[30, 30, 780, 165]] },
      { id: 'conheca-hsx', titulo: 'Conheça o HSX', led: 'HSX_ seguranca', pilula: 'Conheça o HSX', formas: [[40, 862, 360, 917]] },
    ],
  },
  {
    id: 'hsx', numero: 2, pasta: 'HSX', titulo: 'HSX', tela: 'HSX',
    areas: [
      { id: 'comunicacao-empatica', titulo: 'Comunicação empática', led: 'Comunicacao empatica', formas: [[250, 338, 465, 380], [300, 390, 600, 730]] },
      { id: 'acolhimento-acessibilidade', titulo: 'Acolhimento e acessibilidade', led: 'Acolhimento e acessibilidade', formas: [[705, 680, 965, 725], [690, 450, 975, 680]] },
      { id: 'rigor-procedimentos', titulo: 'Rigor nos procedimentos', led: 'Rigor e acolhimento', formas: [[1370, 300, 1595, 342], [980, 350, 1625, 700]] },
    ],
  },
  {
    id: 'formacao-avsec', numero: 3, pasta: 'FORMAÇÃO AVSEC', titulo: 'Formação AVSEC', tela: 'FORMAÇÃO AVSEC',
    areas: [
      { id: 'matriz-celular', titulo: 'Matriz celular', led: 'Logo med+ seg na parede', formas: [[700, 150, 925, 185], [290, 210, 1170, 385]] },
      { id: 'ci-movel', titulo: 'CI Móvel', led: 'Caminhao com logo', formas: [[40, 390, 870, 830]] },
      { id: 'capacitacao-continuada', titulo: 'Capacitação continuada', led: 'Capacitacao continuada', formas: [[1190, 845, 1530, 885], [880, 430, 1672, 800]] },
    ],
  },
  {
    id: 'cultura-pertencimento', numero: 4, pasta: 'CULTURA E PERTENCIMENTO', titulo: 'Cultura e Pertencimento', tela: 'CULTURA E PERTENCIMENTO',
    areas: [
      { id: 'encontros-nacionais', titulo: 'Encontros nacionais', led: 'Encontros nacionais', formas: [[520, 120, 1075, 350], [800, 120, 1115, 170]] },
      { id: 'reconhecimento', titulo: 'Reconhecimento', led: 'Reconhecimento em equipe', formas: [[1210, 255, 1540, 295], [1080, 285, 1480, 480]] },
      { id: 'positive-se', titulo: 'Positive-se', led: 'Positive-se', formas: [[40, 280, 250, 320], [110, 320, 640, 520]] },
      { id: 'gptw', titulo: 'GPTW', led: 'Equipe Med+ celebra', formas: [[1580, 485, 1672, 520], [1260, 440, 1672, 740]] },
      { id: 'premiacoes', titulo: 'Premiações', led: 'Premiacoes Med+Seg', formas: [[1040, 790, 1230, 840], [750, 440, 1250, 720]] },
      { id: 'onboarding', titulo: 'Onboarding', led: 'Onboarding e kit', formas: [[40, 790, 250, 840], [40, 520, 640, 790]] },
    ],
  },
  {
    id: 'descompressao', numero: 5, pasta: 'DESCOMPRESSÃO', titulo: 'Descompressão', tela: 'DESCOMPRESSÃO',
    areas: [
      { id: 'descanso-recuperacao', titulo: 'Descanso e recuperação', led: 'Espaco de descanso', formas: [[140, 355, 410, 388], [20, 390, 610, 760]] },
      { id: 'convivencia-acolhimento', titulo: 'Convivência e acolhimento', led: 'Convivencia e acolhimento', formas: [[870, 765, 1255, 805], [610, 370, 1230, 740]] },
      { id: 'pausa-recarregar', titulo: 'Pausa para recarregar', led: 'Pausa para recarregar', formas: [[1340, 228, 1600, 255], [1230, 260, 1665, 690]] },
    ],
  },
  {
    id: 'tecnologia-indicadores', numero: 6, pasta: 'TECNOLOGIA E INDICADORES', titulo: 'Tecnologia e Indicadores', tela: 'TECNOLOGIA E INDICADORES',
    areas: [
      { id: 'avaliacao-experiencia', titulo: 'Avaliação da experiência', led: 'Avaliacao da experiencia', formas: [[60, 245, 230, 300], [0, 300, 340, 620]] },
      { id: 'gamificacao-hsx', titulo: 'Gamificação HSX', led: 'Gamificacao HSX', formas: [[395, 835, 610, 870], [230, 470, 520, 830]] },
      { id: 'nps', titulo: 'NPS', led: 'NPS e experiencia', formas: [[650, 395, 760, 425], [610, 415, 1040, 690]] },
      { id: 'conformidade', titulo: 'Conformidade', led: 'Conformidade na seguranca', formas: [[1340, 245, 1555, 280], [1110, 290, 1600, 530]] },
      { id: 'retencao', titulo: 'Retenção', led: 'Retencao e pertencimento', formas: [[1440, 580, 1580, 612], [1090, 540, 1672, 880]] },
    ],
  },
  {
    id: 'impacto-social', numero: 7, pasta: 'IMPACTO SOCIAL', titulo: 'Impacto Social', tela: 'IMPACTO SOCIAL',
    areas: [
      { id: 'desenvolvimento-profissional', titulo: 'Desenvolvimento profissional', led: 'Desenvolvimento profissional', formas: [[1330, 810, 1600, 880], [920, 540, 1600, 800]] },
      { id: 'formacao-subsidiada', titulo: 'Formação subsidiada', led: 'Formacao subsidiada', formas: [[40, 295, 225, 355], [0, 380, 510, 800], [300, 380, 915, 640]] },
      { id: 'oportunidades', titulo: 'Oportunidades', led: 'Oportunidades na seguranca', formas: [[1340, 300, 1580, 340], [1330, 340, 1672, 530], [790, 160, 1260, 340]] },
    ],
  },
  {
    id: 'escala-conexao', numero: 8, pasta: 'ESCALA E CONEXÃO', titulo: 'Escala e Conexão', tela: 'ESCALA E CONEXÃO',
    areas: [
      { id: 'rede-nacional-cis', titulo: 'Rede nacional de CIs', led: 'Rede nacional de CIs', formas: [[715, 175, 955, 205], [370, 120, 700, 450], [20, 270, 410, 600], [690, 225, 1030, 345]] },
      { id: 'parcerias-institucionais', titulo: 'Parcerias institucionais', led: 'Parcerias institucionais', formas: [[1320, 315, 1600, 365], [1020, 370, 1672, 700]] },
      { id: 'comunicacao-estrategica', titulo: 'Comunicação estratégica', led: 'Comunicacao estrategica', formas: [[600, 815, 895, 848], [460, 480, 1110, 800]] },
    ],
  },
];

// Areas de toque do menu principal (ENTRADA 1.png). Chave = id da categoria.
const MENU = {
  'safety-security': [[30, 215, 500, 390]],
  'hsx': [[30, 380, 480, 520], [40, 520, 270, 600]],
  'formacao-avsec': [[30, 600, 520, 860], [270, 540, 520, 600]],
  'cultura-pertencimento': [[500, 525, 1000, 880]],
  'descompressao': [[975, 455, 1672, 630]],
  'tecnologia-indicadores': [[1240, 205, 1665, 455]],
  'impacto-social': [[1010, 635, 1640, 895]],
  'escala-conexao': [[900, 95, 1320, 170], [900, 170, 1235, 350]],
};

function norm(s) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}
function slug(s) {
  return norm(s).replace(/\.png$/i, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}
function listar(dir) {
  return fs.readdirSync(dir).filter((f) => /\.png$/i.test(f));
}
function acharArquivo(dir, prefixo) {
  const alvo = norm(prefixo);
  const achados = listar(dir).filter((f) => norm(f).startsWith(alvo));
  if (achados.length !== 1) {
    throw new Error(`"${prefixo}" em ${dir}: ${achados.length} arquivos casam (${achados.join(' | ')})`);
  }
  return achados[0];
}
function copiar(origem, destinoRel) {
  const destino = path.join(DESTINO, destinoRel);
  fs.mkdirSync(path.dirname(destino), { recursive: true });
  fs.copyFileSync(origem, destino);
  return destinoRel.replace(/\\/g, '/');
}
function area(f) {
  return (f[2] - f[0]) * (f[3] - f[1]);
}

function main() {
  if (!fs.existsSync(ORIGEM)) throw new Error(`Pasta de artes nao encontrada: ${ORIGEM}`);
  fs.rmSync(DESTINO, { recursive: true, force: true });
  fs.mkdirSync(DESTINO, { recursive: true });

  const arquivosOrigem = (nome) => path.join(ORIGEM, nome);
  const logo = copiar(arquivosOrigem('ENTRADA LOGO.png'), 'led/entrada-logo.png');
  const menuImg = copiar(arquivosOrigem('ENTRADA 1.png'), 'menu/entrada-1.png');

  const usadas = new Set();
  const categorias = CATEGORIAS.map((cat) => {
    const dir = path.join(ORIGEM, cat.pasta);
    const telaArq = acharArquivo(dir, cat.tela);
    const imagem = copiar(path.join(dir, telaArq), `${cat.id}/tela.png`);
    const areas = cat.areas.map((a, i) => {
      const arq = acharArquivo(dir, a.led);
      usadas.add(path.join(cat.pasta, arq));
      const ledImg = copiar(path.join(dir, arq), `${cat.id}/led-${String(i + 1).padStart(2, '0')}-${slug(arq)}.png`);
      return { id: a.id, titulo: a.titulo, formas: a.formas, ...(a.pilula ? { pilula: a.pilula } : {}), painel: ledImg };
    });
    usadas.add(path.join(cat.pasta, telaArq));
    return { id: cat.id, numero: cat.numero, titulo: cat.titulo, imagem, areas };
  });

  const menu = {
    imagem: menuImg,
    areas: CATEGORIAS.map((c) => ({ id: c.id, titulo: c.titulo, formas: MENU[c.id], destino: c.id })),
  };

  // avisa as imagens do painel que sobraram sem botao
  const sobras = [];
  for (const cat of CATEGORIAS) {
    for (const f of listar(path.join(ORIGEM, cat.pasta))) {
      if (!usadas.has(path.join(cat.pasta, f))) sobras.push(`${cat.pasta}/${f}`);
    }
  }

  const conteudo = {
    versao: 1,
    base: { largura: LARGURA, altura: ALTURA },
    painel: { logo },
    menu,
    categorias,
  };
  fs.writeFileSync(path.join(DESTINO, 'conteudo.json'), JSON.stringify(conteudo, null, 2), 'utf8');

  const nImgs = categorias.reduce((n, c) => n + c.areas.length, 0);
  console.log(`conteudo gerado: ${categorias.length} categorias, ${nImgs} imagens de painel, menu com ${menu.areas.length} areas`);
  if (sobras.length) console.log('imagens sem botao:', sobras.join(', '));
  for (const c of categorias) for (const a of c.areas) {
    const maior = a.formas.reduce((m, f) => (area(f) > area(m) ? f : m));
    if (maior[2] > LARGURA || maior[3] > ALTURA) console.warn('forma fora da imagem:', c.id, a.id, maior);
  }
}

main();
