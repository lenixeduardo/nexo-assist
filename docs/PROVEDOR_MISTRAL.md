# Mistral AI direta — 28/10/2026

Por solicitação do usuário, o provedor padrão passou a Mistral AI direta.

- Mastra 1.79.0: roteador nativo `mistral/mistral-small-latest`.
- Endpoint do SDK instalado: https://api.mistral.ai/v1.
- Segredo exclusivo: MISTRAL_API_KEY, chave criada no Mistral Studio.
- Configuração produtiva: MASTRA_PROVIDER=mistral e MASTRA_MODEL=mistral/mistral-small-latest.
- USE_MASTRA permanece false até cadastrar a chave Mistral; não há inferência real aprovada nesta migração.
- A chave NVIDIA não é reutilizada nem enviada à API Mistral.
- Auditoria, ferramentas restritas ao usuário e confirmações de mutações preservadas.

Validação local: build TypeScript e 19 testes aprovados (provedor, isolamento de credenciais, auditoria, políticas e inicialização). Os três novos comportamentos Mistral falharam antes da implementação e passaram após ela. Testes com PostgreSQL e inferência externa são verificações separadas.

Próximo passo: cadastrar MISTRAL_API_KEY como Secret em Production na Vercel; ativar USE_MASTRA e publicar novo deploy; executar scripts/production-acceptance.py com exigência de Mastra real. Nenhuma compra ou alteração de plano foi feita.

Fontes oficiais: https://docs.mistral.ai/getting-started/quickstarts/studio/activate-and-generate-api-key e https://docs.mistral.ai/api/endpoint/chat.
