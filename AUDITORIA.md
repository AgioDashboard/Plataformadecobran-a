# Auditoria de travas silenciosas — Fase 1

Data: 2026-08-18. Percurso mapeado: `POST /webhook` (Meta) → `receber()` →
`responderCliente()` → `decidir()` (IA) → `validarResposta()` → `enviarTexto()`
→ recibo assíncrono da Meta. Arquivos lidos por completo para esta auditoria:
`backend/src/whatsapp/webhook.ts`, `recibos.ts`, `enviar.ts`,
`backend/src/dominio/negociacao.ts`, `janela.ts`, `travas.ts`,
`backend/src/destinatarios.ts`, `backend/src/db/cadastro.ts`, `config.ts`.

## Tabela

| # | Ponto no código | O que pode falhar | Operador vê hoje? | Cliente recebe algo? | Correção (tarefa) |
|---|---|---|---|---|---|
| 1 | `webhook.ts:204` `avaliarPortao` reprova (pausa global, silenciado, fora da allowlist, fora da janela de 24h) | Qualquer uma das 4 travas de segurança está ativa | **Sim, mas passivo** — grava `resposta-bloqueada` na `auditoria`, ninguém é avisado ativamente | **Não. Zero mensagens.** | Correção não é enviar mensagem aqui (é a trava funcionando) — mas fora da janela de 24h, o comportamento correto da Meta é permitir *template*. Hoje simplesmente desiste. Ver 1.5: logar explicitamente qual das 4 causas foi, hoje `portao.motivo` é uma string solta sem padronização nem alerta. |
| 2 | `webhook.ts:230` `decidir()` lança exceção (Anthropic API fora do ar, JSON malformado, `resposta.content` sem bloco de texto) | Erro de rede, erro 5xx da Anthropic, timeout, schema mudou | **Não** — cai no `catch` genérico de `erro-ao-responder` em `webhook.ts:159`, misturado com qualquer outro erro do pipeline inteiro | **Não. Zero mensagens.** | 🔴 **Ponto crítico.** Task 1.2: fallback determinístico quando a chamada à IA falha — mensagem pronta do motor, sem depender do LLM responder nada. |
| 3 | `webhook.ts:279-290` `validarResposta` reprova, ou `decisao.motivo_escalar !== 'nenhum'` | Validador barra um número legítimo (bugs #4/#5/#6 já ocorridos), ou é escalonamento real (contestação etc.) | **Parcial** — grava `encaminhado-para-humano` com motivo e 600 chars do texto rejeitado, mas ninguém monitora essa tabela em tempo real | **Não. Zero mensagens.** | 🔴 **Ponto crítico, é onde os bugs 4/5/6 doeram.** Task 1.2: retry com o motivo do bloqueio devolvido ao modelo (até 2x) e depois fallback determinístico montado pelo motor. Task 1.3: lista branca estruturada em vez de regex sobre prosa solta. |
| 4 | `webhook.ts:292` `enviarTexto` falha (`envio.ok === false`): token expirado, `#131030` destinatário fora da lista, `#131047` janela de 24h fechada, `#131056` limite de par, `#100`/`#190` token inválido | Qualquer erro reportado *sincronamente* pela Graph API na chamada POST | **Sim, mas passivo** — grava `falha-no-envio` com `envio.erro`, mas sem alerta proativo | **Não. Zero mensagens** — a mensagem nunca chega, e não há retry nem fallback | 🔴 **Foi o bug 1, 2 e 3 já vividos.** Task 1.2: retry (só faz sentido para erros transitórios, não para token inválido) + alerta explícito. Task 1.5: checagem periódica de validade do token, para nunca descobrir isso só quando falha um envio de verdade. |
| 5 | `webhook.ts:328` `degrauRevelado` não reconhece o texto (regex não cobre uma variação nova de formato) | A IA cita o desconto de um jeito que a regex ainda não cobre | **Não** — nenhum log, nenhum alerta; o `estagio_negociacao` simplesmente não avança | **Sim, a mensagem sai** — mas a *próxima* interação repete a mesma oferta, porque o estado não avançou. Silêncio cumulativo: parece travado ao longo de várias trocas, não numa mensagem só. | 🔴 **Foi o bug #4 (a causa raiz dos dois "travou" relatados).** Task 1.2b: eliminar de vez a releitura de regex sobre a própria prosa da IA — gravar a oferta no banco no momento em que o motor a calcula, não inferir depois. |
| 6 | Recibo assíncrono da Meta (`recibos.ts:processarRecibo`) reporta `failed` depois que já registramos `resposta-enviada` como sucesso | A Meta aceitou a chamada (HTTP 200, `envio.ok = true`) mas falhou a entrega de fato, e isso só chega minutos depois via webhook de status | **Parcial** — grava `telefone-descartado` ou `falha-sem-efeito-no-telefone`, mas essa tabela (`telefones`) é sobre *rastreamento de tentativa de descoberta de número*, não sobre a conversa em si; não existe vínculo de volta para a conversa que ficou pendurada | **Não recebeu, mas nosso registro diz que enviamos.** Falso-positivo silencioso — o mais perigoso dos seis, porque nem uma auditoria manual pega isso sem cruzar tabelas. | Task 1.5: status de entrega (`sent`/`delivered`/`failed`) vinculado à própria mensagem em `conversas`, não só à tabela de descoberta de telefone; alertar explicitamente em `failed`. |
| 7 | `webhook.ts:136` `credorDoTelefone` retorna `null` (telefone em 0 ou 2+ carteiras) | Cadastro ambíguo ou inexistente | **Sim** — grava `telefone-sem-carteira-unica` | **Sim, mensagem sai** (sem contexto de dívida, "não informado") | Não é falha silenciosa (mensagem sai), mas o cliente recebe uma resposta genérica sem poder negociar nada. Fora do escopo do Princípio nº 1 — já se comporta como o "modo de falha seguro" documentado no código. |
| 8 | Assinatura do webhook inválida (`webhook.ts:63`) | HMAC não bate — requisição forjada ou segredo desalinhado | **Sim, se o banco estiver de pé** — audita `webhook-assinatura-invalida`; se o banco também estiver fora, nem isso | **Não** (correto — é rejeição de segurança, não deveria responder mesmo) | Fora de escopo: comportamento correto. |
| 9 | `painel.ts` `/api/teste-envio` (envio manual pelo operador) | Mesmos pontos 2/3/4 acima, mas iniciados pelo operador em vez do cliente | O operador está olhando a tela na hora, então vê o resultado da chamada HTTP diretamente | Depende do mesmo `enviarTexto` | Já é melhor que o caminho automático porque tem um humano olhando; ainda assim deve reusar o mesmo fallback do Princípio nº 1 para consistência. |

## Padrão confirmado

Dos 9 pontos, **6 podem terminar um turno em silêncio total para o cliente**
(#1, #2, #3, #4, #6 por efeito, e #5 por acumulação em turnos seguintes) e
**nenhum deles gera qualquer alerta ativo** — todos dependem de alguém abrir a
tabela `auditoria` manualmente e já saber o que procurar. Isso bate
exatamente com os 6 bugs já vividos nesta produção.

## 1.7 — Pesquisa

### Códigos de erro da WhatsApp Cloud API relevantes para falha silenciosa de envio

- **`#131030`** — "Recipient phone number not in allowed list": o destinatário
  não está na lista de até 5 números verificados do número de teste (ou,
  reaproveitado por engano, formato de número que não bate byte-a-byte com o
  cadastro verificado — foi a causa do bug do nono dígito aqui). Erro
  **síncrono**, vem na resposta HTTP da chamada de envio.
- **`#131047`** — janela de atendimento de 24h fechada: só se pode mandar
  *template* pré-aprovado depois que passam 24h da última mensagem do
  cliente. Texto livre fora da janela falha com este código.
- **`#131056`** — limite de par (Business, Consumer): mensagens demais para o
  mesmo destinatário em pouco tempo.
- **`#100` / `#190`** — token inválido, expirado ou sem permissão (o bug do
  token temporário vivido aqui cai nesta família).
- Erros podem chegar de duas formas diferentes: **síncrona**, na resposta
  HTTP da chamada `POST /messages` (é o que `enviar.ts` já captura em
  `resposta.error`), ou **assíncrona**, dentro de `statuses[].errors[]` no
  webhook de status — quando a Meta aceitou a chamada mas falhou a entrega
  depois. O sistema atual só trata bem o caso síncrono.
  ([Meta for Developers — Error codes](https://developers.facebook.com/documentation/business-messaging/whatsapp/support/error-codes),
  [Dualhook — WhatsApp Cloud API Error Codes](https://dualhook.com/docs/api-errors))

### Janela de 24h e regra de template

Confirmado: fora das 24h da última mensagem recebida do cliente, só é permitido
enviar *template* pré-aprovado pela Meta — texto livre (`type: text`) é
rejeitado com `#131047`. `dominio/janela.ts` já implementa essa checagem
localmente (`dentroDaJanela`), mas o `avaliarPortao` hoje só **bloqueia e
desiste** quando a janela está fechada — não cai automaticamente para o envio
de um template.

### Boas práticas de normalização de telefone brasileiro

Confirmado o padrão já usado neste projeto (`destinatarios.ts`): o "nono
dígito" opcional em celulares brasileiros de 8 dígitos por linha faz o mesmo
número aparecer em 12 ou 13 dígitos dependendo da origem do dado. A prática
correta — já adotada aqui — é escolher **uma forma canônica única para
comparação** (sem o 9) e **uma forma de envio única para a API externa** (com
o 9, reconstituído na borda), nunca comparar dígito a dígito nem guardar as
duas formas espalhadas pelo código.

### Padrões de fallback para saída de LLM

- **Retry com feedback do erro**: reenviar ao modelo, na próxima chamada, o
  motivo exato da rejeição (não só "tente de novo") — aumenta a chance de a
  segunda tentativa já vir dentro da lista branca.
- **Resposta determinística de última instância**: quando o retry esgota,
  não voltar a chamar o LLM — montar a mensagem inteira em código, a partir
  de dados já validados (a oferta atual calculada pelo motor). Isso elimina
  a superfície de erro do LLM completamente no pior caso.
- **Circuit breaker**: se a taxa de falhas de validação subir muito num
  período curto, é sinal de regressão no prompt ou no validador — vale
  registrar isso separado de falhas pontuais, para diferenciar "essa
  conversa específica é difícil" de "o sistema quebrou".

## Correções aplicadas nesta Fase 1

- **1.2 — Fallback obrigatório.** Novo `dominio/turno.ts::resolverTurno`
  (puro, testado sem rede/banco): até 3 tentativas de chamar a IA, devolvendo
  o motivo exato da rejeição a cada nova tentativa; se ainda assim falhar, ou
  se a chamada em si lançar exceção, o motor monta uma mensagem determinística
  (`negociacao.ts::montarFallback`) com números já aprovados — nunca mais
  ninguém sai de mãos vazias. Escalamento genuíno (`motivo_escalar`) também
  passou a sempre enviar uma mensagem fixa ao cliente em vez de simplesmente
  desistir. Testes: `turno.test.ts`.
- **1.2b — Estado sem regex sobre a própria prosa.** `degrauRevelado` foi
  removido. A IA agora preenche um campo estruturado (`grau_apresentado`),
  conferido pelo validador contra os percentuais que a resposta realmente
  citou (usando o extrator robusto, não uma regex construída na hora para um
  número só). Cada avanço de degrau grava uma linha em `ofertas_negociacao`
  (migração `0009_negociacao_estado.sql`) com todos os números da oferta e o
  timestamp — auditoria da concessão independente de qualquer texto solto.
- **1.3 — Validador como lista branca estruturada.** `ValoresPermitidos`
  ganhou `descontosPorDegrau`; a checagem de `grau_apresentado` é uma
  comparação de conjuntos, não regex.
- **1.4 — Extrator de valores robusto.** `valoresCitadosCentavos` agora
  reconhece: cifra/reais informal (já existia), gíria ("conto", "pila"),
  multiplicador dígito+escala ("1,5 mil", "1.5k"), numeral por extenso
  ("dois mil", "mil e quinhentos"), valor de parcela ("6x de 250") e valor de
  entrada ("entrada de 300"). Números soltos sem nenhum marcador monetário
  continuam propositalmente fora (ambíguo demais — ver `frases_reais.md`).
- **1.5 — Monitoramento.** `recibos.ts` agora grava `status_entrega` e
  `erro_entrega` em `conversas` (por `id_externo`) e emite um alerta explícito
  em `failed`; o cron diário (`index.ts::scheduled`) passou a checar a
  validade do token a cada disparo e alertar antes que um envio de verdade
  descubra isso na hora errada.
- **1.6 — Banco de frases reais.** `testes/frases_reais.md` +
  `testes/frases-reais.test.ts`, um teste por frase.

Suíte completa: 250 testes, `tsc --noEmit` limpo. Migração `0009` ainda não
aplicada em produção — pendente de confirmação antes do deploy.
