# Validação de produção — Nexo Assist

Data: 28/10/2026 (America/Sao_Paulo). URL canônica: https://nexo-assist-self.vercel.app/.

Código executado: `2963b1d6971ffe98dbcf564b3a7fadf611922982`, branch `feat/postgres-vercel-migration`. Persistência conferida após substituir o deploy `dpl_CeukkUL3wQkQQ82HLidrhNiiVW5w` por `dpl_DjNPMuivqAxcy5RieMu7Dh9e4BDs`, ambos com o mesmo código e configuração produtiva corrigida.

## Correções realizadas

1. Removida a reescrita `/api/:path* → /api/index.js` de `vercel.json`. No framework Node detectado pela Vercel, ela fazia health e login chegarem à verificação de sessão como rota desconhecida. Antes: health e login devolviam `401 Faça login para continuar`. Após: health público `200`; login efetivamente verifica as credenciais.
2. Reaplicados hashes scrypt das credenciais de Ana e Rafael previamente definidas pelo usuário. As credenciais recuperadas eram recusadas no deploy anterior. O valor anterior era Secret e não pode ser lido de volta: a causa exata da divergência do hash não foi demonstrada. A configuração refeita foi comprovada por login real dos dois perfis. Não houve redução do requisito de senha, troca do segredo das sessões ou desativação do TLS.

## Evidências funcionais HTTP

Foram executadas chamadas HTTPS reais à URL pública, com cookies de sessão recebidos no login, respostas do servidor e leituras posteriores dos recursos persistidos. A contagem de verificações inclui status de rotas e asserções de comportamento; não representa essa quantidade de cenários independentes.

| Área | Resultado observado |
|---|---|
| Health | `200`, após inicialização e seed PostgreSQL |
| Login | Ana como EMPLOYEE e Rafael como ANALYST autenticados |
| Sessões | Cookie com Secure, HttpOnly e SameSite=Lax; identidade restaurada via `/api/me` |
| Acesso anônimo | `/api/me` negado com `401` |
| Permissão do analista | Funcionária recebe `403` ao consultar fila do analista |
| Chamado inexistente | `404` para INC-30002; esse fixture não existia, portanto não comprova sozinho isolamento entre dois funcionários reais |
| Criação | Rascunho INC/Hardware/Média, sem alteração da quantidade de chamados antes de confirmar |
| Confirmação | Criado INC-20520 apenas após versão e chave de idempotência |
| Repetição | Mesma confirmação retorna replay e o mesmo chamado |
| Duplicidade | Nova descrição equivalente aponta o chamado existente, com regra NO_DUPLICATE |
| Atualização | Atualizar INC-20520 gera rascunho confirmável |
| Cancelamento | Rascunho de atualização cancelado e relido como CANCELLED |
| Conhecimento | VPN/erro 809 no Windows 11 respeita a condição de aplicabilidade e não propõe a reinstalação exclusiva do Windows 10 |
| Transferência | Estado WAITING_ANALYST, agente pausado e conversa presente na fila |
| Atendimento humano | Rafael assume, envia mensagem visível à Ana e devolve ao agente |
| Encerramento | Rafael encerra; estado CLOSED persistido e envio posterior retorna `409` |
| Auditoria | Execuções e eventos relidos pela API da conversa |
| Logout | Cookie removido pelo cliente; `/api/me` volta a `401` |
| Persistência em novo deploy | INC-20520, conversa encerrada, mensagem do analista e auditoria preservados |

O conjunto principal aprovou 36/36 verificações. O complemento aprovou 10/10 e a releitura após novo deploy aprovou 4/4. Os dados sintéticos criados foram mantidos como evidência: chamado INC-20520 e conversa encerrada `eb21dc0a-2e21-458b-b745-5e03a2ee1352`.

## Build e testes automatizados

- Build local `npm run build`: concluído com código 0.
- Regras locais: 8/8 testes aprovados.
- A tentativa local de `npm test` encontrou dois arquivos impossibilitados de iniciar: `tests/postgres.integration.test.mjs` e `tests/postgres-http.integration.test.mjs`, por ausência de `DATABASE_URL` local. Não foi apresentada como execução local completa aprovada.
- CI do mesmo commit: [Nexo Assist — CI](https://github.com/lenixeduardo/nexo-assist/actions/runs/40680936010) aprovado.
- [PostgreSQL migration checks](https://github.com/lenixeduardo/nexo-assist/actions/runs/40680936081) aprovado com PostgreSQL 16 real, schema isolado, typecheck, build, `npm test` e smoke de conexão.

## Limites e critérios ainda sem evidência

- O modo observado na trilha é determinístico (`deterministic-fallback`). Esta validação não prova Mastra com um provedor LLM real.
- A tela pública de login foi renderizada e inspecionada no Chrome, sem erros de aplicação observados nos logs disponíveis. Os fluxos autenticados foram testados via HTTP; não houve nova revisão visual completa do chat/console, mobile ou comparação pixel-perfect com Pencil.
- Os fixtures antigos INC-20311/INC-30002 não estavam no banco consultado. A tentativa inicial de atualização de INC-20311 não produziu rascunho por recurso ausente; o teste foi refeito com o INC-20520 criado nesta validação. SLA vencido e reabertura até sete dias continuam comprovados por testes de domínio/CI, não por esse fixture em produção.
- Autenticação estrita com senhas próprias em produção é uma decisão anterior do usuário. Ela difere deliberadamente do login permissivo com qualquer senha descrito para os dados demonstrativos do PRD. Os cinco perfis existem no seed; apenas Ana e Rafael foram habilitados nesta configuração de acesso produtivo.
- O `404` de recurso inexistente não substitui um teste produtivo de dois funcionários autenticados. As verificações de propriedade e persistência em banco isolado continuam no CI.
- Não foram executados testes ofensivos, carga, expiração real de sete dias ou invalidação de tokens já copiados após logout. Logout testado significa remoção do cookie do cliente, não revogação global de um token assinado.

Não atribuir uma nota integral ao desafio apenas com esses checks: execução real do LLM e comparação visual completa ainda exigem evidência própria.
