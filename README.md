# Nexo Assist — Desafio técnico Beyond the Bytes

**Versão:** 1.4.0 • **Idioma:** pt-BR • **Stack:** Node.js 22.18+, TypeScript estrito, SQLite, HTML/CSS/JS • **Agente:** Mastra opcional.

Aplicação de service desk com login de funcionários demonstrativos, chat de triagem, consulta de chamados e central de ajuda, rascunhos confirmáveis, regras de prioridade/SLA, transferência para analista, console humano, auditoria rastreável e conversas persistidas.

> **Escopo de validação:** todos os testes automatizados locais (46 de 46) e os 9 fluxos de Chromium passaram. O navegador usou um *bridge* HTTP porque este ambiente bloqueia navegação localhost; não equivale a validar TLS/cookies do navegador. O Mastra com provedor LLM real, pixel-perfect do Pencil e URL público de produção ainda não foram validados. Não declarar 10/10 sem essas evidências.

## Inicialização rápida (modo de demonstração)

Com Node.js 22.18+ e o pacote descompactado:

```bash
npm start
```

Abra `http://localhost:3000`. O `dist/` compilado está incluído no ZIP, portanto o modo determinístico funciona sem baixar pacotes. O SQLite é criado automaticamente em `./data/nexo.sqlite` e populado com 5 usuários, 8 artigos e chamados demonstrativos.

| Perfil | E-mail | Senha de demonstração |
|---|---|---|
| Funcionária | `ana.souza@nexo.com.br` | `demo123` |
| Funcionário | `bruno.tavares@nexo.com.br` | `demo123` |
| Funcionária | `carla.mendes@nexo.com.br` | `demo123` |
| Funcionário | `diego.ramos@nexo.com.br` | `demo123` |
| Analista N2 | `rafael.lima@nexo.com.br` | `demo123` |

**Importante:** a senha não é validada contra uma conta corporativa. Isto é deliberado conforme PRD, **somente para demonstração**. Em `NODE_ENV=production`, o login demo é bloqueado salvo ativação explícita de `APP_DEMO_LOGIN=true`. Não use contas reais nem dados sensíveis.

## Scripts de teste

```bash
npm install                     # necessário para editar/compilar TypeScript
npm run build
npm run typecheck
npm test                        # 46 testes Node
npm run test:e2e                # 9 verificações Chromium + screenshots
```

O teste de navegador requer Python 3 com `playwright` e Chromium disponível. Ele pode executar com `CHROMIUM_PATH=/usr/bin/chromium`; alternativamente, instale o navegador Playwright com `python -m playwright install chromium`. Em ambientes que bloqueiam localhost, a suíte monta os arquivos frontend no Chromium e encaminha suas chamadas fetch ao servidor real com Python; o método e os limites estão descritos em `tests/browser_e2e.py`.

As evidências estão em `artifacts/browser-report.json` e `artifacts/screenshots/` e o levantamento da geometria original em `artifacts/pencil-geometry.json`.

## Componentes e responsabilidades

- `src/server.ts`: API HTTP, sessão assinada, cookies HttpOnly, autorização, CSP, limite de requisições, validação de origem.
- `src/agent.ts`: interpretação, consulta de ferramentas, regras de segurança, histórico e handoff; controla a máquina de estados.
- `src/mastra.ts`: agentes Mastra com ferramentas reais **somente de leitura**, vinculadas à identidade autenticada.
- `src/audit.ts`: registros `agent_runs` e `agent_audit_events`, identificador `traceId`, entradas/saídas redigidas, regras e justificativas.
- `src/db.ts`: serviço simulado de chamados separado do agente, SQL parametrizado, SQLite persistente, transações, controle de concorrência e confirmação idempotente.
- `src/policy.ts`: regras do Anexo A: INC/REQ, categoria, prioridade e SLA, detecção de duplicidade e reabertura.
- `public/`: as seis telas/estados previstos na referência Pencil + layout responsivo.
- `tests/`: regras, integração, auditoria Mastra simulada, segurança, persistência, HTTP de produção, UI Chromium.

Todas as mutações permanentes passam por `POST /api/drafts/:id/confirm`, com versão, chave de idempotência e validação de propriedade. O modelo não tem acesso a mutações de chamados. O estado de cada conversa é `AGENT_ACTIVE → WAITING_ANALYST → ANALYST_ACTIVE → AGENT_ACTIVE/CLOSED`. Enquanto está em atendimento humano, o agente permanece pausado.

## Mastra com provedor real (ainda não validado neste ambiente)

Em uma máquina com acesso ao npm e credenciais de provedor, crie `.env` a partir de `.env.example`, sem incluí-lo no Git:

```env
USE_MASTRA=true
OPENAI_API_KEY=configure-fora-do-repositorio
MASTRA_MODEL=openai/gpt-4.1-mini
APP_SESSION_SECRET=gere-uma-chave-aleatoria-com-pelo-menos-32-caracteres
```

