# ADENDO 1 AO BRIEF — FALHAS DO TESTE REAL DE 18/08

Anexar a `prompt-claude-code-negociadora.md`. Executar **antes** da Fase 2.

---

## DIAGNÓSTICO — O QUE REALMENTE ACONTECEU

Nas mensagens de 11:48, 11:49 e 11:50, a IA respondeu **exatamente o mesmo texto, caractere por caractere**, a três mensagens diferentes do cliente.

Esse texto é o **fallback determinístico** definido na Fase 1 do brief:

> "{nome}, consigo fechar assim: {opcao_1}. Ou, se preferir dividir, {opcao_2}. Qual funciona melhor pra você?"

**Conclusão: o LLM não gerou essas respostas.** Ele foi bloqueado (ou falhou) três vezes, e o fallback disparou três vezes. Um modelo que "perdeu o contexto" produziria textos variados. Texto idêntico é template, não geração.

Isso significa que a Fase 1 funcionou parcialmente: **não houve silêncio**. Mas expôs três defeitos novos.

---

## DEFEITO 1 — O FALLBACK É CEGO AO ESTADO (crítico)

O fallback foi montado a partir da **oferta de abertura** (R$ 840 / 30% / 2x de R$ 492), ignorando que a negociação já estava em `AGREEMENT` fechado em 4x de R$ 270.

Consequência real: a IA ressuscitou uma oferta antiga e **reabriu uma negociação já ganha**, oferecendo espontaneamente 30% a um cliente que já tinha aceitado 10%. Em produção com 30 mil clientes, isso é perda direta de margem em escala.

### Correção obrigatória

O fallback passa a ser **escolhido pelo estado atual**, nunca fixo:

| Estado | Fallback permitido |
|---|---|
| `DISCOVERY` | Pergunta de descoberta (data de renda) |
| `OFFER` / `NEGOTIATING` | Repete a **oferta corrente do degrau atual** — nunca a de abertura |
| `COUNTER_OFFER` | Repete a última contraproposta feita |
| `AGREEMENT` / `PAYMENT_PENDING` | **Nunca contém oferta, valor ou desconto.** Apenas: "Sua negociação está registrada em {condicao_atual}. Vou verificar sua dúvida e já te retorno." |
| `DISPUTED` / `ESCALATED` | Apenas aviso de encaminhamento |

**Regra dura:** em `AGREEMENT` ou posterior, qualquer mensagem de saída contendo valor de oferta diferente do acordo vigente é **bloqueada**, inclusive vinda do fallback. O fallback também passa pelo validador.

---

## DEFEITO 2 — O FALLBACK REPETIU SEM ESCALAR

Disparou 3× em 3 minutos sem alerta e sem mudança de comportamento.

### Correção

- 1º disparo: envia fallback + registra log
- 2º disparo na mesma conversa: envia fallback **diferente** + alerta ao operador
- 3º disparo: **para de responder automaticamente**, marca `ESCALATED`, notifica humano

Nunca repetir o mesmo texto de fallback duas vezes seguidas. Um contador de fallbacks por conversa é obrigatório.

---

## DEFEITO 3 — POR QUE O LLM FOI BLOQUEADO

Investigar nos logs. Hipótese principal: o cliente perguntou sobre **cartão de crédito** e **Serasa** — dois assuntos sem resposta disponível no bloco `OFERTAS_LIBERADAS`, e provavelmente sem regra no prompt. O modelo tentou responder, produziu algo fora da lista branca, e caiu no fallback.

### Correção

Ampliar o contrato de entrada do LLM para incluir um bloco `FATOS_LIBERADOS`, além de `OFERTAS_LIBERADAS`:

```json
{
  "formas_pagamento_aceitas": ["pix", "boleto"],
  "cartao_credito_disponivel": false,
  "prazo_baixa_serasa_dias": 5,
  "condicao_baixa": "após compensação da primeira parcela"
}
```

Se o cliente pergunta algo que não está em `FATOS_LIBERADOS`, a IA **não inventa e não cai em fallback de oferta**. Ela responde:

> "Boa pergunta. Isso eu preciso confirmar com o time — já estou verificando e te retorno ainda hoje."

E registra em `PERGUNTAS_PENDENTES`.

---

## DEFEITO 4 — ESCADA DE DESCONTO INVERTIDA E ESTOURADA

Ofertas observadas, sobre dívida de R$ 1.200:

| Condição | Total | Desconto |
|---|---|---|
| À vista | R$ 840 | **30%** |
| 2x | R$ 984 | 18% |
| 3x | R$ 1.140 | 5% |
| 4x | R$ 1.080 | **10%** |

Dois erros graves:

