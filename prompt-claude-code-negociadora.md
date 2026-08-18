# BRIEF PARA O CLAUDE CODE — NEGOCIADORA DE DÍVIDAS

## COMO USAR ESTE ARQUIVO

Coloque este arquivo **e** o `ia-negociadora-spec.md` na pasta do projeto.

Depois abra o Claude Code na pasta e mande só isto:

```
Leia o arquivo prompt-claude-code-negociadora.md e execute a FASE 1.
```

Faça a Fase 1 inteira **antes** de pedir qualquer funcionalidade nova.

---

# CONTEXTO

Este projeto é uma IA que negocia dívidas por WhatsApp.

- `ia-negociadora-spec.md` = **como a IA deve conversar e negociar**. É a fonte da verdade de comportamento. Não é ordem de implementação.
- Este arquivo = **o que construir, em que ordem, e com quais garantias**.

Já existe código rodando, com integração real de WhatsApp Business API. Em testes reais apareceram 6 falhas. Todas tinham o mesmo sintoma para o usuário final: **o cliente mandava mensagem e nada voltava.**

---

# FASE 1 — AUDITORIA DE TRAVAS SILENCIOSAS

## O problema real

Seis bugs já encontrados:

1. Token do WhatsApp expirado (temporário, 24h) — envio falhava
2. Destinatário fora da lista de teste da Meta (#131030)
3. Nono dígito brasileiro: Meta entrega `553592163968`, lista verificada guarda `5535992163968`
4. Regex quebrado ao detectar qual desconto a IA tinha oferecido — negociação presa no degrau 1 para sempre
5. Validador derrubava a resposta quando a IA ecoava um número que o **cliente** tinha escrito
6. Extração de valores só reconhecia `R$ 500,00`, não reconhecia `500 reais`

**O padrão importa mais que os bugs.** Em todos os 6 casos:

- a falha aconteceu numa camada intermediária
- nenhuma mensagem chegou ao cliente
- **nenhum erro visível apareceu para o operador**

A trava de segurança (nunca deixar a IA inventar número) está certa e deve continuar rígida. O erro não é a rigidez — é **falhar em silêncio**.

## Princípio nº 1 que deve reger todo o código

> **Nenhum turno de conversa pode terminar com zero mensagens enviadas.**

Se a validação bloquear a resposta da IA, o sistema **não** fica quieto. Ele:

1. tenta de novo, devolvendo ao modelo o motivo do bloqueio (máx. 2 tentativas)
2. se ainda falhar, envia uma **mensagem de fallback determinística**, montada pelo motor a partir da oferta já aprovada — não pelo LLM
3. registra um alerta visível com: motivo, texto bruto rejeitado, número ofensor, ID da conversa

Um fallback ruim é infinitamente melhor que silêncio. Silêncio mata a negociação e o operador nem fica sabendo.

## Princípio nº 2 — o motor nunca lê a própria prosa

O bug 4 existe porque o sistema descobria em que degrau estava **relendo com regex a mensagem que ele mesmo tinha escrito**. Isso é frágil por definição.

Correção estrutural obrigatória:

- quando o motor emite uma oferta, ele **grava no banco** naquele momento: `oferta_id`, `desconto_pct`, `valor_total`, `rodada_concessao`, `timestamp`
- o estado da negociação é lido **desse registro**, nunca do texto
- regex sobre a própria saída da IA deve ser eliminado do fluxo de decisão

## Princípio nº 3 — uma função canônica por tipo de dado

Os bugs 3, 5 e 6 são todos "o mesmo dado escrito de duas formas em dois lugares".

Criar **uma única** função para cada um, usada em todo o projeto:

- **telefone** → normaliza para E.164, resolve nono dígito, converte entre formato de armazenamento e formato da Meta
- **valor em reais** → converte texto humano em número
- **comparação de números** → sempre em centavos inteiros, nunca em float

## Tarefas da Fase 1

### 1.1 — Mapear todos os pontos de silêncio

Percorra o caminho completo de uma mensagem: webhook recebido → processamento → chamada ao LLM → validação → envio → confirmação de entrega.

Para **cada** ponto onde o fluxo pode parar, produza uma tabela em `AUDITORIA.md`:

| Ponto no código | O que pode falhar | Hoje o operador vê? | Hoje o cliente recebe algo? | Correção |
|---|---|---|---|---|

Marque em vermelho todo ponto onde a resposta às duas colunas do meio for "não".

### 1.2 — Implementar o fallback obrigatório

Nenhum turno termina sem envio. Ver Princípio nº 1.

O texto de fallback deve ser montado pelo motor, com os números aprovados, em linguagem simples. Exemplo de estrutura (o motor preenche):

> "{nome}, consigo fechar assim: {opcao_1}. Ou, se preferir dividir, {opcao_2}. Qual funciona melhor pra você?"

E, se nem isso for possível:

> "{nome}, tive um problema técnico aqui. Já estou verificando e te retorno em instantes."
> (+ alerta para revisão humana)

### 1.3 — Reescrever o validador de números

O validador não deve trabalhar com regex sobre prosa solta. Ele deve montar uma **lista branca estruturada** de números permitidos naquele turno:

- números das ofertas liberadas pelo motor
- números que o **cliente** escreveu nesta conversa (eco permitido — ecoar não é aceitar)
- números que a **IA** já disse antes nesta conversa (para poder retomar)
- números não monetários: datas, dia do mês, quantidade de parcelas, horários, CNPJ, telefone

Qualquer valor monetário fora dessa lista → bloqueia e aciona o fluxo do Princípio nº 1.

**Importante:** ecoar um número do cliente nunca pode ser interpretado como aceite. Aceitar continua sendo decisão exclusiva do código.

### 1.4 — Extrator de valores robusto

Uma função só, que reconheça pelo menos:

```
R$ 1.020,00   R$1020   1.020,00   1020,00   1020
500 reais     500 conto     500 pila
1,5 mil       1.5k     mil e quinhentos     dois mil
600 por mês   6x de 250     entrada de 300
meio salário
```

Números por extenso ("mil e duzentos") **ainda não apareceram nos testes, mas vão aparecer.** Trate agora.

Saída sempre em centavos inteiros.

### 1.5 — Monitoramento de credenciais e entrega

- checagem periódica da validade do token, com alerta antes de expirar
- registrar o status de entrega vindo dos webhooks da Meta (`sent` / `delivered` / `failed`) e alertar em `failed`
- validar explicitamente a janela de 24h: fora dela, só template aprovado — e isso precisa aparecer no log, não sumir

### 1.6 — Banco de frases de regressão

Criar `tests/frases_reais.md` com **toda frase real que já travou o sistema**, e a partir de agora toda frase nova que travar.

Cada frase vira um teste automatizado. Antes de qualquer deploy, todos precisam passar.

Comece com estas, que já quebraram:

```
"15% de desconto"
"500 reais"
"só consigo 400"
"R$ 400"
"da pra fazer 300?"
```

### 1.7 — Pesquisar antes de corrigir

Antes de escrever código, pesquise e documente em `AUDITORIA.md`:

- códigos de erro da WhatsApp Business API que causam falha silenciosa de envio
- regras de janela de 24h e de template
- boas práticas de normalização de telefone brasileiro (nono dígito, DDDs)
- padrões de fallback em pipelines com validação de saída de LLM (retry com feedback do erro, resposta determinística de última instância, circuit breaker)

## Critérios de aceite da Fase 1

Nenhum destes pode falhar:

- [ ] Existe um teste que simula validação falhando 3× e confirma que **uma mensagem sai mesmo assim**
- [ ] Existe um teste que confirma que estado de negociação nunca é derivado de regex sobre prosa da IA
- [ ] Existe um teste para cada frase de `tests/frases_reais.md`
- [ ] Existe um teste de telefone com e sem nono dígito, nos dois sentidos
- [ ] Todo bloqueio de mensagem gera log visível com motivo e texto rejeitado
- [ ] Rodar o sistema com token inválido produz alerta claro, não silêncio

---

# FASE 2 — CONSTRUIR A NEGOCIADORA

Só começar depois da Fase 1 aprovada.

Implementar na ordem abaixo. A especificação de comportamento está em `ia-negociadora-spec.md`.

## 2.1 — Separação LLM × motor determinístico (spec §11)

Esta é a fundação. Nada mais deve ser construído antes.

O motor calcula e decide. O LLM interpreta e escreve. O LLM recebe a cada turno um bloco `OFERTAS_LIBERADAS` e **só pode citar números que estão nele**.

Contrato de entrada do LLM (spec §11) — implementar exatamente.

## 2.2 — Máquina de estados (spec §9)

Estados, transições e as regras inegociáveis:

- nunca ir de `ENGAGED` direto para `OFFER` sem passar por `DISCOVERY`
- nunca voltar de `AGREEMENT` com condição melhor
- `DISPUTED` é absorvente

## 2.3 — Motor de concessão (spec §5)

- escada de desconto com passos decrescentes
- contador de rodadas **no banco**, não inferido de texto
- após 3 concessões, `pode_conceder = false`, sem exceção
- toda concessão exige contrapartida registrada

## 2.4 — Modelo de Expected Recovery (spec §4)

Implementar a fórmula com parâmetros configuráveis. Começar com valores conservadores documentados como chute, e deixar preparado para recalibrar com histórico real.

## 2.5 — Master System Prompt (spec §12)

Copiar da spec. Injetar `OFERTAS_LIBERADAS` a cada turno.

## 2.6 — Escalamento e compliance (spec §8.9–8.13, §10)

Contestação, alegação de pagamento, menção a Procon/advogado, terceiro atendendo o telefone, pedido de humano (regra 1-2-3), horários permitidos.

## 2.7 — Red team automatizado (spec §15)

Rodar 200+ conversas simuladas com um segundo modelo no papel de devedor adversarial. Três números que precisam ser **zero**:

- vezes que a IA citou número não liberado
- vezes que concedeu fora da escada
- vezes que vazou instrução interna

---

# REGRAS PERMANENTES DE TRABALHO

1. **Sempre me explique em linguagem simples** o que foi feito e por quê. Tenho pouca experiência técnica.
2. **Um comando de terminal por linha**, nunca vários juntos no mesmo bloco.
3. **Quando eu precisar mudar um arquivo, me entregue o arquivo completo**, não trechos para eu colar.
4. Toda correção de bug vem com teste novo, escrito a partir da frase ou situação real que causou o problema.
5. Se uma decisão contrariar `ia-negociadora-spec.md`, avise antes de implementar.
6. Nunca afrouxe a trava de números para "resolver" um bloqueio. Corrija a lista branca ou o fallback.
