# Fases 1 e 2 — validação da integração Mastra e rastreabilidade

## Escopo implementado

1. `src/mastra.ts` usa as APIs oficiais `Agent` e `createTool` quando o runtime está instalado e `USE_MASTRA=true`. O modelo recebe contexto das mensagens e pode executar cinco ferramentas reais de leitura: `search-knowledge`, `list-my-tickets`, `get-my-ticket`, `find-potential-duplicates` e `assess-service-desk-policy`.
2. As ferramentas leem banco de testes legado/service desk reais da aplicação, não uma resposta de exemplo. Suas ações são limitadas ao usuário autenticado. Mutação de chamados continua exclusivamente no backend após rascunho e confirmação.
3. `src/postgres-audit.ts` mantém `agent_runs` e `agent_audit_events` no banco de testes legado. Cada execução registra `traceId`, modo, modelo, digest da entrada, resultado/falha, timestamps, ordem (`seq`), duração, chamada e resposta de ferramenta, recursos, decisão e justificativas. Dados são limitados e filtrados antes da gravação. Não são guardadas chaves nem prompt bruto da mensagem como input auditado.
4. A resposta do chat inclui `trace.traceId`. O endpoint autenticado `GET /api/conversations/:id/audit` permite acompanhar a trilha, e o chat oferece `Ver trilha detalhada`.
5. O resultado do modelo é validado em JSON estrito. Em status, conhecimento e abertura, a classificação de alta/média confiança só é aceita se as ferramentas obrigatórias forem executadas com sucesso. Falhas não são convertidas silenciosamente em êxitos. LOW faz escalonamento seguro (exceto handoff explícito/fora de escopo).

## Evidências obtidas neste ambiente

- Compilação `npm run build`: aprovada.
- `npm test`: **38/38** aprovados. Inclui testes HTTP com autenticação de auditoria, isolamento de usuários, chamadas de ferramenta via runtime de teste (mesmo contrato Agent/createTool), invalidação de output, falhas e ordenação da trilha, além dos cenários existentes.
- Não foi possível instalar o SDK `@mastra/core` nesta sessão: erro DNS `EAI_AGAIN` em `registry.npmjs.org`.
- Não havia `OPENAI_API_KEY`; portanto, **nenhuma inferência com provedor real foi executada**. Os testes com runtime injetado NÃO provam compatibilidade nem qualidade do LLM externo.

## Como executar o smoke com Mastra real

1. Use **Node.js >=22.18.0** e rede com acesso ao npm e ao provedor de modelo.
2. `npm install` (deve instalar os pacotes `@mastra/core` e `zod`).
3. `cp .env.example .env`; defina `USE_MASTRA=true`, `OPENAI_API_KEY=...`, `APP_SESSION_SECRET=...` e o modelo suportado em `MASTRA_MODEL`.
4. `npm run build` e `npm run smoke:mastra`.
5. O smoke exige interpretação `TICKET_STATUS`, `KNOWLEDGE_QUESTION`, `TICKET_CREATE`, além de comprovação de tool calls correspondentes. Em caso de diferença, termina com status 1. Os registros persistidos ficam no DB_PATH.
6. `npm run start:env` abre o servidor real para testar o chat; a API de auditoria exibe a trilha para o usuário autorizado.

**Observação:** o app continua em modo determinístico quando `USE_MASTRA=false`. Nesse modo, as decisões também geram eventos auditáveis, mas não devem ser apresentadas como inferências Mastra.

## Limites explícitos

- A integração real com o SDK e o provedor deve ser confirmada no smoke descrito acima.
- A proteção de dados é um filtro de logs para protótipo, não uma política completa de retenção/anonimização LGPD.
- Não há append-only resistente a administradores do banco nem exportação OTEL nativa; a trilha é persistente e correlacionada, mas não inviolável.
- Validação visual do Pencil e E2E em navegador pertencem à fase 4 e não foram executadas aqui.
