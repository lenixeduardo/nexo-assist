# PostgreSQL: configuração e testes

A aplicação usa `DATABASE_URL` no servidor. Nunca use a URL da API REST,
chave `anon` ou `service_role` como string de conexão PostgreSQL.
Configure a string do pooler de transações do Supabase como segredo no ambiente
de hospedagem. `PGSSL_DISABLE=true` é permitido apenas em ambiente de teste local.

O schema privado `nexo` foi provisionado no projeto TCGScan.
O driver `pg` configura `search_path=nexo,pg_catalog` para cada conexão.

## Testes

O workflow `.github/workflows/postgres-migration.yml` provisiona um
PostgreSQL 16 temporário, aplica `migrations/001_postgres.sql`,
compila o projeto e executa os testes de integração em
`tests/postgres-integration.test.mjs` e `scripts/postgres-smoke.mjs`.

**Não executar os testes de integração no banco de produção:** eles inserem
usuários, tickets, conversas e mensagens de teste. O workflow usa um banco
descartável e isolado.

A suíte legada `npm test` contém cenários específicos de SQLite e deve
ser migrada antes de liberar a produção. Os testes novos não substituem
toda a cobertura de regressão existente.

## Credenciais

O conector Supabase permite consultar o esquema, mas não fornece a senha
do banco. Para validar o aplicativo contra o Supabase real, ainda é necessário
configurar a variável secreta `DATABASE_URL` no ambiente de execução
e rodar `npm run smoke:postgres` com acesso ao pooler.
