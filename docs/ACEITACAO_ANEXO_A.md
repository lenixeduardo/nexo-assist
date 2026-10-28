# Aceitação do Anexo A — 28/10/2026

## Resultado e cobertura

Commit de código: `a56781e1e36bcf9dbaee50efa8862917453dc235`. [CI com PostgreSQL 16 real](https://github.com/lenixeduardo/nexo-assist/actions/runs/40684397115): **26/26 testes passaram**, sem skips. Inclui regressão de seed incremental, políticas, HTTP e estes cenários em transações revertidas:

| Cenário | Evidência automatizada |
|---|---|
| Tipos e seis categorias | A1 |
| Quatro prioridades, prazo por atualização e limite exato de sete dias | A2 |
| Campos obrigatórios, rascunho e confirmação idempotente | A3 |
| Duplicidade e atualização apenas após confirmação | A4 |
| Reabertura recente confirmada e recusa após sete dias | A5 |
| Transferência solicitada, crítica, vencida e por incerteza, com resumo e pausa | A6 |
| Analista assume, responde, devolve e encerra | A7 |
| Dois funcionários reais isolados em tickets, drafts e conversas | A8 |
| RH, financeiro, facilities e aplicabilidade Windows 10/11 | A9 |
| Serviço indisponível sem mutação e eventos de auditoria ordenados | Supporting |

Esses testes validam regras e persistência com o modo determinístico, sem fingir execução real do modelo. A integração externa é coberta separadamente pelo smoke que exige Mastra real.

## Dados demonstrativos disponíveis

Produção contém cinco usuários, oito artigos e os sete fixtures do Anexo B, além de INC-20520 criado na validação anterior. Há chamados abertos, vencidos, resolvidos há quatro e quinze dias e pertencentes a outros funcionários. O seed é opt-in, incremental e não sobrescreve dados existentes.

## Falhas encontradas e corrigidas

1. Seed ignorava todos os fixtures se existisse qualquer ticket. Teste vermelho: [execução 40683730606](https://github.com/lenixeduardo/nexo-assist/actions/runs/40683730606); após correção, suíte verde acima.
2. “Solicitar monitor” era INC; agora classifica REQ. Reproduzido localmente por A1 antes da correção.
3. “Notebook lento após atualização” era confundido com comando de atualização do ticket. A4 falhou na [execução 40684134733](https://github.com/lenixeduardo/nexo-assist/actions/runs/40684134733); após restringir o verbo ao comando explícito, passou.
4. Smoke do Mastra usava SQLite e não aguardava operações assíncronas. Corrigido para PostgreSQL, imports e auditoria aguardados.

## Execução externa do LLM — bloqueada, não aprovada

Uma chamada HTTPS real do deploy `dpl_48iErdn7GBSdgLJwt7CRZfv6QJXf` iniciou Mastra com `openai/gpt-4.1-mini`, OIDC e AI Gateway. A API externa respondeu HTTP **403**, tipo **customer_verification_required**, exigindo cartão válido cadastrado na conta Vercel. Não houve chamada bem-sucedida às ferramentas pelo modelo, geração concluída ou consumo de tokens comprovado.

Trace auditável: `458e3d7e-7c56-4e3a-a827-dc4f53a33b44`. A execução foi gravada como FAILED, com MODEL_CALL, MODEL_RESULT/ERROR e MODEL_FAILURE_NO_SILENT_FALLBACK. Nenhum chamado foi criado ou atualizado por essa falha. O motivo externo detalhado foi confirmado nos runtime logs da Vercel. Não se aprovou o teste com respostas heurísticas.

A conta não foi alterada financeiramente. O modo demonstrativo foi restaurado enquanto a liberação depende do titular. O código está preparado para ativação, mas **Mastra com LLM real funcionando continua pendente**.

## Como concluir após liberar a conta

Ativar USE_MASTRA=true em Production, criar novo deploy e executar `scripts/production-acceptance.py` com as credenciais no ambiente. O padrão exige modo Mastra, eventos do modelo e uso real persistido. Não usar NEXO_REQUIRE_MASTRA=false para concluir essa etapa.

A validação visual completa do protótipo permanece fora desta bateria de API/domínio.
