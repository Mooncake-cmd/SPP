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
