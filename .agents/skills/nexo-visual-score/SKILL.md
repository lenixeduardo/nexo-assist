---
name: nexo-visual-score-gate
description: Audita cada tela do Nexo Assist contra o Pencil, identifica gaps, corrige e revalida até alcançar 9,5/10 com evidências reais.
---
# Nexo Visual Score Gate — /nexo-visual-score

## Fonte de verdade
Use `docs/nexo.pen` e o PRD do desafio. Compare a mesma tela, no mesmo estado funcional e viewport 1440×900. Não confunda estados distintos (fila vazia vs fila preenchida; consulta vs seleção). Não invente dados nem altere tickets reais para obter uma captura.

## Ciclo obrigatório por tela
1. Identifique frame Pencil, rota, perfil, pré-condições e dados de teste.
2. Capture Pencil e produção com Playwright, sem substituir screenshot real por imagem gerada.
3. Verifique estado semântico equivalente antes de pontuar. Se faltar, registre **NÃO TESTADO** e crie fixture isolada ou cenário de teste autorizado.
4. Atribua notas de 0–10 para geometria e layout (25%), tipografia (15%), componentes e estados (20%), cores e superfícies (10%), conteúdo e dados equivalentes (15%), responsividade e acessibilidade (15%). Média ponderada; reporte evidências, screenshots e desvios mensuráveis. Métricas de pixels são auxiliares, não a nota.
5. Gere backlog ordenado por impacto, com seletor/componente, diferença observada, referência desejada, correção e critério verificável.
6. Corrija um conjunto coerente de problemas por vez, preserve fluxos reais e execute build, testes e auditoria visual.
7. Repita até nota >= 9,5/10 em **cada** tela e nenhuma diferença crítica aberta. Nunca declare 9,5 sem capturas atuais e validação funcional.

## Critérios de bloqueio
- Login/autenticação falha, componente ausente, layout quebrado, overflow horizontal, texto ilegível, tela/estado não capturado, botão sem ação real, dados fictícios apresentados como reais: bloqueia aprovação.
- Screenshot do CI deve registrar commit, URL, viewport, usuário de teste (sem segredo), data, frame e estado.
- Não usar porcentagem de pixels como nota de 0–10.
- Nunca ocultar falhas com `continue-on-error` na etapa de aceitação; exportação de evidências pode usar `if: always()`.

## Relatório
Tabela: tela, estado verificado, nota por dimensão, nota final, gaps P0/P1/P2, correções feitas, testes, screenshot e próximo passo. Marque **PENDENTE** quando não houver estado comparável. O gate global passa apenas se todas as seis telas atingirem >=9,5.

## Telas
- bi8Au: Login
- IcuoM: Chat novo chamado
- vbsNW: Chat consulta e transferência
- x2HBOE: Atendente conversas
- CAqx8: Atendente em atendimento
- i4fCbC: Meu perfil

## GATE OBRIGATÓRIO DE EVIDÊNCIA (não opcional)
Depois de **cada** alteração de UI, execute o workflow `Nexo visual audit screenshots` no SHA atualizado, aguarde sua conclusão e recupere o artifact `nexo-visual-audit-evidence`. Nunca encerre a rodada apenas com commit ou CI verde.

Antes de considerar uma página avaliada, confirme no artifact:
1. Captura Pencil PNG, captura real da UI da **branch atual** (JS/CSS injetados sobre origem autenticada), e `comparison-<screen>.jpg` lado a lado, todas no mesmo viewport e estado.
2. `six-screen-comparison.json` contendo a página com `status=compared`; `authenticated/results.json` com `status=captured` e sem overflow. Para login, capture equivalente anônimo.
3. Log do run e SHA correspondente ao último commit; screenshots de um SHA antigo são inválidas para pontuar correções novas.
4. Disponibilize a evidência visual **na própria conversa** quando solicitado, além de link do artifact e nota detalhada.
5. Compare resultados antes/depois. Se MAE piorar, investigue regressão antes de declarar progresso; métricas de pixels não substituem a inspeção semântica.
6. Sem screenshot, com estados divergentes ou falta de dados, marque `BLOQUEADO/NÃO TESTADO`; não aumente a nota e não declare aprovação.
7. A nota 9,5 requer aprovação por tela, evidência do mesmo SHA, testes de interação e relatório de critérios ponderados. O gate global exige seis telas aprovadas.

### Evidência de referência mais recente
Run 40771905509 (SHA e49f929): login MAE 7.31; chat novo 18.61; consulta 13.85; fila 9.60; perfil 2.96; atendimento ativo NÃO TESTADO. Estes valores são apenas baseline, não nota visual.
