# MundoMedSeg

Totem interativo (tela touch horizontal 43") + painel de LED para o *Mundo Med+ Seg*. Um computador com duas saídas de vídeo, uma janela do programa em cada tela: o toque no **totem** comanda o que aparece no **painel de LED**.

Versão atual: **0.3.0** (veja `CHANGELOG.md`). Programas prontos ficam em `versoes/`.

## Fluxo

```
Painel LED: ENTRADA LOGO ───────────────┐
Totem:      ENTRADA 1 (menu)            │ (nada muda no painel)
   │ toca numa área (zoom)              │
   ▼                                    │
Totem:      tela da categoria           │
   │ toca num tema                      ▼
   └────────────────────────────► Painel: arte do tema
   │ "voltar" (zoom reverso)
   ▼
Totem: menu     Painel: logo
```

## Desenvolvimento

```bash
npm install
npm start                # abre as duas janelas (arraste para os monitores e maximize)
npm run dev              # igual, ignora o estado de tela cheia gravado
npm run testar           # teste ponta a ponta com capturas (pasta passada em --autoteste=)
npm run gerar-conteudo   # regenera conteudo/ a partir de ../MED+ SEG
npm run empacotar        # cria versoes/MundoMedSeg-vX.Y.Z (+ .zip)
```

Teste automático: `npx electron . --autoteste=<pasta-das-capturas>` (acrescente `--quadros` para fotografar instantes exatos das animações).

Para publicar uma nova versão: suba `version` em `package.json`, registre no `CHANGELOG.md` e rode `npm run empacotar` (não sobrescreve versões antigas).

## Estrutura

| Pasta | O que tem |
|---|---|
| `src/main/` | processo principal: janelas por monitor, ponte totem→painel, atalhos, log |
| `src/renderer/` | `totem.*` (menu, zoom, áreas de toque) e `painel.*` (logo, troca de arte) |
| `conteudo/` | artes + `conteudo.json` (áreas de toque, imagens de cada tema) |
| `scripts/` | gerador de conteúdo, empacotador, atalhos do pacote |
| `versoes/` | cada versão empacotada |

## Ajustando as áreas de toque

Em `conteudo/conteudo.json` cada área tem `formas`: retângulos `[x1, y1, x2, y2]` em pixels da arte (1672×941). A maior forma é o centro do zoom. Para mudar de forma permanente, edite os dados em `scripts/gerar-conteudo.js` (o gerador sobrescreve `conteudo/`).
