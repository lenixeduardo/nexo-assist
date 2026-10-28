# Provedor direto NVIDIA — ativação de 28/10/2026

A chave NVIDIA_API_KEY foi confirmada como Secret em Production, sem ler seu valor. USE_MASTRA=true foi ativado e as chamadas HTTPS reais foram executadas pelo Mastra no deploy. A NVIDIA recusou as três tentativas iniciais e a repetição com chave substituída; não houve inferência bem-sucedida nem uso de tokens comprovado.

| Modelo no endpoint NVIDIA | Resultado |
|---|---|
| mistralai/mistral-large-3-675b-instruct-2512 | 410 Gone: modelo retirado |
| mistralai/mistral-large-2-instruct | 404: Function not found for account |
| nvidia/nemotron-3-super-120b-a12b | 404: Function not found for account |

O catálogo público GET /v1/models lista os dois últimos modelos. Isso não comprovou disponibilidade na conta para POST /v1/chat/completions. A documentação oficial NVIDIA AI-Q associa 404 Not found for account a chave inválida ou expirada e recomenda gerar uma nova. Também existem relatos de liberação de acesso a endpoints; a permissão específica não foi inspecionada. Não afirmar que a chave está válida apenas por estar cadastrada.

- Documentação oficial: https://docs.nvidia.com/aiq-blueprint/2.2.1/resources/troubleshooting.html
- Geração da chave: https://docs.api.nvidia.com/nim/docs/api-quickstart
- Evidências sem segredos: artifacts/nvidia-activation-attempts-2026-10-28.json

## Código e auditoria

Roteador nativo do Mastra 1.79.0, endpoint fixo https://integrate.api.nvidia.com/v1, sem AI Gateway nem OIDC para inferência. Modelo configurado atualmente: nvidia/nvidia/nemotron-3-super-120b-a12b. Para esse modelo, reasoning desativado e temperature/top_p conforme documentação NVIDIA. Limites: quatro passos, 500 tokens de saída por chamada e timeout de 45s para generate.

As tentativas foram registradas como FAILED com MODEL_CALL, MODEL_RESULT/ERROR e MODEL_FAILURE_NO_SILENT_FALLBACK. Nenhum ticket foi criado ou atualizado nas tentativas. Não houve aprovação indevida por heurística.

A redação da auditoria foi corrigida: métricas numéricas inputTokens/outputTokens/totalTokens são preservadas; tokens de autenticação e chaves NVIDIA/OpenAI são removidos, inclusive se estiverem embutidos em texto. Dois testes falharam antes da correção e passaram após ela.

[CI completo](https://github.com/lenixeduardo/nexo-assist/actions/runs/40688439832): **35/35 testes aprovados**, incluindo PostgreSQL real, Anexo A, provedor direto e redação de segredos. Esse resultado não comprova geração externa.

## Reteste com chave substituída

A alteração do segredo foi confirmada por metadados e publicada no deploy dpl_BE6v54r6jkogtXxXeZ4QVzaevngz. Em 28/10/2026 às 12:43:42 UTC, a inferência real com Nemotron voltou a retornar 404 Function not found for account. Trace 8227fb39-f915-4bf2-90bb-11e62c3262df; request NVIDIA 31b0299f-0d4d-49c7-9442-8494c4106840. Sem inferência aprovada, sem tokens comprovados e sem mutação de tickets.

## Próximo passo necessário

Como a falha persistiu após a substituição da chave, solicitar ao suporte NVIDIA a verificação do acesso da conta a Public API Endpoints e ao modelo Nemotron configurado. Informar o horário UTC e o request ID acima, sem enviar a chave por chat. A causa exata de credencial/acesso ainda não foi confirmada pelo provedor.

O modo demonstrativo foi restaurado explicitamente (USE_MASTRA=false) enquanto o bloqueio externo é resolvido. Após corrigir a chave/acesso, ativar USE_MASTRA=true, fazer novo deploy e repetir scripts/production-acceptance.py com a exigência padrão de Mastra. Custos e quotas dependem da conta NVIDIA; nenhuma compra ou alteração financeira foi realizada pelo agente.
