# Configuração de ofertas por credor — Design

**Data:** 2026-08-16
**Contexto:** Fases 1 a 4 publicadas. Fase 5 (portal de autonegociação) em execução — Task 1 concluída.
**Relacionado:** `docs/superpowers/plans/2026-08-16-fase-5-portal-autonegociacao.md`

## Problema

A tela de regras comerciais criada na Fase 3 tem três números: desconto
máximo, parcelamento máximo e comissão. Isso descreve um limite, não uma
oferta. Com ela, o portal só consegue oferecer "à vista com o desconto
máximo" e "2x, 3x… até o teto, sem desconto" — uma regra fixa embutida no
código, que o usuário não controla.

O que a operação precisa é dizer, por credor: *quanto de desconto cada
quantidade de parcelas recebe*. E precisa poder mudar isso sozinho, a
qualquer momento, sem pedir alteração de código.

Há um agravante: o portal fecha acordo **sem revisão humana**. Um erro de
digitação nessa tela vira prejuízo silencioso, descoberto só na conciliação.

## Decisões

Tomadas com o usuário em 2026-08-16, cada uma fechando uma alternativa
plausível.

**1. Faixas de parcelamento com desconto próprio.** O credor descreve linhas
como "1x → 20%", "2 a 3x → 10%", "4 a 6x → 0%". Descartadas: parâmetros
gerais com curva fixa de desconto (não dá o controle pedido) e lista de
ofertas com valor fechado (não se adapta ao saldo — geraria "6x de R$ 5,00"
numa dívida pequena, e exigiria uma lista por devedor).

**2. Sem entrada.** Cada faixa tem parcelas iguais. Entrada é comum em
assessoria e reduz acordo quebrado, mas custa uma coluna a mais, cálculo a
mais, duas cobranças no provedor em vez de uma, e telas separadas para
entrada e demais parcelas. Se um dia for preciso, entra como coluna nova na
mesma tela — nada do que este design constrói precisa ser desfeito.

**3. Parcela mínima é por credor.** Cada empresa de formatura tem ticket
diferente. Faixa cuja parcela ficaria abaixo do mínimo simplesmente não
aparece para aquele devedor. Descartado: valor fixo no código, que exigiria
publicação para mudar — o oposto do objetivo da tela.

**4. `parcelamentoMaximo` deixa de existir.** Vira consequência da última
faixa. Manter os dois seria ter duas fontes de verdade para o mesmo fato, e
elas divergiriam.

**5. Três proteções, não uma.** Prévia calculada, teto da assessoria acima
das faixas, e confirmação para mudança grande. A prévia é a mais forte:
transforma erro de digitação em número absurdo na tela antes de virar
acordo.

**6. A prévia é calculada no servidor.** Reimplementar `gerarOfertas` em
JavaScript no navegador criaria duas fontes de verdade; a prévia mostraria
uma coisa e o portal faria outra — exatamente o erro que a prévia existe
para impedir. Um endpoint calcula e não grava.

**7. A importação passa a deduplicar por CPF.** Descoberto ao concluir a
Task 1 da Fase 5: com CPF gravado, duas linhas da mesma planilha com o mesmo
CPF e telefones diferentes violam o índice único e **abortam a importação no
meio, com parte da carteira gravada**. Mesmo CPF é a mesma pessoa: o
telefone novo entra como telefone adicional dela, o que ainda alimenta a
descoberta de WhatsApp da Fase 4. Descartados: descartar a linha (perde o
telefone novo) e transação única (uma linha ruim impediria a planilha
inteira, contrariando a regra já estabelecida de descartar linha ruim).

## Modelo de dados

`RegrasCredor` passa a ser:

```ts
interface FaixaParcelamento {
  de: number;        // inclusivo, >= 1
  ate: number;       // inclusivo, >= de
  descontoPct: number;
}

interface RegrasCredor {
  faixas: FaixaParcelamento[];
  parcelaMinimaCentavos: number;
  descontoTetoPct: number;              // teto da assessoria
  comissaoSobreRecuperadoPct: number;   // já existe
}
```

