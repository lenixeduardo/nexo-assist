# Nexo Assist — Desafio técnico Beyond the Bytes

Service desk em português com chat de triagem, chamados simulados, confirmação explícita, transferência humana, console do analista e auditoria persistente.

**Stack atual:** Node.js 22.18+, TypeScript estrito, PostgreSQL, HTML/CSS/JS. Mastra é uma integração opcional. O caminho ativo `src/server.ts` utiliza PostgreSQL; os módulos SQLite e alguns arquivos de `dist/` no histórico são legados. Compile antes de executar.

**Produção:** https://nexo-assist-self.vercel.app/

## Executar localmente

```bash
npm install
cp .env.example .env
# Configure DATABASE_URL para um banco PostgreSQL de desenvolvimento.
# Aplique migrations/001_postgres.sql nesse banco, conforme migrations/README.md.
npm run build
npm run start:env
```

O esquema privado `nexo` deve existir antes de iniciar. A aplicação semeia cinco funcionários/perfis e oito artigos; chamados de exemplo são opcionais com `SEED_DEMO_TICKETS=true`. Não aponte testes para o banco de produção. Os testes usam dados próprios e devem executar em banco isolado.

Em ambiente não produtivo, sem `APP_AUTH_USERS_JSON`, os usuários de exemplo aceitam qualquer senha não vazia. Em produção, a configuração de autenticação é obrigatória: `APP_DEMO_LOGIN` não substitui `APP_AUTH_USERS_JSON` no servidor PostgreSQL atual.

| Perfil | E-mail |
|---|---|
| Funcionária | `ana.souza@nexo.com.br` |
| Funcionário | `bruno.tavares@nexo.com.br` |
| Funcionária | `carla.mendes@nexo.com.br` |
| Funcionário | `diego.ramos@nexo.com.br` |
| Analista N2 | `rafael.lima@nexo.com.br` |

Produção utiliza credenciais próprias para Ana e Rafael, armazenadas como hashes scrypt. As senhas são entregues fora do repositório; `demo123` não é a senha produtiva. Os demais perfis do seed não possuem acesso produtivo sem inclusão explícita na configuração.

## Verificação

```bash
npm run typecheck
npm run build
npm test
npm run smoke:postgres
```

`npm test` exige `DATABASE_URL` e o esquema de teste criado. O workflow `.github/workflows/postgres-migration.yml` provisiona PostgreSQL 16 isolado, aplica a migração e executa testes de domínio, persistência, HTTP e conexão. `.github/workflows/ci.yml` verifica build, tipos e regras de negócio. Testes de navegador legados não comprovam o deploy atual.

A validação real de produção está documentada em [docs/VALIDACAO_PRODUCAO_2026-10-28.md](docs/VALIDACAO_PRODUCAO_2026-10-28.md), com a relação de verificações e limites da evidência. O resultado de um smoke HTTP não equivale a validar visualmente todas as telas, responsividade ou a integração com um LLM real.

## Deploy na Vercel

O projeto usa o framework Node com detecção de `src/server.ts`, exportação padrão do handler e `api/index.js` como entrada auxiliar. O roteamento nativo preserva os caminhos `/api/*`; não reescreva todos eles para `/api/index.js`, pois isso faz login e health chegarem à autenticação como rota desconhecida.

Configure no ambiente Production:

- `DATABASE_URL`: conexão PostgreSQL externa.
- `PGSSL_CA_PEM` e `PGSSLMODE`: TLS com verificação de certificado; não desabilitar TLS em produção.
- `APP_SESSION_SECRET`: segredo aleatório com pelo menos 32 caracteres.
- `APP_AUTH_USERS_JSON`: objeto `{ "email": "scrypt:SALT_HEX:HASH_HEX" }`; salt de 16 bytes decodificado de hex, derivação de 64 bytes com N=16384, r=8, p=1.
- `NODE_ENV=production`; `SEED_DEMO_TICKETS=true` apenas para dados demonstrativos.
- `USE_MASTRA=false` para o modo determinístico validado. A ativação de Mastra requer configuração e smoke real separado.

Após qualquer mudança nas variáveis, crie um novo deploy. Não publique segredos no código, logs ou relatório. O domínio público canônico acima difere dos aliases de preview protegidos por Vercel Authentication.

## Componentes e regras

- `src/server.ts`: API HTTP, sessões assinadas, cookies HttpOnly/Secure, autorização, validação de origem e limites de requisições.
- `src/agent.ts`: triagem, ferramentas e máquina de estados; o agente pausa durante atendimento humano.
- `src/postgres-db.ts`: serviço simulado de chamados, transações, confirmação idempotente e propriedade de recursos.
- `src/postgres.ts`: pool TLS e `SET LOCAL search_path` por transação, compatível com o pooler transacional.
- `src/postgres-audit.ts`: execuções e eventos ordenados, vinculados à identidade e conversa.
- `src/policy.ts`: tipo, categoria, prioridade, SLA, duplicidade e reabertura.
- `src/mastra.ts`: ferramentas de leitura associadas ao usuário autenticado; a integração real permanece uma validação separada.
- `public/`: login, chat, rascunhos, auditoria, perfil e console humano.

Mutações de chamados exigem `POST /api/drafts/:id/confirm`, versão e chave de idempotência. Estados: `AGENT_ACTIVE → WAITING_ANALYST → ANALYST_ACTIVE → AGENT_ACTIVE/CLOSED`.

O limite é de 30 mensagens do funcionário por sessão ativa com o agente. Prioridades: crítica 1h corrida; alta 4h úteis; média 3 dias úteis; baixa 5 dias úteis. Horário útil: seg–sex, 08h–18h, America/Sao_Paulo, sem feriados. Reabertura: até sete dias após resolução, com confirmação. Duplicidade e confiança são heurísticas, não garantias semânticas ou probabilidades calibradas.

## Documentação e limites

- `docs/AGENT_SPEC.md`: especificação do agente.
- `docs/VALIDACAO_FASES_1_2.md` e `docs/VALIDACAO_FASES_3_4_5.md`: evidências históricas, anteriores ao deploy PostgreSQL.
- `docs/nexo.pen`: referência visual original.
- `migrations/README.md` e `docs/postgres-testing.md`: migração e testes.

O modo determinístico não comprova a execução real do Mastra com provedor LLM. A comparação pixel-perfect nativa com Pencil e a revisão visual completa desktop/mobile permanecem separadas. Autenticação corporativa/SSO, retenção de auditoria e operação em escala ficam fora deste protótipo.
