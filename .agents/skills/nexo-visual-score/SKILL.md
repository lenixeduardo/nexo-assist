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
