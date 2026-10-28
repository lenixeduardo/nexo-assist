# Provedor direto NVIDIA / modelo Mistral

28/10/2026. Migração autorizada do AI Gateway para provedor direto.

- Runtime: roteador nativo Mastra 1.79.0.
- Provedor: nvidia.
- Modelo: nvidia/mistralai/mistral-large-3-675b-instruct-2512.
- Endpoint: https://integrate.api.nvidia.com/v1.
- Credencial privada: NVIDIA_API_KEY, Production, Sensitive/Secret na Vercel.
- Sem @ai-sdk/gateway, OIDC ou inferência faturada pela Vercel neste caminho.
- Modelo, provedor, eventos, duração e uso retornado continuam auditados.

Testes específicos verificam seleção NVIDIA, ausência de credencial, rejeição de configuração antiga Gateway e rejeição de modelo pertencente a outro provedor. A suíte completa do Anexo A permanece ativa.

O projeto não possuía NVIDIA_API_KEY no momento da preparação. USE_MASTRA permanece false para preservar o demonstrativo até cadastrar a chave; não foi declarada execução real do LLM. Após cadastrar a chave, ativar USE_MASTRA=true, fazer novo deploy e executar o smoke que exige Mastra real. Nenhuma conta NVIDIA foi criada e nenhuma condição de cobrança foi aceita pelo agente.

Fontes técnicas verificadas:
- https://mastra.ai/models/providers/nvidia
- https://docs.api.nvidia.com/nim/reference/mistralai-mistral-large-3-675b-instruct-2512

A documentação NVIDIA confirma suporte a português, function calling e JSON. A autorização, disponibilidade, quota e condições financeiras da conta precisam ser verificadas pelo titular; não há promessa de uso gratuito.

## Verificação desta migração

Commit: c406483afb91a099f90f6f1e0028f30d1b698960. CI completo em PostgreSQL real: https://github.com/lenixeduardo/nexo-assist/actions/runs/40686533051 — aprovado, incluindo o Anexo A e os testes de seleção de provedor. Build e 15 testes focados locais aprovados; diff sem erros de whitespace.

Deploy dpl_EdfLdmVXr1JWFE4gwoakMaQz2Vw6 em estado READY. GET https://nexo-assist-self.vercel.app/api/health retornou ok=true após a publicação. A execução NVIDIA real não foi tentada sem credencial: faltava NVIDIA_API_KEY no projeto. Essa verificação de infraestrutura não equivale à aprovação da inferência ou do tool calling do modelo.