```bash
npm install
npm run build
npm run smoke:mastra
npm run start:env
```

`smoke:mastra` deve executar uma chamada real e falhar se ferramentas não forem invocadas. Testes que imitam a API do Mastra **não** comprovam o runtime real.

A API `GET /api/conversations/:id/audit` expõe somente ao funcionário proprietário ou ao analista autorizado os eventos correlacionados de suas conversas. Os registros escondem segredos e preservam identificadores de recursos e tempos das ferramentas.

## Fluxos rápidos de aceitação

1. Ana pergunta `Qual o status dos meus chamados?`; o agente retorna cards filtrados por identidade.
2. Ana pergunta `Qual o status do chamado INC-20311?`; o SLA vencido provoca handoff. O agente pausa.
3. Ana envia `Minha impressora está travando, só eu, tenho alternativa de usar outra impressora`; surge um rascunho **sem criar chamado**. Clique em Confirmar para a mutação efetiva.
4. Ana pede `Quero falar com um analista`; Rafael assume no console, responde, devolve ou encerra.
5. Expanda `Ver decisões do agente` / `Ver trilha detalhada` para acessar eventos ordenados do agente e suas ferramentas.
6. Reinicie o servidor e verifique que conversas, mensagens, chamados e estados foram preservados.

## Deploy recomendado: Render + disco persistente

`render.yaml` e `Dockerfile` estão preparados para um serviço web Node de longa duração, com `/data/nexo.sqlite` em **disco persistente**. Este é um **blueprint**, não um deploy realizado. O SQLite local não deve ser hospedado em Vercel Functions sem migração para banco externo (o armazenamento efêmero violaria a persistência exigida).

1. Envie este projeto a um repositório Git sob seu controle, omitindo `.env` e arquivos SQLite.
2. Conecte o repositório ao serviço Render e crie um Blueprint baseado em `render.yaml` (plano com disco persistente).
3. Configure a variável secreta `APP_SESSION_SECRET` e, para testes demonstrativos públicos, `APP_DEMO_LOGIN=true`; proteja o acesso/limite requisições e não use dados reais.
4. Depois do deploy, abra `https://SEU-DOMINIO/api/health`, realize login, crie/recupere uma conversa, reinicie a instância e confirme que a persistência funciona.
5. Para usar Mastra no deploy, configure `OPENAI_API_KEY`, `MASTRA_MODEL` e `USE_MASTRA=true` nas variáveis privadas do provedor. Execute o smoke test com a credencial no ambiente de homologação.

**Sem conexão com a hospedagem e provisionamento de disco não há URL público neste pacote.** Não se recomenda publicar o backend SQLite em um runtime serverless sem persistência.

## Regras adotadas e trade-offs

- Prioridade crítica: 1h corrida; alta 4h úteis; média 3 dias úteis; baixa 5 dias úteis.
- Horário útil adotado: seg–sex 08:00–18:00, America/Sao_Paulo, **sem feriados**. É uma interpretação documentada do PRD.
- O limite de 30 mensagens conta as mensagens do funcionário com o agente, não mensagens de analistas.
- Chamados resolvidos até sete dias podem ser reabertos após confirmação. Duplicidade é uma heurística baseada em assunto + categoria e validada novamente na transação; **não** é uma busca semântica perfeita.
- A classificação de confiança é uma heurística/autodeclaração de modelo, não uma probabilidade calibrada.
- `conversation_processing` rejeita solicitações simultâneas e possui TTL de recuperação de 90s. Adequado a protótipo com um SQLite em volume compartilhado; não equivale a um sistema distribuído com orquestração de workers.
- O modelo utiliza ferramentas somente de leitura. Dados de outro funcionário nunca devem ser enviados ao modelo.
- Requisitos de produção fora do MVP: autenticação corporativa, gestão de segredos, política de retenção da auditoria, testes ofensivos, telemetria e banco gerenciado distribuído.

## Documentação e auditoria

- `docs/AGENT_SPEC.md`: spec de desenvolvimento do agente.
- `docs/VALIDACAO_FASES_1_2.md`: integração Mastra e auditoria.
- `docs/VALIDACAO_FASES_3_4_5.md`: auditoria detalhada do PRD, evidências e limitações.
- `docs/nexo.pen`: referência Pencil v2.21 original.
- `artifacts/pencil-geometry.json`: tokens e dimensões dos seis frames.
- `.github/workflows/ci.yml`: CI de compilação, testes e capturas Chromium.

### Conclusão

**Implementado e validado localmente:** regras, fluxos, segurança funcional, auditoria, console e testes. **Ainda pendente para alegar 10/10:** execução real do Mastra com LLM, renderização e comparação pixel-perfect nativa do Pencil e publicação + smoke real em hospedagem persistente.
