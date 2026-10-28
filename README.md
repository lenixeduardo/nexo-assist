# Nexo Assist — serviço de atendimento com PostgreSQL

Aplicação Node.js/TypeScript com chat de triagem, chamados, confirmação de rascunhos, atendimento humano e auditoria. **Persistência exclusivamente PostgreSQL**.

- Supabase: projeto TCGScan `ddiqrryapdimhuzvjtxn`.
- Schema isolado: `nexo` (não usar `public`).
- Conexão: `DATABASE_URL` protegida, TLS validado, driver `pg`.
- IA: Mastra, provedor Mistral direto (`mistral/mistral-small-latest`), dependente de chave e teste real.
- Produção: https://nexo-assist-self.vercel.app/

## Instalação

```bash
npm ci
cp .env.example .env
# Definir DATABASE_URL de um PostgreSQL de desenvolvimento, não o de produção.
# Aplicar migrations/001_postgres.sql no banco de desenvolvimento.
npm run typecheck
npm run build
npm run start:env
```

**Não aponte testes de integração ou seeds de demonstração para o banco produtivo.** O schema `nexo` do Supabase já possui dados e deve ser preservado. `SEED_DEMO_TICKETS` deve ser falso em produção. `APP_SESSION_SECRET` e `APP_AUTH_USERS_JSON` devem ser segredos no servidor.

## Testes

O workflow `.github/workflows/postgres-migration.yml` cria um PostgreSQL temporário, aplica a migração e testa regras, domínio, API e persistência. Localmente, configure um banco isolado e execute:

```bash
npm run typecheck
npm run build
npm test
npm run smoke:postgres
```

O teste `scripts/mastra-live-smoke.mjs` faz chamadas reais e grava auditoria; exige credenciais de provedor, banco isolado e execução explícita. Testes determinísticos não substituem sua evidência.

## Arquitetura

- `src/postgres.ts`: conexões TLS, transações e `SET LOCAL search_path TO nexo` por transação.
- `src/postgres-db.ts`: usuários, artigos, tickets, rascunhos, conversas, idempotência e handoff.
- `src/postgres-audit.ts`: `agent_runs` e `agent_audit_events`.
- `src/server.ts`: API, sessão e assets web.
- `src/agent.ts`: lógica determinística e autorização por usuário.
- `src/mastra.ts` e `src/mastra-provider.ts`: classificação via modelo, ferramentas somente leitura.
- `public/`: interface.

A API não permite mutação de tickets diretamente pelo modelo: o funcionário precisa confirmar cada rascunho. O banco compartilhado com TCGScan permanece isolado pelo schema `nexo`.

## Segurança

As tabelas de `nexo` não devem receber permissões `anon` nem `authenticated` na Data API. O acesso é server-side por credenciais PostgreSQL. RLS requer revisão específica antes de ser ativado; não criar policies permissivas indiscriminadamente. Nunca registrar ou publicar a URL de conexão completa, senhas ou chaves.

A aplicação necessita validação ponta a ponta em produção com login, histórico preservado entre requisições, chamadas Mistral e auditoria persistente. `READY` na Vercel e HTTP 200 no health não comprovam esses requisitos.
