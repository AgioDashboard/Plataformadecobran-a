# Frases reais que já travaram o sistema

Toda frase real (do cliente ou gerada pela IA) que já causou uma falha
silenciosa vira uma entrada aqui, e ganha um teste automatizado
correspondente. Antes de qualquer deploy, todos os testes destas frases
precisam passar. Ver `AUDITORIA.md` para o mapeamento completo dos pontos de
falha; este arquivo é só o histórico de casos concretos.

| # | Frase | Quem disse | O que quebrava | Onde o teste vive |
|---|---|---|---|---|
| 1 | "15% de desconto" | IA (resposta) | `degrauRevelado` nunca reconhecia por causa de um `\b` mal posicionado logo após `%` seguido de espaço — a negociação ficava presa no degrau 1 para sempre | `negociacao.test.ts` (histórico — a checagem virou `grau_apresentado` estruturado, testada em `ia-validacao.test.ts`) |
| 2 | "500 reais" | Cliente | O extrator de valores só reconhecia `R$ 500,00` (com vírgula e centavos); a forma informal sem cifra e sem centavos não era capturada, então a IA não conseguia nem ecoar de volta o valor que o próprio cliente escreveu | `ia-validacao.test.ts` — `extrai valor "reais" informal, sem centavos` |
| 3 | "só consigo 400" | Cliente | Valor sem "R$", sem "reais", só o número — variação ainda mais informal da falha acima | `ia-validacao.test.ts` — cobrto por `nao extrai nada de texto sem valor` (caso negativo) e pelos casos de eco; ver nota abaixo |
| 4 | "R$ 400" | Cliente | Cifra sem vírgula/centavos | `ia-validacao.test.ts` — `extrai cifra informal, sem centavos` |
| 5 | "da pra fazer 300?" | Cliente | Número solto em frase interrogativa, sem cifra nem "reais" | ver nota abaixo — não extraído de propósito (ambíguo demais sem contexto monetário explícito) |
| 6 | "Em 4x eu não consigo, mas fico bem abaixo dos R$ 500,00 que você mencionou: são R$ 492,00 por parcela." | IA (resposta) | A IA ecoava um valor que o cliente tinha escrito, mas o validador só permitia números que o motor de negociação tinha aprovado — ecoar não era o mesmo que aceitar, mas o validador não distinguia | `ia-validacao.test.ts` — `resposta que ecoa o valor do cliente passa quando esse valor esta na lista de citados` |
| 7 | "1,5 mil" / "1.5k" | Cliente | Multiplicador informal não reconhecido | `ia-validacao.test.ts` — `extrai "1,5 mil" e "1.5k" como multiplicador de mil` |
| 8 | "dois mil" / "mil e quinhentos" | Cliente | Numeral por extenso não reconhecido | `ia-validacao.test.ts` — `extrai "dois mil" e "mil e quinhentos" por extenso` |
| 9 | "6x de 250" | Cliente | Valor de parcela informal não reconhecido | `ia-validacao.test.ts` — `extrai valor de parcela em "6x de 250"` |
| 10 | "entrada de 300" | Cliente | Valor de entrada informal não reconhecido | `ia-validacao.test.ts` — `extrai valor de "entrada de 300"` |
| 11 | "Verifiquei as condições liberadas pro seu caso e consegui um esforço adicional: 2x de R$ 516,00, com entrada mínima de R$ 182,40 no dia 25. À vista, fecha em R$ 912,00." | IA (resposta) | A Fase 2 passou a instruir a IA a citar a entrada mínima do degrau como contrapartida, mas `permitido.centavos` nunca incluía esse valor — toda resposta que mencionava a entrada mínima do degrau 2/3 era barrada, sempre caindo no mesmo fallback estático repetido | `negociacao.test.ts` — `permitido.centavos inclui a entrada minima de cada degrau que a tiver` |
| 12 | "Aumenta o numero de parcelas por favor" / "Eu queria parcelar em 4x" | Cliente | O parcelamento da negociação era sempre fixo em 2x — não havia número nenhum de 3x/4x autorizado, então qualquer tentativa real da IA de responder ao pedido era barrada e o sistema caía sempre no mesmo fallback estático repetido, mesmo após o cliente insistir várias vezes (real, em produção: cliente relatou "já teria bloqueado"). Correção original usava uma penalidade de desconto inventada; revisada no mesmo dia para usar a tabela de faixas de parcelamento que o credor já configura no painel, evitando duas fontes de verdade | `negociacao.test.ts` — `parceladoEstendido usa os numeros exatos da tabela de faixas do credor` e `permitido.centavos e percentuaisPct incluem as parcelas estendidas` |
| 13 | Cliente aceita ("Otimo em 4x esta ideal") e minutos depois pergunta "e possivel pagar no cartao? pagando meu nome sai do serasa?" | Cliente | Aceitar uma oferta que a própria IA já tinha apresentado (sem repetir o número como proposta) nunca fechava a negociação no sistema — só `avaliarContraproposta` fechava, e ela exige um número novo do cliente. A negociação ficava "aberta" para sempre, então perguntas depois do "fechado" (cartão, Serasa) caíam sem fato disponível para responder, a tentativa da IA era barrada, e o fallback reapresentava a escada de desconto do zero — reabrindo uma negociação já ganha | `ia-validacao.test.ts` — testes de `cliente_aceitou`/`valor_fechado_centavos`; `fatos.test.ts`; `prompt.test.ts` — `SYSTEM nunca reabre desconto numa negociacao ja fechada`; **conversa completa (teste de regressão obrigatório do Adendo 1)** em `adendo1-regressao.test.ts` |
| 14 | "Vou gerar o boleto/PIX referente a primeira parcela... e te envio em seguida" | IA (resposta) | Promessa de ação sem ferramenta correspondente — nada foi de fato gerado nem enviado. Afirmação falsa em cobrança (spec §12, risco art. 71 CDC) | `fatos.test.ts` — `FATOS_PADRAO nao afirma cartao de credito disponivel`; `prompt.test.ts` — `SYSTEM nunca promete acao sem ferramenta disponivel` |

