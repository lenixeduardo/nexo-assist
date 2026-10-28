# Auditoria PRD v5 — fases 3, 4 e 5

## Método / limitações

O ZIP é o artefato de código. Os testes do Node são executados contra banco de testes legado temporário; a suíte de navegador executa o JS/CSS original em Chromium e conecta a API HTTP real via bridge Python, pois navegação direta localhost é bloqueada pelo ambiente. Não confundir bridge com validação de tráfego TLS e cookies no navegador. Não foi possível renderizar nativamente o Pencil para gerar uma métrica pixel-perfect. A comparação de 6 frames é estrutural e geométrica (`artifacts/pencil-geometry.json`), não pixel a pixel.

## Fase 3: Segurança

- Analista vê apenas conversas `WAITING_ANALYST` e `ANALYST_ACTIVE`, nunca conversas em andamento com o agente; HTTP, fila e auditoria têm verificações de autorização.
- Usuário autenticado pode consultar/alterar somente chamados e rascunhos próprios. Tools do Mastra usam userId da sessão.
- banco de testes legado usa transações `BEGIN IMMEDIATE` e lock persistente `conversation_processing` para rejeitar mensagens simultâneas de um mesmo diálogo, inclusive entre processos. TTL de recuperação do lock: 90s (limitação, não lock distribuído de alto volume).
- Confirmação do rascunho verifica versão, estado, ownership, política, duplicidade, serviço legado e idempotência vinculada ao ID do rascunho. Replays sinalizados `replay:true`.
- Edições verificam limites de tamanho e recalculam prioridade; respostas humanas passam por transação e state machine.
- Login de demonstração é bloqueado em `NODE_ENV=production` salvo `APP_DEMO_LOGIN=true` explícito. Sessões exigem segredo robusto em produção. Controles básicos de origem, CSP, cookie HttpOnly e rate limit para login existem. Login demo não equivale a autenticação corporativa.
- Simulação de indisponibilidade do sistema legado produz resposta segura e não cria chamados, validada em testes.

## Fase 4: Interface

- Contraste de base, superfícies, variáveis de cor, sidebar 232px e console 64px/380px/340px alinhados à geometria do Pencil v2.21.
- Foram produzidas screenshots dos seis estados do protótipo e uma variante mobile. As telas de chat usam dados de exemplo próprios, não as mesmas datas/linhas do Pencil.
- Suíte Playwright: login, perfil, rascunho, painel de auditoria, confirmação, chamado vencido/transferência, console aguardando, analista assumiu, mobile sem overflow.
- **Pendente:** rasterizar arquivo .pen pelo Pencil e comparar pixels, incluindo tipografia Geist, ícones nativos, detalhamento de microcomponentes e responsividade em outros tamanhos. Não é adequado alegar 9,5+ de fidelidade visual sem referência renderizada.

## Fase 5: Entrega e publicação

- README e arquivo `.env.example`; scripts `npm run build`, `npm test`, `npm run test:e2e`.
- CI GitHub com typecheck, testes e evidências de Chromium.
- Dockerfile e `render.yaml` para hospedar como serviço Node contínuo em **Render Starter com disco persistente**, ao contrário de deploy serverless com banco de testes legado efêmero. Necessário conectar repositório e provisionar conta de hospedagem; o blueprint não cria deploy automaticamente.
- **Deploy público NÃO realizado** nesta execução. Nenhum URL ou status READY deve ser declarado antes do deploy remoto e de um smoke HTTP pós-deploy. O modo Mastra real também depende de dependências e credenciais do provedor.

## Checklist da avaliação do PRD

| Critério | Implementação / evidência | Estado |
|---|---|---|
| Login funcionários de exemplo | tela e API login | local aprovado |
| Chat, 30 mensagens, histórico | backend e navegador | local aprovado |
| Consultar KB / tickets, SLA | API, lógica, 46 testes | local aprovado |
| Incidente/requisição, prioridade | regras determinísticas | local aprovado |
| Draft com confirmação | API transacional + navegador | local aprovado |
| Evitar duplicidade e reabrir 7 dias | regras com testes | local aprovado |
| Handoff humano / agente pausado | DB state + console + navegador | local aprovado |
| Console atendente | fila, ações, estados | local aprovado |
| Transparência / auditoria | tabelas de eventos + UI | local aprovado |
| Persistência após reinício | banco de testes legado + teste restart | local aprovado |
| Mastra real / LLM | adapter e smoke dedicados | **pendente live** |
| Pixel perfect do Pencil | tokens, dimensões e capturas | **parcial** |
| Deploy público funcional | Docker+Render blueprint | **não publicado** |

**Nota:** não declarar nota 10/10 até comprovação da execução real do Mastra, validação nativa visual e serviço publicado com persistência.
