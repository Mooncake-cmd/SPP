# Objetivo da importação de .apkg (Anki)

Ao trabalhar na importação de baralhos do Anki (`.apkg`) neste projeto, o objetivo principal do
usuário é **manter fidelidade a como o card foi feito para ser exibido no Anki** — não uma
heurística aproximada.

Isso significa: sempre que possível, montar frente/verso a partir do template real da nota
(`qfmt`/`afmt`, presentes no `.apkg`), reproduzindo o que o Anki de fato mostra — incluindo seções
condicionais (`{{#Campo}}`/`{{^Campo}}`), qual campo contém as lacunas de cloze (`{{cloze:Campo}}`)
e filtros como `{{hint:Campo}}` (caixa expansível "+ Saiba mais", implementada como
`<details>/<summary>` de verdade) — em vez de assumir por posição que o campo 0 é a frente e o
resto vira a resposta. Essa heurística por posição só deve ser usada como fallback, quando o deck
não tiver um template legível.

Ao investigar um novo deck que "não importa direito", a primeira pergunta é: o card exibido no
nosso site bate com o que o template do Anki realmente mostraria? Bugs de fidelidade (conteúdo no
lado errado, campo perdido, mídia do campo errado, lacuna de cloze não reconhecida) são a
prioridade — mais importante que otimizações de performance ou conveniências de UI nessa função
específica.

Ver `script.js`, seção "IMPORTAÇÃO DE BARALHOS DO ANKI (.apkg)", principalmente
`converterNotaAnki`, `prepararTemplateAnki`, `renderizarTemplateAnki` e `converterNotaComTemplateAnki`.

## Atenção recorrente: decks com HTML/CSS rico embutido no campo (não só no template)

Vários decks reais (principalmente os gerados por IA/editores visuais de flashcard — ex. o deck FGV
de "Preposição, Conjunção e Conectivos") não usam o mecanismo de template do Anki pra estilizar nada:
o modelo é um "Básico" simples, e cada CAMPO da nota já vem com uma página HTML inteira embutida
(`<div style="...">` aninhados, às vezes até `<style>` com `@media`/`@import`). Todo esse HTML passa
por `sanitizarNoAnki`/`sanitizarEstiloInlineAnki` (`TAGS_ANKI_PERMITIDAS`/
`PROPRIEDADES_CSS_ANKI_PERMITIDAS`, script.js), que só deixa passar uma allowlist restrita de
tags/propriedades CSS por segurança — e qualquer propriedade fora dela é **descartada em silêncio**,
sem erro nem aviso nenhum.

Isso já causou pelo menos um bug real e feio: o deck usava `background:#0F7A52` (abreviado) num
`<div>` pai e `color:#FFFFFF` no texto dentro dele — só `background-color` estava na allowlist, não
`background`, então o fundo verde sumia e sobrava texto BRANCO INVISÍVEL sobre o fundo branco do
site (não "sem a cor certa" — o texto literalmente desaparecia). Uma "tabela" montada com
`<div style="display:grid; grid-template-columns:...">` (em vez de `<table>` de verdade) teve o
mesmo problema: sem `display`/`grid-template-columns` na allowlist, as "linhas" viravam blocos
empilhados sem nenhuma coluna.

**Ao investigar um novo deck, além de checar template/campos/mídia (seção acima), vale também abrir
o HTML bruto de uma nota (`sqlite3`/`python3` no `collection.anki21`, campo `flds`) e:**
- Ver se tem `style="..."` inline usando propriedades que talvez não estejam em
  `PROPRIEDADES_CSS_ANKI_PERMITIDAS` — sobretudo formas abreviadas (`background` em vez de
  `background-color`, `border` já coberto, mas cuidado com `font`, `flex`, etc.) e propriedades de
  layout (`display`, `grid-*`, `flex-*`, `gap`).
- Prestar atenção em pares cor-de-texto-clara + fundo-escuro (ou o contrário) no HTML original —
  se a propriedade de fundo não sobreviver à sanitização e a de texto sobreviver, o resultado é
  texto ilegível/invisível, não só "menos bonito". É o tipo de bug que passa despercebido num teste
  automatizado que só confere se o TEXTO está presente no DOM (ele está — só que invisível), então
  vale conferir visualmente (screenshot) ou o `background-color`/`color` computados do elemento,
  não só a presença do texto.
- Se achar uma propriedade CSS legítima de fora da allowlist sendo descartada, é provável que valha
  adicionar à lista (o filtro de `url()`/`expression()`/`javascript:`/`@import` em
  `sanitizarEstiloInlineAnki` já se aplica a QUALQUER propriedade, então normalmente é seguro
  expandir a lista com propriedades puramente visuais/de layout).

# Futuro: substituir o SM-2 atual do SRS por FSRS

O agendamento de revisão hoje (`processarRevisaoSRS`, script.js) é um SM-2 simplificado
(dificil/bom/fácil escalando `intervalo_atual` por `fator_facilidade`). O plano é trocar isso por
FSRS quando o log (`dados.srsRevisoesLog`, já registrado a cada revisão) tiver histórico suficiente
acumulado (na ordem de alguns meses de uso) pra treinar/otimizar os pesos — sem pressa, não é a
próxima coisa a implementar.

Material de referência já levantado pra essa implementação futura:

- **Papers originais da MaiMemo** (fundamentação teórica de por que o FSRS funciona — curva de
  esquecimento, efeito de espaçamento, valor de features temporais no histórico de revisão):
  - "Optimizing Spaced Repetition Schedule by Capturing the Dynamics of Memory" (Su et al.,
    IEEE TKDE 2023) — modelos DHP-HLR/GRU-HLR + otimização SSP-MMC.
  - "A Stochastic Shortest Path Algorithm for Optimizing Spaced Repetition Scheduling"
    (Ye, Su e Cao, KDD 2022) — versão de conferência do mesmo trabalho.
- **Wiki oficial**: https://github.com/open-spaced-repetition/awesome-fsrs/wiki — "ABC of FSRS",
  explicação do algoritmo, da métrica de avaliação, benchmarks e notebooks.

**Atenção**: os dois papers acima são a base acadêmica/histórica, não a especificação literal do
FSRS usado em produção hoje (o que o Anki roda de fato). O FSRS real (FSRS-4.5/5/6) é uma versão
simplificada e evoluída — modelo explícito de 3 componentes (Estabilidade S, Dificuldade D,
Retrievability R) com ~19-21 pesos treináveis por regressão logística sobre o histórico de revisões
do próprio usuário, não GRU/RL como nos papers. Na hora de implementar de verdade, a fonte certa
das fórmulas de produção é o repositório `fsrs4anki` (ou os ports `py-fsrs`/`ts-fsrs`) da
organização `open-spaced-repetition`, não uma reimplementação direta a partir dos papers.
