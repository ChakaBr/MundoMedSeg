# Alterações

Cada versão fica em `versoes/MundoMedSeg-vX.Y.Z/` (+ `.zip`), gerada por `npm run empacotar`.

## v0.3.0 — 05/11/2026

Ajustes pedidos depois de testar a v0.2.0.

- **Zoom do totem volta ao da v0.1.0** (a maquete cresce até estourar e o ambiente emerge do ponto tocado; voltar faz o inverso), com a duração original de 1 s. Removidos rastro/vinheta/clarão e a "respiração" das cenas do totem.
- **Seleção só no nome**: ao tocar num tema do submenu, apenas o nome (rótulo) fica realçado; o quadrado da área inteira não acende mais (o toque continua valendo na área toda). Rótulos de *CI Móvel* e *Encontros nacionais* corrigidos.
- **Removida a legenda "No painel: …"** do totem.
- Painel (TV vertical e animações em partes) inalterado.

## v0.2.0 — 05/11/2026

Janelas livres, painel pensado para **TV 65" na vertical** e animações seguindo a referência.

- **Janelas movíveis**: as duas janelas têm moldura e podem ser arrastadas para qualquer monitor estendido. **Maximizar** (ou F11) vira **tela cheia no monitor em que a janela está**; **Esc** sai; **Alt+F4** fecha. Posição e estado ficam gravados em `config.json`.
- **Mouse sempre visível** + **anel laranja** em cada clique/toque no totem (para acompanhar os testes). Antes o cursor era escondido.
- **Painel em TV vertical**: o cartão (3:4) fica centralizado e o que sobra da tela é preenchido com a **borda da própria arte** esticada e suavizada (branco continua branco; foto escura continua escura), sem tarja preta.
- **Cartão do painel anima em partes** (análise automática de cada imagem): a **foto** abre do centro com zoom e foco → os **títulos** são "escritos" da esquerda para a direita → o **texto linha a linha** → o **ícone e os fios laranja** são desenhados de cima para baixo. Cartões só de texto entram faixa a faixa. A foto segue "respirando" devagar. O logo também entra com zoom e respira. A troca entre cartões abre o novo fundo em círculo e recua o anterior.
- **Zoom do totem refeito (entrar e sair do ambiente)**: ao tocar numa área a maquete mergulha no ponto tocado com aceleração, rastro de movimento, vinheta e clarão; o ambiente chega "de dentro", maior e desfocado, e desacelera até assentar. **Voltar** faz o inverso (o ambiente recua para o ponto e a maquete vem de um zoom grande). Cenas paradas "respiram" levemente.
- **Safety + Security**: o cartão HSX deixou de ficar sem uso. O título "01 Safety + Security" abre o panorama e um botão visível **"Conheça o HSX"** abre o cartão HSX (Emergência e Incêndio seguem com o cartão Safety + Security; AVSEC com Formação AVSEC).
- **Ícone padrão Alyce** no `.exe`, na janela e na barra de tarefas.
- Teste automático com 20 verificações (inclui maximizar/Esc, cursor, anel, partes do cartão, preenchimento) e modo `--quadros`, que pausa as animações e fotografa instantes exatos.

**Não validado**: TV 65" real, tela touch real, dois monitores físicos (testado com um monitor; maximizar/Esc testados no monitor único).

## v0.1.0 — 03/11/2026

Primeira versão: totem touch + painel de LED, seguindo o vídeo de referência.

- **Duas janelas, uma por monitor** (Electron): *totem* (tela touch 43" horizontal) e *painel* (LED). O totem decide, o painel só exibe. Com um monitor só abre as duas lado a lado (teste).
- **Painel de LED**: fica em `ENTRADA LOGO.png` até haver interação; troca de arte com fade + leve zoom. Imagens em retrato (1086×1448) aparecem inteiras sobre fundo desfocado da própria arte.
- **Totem**: abre em `ENTRADA 1.png` (menu). As 8 áreas do menu têm zona de toque; ao tocar, a tela faz **zoom a partir do ponto tocado** até a tela da categoria (e o inverso ao voltar). O painel continua no logo.
- **Dentro da categoria**: tocar num tema (ex.: *Reconhecimento*) envia a arte ao painel; dá para tocar em outro em seguida (troca direta). O tema escolhido fica realçado e uma legenda diz o que está no painel.
- **Botão voltar** (canto superior direito) volta ao menu com zoom reverso e o painel retorna ao logo.
- **Ociosidade**: 90 s sem toque volta ao menu + logo (configurável).
- **Conteúdo**: 8 categorias, 29 artes de painel, tudo descrito em `conteudo/conteudo.json` (áreas de toque em pixels da arte 1672×941) e gerado por `npm run gerar-conteudo` a partir da pasta `MED+ SEG`.
- **Operação**: `Ctrl+Shift+S` troca as telas (salvo em `config.json`), `Ctrl+Shift+R` reinicia, `Ctrl+Shift+Q` encerra; detecta o monitor touch automaticamente quando o Windows informa; instância única; impede a tela de apagar; recarrega a janela se o render cair; log em `mundomedseg.log`.
- **Teste automático** (`npm run testar`): clica de verdade no totem e confere o painel (10 verificações) e salva capturas.

**Decisões a validar** (fáceis de mudar em `scripts/gerar-conteudo.js` / `conteudo.json`)
- Em *Safety + Security* só existem 3 cartões de texto (Safety+Security, HSX, Formação AVSEC) para 3 botões (Emergência médica, Combate ao incêndio, AVSEC): ficaram Emergência médica e Combate ao incêndio → cartão *Safety + Security*, AVSEC → cartão *Formação AVSEC*. O cartão *HSX – segurança que acolhe pessoas* ficou sem botão.
- Áreas de toque foram desenhadas a olho sobre as artes (rótulo + cena ao redor); vale testar no totem real e ajustar.
- Botão voltar no canto superior **direito** (no esquerdo ficaria sobre o número/título das artes).

**Não validado**: monitor touch e painel LED reais (testado com 1 monitor, mouse simulando toque).