## Nota sobre os casos 3 e 5

"só consigo 400" e "da pra fazer 300?" são números soltos, sem cifra, sem
"reais", sem escala ("mil"), sem contexto de parcela ou entrada. O extrator
**decide propositalmente não capturar esses casos** — ver o teste `numero
por extenso solto, sem escala nem "reais", nao e extraido (ambiguo demais)`
em `ia-validacao.test.ts`, que cobre o mesmo princípio para números por
extenso. A razão: um número bruto sem nenhum marcador monetário é ambíguo
demais (pode ser dia do mês, quantidade de parcelas, hora, CPF parcial) —
capturá-lo automaticamente arriscaria a IA ecoar um número que não tinha
relação nenhuma com dinheiro. Isso significa que, hoje, se o cliente disser
só "consigo 400" sem nenhuma pista adicional, a IA não pode citar esse
número de volta — ela precisa pedir "você quer dizer R$ 400?" antes, o que
já é um comportamento aceitável (confirmar em vez de assumir). Se isso se
provar um problema real em produção, a extração pode ser ampliada, mas o
custo de errar para o outro lado (capturar "400" de "fica pra semana que
vem, dia 400" — hipotético, mas a categoria de erro é real) é maior.

## Como adicionar uma frase nova

1. Ao investigar uma trava nova, ache a frase exata (cliente ou IA) que
   expôs o problema.
2. Acrescente uma linha nesta tabela.
3. Escreva um teste que falha ANTES da correção e passa DEPOIS, usando essa
   frase literal (não uma paráfrase) — é isso que garante que a mesma frase
   nunca mais passe despercebida.
4. Rode a suíte inteira (`npm run teste` dentro de `backend/`) antes de
   fazer deploy.