Nova tabela `faixas_parcelamento` (credor_id, de, ate, desconto_pct), com as
faixas de um credor lidas em ordem. Os campos escalares ficam em `credores`;
`parcelamento_maximo` e `desconto_maximo_pct` são substituídos por
`parcela_minima_centavos` e `desconto_teto_pct`.

**Migração dos credores existentes:** cada um vira uma faixa só,
`1..parcelamento_maximo` com `desconto_maximo_pct`, e o teto recebe o
`desconto_maximo_pct` que ele tinha. `credor-padrao` está em 1x e 0%, então
para ele nada muda de fato.

## Geração de ofertas

`gerarOfertas(saldoCentavos, regras)` percorre as faixas em ordem e, para
cada quantidade de parcelas dentro de cada faixa, produz uma oferta com o
desconto daquela faixa. Descarta a opção cuja parcela ficaria abaixo de
`parcelaMinimaCentavos`. Continua pura e determinística — nenhuma IA
participa, e é isso que permite recalcular a lista no servidor para validar
a escolha do devedor.

Saldo zero ou negativo não gera oferta. Sem faixa nenhuma configurada, não
gera oferta — o modo de falha é não oferecer nada, nunca inventar condição.

## Validação

Vive em `dominio/faixas.ts`, função pura, testada. O formulário apenas
espelha; a validação que vale é a do servidor.

- A primeira faixa começa em 1
- `de <= ate` em toda faixa
- Faixas não se sobrepõem e não deixam buraco (a próxima começa em `ate + 1`)
- Nenhum `descontoPct` acima de `descontoTetoPct`
- `descontoTetoPct` entre 0 e 100
- `parcelaMinimaCentavos > 0`
- Máximo de 60 parcelas na última faixa

Faixa inválida devolve 400 com o motivo em texto, e a tela mostra a
mensagem — o mesmo padrão já usado na tela de regras atual.

## A tela

No lugar da tela de regras atual, dentro do cartão do credor selecionado.

**Esquerda:** tabela editável de faixas — colunas *de*, *até*, *desconto*,
mais um botão de remover por linha e um "acrescentar faixa" no fim. Abaixo,
os três campos globais: parcela mínima, teto de desconto e comissão.

**Direita:** a prévia. Um campo com valor de dívida de exemplo, iniciado com
a **média das dívidas em aberto daquele credor** — para você conferir o caso
real, não um número inventado. Abaixo, a lista de ofertas exatamente como o
devedor as veria.

A prévia atualiza ao editar, com espera curta para não chamar o servidor a
cada tecla, e mostra o erro de validação quando a configuração está
inválida — nesse caso, sem ofertas.

**Ao salvar:** se algum desconto subiu mais de 10 pontos, aparece a
confirmação com antes e depois lado a lado. Caso contrário, salva direto.

## Fluxo de dados

```
Painel (operador)
  edita faixas ──► POST /api/previa-ofertas?credor=  ──► gerarOfertas ──► ofertas na tela
                     (calcula, não grava)
  salva      ──► POST /api/regras?credor=  ──► validarFaixas ──► grava ──► 200 ou 400
Portal (devedor)
  abre link  ──► lê regras do credor ──► gerarOfertas ──► mesmas ofertas
```

A mesma função serve a prévia e o portal. É o que garante que o que você vê
configurando é o que o devedor vê negociando.

## Testes

- `faixas.test.ts` — validação: sobreposição, buraco, primeira faixa fora do 1, desconto acima do teto, faixa vazia, mais de 60 parcelas
- `ofertas.test.ts` — geração: desconto por faixa aplicado corretamente, parcela abaixo do mínimo some, saldo zero, sem faixas, soma das parcelas fecha com o total, índices sequenciais
- `importar.test.ts` — deduplicação por CPF: mesma pessoa em duas linhas vira um devedor com dois telefones
- Verificação na tela: prévia acompanha a edição, configuração inválida mostra o motivo, confirmação aparece na mudança grande e não aparece na pequena

## Fora de escopo

Entrada; desconto separado sobre principal e sobre juros; histórico de
versões da configuração (quem mudou o quê e quando — hoje a auditoria
registra que houve mudança, não o conteúdo anterior); política que varia com
o tempo de atraso.
