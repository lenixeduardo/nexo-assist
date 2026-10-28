# Nexo Assist — PostgreSQL

O backend, o agente e Mastra utilizam PostgreSQL assíncrono. O esquema privado
`nexo` foi aplicado ao banco do TCGScan (`ddiqrryapdimhuzvjtxn`) e não
modifica o esquema `public`.

## Credenciais

A aplicação exige `DATABASE_URL` no servidor. A conexão administrativa via
Supabase MCP não disponibiliza a senha PostgreSQL; **não redefina a senha**
do banco compartilhado, pois isso pode interromper o TCGScan.

1. Supabase → projeto TCGScan → **Connect** → **Transaction pooler** (porta 6543).
2. Configure a URL completa no segredo `DATABASE_URL` da hospedagem,
   sem incluir a senha no Git ou no frontend.
3. Configure `APP_SESSION_SECRET` e `APP_AUTH_USERS_JSON` como segredos.
4. Em produção, `APP_DEMO_LOGIN=false`, `SEED_DEMO_TICKETS=false` e
   **não** configure `PGSSL_DISABLE`.

Todas as consultas usam `SET LOCAL search_path TO nexo, pg_catalog` dentro
de uma transação, adequado ao pooler de transações Supavisor.

## Validação

`.github/workflows/postgres-migration.yml` executa um PostgreSQL 16
descartável e aplica `migrations/001_postgres.sql`.

- `npm test`: testes de política, PostgreSQL e HTTP.
- `npm run test:postgres`: testes de persistência e HTTP PostgreSQL.
- `npm run smoke:postgres`: conexão, esquema privado e rollback.
- `npm run test:legacy`: suíte SQLite antiga, preservada para referência.

O teste em PostgreSQL de CI não comprova a conexão com o Supabase real.
Execute `npm run smoke:postgres` usando o segredo real em ambiente protegido
antes de considerar a migração concluída. Não desative o Render antes de
validar login, tickets, auditoria e o deploy Vercel.
