# Nexo Assist — QA e release gate (04/11/2026)

## Status

Versão preparada em **PR #7** (segurança e smoke isolado) e **PR #8** (tickets, handoff, UI e QA). Publicação em produção bloqueada até aprovação da matriz abaixo.

Esta avaliação não pode ser marcada como 96+/100 com base somente em build READY, respostas HTTP 200, cenários simulados ou screenshots sem referência Pencil.

## Equipes de verificação independentes

| Frente automatizada | Arquivo/job | Responsabilidade |
|---|---|---|
| Segurança/autenticação | `.github/workflows/ci.yml` + `tests/auth-session.test.mjs` | HMAC, cookies, fronteiras de acesso e sintaxe JS |
| Regras, tickets, analistas, dados | `.github/workflows/postgres-migration.yml` | Banco descartável, transações, idempotência, concorrência e smoke de rollback |
| UX, responsividade e navegação | `.github/workflows/qa-browser.yml` | Chromium real, seis estados da UI, 375/390/768/1440 px, screenshots e erros de console |
| IA real | `.github/workflows/qa-mistral.yml` | Três inferências com Mastra e provedor Mistral, ferramentas consultadas, uso e eventos persistidos |

São verificações especializadas automatizadas; não constituem agentes humanos independentes nem substituem uma revisão visual manual.

## Critérios de aceitação dos 13 itens

| Item | Evidência obrigatória |
|---|---|
| 01 Permissões | Auditoria de `nexo`: sem grants `anon/authenticated`, papel servidor e RLS revisados |
| 02 Sessões | Testes HMAC, cookies, isolamento de usuários, login real validado em preview |
| 03 Mastra/Mistral | **Execução live COMPLETED** com chamadas reais a ferramentas e auditoria; sem fallback fictício |
| 04 PostgreSQL | SSL/TLS, schema `nexo`, persistência, rollback, reconexão e teste no banco descartável |
| 05 Tickets | Rascunhos, confirmação, idempotência, sequenciamento de IDs e duplicidades |
| 06 Handoff | Fila, assumir, responder, devolver, encerrar, estados e concorrência |
| 07 Seis telas | Evidência 01-login, 02-chat, 03-rascunho, 04-fila, 05-atendimento assumido, 06-perfil |
| 08 Tipografia/UI | Ícones SVG, tokens Pencil, labels legíveis, fontes carregadas, ausência de dados falsos |
| 09 Acessibilidade/mobile | Keyboard, foco, menu Escape, sem overflow nos quatro viewports, sem exceções JS |
| 10 Regressões | CI verde e capturas atribuídas ao mesmo SHA de commit |
| 11 Pipeline | `npm ci`, Node 22 LTS pinado, environment protegido, projeto e branch corretos |
| 12 Entrega | Review, changelog, preview READY, certificação de segurança, merge e promoção controlada |
| 13 QA >95/100 | Nota calculada com evidência por critério, **sem áreas críticas pendentes** |

## Régua de pontuação (100 pontos)

| Dimensão | Máximo | Regra para nota |
|---|---:|---|
| Segurança e autenticação | 15 | Testes de sessões, autorização e grants |
| Chamados, idempotência e concorrência | 20 | Regressões reais PostgreSQL aprovadas |
| Atendimento humano | 15 | Casos de fila, atribuição e retorno no banco e navegador |
| Banco e isolamento | 15 | Sem mutação no Supabase produtivo; smoke PostgreSQL isolado |
| Funcionalidade de UI | 10 | Editor, navegação, mensagens, erros e auditoria |
| Mobile/acessibilidade | 10 | 375/390/768/1440, foco, teclado e ausência de overflow |
| Fidelidade visual ao Pencil | 5 | Rasterização e comparação de referência, não somente CSS |
| Mastra com Mistral real | 5 | Evidência `MODEL_RESULT` com usage e tools reais |
| Release/observabilidade | 5 | Preview e produção aprovados, rastreabilidade e rollback |
| **Total** | **100** | **Liberação somente com 96 pontos ou mais e sem blocker P0** |

**Gates P0:** falha de autorização, vazamento de dados, falta de persistência, falha de Mistral live (enquanto USE_MASTRA=true), ou CI/build vermelho impedem release independentemente da nota.

## Ações pendentes externas

- Configurar, em segredo protegido do GitHub Actions, `MISTRAL_API_KEY` para `qa-mistral.yml` (não transmitir a chave em chat ou logs). A existência de uma chave protegida na Vercel **não equivale** a esse teste.
- Comparar as seis capturas do mesmo commit com `docs/nexo.pen` por exportação nativa de referência quando disponível. Diferenças de renderização devem ser registradas, não tratadas como zero.
- Só após gates verdes: revisar PR #7 e PR #8, publicar o commit aprovado, checar produção sem criar chamados fictícios e registrar commit SHA publicado.

## Evidências e links

- PR base: https://github.com/lenixeduardo/nexo-assist/pull/7
- PR funcional/UX: https://github.com/lenixeduardo/nexo-assist/pull/8
- Revisão visual histórica: `artifacts/pencil-geometry.json`
- Screenshots novos: artefato `nexo-qa-six-screens` da execução de `qa-browser.yml`.
