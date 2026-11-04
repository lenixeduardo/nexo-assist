# Nexo Assist — revisão visual do Pencil (04/11/2026)

**Escopo:** exclusivamente fidelidade visual e usabilidade. Mistral/API key excluída da nota conforme solicitação.  
**Branch:** `fix/nexo-ticket-handoff-ui-a11y-20261104`  
**Commit testado:** `6a093b3f376c0d79c4fc3b03d15f75a1f7124830`  
**Preview Vercel:** https://nexo-assist-ktz0x8l6t-lenix-eduardos-projects.vercel.app — READY (preview, não produção)

## Correções aplicadas após a v6

1. Reestruturação da barra lateral: duas navegações primárias, acesso de nova conversa no cabeçalho e histórico expansível (sem remover a funcionalidade).
2. Marca Nexo renderizada em SVG próprio; pesos, densidade tipográfica e metadados das respostas próximos ao Pencil.
3. Cartões de seleção de chamados usam ID, título, situação e data reais via API autorizada; evitam repetição de linhas no texto do agente.
4. Resumo de chamado contém título, descrição, status, categoria, prioridade, data de abertura e última atualização reais. Campo não disponível permanece como não informado, sem inventar prazo.
5. Triagem apresenta opções contextuais para quantidade de pessoas afetadas, com submissão pela API real e resposta livre preservada.
6. Rascunho do chamado com cartão largo, menos bordas e cabeçalho compacto, mantendo edição, cancelamento e confirmação.
7. Alinhamento vertical de conversas curtas e compositor sem contorno pesado, conforme hierarquia da referência.
8. Botões de devolver/encerrar atendimento deslocados para cabeçalho quando o analista assumiu. Área de handoff permanece no rodapé durante espera.
9. Corrigida rolagem após layout de novo chamado e conversa do analista, com assertivas que exigem ações e mensagem recente visíveis.

## Medição da fidelidade

Exportação dos seis frames originais `docs/nexo.pen` com o Pencil, comparados a screenshots reais no Chromium dos mesmos tamanhos, sem escala artificial.

| Tela | SSIM v6 | SSIM após revisão | Erro RGB médio após revisão |
| --- | ---: | ---: | ---: |
| Login | .8291 | .8299 | 12.70 |
| Novo chamado | .7869 | .8010 | 16.29 |
| Consulta/transferência | .7983 | .8343 | 13.89 |
| Fila do analista | .7512 | .7513 | 10.01 |
| Atendimento assumido | .7441 | .7436 | 10.42 |
| Perfil | .9298 | .9457 | 2.03 |
| **Média** | **.8066** | **.8176** | — |

**Interpretação:** SSIM é uma medida de semelhança de imagens (0 a 1), não a nota de qualidade 0–100. Diferenças de texto, fixture de dados, horários e composição interferem. A geometria macro do console permanece próxima, mas o conteúdo e a distribuição do histórico ainda divergem consideravelmente dos frames. A meta de **95/100 não foi certificada**.

## Evidência funcional

- **44/44 verificações Chromium PASS**. [Execução QA](https://github.com/lenixeduardo/nexo-assist/actions/runs/41850416815).
- QA cobre autenticação isolada, rascunho editável, confirmação persistida, seleção/consulta de ticket autorizado, handoff, resposta e devolução de analista, ações no cabeçalho, mensagem recente visível, escolhas de impacto funcionais, drawer mobile, sem exceções JS e sem overflow em 375/390/768.
- **Build/TypeScript/JS/auth PASS**. [Workflow CI](https://github.com/lenixeduardo/nexo-assist/actions/runs/41850416775).
- **Integração PostgreSQL 16 PASS**. [Workflow Postgres](https://github.com/lenixeduardo/nexo-assist/actions/runs/41850417070).
- Vercel preview READY no commit testado; produção e banco compartilhado não receberam fixtures.

## Pendências para certificar 95/100

1. Criar um cenário visual canônico compatível com as conversas da fonte Pencil, sem afirmar dados inventados em produção; telas de analista são as maiores divergências SSIM.
2. Revisar tipografia, ícones e espaçamentos por região no login e nas conversas; o Pencil original contém métricas demonstrativas sem lastro que **não devem ser reinseridas** apenas para melhorar SSIM.
3. Auditar interações com teclado, leitor de tela, contraste e desempenho em aparelhos físicos, além do Chromium de CI.
4. Consolidar as muitas regras CSS em uma camada de estilos mais previsível, removendo sobrescritas redundantes sem regressão.
5. Fazer nova comparação/aceite visual humano, incluindo medidas por região, antes de certificar pontuação superior a 95/100.

**Release:** PR #8 permanece draft; nenhuma alteração em produção. Mistral foi excluído desta avaliação visual, mas seu teste de integração ainda constitui uma questão separada para uma publicação completa.