**(a) A primeira mensagem já entregou o desconto máximo autorizado (30%).** Isso viola a regra central da spec (§2, Hipótese 2; §5.1): a abertura deve ser 0% a 10%, nunca o teto. Todo cliente que fecharia com 10% agora fecha com 30%. Este é o erro mais caro do teste inteiro — e ele passou despercebido porque "pareceu uma boa negociação".

**(b) A escada não é monotônica:** 4x (10%) está mais barato que 3x (5%). Mais parcelas com desconto maior premia o cenário de maior risco.

### Correção

O motor gera ofertas a partir de uma tabela declarativa, validada na inicialização:

```
degrau_1: avista 8%   | 3x 5%  | 6x 0%
degrau_2: avista 18%  | 3x 12% | 6x 6%
degrau_3: avista 26%  | 3x 18% | 6x 10%
degrau_final: avista 30% | 3x 22% | 6x 14%
```

Validações obrigatórias na subida do sistema (o sistema não inicia se falharem):

1. desconto **decresce** conforme o número de parcelas aumenta, em todo degrau
2. desconto **cresce** conforme o degrau avança, em toda coluna
3. nenhum valor excede o teto autorizado da carteira
4. degrau 1 nunca contém o teto

---

## DEFEITO 5 — PROMESSA DE AÇÃO SEM FERRAMENTA

A IA disse "vou gerar o boleto e te envio em seguida". Não existe ferramenta de geração de boleto no sistema. Nada foi enviado.

Isso é afirmação falsa em cobrança — proibição absoluta da spec §12, e risco de art. 71 do CDC.

### Correção

- Criar um **registro de ferramentas disponíveis** injetado no prompt a cada turno.
- Regra no Master Prompt: *"Você nunca promete uma ação que não tenha ferramenta correspondente disponível neste turno. Se o cliente pedir algo que você não pode executar, diga que vai encaminhar."*
- Enquanto PIX/boleto não estiverem implementados, `cartao_credito_disponivel: false` e as formas de pagamento devem levar a encaminhamento humano, não a promessa.
- Quando forem implementados: a mensagem de confirmação só é enviada **depois** do retorno bem-sucedido da ferramenta, nunca antes.

---

## DEFEITO 6 — PERGUNTAS PENDENTES SÃO PERDIDAS

O cliente perguntou sobre cartão e Serasa quatro vezes. Nenhuma foi respondida nem registrada.

### Correção — fila de perguntas pendentes

Nova estrutura no estado da negociação:

```json
"perguntas_pendentes": [
  {"tema": "cartao_credito", "turno": 12, "respondida": false},
  {"tema": "serasa", "turno": 12, "respondida": false}
]
```

Regras:

1. Toda mensagem do cliente pode conter **mais de uma intenção**. O extrator deve devolver uma lista, não um valor único.
2. **Pergunta pendente tem prioridade sobre negociação.** Se há pergunta não respondida, a próxima mensagem da IA responde a ela antes de qualquer oferta.
3. Uma pergunta só sai da fila quando respondida ou encaminhada.
4. Se a mesma pergunta aparecer 2× sem resposta → `ESCALATED`.

---

## DEFEITO 7 — ESTADO PODE REGREDIR

### Correção

`AGREEMENT` e `PAYMENT_PENDING` são quase absorventes. Saídas permitidas apenas para:

- `PAID`
- `BROKEN_PROMISE` (vencimento não pago)
- `DISPUTED` / `ESCALATED`
- `NEGOTIATING`, **exclusivamente** se o cliente pedir explicitamente para renegociar — e nesse caso a condição nunca pode ser melhor que a acordada (spec §9)

Uma pergunta ("posso pagar no cartão?") **nunca** é motivo de transição de estado.

---

## TESTE DE REGRESSÃO OBRIGATÓRIO

A conversa completa deste teste (screenshot de 18/08) vira caso de teste automatizado em `tests/frases_reais.md`.

Critérios de aprovação — todos devem passar:

- [ ] Após "Ótimo em 4x está ideal", o estado é `AGREEMENT` e nunca mais volta a `NEGOTIATING` sozinho
- [ ] Após o acordo, nenhuma mensagem de saída contém R$ 840, 30%, ou 2x de R$ 492
- [ ] "é possível pagar no cartão? pagando meu nome sai do serasa?" gera **duas** entradas em `perguntas_pendentes`
- [ ] A resposta a essa mensagem responde às duas perguntas ou informa encaminhamento — e não contém oferta
- [ ] A mesma mensagem de fallback nunca é enviada duas vezes seguidas
- [ ] A oferta de abertura nunca contém o desconto máximo da carteira
- [ ] A escada de desconto passa nas 4 validações de monotonicidade
- [ ] Nenhuma promessa de gerar boleto/PIX sem ferramenta disponível
