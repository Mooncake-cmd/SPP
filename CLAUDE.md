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
