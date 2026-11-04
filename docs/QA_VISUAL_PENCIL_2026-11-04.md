# Nexo Assist — fidelidade visual ao Pencil v2.21

**Data:** 04/11/2026. **Baseline:** `docs/nexo.pen`. **Código de interface:** branch `fix/nexo-ticket-handoff-ui-a11y-20261104`. **Capturas:** Chromium QA isolado (viewports de 1440×900, exceto atendimento assumido 1567×900).

## Metodologia

Exportamos nativamente os seis frames do `docs/nexo.pen` com `@open-pencil/cli`, capturamos as telas em Chromium e calculamos SSIM, erro absoluto médio RGB e proporção de pixels cuja diferença máxima de canal não supera 20. As dimensões de cada par são idênticas; não houve redimensionamento dos frames para fazer a medida.

SSIM mede semelhança de padrões de imagem, **não é uma nota de fidelidade nem percentual de pixels idênticos**. Dados reais de teste, textos diferentes e renderização da fonte também o influenciam. Capturas não provam fidelidade semântica ou acessibilidade.

## Resultado

| Frame Pencil | SSIM | Pixel com diferença ≤20 (máximo por canal) | MAE RGB |
|---|---:|---:|---:|
| 01 Login | 0,829 | 90,40% | 12,79 |
| 02 Chat — novo chamado | 0,771 | 86,03% | 23,06 |
| 03 Consulta e transferência | 0,824 | 90,59% | 16,06 |
| 04 Fila do analista | 0,737 | 86,15% | 15,22 |
| 05 Analista assumiu | 0,746 | 86,62% | 14,42 |
| 06 Perfil | 0,924 | 96,46% | 5,40 |
| **Média aritmética** | **0,805** | — | — |

## Achados

- **Login:** geometria macro/cores semelhantes; conteúdo da demonstração e métricas foram intencionalmente removidos/substituídos para não afirmar resultados fictícios. Não restaurar falsas taxas de resolução só para aumentar SSIM.
- **Novo chamado:** estrutura 232 px da barra lateral e linguagem visual preservadas, mas sequência, volume e posição das mensagens, detalhamento do rascunho e espaçamento diferem do frame. É a maior diferença média RGB.
- **Consulta/transferência:** layout principal preservado, mas o frame Pencil representa fluxo com múltiplos chamados, cartões de seleção e mensagens mais extensas; o caso do QA tem histórico diferente e conteúdo mais curto.
- **Fila e atendimento assumido:** principais divergências visuais. O Pencil usa rail/queue/centro/histórico com quatro colunas (64/380/flex/340), com múltiplas conversas, estados, badges e contexto. QA exibe conversa única no ambiente isolado. Ausência de dados de fixture visual comparáveis impede separar todo o impacto do layout do impacto de conteúdo.
- **Perfil:** melhor semelhança de pixels, mas a composição do card e as ações de senha divergem. Não inventar alteração de senha funcional quando não existe backend.
- **Mobile:** verificações funcionais nos 375, 390 e 768 px aprovadas em QA Chromium; o arquivo Pencil contém somente seis frames desktop, então não há referência nativa pixel-perfect mobile.

## Conclusão

A aplicação **não demonstra fidelidade visual de 95/100 nem similaridade ≥0,95 no conjunto**. A média SSIM é 0,805 e a comparação deve ser interpretada com as diferenças de fixture em mente. Próximos ajustes: (1) criar fixtures idênticas ao frame original no banco isolado, (2) refinar chat/rascunho, (3) compor fila com estados reais múltiplos, (4) ajustar perfil respeitando o backend e (5) repetir exportação/SSIM + revisão humana.

## Gate de IA

Em 04/11/2026, a credencial `MISTRAL_API_KEY` foi reconhecida pelo GitHub Actions e a chamada real ao endpoint Mistral foi feita, mas retornou **HTTP 429 rate_limited** para os três cenários de smoke. Não há inferência COMPLETED validada. Referência: [GitHub Actions Mistral](https://github.com/lenixeduardo/nexo-assist/actions/runs/41831644423).

O merge e a promoção para produção continuam condicionados à integração Mistral real, à aprovação QA e à revisão visual.