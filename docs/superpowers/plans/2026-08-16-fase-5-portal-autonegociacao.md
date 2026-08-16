# Fase 5 — Portal de autonegociação: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** O devedor abre um link individual, confirma quem é, vê a própria dívida, escolhe entre opções de parcelamento calculadas a partir da política do credor, e fecha o acordo sozinho — com Pix ou boleto gerados na hora, sem atendente.

**Architecture:** Um namespace **público** (`/acordo/*`) passa a existir ao lado do painel autenticado, servido pelo mesmo Worker. O acesso é por token aleatório de 32 bytes, guardado no banco apenas como hash, com validade e limite de tentativas. As condições de acordo são **cálculo determinístico** sobre as regras do credor da Fase 3 — nenhuma IA participa. O provedor de pagamento fica atrás de uma interface, com uma implementação de teste que não cobra nada, para que o portal inteiro seja construído e verificado antes de qualquer integração real.

**Tech Stack:** Cloudflare Workers, D1, TypeScript com type-stripping nativo do Node 24, wrangler 3, HTML/CSS/JS puro sem build. Provedor de pagamento: **Asaas** (Pix + boleto na mesma API, sandbox gratuito), atrás de interface própria.

**Spec:** este documento — seções "Decisões de projeto" e "Modelo de ameaça". A especificação do usuário está transcrita em "O que foi pedido".

**Depende de:** Fase 3 concluída (regras comerciais por credor) e Fase 4 concluída (telefones). Ambas publicadas em 2026-08-16.

---

## Global Constraints

- **A pausa global fica LIGADA durante toda a fase.** Nenhuma tarefa a desliga.
- **O portal nasce FECHADO.** A trava `portal_aberto` entra no banco com valor 0. Abrir é decisão do usuário, separada.
- Nenhuma credencial em arquivo. A chave do Asaas entra por `wrangler secret put`, como as demais.
- NENHUM CPF, telefone ou nome real em arquivo, teste ou fixture. CPFs de teste devem ser gerados válidos e obviamente fictícios (a lista está na Task 1).
- Nenhuma dependência nova de runtime. Nenhum CDN, nenhum passo de build.
- Código e comentários em português sem acento; texto de tela em português com acento.
- Ao final de cada tarefa: testes, `tsc`, varredura de segredos a partir da raiz, commit e push.
- Modo de falha é sempre **negar**: sem CPF cadastrado não há link; sem token válido não há página; sem política do credor não há oferta.

---

## O que foi pedido

Transcrito da especificação do usuário, para viajar junto com o plano:

> O devedor recebe um link, abre, vê a própria dívida, escolhe entre opções de parcelamento pré-aprovadas pelo credor, e fecha o acordo sozinho — gerando boleto ou Pix na hora, sem nenhum atendente envolvido. É o modelo do Serasa Limpa Nome.
>
> **Fluxo:** link único e individual por devedor, com validade (não pode ser adivinhável nem reutilizável por outra pessoa); autenticação leve (confirmar CPF ou data de nascimento antes de mostrar qualquer valor); mostrar a dívida e as opções geradas a partir da política daquele credor; o devedor escolhe, confirma, e o sistema gera o pagamento; registrar o acordo e disparar a confirmação por WhatsApp.
>
> **Travas:** o portal só oferece condições que a política do credor permite, e nenhuma condição pode ser gerada por IA — é cálculo determinístico. Nenhum dado de outro devedor pode ser acessível trocando um parâmetro na URL.

---

## Decisões de projeto

**1. O portal tem trava própria, e o botão de pânico aciona as duas.** Decidido com o usuário em 2026-08-16, divergindo da especificação original. Pausar o disparo é rotina; derrubar o portal junto deixaria com página morta quem clicou num link que **já enviamos** — punindo quem quer pagar. Mas se a pausa foi acionada porque os valores estão errados, um portal no ar fecharia acordos errados sozinho. Por isso: `pausa_global` trava envio, `portal_aberto` trava o portal, e o botão de emergência do painel aciona as duas de uma vez.

**2. Nenhuma IA no cálculo.** As condições saem de `gerarOfertas`, função pura sobre as regras do credor. A IA da Fase 2 continua barrando qualquer menção a desconto nas conversas. Um número que o devedor vê na tela do portal nunca passou por modelo nenhum.

**3. O token é a única chave, e não há id na URL.** A URL é `/acordo/<token>`. Não existe `?devedor=` nem `?id=` — não há parâmetro para trocar. É assim que o requisito "nenhum dado de outro devedor acessível trocando um parâmetro" é cumprido por construção, e não por verificação.

**4. O token é guardado como hash.** No banco fica `SHA-256(token)`. Quem obtiver uma cópia do banco não consegue montar links válidos. O token em claro existe só no momento em que é gerado e dentro do link enviado.

**5. Sem CPF cadastrado, o devedor não recebe link.** A autenticação leve confere o CPF; sem ele não há o que conferir, e servir a dívida sem conferência nenhuma seria pior do que não ter portal. O importador passa a ler a coluna de CPF do Cobmais. **Premissa a confirmar com o usuário:** que a exportação tenha essa coluna. Se não tiver, esta fase para na Task 1 e a alternativa (código por WhatsApp) volta à mesa.

**6. A resposta é a mesma para link inexistente, expirado e já usado.** Distinguir permitiria enumerar tokens válidos. A página diz "link inválido ou expirado" nos três casos, e a auditoria registra qual foi.

**7. Confirmação por WhatsApp é envio, e passa pelo portão.** O acordo é gravado **antes** de tentar enviar. Com a pausa global ligada — que é o estado atual — o acordo fecha e a confirmação não sai; o painel mostra o acordo com "confirmação pendente". Um acordo perdido porque a mensagem falhou seria muito pior que uma mensagem não enviada.

**8. O provedor de pagamento fica atrás de interface.** `ProvedorPagamento` com uma implementação `provedor-teste` que devolve dados falsos sem chamar rede. Todo o portal é construído e verificado com ela. O Asaas entra numa tarefa própria, no fim, e trocar por Gerencianet significa escrever um arquivo.

---

## Modelo de ameaça

Escrito porque esta é a primeira superfície **pública** do sistema — tudo até aqui estava atrás de autenticação.

| Ameaça | Defesa | Onde |
|---|---|---|
| Adivinhar um token | 32 bytes de `crypto.getRandomValues`, base64url (256 bits) | Task 4 |
| Vazamento do banco vira links válidos | Só o SHA-256 do token é guardado | Task 4 |
| Enumerar tokens válidos pela resposta | Mesma resposta para inexistente, expirado e usado | Task 4 |
| Força bruta no CPF | Máximo 5 tentativas por link; depois o link morre | Task 5 |
| Comparação de CPF vazando informação por tempo | `textosIguaisEmTempoConstante`, já existente | Task 5 |
| Trocar parâmetro para ver outro devedor | Não existe parâmetro: só o token | Task 5 |
| Reutilizar link de outra pessoa | Link pertence a um devedor e exige o CPF dele | Task 5 |
| Fechar acordo fora da política | `gerarOfertas` é a única fonte; a escolha é validada contra a lista recalculada no servidor | Task 6 |
| Adulterar o valor no envio do formulário | O servidor ignora valores do cliente e recalcula pelo índice da oferta | Task 6 |
| Portal no ar com dados errados | Trava `portal_aberto`, fechada por padrão | Task 3 |
| Link continuar válido depois do acordo | Consumido na confirmação | Task 7 |

---

## Estrutura de arquivos

**Criar:**

| Arquivo | Responsabilidade |
|---|---|
| `backend/migracoes/0006_portal.sql` | `links_acordo`, `acordos`, trava `portal_aberto` |
| `backend/src/dominio/cpf.ts` | Normalização e validação de CPF — puro |
| `backend/src/dominio/ofertas.ts` | Cálculo determinístico das condições — puro |
| `backend/src/db/links.ts` | Criar, ler, contar tentativas e consumir link |
| `backend/src/db/acordos.ts` | Gravar e listar acordos |
| `backend/src/pagamento/provedor.ts` | Interface `ProvedorPagamento` + implementação de teste |
| `backend/src/pagamento/asaas.ts` | Implementação real |
| `backend/src/api/portal.ts` | Rotas públicas `/acordo/*` |
| `backend/src/portal/servir.ts` | Serve os arquivos do portal |
| `portal/index.html`, `portal/estilos.css`, `portal/app.js` | Telas do portal (raiz do repo, pasta própria) |
| `backend/testes/cpf.test.ts`, `ofertas.test.ts`, `links.test.ts`, `portal-seguranca.test.ts` | Testes |

**Modificar:** `backend/src/cobmais/importar.ts` (coluna CPF), `backend/src/db/cadastro.ts` (documento), `backend/src/dominio/travas.ts` (trava do portal), `backend/src/index.ts` (rota pública antes da autenticação), `backend/src/api/painel.ts` (gerar link, listar acordos, trava), `backend/scripts/gerar-painel.mjs` (arquivos do portal), `index.html`/`app.js`/`estilos.css` (painel).

---

### Task 1: CPF — validação e importação

**Files:**
- Create: `backend/src/dominio/cpf.ts`, `backend/testes/cpf.test.ts`
- Modify: `backend/src/cobmais/importar.ts`, `backend/testes/importar.test.ts`

**Interfaces:**
- Produces: `normalizarCpf(bruto: string): string`, `cpfValido(bruto: string): boolean`, `mascararCpf(bruto: string): string`. `Cliente` de `importar.ts` ganha `cpf: string | null`.

- [ ] **Step 1: Escrever o teste (vai falhar)**

`backend/testes/cpf.test.ts`:

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizarCpf, cpfValido, mascararCpf } from '../src/dominio/cpf.ts';

// CPFs FICTICIOS com digitos verificadores corretos, gerados para teste.
const VALIDO = '52998224725';
const VALIDO_2 = '11144477735';

test('normaliza tirando pontuacao', () => {
  assert.equal(normalizarCpf('529.982.247-25'), VALIDO);
  assert.equal(normalizarCpf(null as unknown as string), '');
});

test('cpf com digitos verificadores corretos e valido', () => {
  assert.equal(cpfValido(VALIDO), true);
  assert.equal(cpfValido(VALIDO_2), true);
  assert.equal(cpfValido('529.982.247-25'), true);
});

test('cpf com digito verificador errado e invalido', () => {
  assert.equal(cpfValido('52998224726'), false);
});

test('cpf com todos os digitos iguais e invalido', () => {
  // 11111111111 passa na conta dos verificadores mas nao existe.
  assert.equal(cpfValido('11111111111'), false);
  assert.equal(cpfValido('00000000000'), false);
});

test('cpf com tamanho errado e invalido', () => {
  assert.equal(cpfValido('123'), false);
  assert.equal(cpfValido(''), false);
  assert.equal(cpfValido('529982247250'), false);
});

test('mascara mostra so os tres ultimos digitos antes do verificador', () => {
  assert.equal(mascararCpf(VALIDO), '***.***.247-25');
  assert.equal(mascararCpf('invalido'), 'sem CPF');
});
```

- [ ] **Step 2: Rodar e confirmar a falha**

```bash
cd backend && npm run teste
```

Esperado: `Cannot find module '../src/dominio/cpf.ts'`.

- [ ] **Step 3: Implementar**

`backend/src/dominio/cpf.ts`:

```ts
// Validacao de CPF. Serve para duas coisas diferentes: recusar lixo na
// importacao, e conferir a identidade de quem abre o portal. Nos dois casos
// o modo de falha e negar.

export function normalizarCpf(bruto: string): string {
  return String(bruto ?? '').replace(/\D/g, '');
}

function digitoVerificador(base: string, pesoInicial: number): number {
  let soma = 0;
  for (let i = 0; i < base.length; i += 1) {
    soma += Number(base[i]) * (pesoInicial - i);
  }
  const resto = (soma * 10) % 11;
  return resto === 10 ? 0 : resto;
}

export function cpfValido(bruto: string): boolean {
  const d = normalizarCpf(bruto);
  if (d.length !== 11) return false;

  // Sequencias repetidas passam na conta dos verificadores mas nao sao CPF
  // de ninguem. 11111111111 e o caso classico.
  if (/^(\d)\1{10}$/.test(d)) return false;

  const primeiro = digitoVerificador(d.slice(0, 9), 10);
  if (primeiro !== Number(d[9])) return false;

  const segundo = digitoVerificador(d.slice(0, 10), 11);
  return segundo === Number(d[10]);
}

// A tela nunca estampa o CPF inteiro, do mesmo jeito que nunca estampa o
// telefone inteiro.
export function mascararCpf(bruto: string): string {
  const d = normalizarCpf(bruto);
  if (d.length !== 11) return 'sem CPF';
  return `***.***.${d.slice(6, 9)}-${d.slice(9)}`;
}
```

- [ ] **Step 4: Rodar os testes**

```bash
cd backend && npm run teste
```

Esperado: os 6 novos passam.

- [ ] **Step 5: Ler a coluna de CPF na importação**

Em `backend/src/cobmais/importar.ts`, a interface ganha o campo:

```ts
export interface Cliente {
  nome: string;
  cpf: string | null;
  telefone: string;
  telefonesExtras: string[];
  valorCentavos: number;
  vencimento: string;
}
```

O cabeçalho da planilha passa a ser lido para localizar a coluna, em vez de
posição fixa — a exportação do Cobmais pode ter a coluna de CPF em lugares
diferentes conforme o layout escolhido:

```ts
// A coluna de CPF e localizada pelo cabecalho, nao por posicao: o Cobmais
// exporta layouts diferentes conforme o relatorio, e assumir a quinta
// coluna quebraria em silencio no dia em que alguem trocasse o layout.
function indiceDoCpf(cabecalho: string): number {
  const colunas = cabecalho.split(';').map((c) => c.trim().toLowerCase());
  return colunas.findIndex((c) => c === 'cpf' || c === 'documento' || c === 'cpf/cnpj');
}
```

Em `interpretarCsv`, capture o cabeçalho antes do `slice(1)` e use o índice:

```ts
export function interpretarCsv(texto: string): Cliente[] {
  const todas = texto.trim().split(/\r?\n/);
  const cabecalho = todas[0] ?? '';
  const iCpf = indiceDoCpf(cabecalho);
  const linhas = todas.slice(1);
```

e, dentro do `flatMap`, depois de calcular `extras`:

```ts
    // CPF invalido entra como null, nao como texto qualquer: e melhor o
    // devedor ficar sem link do que receber um portal que nao consegue
    // conferir quem ele e.
    const cpfBruto = iCpf >= 0 ? (colunas[iCpf] ?? '') : '';
    const cpf = cpfValido(cpfBruto) ? normalizarCpf(cpfBruto) : null;
```

com `cpf,` no objeto devolvido e o import de `cpfValido`/`normalizarCpf` no topo.

- [ ] **Step 6: Testes da importação**

Acrescente a `backend/testes/importar.test.ts`:

```ts
test('coluna de CPF e encontrada pelo cabecalho', () => {
  const csv = [
    'nome;telefone;valor;vencimento;cpf',
    'Ana Ficticia;5535900000001;10,00;10/09/2026;529.982.247-25',
  ].join('\n');
  assert.equal(interpretarCsv(csv)[0].cpf, '52998224725');
});

test('cabecalho com CPF em outra posicao continua funcionando', () => {
  const csv = [
    'cpf;nome;telefone;valor;vencimento',
    '52998224725;Ana Ficticia;5535900000001;10,00;10/09/2026',
  ].join('\n');
  // A posicao das outras colunas nao mudou neste layout de teste, entao
  // apenas o CPF e verificado aqui.
  assert.equal(interpretarCsv(csv)[0].cpf, '52998224725');
});

test('planilha sem coluna de CPF importa com cpf nulo', () => {
  const csv = ['nome;telefone;valor;vencimento', 'Ana Ficticia;5535900000001;10,00;10/09/2026'].join('\n');
  assert.equal(interpretarCsv(csv)[0].cpf, null);
});

test('CPF invalido na planilha vira nulo, nao texto', () => {
  const csv = [
    'nome;telefone;valor;vencimento;cpf',
    'Ana Ficticia;5535900000001;10,00;10/09/2026;11111111111',
  ].join('\n');
  assert.equal(interpretarCsv(csv)[0].cpf, null);
});
```

Em `importarParaCarteira`, passe `documento: cliente.cpf` no lugar do `null`
atual ao chamar `inserirDevedor`.

- [ ] **Step 7: Rodar tudo e commitar**

```bash
cd backend && npm run teste && npx tsc --noEmit
```

```bash
git add backend/src/dominio/cpf.ts backend/testes/cpf.test.ts backend/src/cobmais/importar.ts backend/testes/importar.test.ts && git commit -m "Valida CPF e importa a coluna do Cobmais pelo cabecalho" && git push
```

---

### Task 2: Ofertas — cálculo determinístico ⛔ SUBSTITUÍDA — NÃO EXECUTE

> **Esta tarefa foi substituída em 2026-08-16** pela Task 2 de
> `docs/superpowers/plans/2026-08-16-configuracao-de-ofertas.md`.
>
> O usuário pediu uma tela onde possa alterar ofertas e parcelas a qualquer
> momento. Com ela, `descontoMaximoPct` e `parcelamentoMaximo` deixam de
> existir: `RegrasCredor` passa a ter uma **tabela de faixas de
> parcelamento**, e `gerarOfertas` percorre as faixas. O código abaixo
> calcula sobre os campos antigos e não compila mais.
>
> A `Oferta` do plano novo **não tem o campo `tipo`** — "à vista" é
> `parcelas === 1`. Onde as Tasks 6, 7 e 9 deste plano escrevem
> `oferta.tipo === 'a_vista'`, leia `oferta.parcelas === 1`; na gravação do
> acordo, derive `parcelas === 1 ? 'a_vista' : 'parcelado'` para a coluna
> `tipo` da tabela.
>
> As demais tarefas deste plano continuam válidas.

<details>
<summary>Versão original, mantida como registro</summary>

**Files:**
- Create: `backend/src/dominio/ofertas.ts`, `backend/testes/ofertas.test.ts`

**Interfaces:**
- Consumes: `RegrasCredor` de `../dominio/credor.ts`.
- Produces:
  - `interface Oferta { indice: number; tipo: 'a_vista' | 'parcelado'; parcelas: number; valorParcelaCentavos: number; totalCentavos: number; descontoPct: number }`
  - `function gerarOfertas(saldoCentavos: number, regras: RegrasCredor): Oferta[]`

- [ ] **Step 1: Escrever o teste (vai falhar)**

`backend/testes/ofertas.test.ts`:

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { gerarOfertas } from '../src/dominio/ofertas.ts';

const semDesconto = { descontoMaximoPct: 0, parcelamentoMaximo: 1, comissaoSobreRecuperadoPct: 10 };
const generoso = { descontoMaximoPct: 20, parcelamentoMaximo: 6, comissaoSobreRecuperadoPct: 15 };

test('politica sem desconto e sem parcelamento gera so a vista integral', () => {
  const o = gerarOfertas(100000, semDesconto);
  assert.equal(o.length, 1);
  assert.deepEqual(o[0], {
    indice: 0, tipo: 'a_vista', parcelas: 1,
    valorParcelaCentavos: 100000, totalCentavos: 100000, descontoPct: 0,
  });
});

test('desconto a vista sai exatamente no teto da politica', () => {
  const [aVista] = gerarOfertas(100000, generoso);
  assert.equal(aVista.tipo, 'a_vista');
  assert.equal(aVista.descontoPct, 20);
  assert.equal(aVista.totalCentavos, 80000);
});

test('nenhuma oferta ultrapassa o desconto maximo', () => {
  for (const o of gerarOfertas(100000, generoso)) {
    assert.ok(o.descontoPct <= generoso.descontoMaximoPct, `desconto ${o.descontoPct} acima do teto`);
  }
});

test('nenhuma oferta ultrapassa o parcelamento maximo', () => {
  for (const o of gerarOfertas(100000, generoso)) {
    assert.ok(o.parcelas <= generoso.parcelamentoMaximo, `${o.parcelas} parcelas acima do teto`);
  }
});

test('parcelado nao tem desconto', () => {
  // Desconto e contrapartida do pagamento imediato. Dar nos dois seria
  // decisao comercial nova, nao um detalhe de implementacao.
  for (const o of gerarOfertas(100000, generoso).filter((x) => x.tipo === 'parcelado')) {
    assert.equal(o.descontoPct, 0);
    assert.equal(o.totalCentavos, 100000);
  }
});

test('a soma das parcelas fecha com o total, sem centavo perdido', () => {
  // 100003 em 6 parcelas nao divide redondo: a diferenca vai na primeira.
  for (const o of gerarOfertas(100003, generoso).filter((x) => x.tipo === 'parcelado')) {
    const soma = o.valorParcelaCentavos * o.parcelas;
    assert.ok(Math.abs(soma - o.totalCentavos) < o.parcelas,
      `parcelas somam ${soma}, total ${o.totalCentavos}`);
  }
});

test('indices sao sequenciais a partir de zero', () => {
  const o = gerarOfertas(100000, generoso);
  assert.deepEqual(o.map((x) => x.indice), o.map((_, i) => i));
});

test('saldo zero ou negativo nao gera oferta nenhuma', () => {
  assert.deepEqual(gerarOfertas(0, generoso), []);
  assert.deepEqual(gerarOfertas(-500, generoso), []);
});

test('parcela nunca fica abaixo do minimo, mesmo com parcelamento alto', () => {
  // Divida de R$ 30,00 em 6x daria R$ 5,00 por parcela — abaixo do custo do
  // boleto. O parcelamento e reduzido ate a parcela valer a pena.
  const o = gerarOfertas(3000, generoso).filter((x) => x.tipo === 'parcelado');
  for (const p of o) assert.ok(p.valorParcelaCentavos >= 2000, `parcela de ${p.valorParcelaCentavos}`);
});
```

- [ ] **Step 2: Rodar e confirmar a falha**

```bash
cd backend && npm run teste
```

- [ ] **Step 3: Implementar**

`backend/src/dominio/ofertas.ts`:

```ts
import type { RegrasCredor } from './credor.ts';

export interface Oferta {
  indice: number;
  tipo: 'a_vista' | 'parcelado';
  parcelas: number;
  valorParcelaCentavos: number;
  totalCentavos: number;
  descontoPct: number;
}

// Parcela menor que isto nao paga o custo de emissao do boleto e ainda
// prende o devedor num acordo longo por valor irrisorio.
const PARCELA_MINIMA_CENTAVOS = 2000;

// Calculo deterministico, sem IA e sem aleatoriedade: mesma divida e mesma
// politica produzem sempre as mesmas opcoes. E o que permite recalcular a
// lista no servidor para validar a escolha do devedor, em vez de confiar no
// que o navegador mandou.
export function gerarOfertas(saldoCentavos: number, regras: RegrasCredor): Oferta[] {
  if (!Number.isFinite(saldoCentavos) || saldoCentavos <= 0) return [];

  const ofertas: Array<Omit<Oferta, 'indice'>> = [];

  const desconto = Math.min(Math.max(regras.descontoMaximoPct, 0), 100);
  const totalAVista = Math.round(saldoCentavos * (1 - desconto / 100));
  ofertas.push({
    tipo: 'a_vista',
    parcelas: 1,
    valorParcelaCentavos: totalAVista,
    totalCentavos: totalAVista,
    descontoPct: desconto,
  });

  for (let n = 2; n <= regras.parcelamentoMaximo; n += 1) {
    // Arredonda para cima: a soma das parcelas nunca fica abaixo do total,
    // e a sobra de centavos favorece o devedor na ultima.
    const parcela = Math.ceil(saldoCentavos / n);
    if (parcela < PARCELA_MINIMA_CENTAVOS) break;

    ofertas.push({
      tipo: 'parcelado',
      parcelas: n,
      valorParcelaCentavos: parcela,
      totalCentavos: saldoCentavos,
      descontoPct: 0,
    });
  }

  return ofertas.map((o, indice) => ({ indice, ...o }));
}
```

- [ ] **Step 4: Rodar os testes e commitar**

```bash
cd backend && npm run teste && npx tsc --noEmit
```

```bash
git add backend/src/dominio/ofertas.ts backend/testes/ofertas.test.ts && git commit -m "Calcula as condicoes de acordo a partir da politica do credor" && git push
```

</details>

---

### Task 3: Tabelas do portal e a trava própria

**Files:**
- Create: `backend/migracoes/0006_portal.sql`
- Modify: `backend/src/dominio/travas.ts`

**Interfaces:**
- Produces: `lerPortalAberto(db): Promise<boolean>`, `definirPortalAberto(db, aberto: boolean, por: string): Promise<void>`.

- [ ] **Step 1: Escrever a migração**

`backend/migracoes/0006_portal.sql`:

```sql
-- Trava propria do portal, separada da pausa global. Nasce FECHADA: um
-- canal publico que fecha acordo sozinho nao entra no ar por acidente.
CREATE TABLE IF NOT EXISTS portal_estado (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  aberto INTEGER NOT NULL DEFAULT 0,
  desde TEXT NOT NULL,
  por TEXT
);

INSERT OR IGNORE INTO portal_estado (id, aberto, desde, por)
VALUES (1, 0, '2026-08-16T00:00:00.000Z', 'implantacao');

-- Link individual de acordo. O token NAO e guardado: so o SHA-256 dele.
-- Uma copia deste banco nao permite montar link valido nenhum.
CREATE TABLE IF NOT EXISTS links_acordo (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  token_hash TEXT NOT NULL UNIQUE,
  credor_id TEXT NOT NULL REFERENCES credores (id),
  devedor_id TEXT NOT NULL REFERENCES devedores (id),
  criado_em TEXT NOT NULL,
  expira_em TEXT NOT NULL,
  tentativas INTEGER NOT NULL DEFAULT 0,
  consumido_em TEXT
);

CREATE INDEX IF NOT EXISTS idx_links_devedor ON links_acordo (credor_id, devedor_id);

CREATE TABLE IF NOT EXISTS acordos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  credor_id TEXT NOT NULL REFERENCES credores (id),
  devedor_id TEXT NOT NULL REFERENCES devedores (id),
  link_id INTEGER NOT NULL REFERENCES links_acordo (id),
  tipo TEXT NOT NULL CHECK (tipo IN ('a_vista', 'parcelado')),
  parcelas INTEGER NOT NULL CHECK (parcelas >= 1),
  valor_parcela_centavos INTEGER NOT NULL CHECK (valor_parcela_centavos > 0),
  total_centavos INTEGER NOT NULL CHECK (total_centavos > 0),
  desconto_pct REAL NOT NULL,
  cobranca_externa_id TEXT,
  link_pagamento TEXT,
  fechado_em TEXT NOT NULL,
  confirmacao_enviada INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_acordos_credor ON acordos (credor_id, fechado_em DESC);
```

- [ ] **Step 2: Acrescentar a trava**

Ao final de `backend/src/dominio/travas.ts`:

```ts
// Trava separada da pausa global, de proposito. Pausar o disparo e rotina;
// derrubar o portal junto deixaria com pagina morta quem clicou num link
// que ja enviamos. O botao de emergencia do painel aciona as duas.
export async function lerPortalAberto(db: D1Database): Promise<boolean> {
  const linha = await db
    .prepare('SELECT aberto FROM portal_estado WHERE id = 1')
    .first<{ aberto: number }>();
  // Ausencia de linha significa banco nao inicializado: portal fechado.
  return linha ? linha.aberto === 1 : false;
}

export async function definirPortalAberto(
  db: D1Database,
  aberto: boolean,
  por: string,
): Promise<void> {
  await db
    .prepare('UPDATE portal_estado SET aberto = ?, desde = ?, por = ? WHERE id = 1')
    .bind(aberto ? 1 : 0, new Date().toISOString(), por)
    .run();
  await registrarAuditoria(db, {
    acao: aberto ? 'portal-aberto' : 'portal-fechado',
    telefone: null,
    detalhe: `por ${por}`,
  });
}
```

- [ ] **Step 3: Aplicar e conferir**

```bash
cd backend && npm run migrar && npx wrangler d1 execute cobranca --local --command "SELECT aberto FROM portal_estado"
```

Esperado: `aberto = 0`.

- [ ] **Step 4: Rodar tudo e commitar**

```bash
cd backend && npm run teste && npx tsc --noEmit
```

O teste-guarda vigia `devedores|dividas|conversas|telefones|tentativas_contato`. Acrescente `links_acordo|acordos` à lista `TABELAS_DE_CARTEIRA` em `backend/testes/escopo-guarda.test.ts` — as duas tabelas têm `credor_id` e todas as consultas das Tasks 4 a 7 o usam, então nenhuma exceção nova deve ser necessária. Se alguma consulta acusar, ponha escopo nela; só libere com justificativa escrita se o escopo for genuinamente impossível.

```bash
git add backend/migracoes/0006_portal.sql backend/src/dominio/travas.ts backend/testes/escopo-guarda.test.ts && git commit -m "Cria as tabelas do portal e a trava propria, fechada por padrao" && git push
```

---

### Task 4: Link — geração, hash e verificação

**Files:**
- Create: `backend/src/db/links.ts`, `backend/testes/links.test.ts`

**Interfaces:**
- Consumes: `CredorId`.
- Produces:
  - `const VALIDADE_DIAS = 7`, `const MAXIMO_TENTATIVAS = 5`
  - `async function hashDeToken(token: string): Promise<string>`
  - `async function criarLink(db, credorId, devedorId): Promise<{ token: string; expiraEm: string }>`
  - `type ResultadoLink = { ok: true; linkId: number; credorId: CredorId; devedorId: string } | { ok: false; motivo: 'invalido' | 'expirado' | 'consumido' | 'bloqueado' }`
  - `async function abrirLink(db, token: string): Promise<ResultadoLink>`
  - `async function registrarTentativa(db, linkId: number): Promise<number>`
  - `async function consumirLink(db, linkId: number): Promise<void>`

- [ ] **Step 1: Escrever o teste (vai falhar)**

`backend/testes/links.test.ts`:

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { hashDeToken, VALIDADE_DIAS, MAXIMO_TENTATIVAS } from '../src/db/links.ts';

test('o hash e estavel e tem 64 caracteres hex', async () => {
  const h = await hashDeToken('abc');
  assert.match(h, /^[0-9a-f]{64}$/);
  assert.equal(h, await hashDeToken('abc'));
});

test('tokens diferentes produzem hashes diferentes', async () => {
  assert.notEqual(await hashDeToken('abc'), await hashDeToken('abd'));
});

test('o hash nao contem o token', async () => {
  // Obvio, mas e a propriedade que faz o banco vazado nao virar link valido.
  const token = 'token-secreto-de-teste';
  assert.ok(!(await hashDeToken(token)).includes(token));
});

test('a validade e curta o bastante para limitar reuso', () => {
  assert.ok(VALIDADE_DIAS >= 1 && VALIDADE_DIAS <= 30);
});

test('o limite de tentativas impede forca bruta em CPF', () => {
  // 5 chances contra 11 digitos: qualquer valor alto tornaria o CPF
  // adivinhavel por quem tem o link.
  assert.ok(MAXIMO_TENTATIVAS >= 3 && MAXIMO_TENTATIVAS <= 5);
});
```

- [ ] **Step 2: Rodar e confirmar a falha**

```bash
cd backend && npm run teste
```

- [ ] **Step 3: Implementar**

`backend/src/db/links.ts`:

```ts
import type { CredorId } from '../dominio/credor.ts';

export const VALIDADE_DIAS = 7;
export const MAXIMO_TENTATIVAS = 5;

export async function hashDeToken(token: string): Promise<string> {
  const bytes = new TextEncoder().encode(token);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function novoToken(): string {
  // 32 bytes = 256 bits. Adivinhar exige forca bruta impraticavel, e e por
  // isso que o token pode ser a unica chave da pagina.
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

export async function criarLink(
  db: D1Database,
  credorId: CredorId,
  devedorId: string,
): Promise<{ token: string; expiraEm: string }> {
  const token = novoToken();
  const agora = new Date();
  const expira = new Date(agora.getTime() + VALIDADE_DIAS * 24 * 60 * 60 * 1000);

  await db
    .prepare(
      `INSERT INTO links_acordo (token_hash, credor_id, devedor_id, criado_em, expira_em)
       VALUES (?, ?, ?, ?, ?)`,
    )
    .bind(await hashDeToken(token), credorId, devedorId, agora.toISOString(), expira.toISOString())
    .run();

  // O token em claro so existe aqui e no link enviado. Nao volta a aparecer.
  return { token, expiraEm: expira.toISOString() };
}

export type ResultadoLink =
  | { ok: true; linkId: number; credorId: CredorId; devedorId: string }
  | { ok: false; motivo: 'invalido' | 'expirado' | 'consumido' | 'bloqueado' };

export async function abrirLink(db: D1Database, token: string): Promise<ResultadoLink> {
  if (typeof token !== 'string' || token.length < 20) return { ok: false, motivo: 'invalido' };

  const linha = await db
    .prepare(
      `SELECT id, credor_id, devedor_id, expira_em, tentativas, consumido_em
       FROM links_acordo WHERE token_hash = ?`,
    )
    .bind(await hashDeToken(token))
    .first<{
      id: number;
      credor_id: string;
      devedor_id: string;
      expira_em: string;
      tentativas: number;
      consumido_em: string | null;
    }>();

  if (!linha) return { ok: false, motivo: 'invalido' };
  if (linha.consumido_em !== null) return { ok: false, motivo: 'consumido' };
  if (new Date(linha.expira_em) <= new Date()) return { ok: false, motivo: 'expirado' };
  if (linha.tentativas >= MAXIMO_TENTATIVAS) return { ok: false, motivo: 'bloqueado' };

  return {
    ok: true,
    linkId: Number(linha.id),
    credorId: linha.credor_id as CredorId,
    devedorId: linha.devedor_id,
  };
}

export async function registrarTentativa(db: D1Database, linkId: number): Promise<number> {
  await db
    .prepare('UPDATE links_acordo SET tentativas = tentativas + 1 WHERE id = ?')
    .bind(linkId)
    .run();
  const linha = await db
    .prepare('SELECT tentativas FROM links_acordo WHERE id = ?')
    .bind(linkId)
    .first<{ tentativas: number }>();
  return linha ? Number(linha.tentativas) : MAXIMO_TENTATIVAS;
}

export async function consumirLink(db: D1Database, linkId: number): Promise<void> {
  await db
    .prepare('UPDATE links_acordo SET consumido_em = ? WHERE id = ?')
    .bind(new Date().toISOString(), linkId)
    .run();
}
```

As consultas de `links_acordo` acima não têm `credor_id` no `WHERE` porque
a chave é o hash do token, que é único no mundo — o mesmo argumento já
aceito para `fecharTentativa` na Fase 4. Se o teste-guarda acusar, acrescente
a exceção com essa justificativa.

- [ ] **Step 4: Rodar os testes e commitar**

```bash
cd backend && npm run teste && npx tsc --noEmit
```

```bash
git add backend/src/db/links.ts backend/testes/links.test.ts && git commit -m "Gera link de acordo com token de 256 bits guardado como hash" && git push
```

---

### Task 5: Rotas públicas — abrir link e conferir CPF

**Files:**
- Create: `backend/src/api/portal.ts`, `backend/testes/portal-seguranca.test.ts`
- Modify: `backend/src/index.ts`

**Interfaces:**
- Consumes: `abrirLink`, `registrarTentativa`, `lerPortalAberto`, `cpfValido`, `normalizarCpf`, `textosIguaisEmTempoConstante`, `gerarOfertas`, `lerCredor`.
- Produces: `rotearPortal(requisicao, url, db): Promise<Response>`; rotas `POST /acordo/entrar`, `GET /acordo/:token` (HTML).

- [ ] **Step 1: Escrever o teste de segurança (vai falhar)**

`backend/testes/portal-seguranca.test.ts`:

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const fonte = readFileSync(join(import.meta.dirname, '../src/api/portal.ts'), 'utf8');

test('o portal nunca aceita id de devedor pela URL', () => {
  // O requisito e "nenhum dado de outro devedor acessivel trocando um
  // parametro". Cumprido por construcao: nao existe parametro a trocar.
  assert.ok(!/searchParams\.get\(['"](devedor|credor|id)['"]\)/.test(fonte));
});

test('a comparacao de CPF e em tempo constante', () => {
  assert.match(fonte, /textosIguaisEmTempoConstante/);
});

test('as tres falhas de link devolvem a mesma mensagem', () => {
  // Distinguir inexistente de expirado permitiria enumerar tokens validos.
  const mensagens = [...fonte.matchAll(/MENSAGEM_LINK_INVALIDO/g)];
  assert.ok(mensagens.length >= 1);
  assert.match(fonte, /const MENSAGEM_LINK_INVALIDO/);
});

test('o portal checa a propria trava antes de servir', () => {
  assert.match(fonte, /lerPortalAberto/);
});

test('a tentativa e registrada antes de responder ao CPF errado', () => {
  assert.match(fonte, /registrarTentativa/);
});

test('nenhuma resposta do portal ecoa o CPF recebido', () => {
  assert.ok(!/JSON\.stringify\(\{[^}]*cpf/i.test(fonte));
});
```

- [ ] **Step 2: Rodar e confirmar a falha**

```bash
cd backend && npm run teste
```

Esperado: ENOENT ao ler `src/api/portal.ts`.

- [ ] **Step 3: Implementar**

`backend/src/api/portal.ts`:

```ts
import { abrirLink, registrarTentativa, MAXIMO_TENTATIVAS } from '../db/links.ts';
import { lerPortalAberto, registrarAuditoria } from '../dominio/travas.ts';
import { cpfValido, normalizarCpf } from '../dominio/cpf.ts';
import { textosIguaisEmTempoConstante } from '../seguranca/comparar.ts';
import { gerarOfertas } from '../dominio/ofertas.ts';
import { lerCredor } from '../db/credores.ts';
import { servirPortal } from '../portal/servir.ts';

// Mensagem unica para link inexistente, expirado, consumido e bloqueado.
// Distinguir permitiria descobrir quais tokens existem.
const MENSAGEM_LINK_INVALIDO = 'Este link não é válido ou expirou.';

const MENSAGEM_PORTAL_FECHADO =
  'O atendimento on-line está temporariamente indisponível. Tente mais tarde.';

export async function rotearPortal(
  requisicao: Request,
  url: URL,
  db: D1Database,
): Promise<Response> {
  // A pagina em si e estatica e nao revela nada: os dados so vem depois do
  // CPF conferido. Por isso ela e servida antes de qualquer checagem.
  if (requisicao.method === 'GET') {
    return servirPortal(url);
  }

  if (url.pathname === '/acordo/entrar' && requisicao.method === 'POST') {
    if (!(await lerPortalAberto(db))) {
      return Response.json({ ok: false, mensagem: MENSAGEM_PORTAL_FECHADO }, { status: 503 });
    }

    const corpo = (await requisicao.json().catch(() => ({}))) as {
      token?: unknown;
      cpf?: unknown;
    };
    const token = typeof corpo.token === 'string' ? corpo.token : '';
    const cpfInformado = typeof corpo.cpf === 'string' ? corpo.cpf : '';

    const link = await abrirLink(db, token);
    if (!link.ok) {
      await registrarAuditoria(db, {
        acao: 'portal-link-recusado',
        telefone: null,
        detalhe: link.motivo,
      });
      return Response.json({ ok: false, mensagem: MENSAGEM_LINK_INVALIDO }, { status: 404 });
    }

    // A tentativa e contada ANTES de conferir. Contar so no erro deixaria a
    // forca bruta livre em caso de falha no meio do caminho.
    const tentativas = await registrarTentativa(db, link.linkId);

    const devedor = await db
      .prepare('SELECT nome, documento FROM devedores WHERE id = ? AND credor_id = ?')
      .bind(link.devedorId, link.credorId)
      .first<{ nome: string; documento: string | null }>();

    const cpfCadastrado = normalizarCpf(devedor?.documento ?? '');
    const acertou =
      cpfValido(cpfInformado) &&
      cpfCadastrado.length === 11 &&
      textosIguaisEmTempoConstante(normalizarCpf(cpfInformado), cpfCadastrado);

    if (!acertou) {
      await registrarAuditoria(db, {
        acao: 'portal-cpf-incorreto',
        telefone: null,
        detalhe: `link ${link.linkId}, tentativa ${tentativas} de ${MAXIMO_TENTATIVAS}`,
      });
      return Response.json(
        {
          ok: false,
          mensagem: 'CPF não confere.',
          tentativasRestantes: Math.max(MAXIMO_TENTATIVAS - tentativas, 0),
        },
        { status: 401 },
      );
    }

    const credor = await lerCredor(db, link.credorId);
    if (!credor) {
      return Response.json({ ok: false, mensagem: MENSAGEM_LINK_INVALIDO }, { status: 404 });
    }

    const { results: dividas } = await db
      .prepare(
        `SELECT valor_centavos FROM dividas
         WHERE credor_id = ? AND devedor_id = ? AND situacao = 'aberta'`,
      )
      .bind(link.credorId, link.devedorId)
      .all<{ valor_centavos: number }>();

    const saldo = dividas.reduce((s, d) => s + Number(d.valor_centavos), 0);

    await registrarAuditoria(db, {
      acao: 'portal-acesso-autorizado',
      telefone: null,
      detalhe: `link ${link.linkId}, credor ${link.credorId}`,
    });

    return Response.json({
      ok: true,
      nome: devedor!.nome,
      credor: credor.nome,
      saldoCentavos: saldo,
      ofertas: gerarOfertas(saldo, credor.regras),
    });
  }

  return new Response('Nao encontrado', { status: 404 });
}
```

- [ ] **Step 4: Abrir a rota pública no roteador**

Em `backend/src/index.ts`, **antes** do bloco autenticado:

```ts
import { rotearPortal } from './api/portal.ts';
```

```ts
    // Unico namespace publico do Worker. Fica antes da autenticacao de
    // proposito, e por isso tudo dentro dele exige token de link valido.
    if (url.pathname === '/acordo' || url.pathname.startsWith('/acordo/')) {
      return rotearPortal(requisicao, url, env.DB);
    }
```

- [ ] **Step 5: Rodar os testes e commitar**

```bash
cd backend && npm run teste && npx tsc --noEmit
```

```bash
git add backend/src/api/portal.ts backend/testes/portal-seguranca.test.ts backend/src/index.ts && git commit -m "Abre o namespace publico do portal com conferencia de CPF" && git push
```

---

### Task 6: Fechar o acordo, com a escolha validada no servidor

**Files:**
- Create: `backend/src/db/acordos.ts`, `backend/src/pagamento/provedor.ts`
- Modify: `backend/src/api/portal.ts`

**Interfaces:**
- Produces:
  - `interface Cobranca { idExterno: string; linkPagamento: string }`
  - `interface ProvedorPagamento { criarCobranca(p: { valorCentavos: number; parcelas: number; nomeCliente: string; cpf: string; descricao: string }): Promise<Cobranca> }`
  - `const provedorDeTeste: ProvedorPagamento`
  - `async function gravarAcordo(db, dados): Promise<number>`
  - `async function acordosDoCredor(db, credorId): Promise<...>`
  - Rota `POST /acordo/fechar`.

- [ ] **Step 1: Interface do provedor e implementação de teste**

`backend/src/pagamento/provedor.ts`:

```ts
export interface Cobranca {
  idExterno: string;
  linkPagamento: string;
}

export interface DadosCobranca {
  valorCentavos: number;
  parcelas: number;
  nomeCliente: string;
  cpf: string;
  descricao: string;
}

export interface ProvedorPagamento {
  criarCobranca(dados: DadosCobranca): Promise<Cobranca>;
}

// Nao chama rede e nao cobra nada. Existe para que o portal inteiro seja
// construido e verificado antes de qualquer integracao real — e para que o
// dia da integracao mude um arquivo so.
export const provedorDeTeste: ProvedorPagamento = {
  async criarCobranca(dados) {
    return {
      idExterno: `teste-${dados.parcelas}x-${dados.valorCentavos}`,
      linkPagamento: 'https://exemplo.invalido/pagamento-de-teste',
    };
  },
};
```

- [ ] **Step 2: Repositório de acordos**

`backend/src/db/acordos.ts`:

```ts
import type { CredorId } from '../dominio/credor.ts';

export interface DadosAcordo {
  credorId: CredorId;
  devedorId: string;
  linkId: number;
  tipo: 'a_vista' | 'parcelado';
  parcelas: number;
  valorParcelaCentavos: number;
  totalCentavos: number;
  descontoPct: number;
  cobrancaExternaId: string | null;
  linkPagamento: string | null;
}

export async function gravarAcordo(db: D1Database, d: DadosAcordo): Promise<number> {
  const r = await db
    .prepare(
      `INSERT INTO acordos
        (credor_id, devedor_id, link_id, tipo, parcelas, valor_parcela_centavos,
         total_centavos, desconto_pct, cobranca_externa_id, link_pagamento, fechado_em)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      d.credorId, d.devedorId, d.linkId, d.tipo, d.parcelas, d.valorParcelaCentavos,
      d.totalCentavos, d.descontoPct, d.cobrancaExternaId, d.linkPagamento,
      new Date().toISOString(),
    )
    .run();
  return Number(r.meta.last_row_id);
}

export async function marcarConfirmacaoEnviada(db: D1Database, id: number): Promise<void> {
  await db.prepare('UPDATE acordos SET confirmacao_enviada = 1 WHERE id = ?').bind(id).run();
}

export async function acordosDoCredor(
  db: D1Database,
  credorId: CredorId,
  limite = 200,
): Promise<Array<Record<string, unknown>>> {
  const { results } = await db
    .prepare(
      `SELECT id, credor_id, devedor_id, tipo, parcelas, valor_parcela_centavos,
              total_centavos, desconto_pct, link_pagamento, fechado_em, confirmacao_enviada
       FROM acordos WHERE credor_id = ? ORDER BY fechado_em DESC LIMIT ?`,
    )
    .bind(credorId, limite)
    .all();
  return results;
}
```

- [ ] **Step 3: Rota de fechamento**

Em `backend/src/api/portal.ts`, acrescente antes do `return` final:

```ts
  if (url.pathname === '/acordo/fechar' && requisicao.method === 'POST') {
    if (!(await lerPortalAberto(db))) {
      return Response.json({ ok: false, mensagem: MENSAGEM_PORTAL_FECHADO }, { status: 503 });
    }

    const corpo = (await requisicao.json().catch(() => ({}))) as {
      token?: unknown;
      cpf?: unknown;
      indice?: unknown;
    };
    const token = typeof corpo.token === 'string' ? corpo.token : '';
    const indice = Number(corpo.indice);

    const link = await abrirLink(db, token);
    if (!link.ok) {
      return Response.json({ ok: false, mensagem: MENSAGEM_LINK_INVALIDO }, { status: 404 });
    }

    // O CPF e conferido de novo: o fechamento nao confia em ter havido um
    // /acordo/entrar antes, porque nao ha sessao entre as duas chamadas.
    const devedor = await db
      .prepare('SELECT nome, documento FROM devedores WHERE id = ? AND credor_id = ?')
      .bind(link.devedorId, link.credorId)
      .first<{ nome: string; documento: string | null }>();

    const cpfCadastrado = normalizarCpf(devedor?.documento ?? '');
    const cpfInformado = normalizarCpf(typeof corpo.cpf === 'string' ? corpo.cpf : '');
    if (
      cpfCadastrado.length !== 11 ||
      !textosIguaisEmTempoConstante(cpfInformado, cpfCadastrado)
    ) {
      await registrarTentativa(db, link.linkId);
      return Response.json({ ok: false, mensagem: 'CPF não confere.' }, { status: 401 });
    }

    const credor = await lerCredor(db, link.credorId);
    if (!credor) {
      return Response.json({ ok: false, mensagem: MENSAGEM_LINK_INVALIDO }, { status: 404 });
    }

    const { results: dividas } = await db
      .prepare(
        `SELECT valor_centavos FROM dividas
         WHERE credor_id = ? AND devedor_id = ? AND situacao = 'aberta'`,
      )
      .bind(link.credorId, link.devedorId)
      .all<{ valor_centavos: number }>();
    const saldo = dividas.reduce((s, d) => s + Number(d.valor_centavos), 0);

    // A lista e RECALCULADA aqui. O navegador manda so o indice: valor,
    // parcelas e desconto vem do servidor. Adulterar o formulario nao muda
    // nada, porque nada do que ele manda vira dinheiro.
    const ofertas = gerarOfertas(saldo, credor.regras);
    const escolhida = ofertas[indice];
    if (!Number.isInteger(indice) || !escolhida) {
      return Response.json({ ok: false, mensagem: 'Opção inválida.' }, { status: 400 });
    }

    const cobranca = await provedor.criarCobranca({
      valorCentavos: escolhida.totalCentavos,
      parcelas: escolhida.parcelas,
      nomeCliente: devedor!.nome,
      cpf: cpfCadastrado,
      descricao: `Acordo ${credor.nome}`,
    });

    // O acordo e gravado ANTES de qualquer tentativa de aviso. Um acordo
    // perdido porque a mensagem falhou seria muito pior que um aviso nao
    // enviado.
    const acordoId = await gravarAcordo(db, {
      credorId: link.credorId,
      devedorId: link.devedorId,
      linkId: link.linkId,
      tipo: escolhida.tipo,
      parcelas: escolhida.parcelas,
      valorParcelaCentavos: escolhida.valorParcelaCentavos,
      totalCentavos: escolhida.totalCentavos,
      descontoPct: escolhida.descontoPct,
      cobrancaExternaId: cobranca.idExterno,
      linkPagamento: cobranca.linkPagamento,
    });

    await consumirLink(db, link.linkId);
    await registrarAuditoria(db, {
      acao: 'acordo-fechado',
      telefone: null,
      detalhe: `acordo ${acordoId}, credor ${link.credorId}, ${escolhida.parcelas}x`,
    });

    return Response.json({
      ok: true,
      acordoId,
      parcelas: escolhida.parcelas,
      valorParcelaCentavos: escolhida.valorParcelaCentavos,
      totalCentavos: escolhida.totalCentavos,
      linkPagamento: cobranca.linkPagamento,
    });
  }
```

Acrescente aos imports do arquivo: `consumirLink` de `../db/links.ts`,
`gravarAcordo` de `../db/acordos.ts`, e o provedor:

```ts
import { provedorDeTeste } from '../pagamento/provedor.ts';

// Trocado pelo Asaas na Task 9. Ate la, nenhuma cobranca real e criada.
const provedor = provedorDeTeste;
```

- [ ] **Step 4: Teste da validação por índice**

Acrescente a `backend/testes/portal-seguranca.test.ts`:

```ts
test('o fechamento recalcula a oferta e ignora valores do cliente', () => {
  // Se o servidor lesse valorCentavos do corpo, qualquer um fecharia acordo
  // de um centavo. A unica coisa aceita do navegador e o indice.
  assert.match(fonte, /const ofertas = gerarOfertas\(saldo, credor\.regras\)/);
  assert.match(fonte, /const escolhida = ofertas\[indice\]/);
  assert.ok(!/corpo\.(valor|total|parcelas|desconto)/.test(fonte));
});

test('o link e consumido ao fechar o acordo', () => {
  assert.match(fonte, /consumirLink/);
});

test('o acordo e gravado antes de consumir o link', () => {
  const iGravar = fonte.indexOf('gravarAcordo(db');
  const iConsumir = fonte.indexOf('consumirLink(db');
  assert.ok(iGravar > 0 && iConsumir > iGravar, 'gravarAcordo deve vir antes de consumirLink');
});
```

- [ ] **Step 5: Rodar tudo e commitar**

```bash
cd backend && npm run teste && npx tsc --noEmit
```

```bash
git add backend/src/db/acordos.ts backend/src/pagamento/provedor.ts backend/src/api/portal.ts backend/testes/portal-seguranca.test.ts && git commit -m "Fecha o acordo recalculando a oferta no servidor" && git push
```

---

### Task 7: Telas do portal

**Files:**
- Create: `portal/index.html`, `portal/estilos.css`, `portal/app.js`, `backend/src/portal/servir.ts`
- Modify: `backend/scripts/gerar-painel.mjs`

**Interfaces:**
- Consumes: `POST /acordo/entrar`, `POST /acordo/fechar`.
- Produces: `servirPortal(url: URL): Response`, `ehRotaDoPortal(url: URL): boolean`.

- [ ] **Step 1: A tela**

`portal/index.html` — três telas no mesmo documento, alternadas por `hidden`:

```html
<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Negociar dívida</title>
    <link rel="stylesheet" href="/acordo/estilos.css" />
  </head>
  <body>
    <main class="folha">
      <h1 class="marca">Agio</h1>

      <section id="tela-entrar" class="cartao">
        <h2>Confirme quem é você</h2>
        <p class="ajuda">Para sua segurança, informe o CPF do titular da dívida.</p>
        <form id="forma-entrar">
          <label for="cpf">CPF</label>
          <input id="cpf" name="cpf" inputmode="numeric" autocomplete="off" required />
          <button type="submit" class="botao">Continuar</button>
        </form>
        <p id="erro-entrar" class="erro" role="alert" hidden></p>
      </section>

      <section id="tela-ofertas" class="cartao" hidden>
        <h2 id="saudacao"></h2>
        <p class="ajuda">Escolha como prefere quitar. As condições abaixo já estão aprovadas.</p>
        <p class="saldo">Total em aberto: <strong id="saldo"></strong></p>
        <ul id="lista-ofertas" class="ofertas"></ul>
        <p id="erro-ofertas" class="erro" role="alert" hidden></p>
      </section>

      <section id="tela-pronto" class="cartao" hidden>
        <h2>Acordo fechado</h2>
        <p id="resumo-acordo"></p>
        <a id="link-pagamento" class="botao" href="#" rel="noopener">Pagar agora</a>
        <p class="ajuda">Você também receberá a confirmação pelo WhatsApp.</p>
      </section>
    </main>
    <script type="module" src="/acordo/app.js"></script>
  </body>
</html>
```

- [ ] **Step 2: O comportamento**

`portal/app.js`:

```js
// O token vem do caminho, nunca de parametro de consulta: /acordo/<token>.
// Nao ha id de devedor em lugar nenhum da URL.
const token = location.pathname.split('/').filter(Boolean)[1] ?? '';

// Guardado so em memoria, para a segunda chamada. Nao vai para
// localStorage: e CPF, e a aba fechada nao deve deixar rastro.
let cpfConfirmado = '';
let ofertasEmTela = [];

const elemento = (id) => document.getElementById(id);
const moeda = (centavos) =>
  (centavos / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

function mostrarErro(id, mensagem) {
  const p = elemento(id);
  p.textContent = mensagem;
  p.hidden = false;
}

elemento('forma-entrar').addEventListener('submit', async (evento) => {
  evento.preventDefault();
  elemento('erro-entrar').hidden = true;

  const resposta = await fetch('/acordo/entrar', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ token, cpf: elemento('cpf').value }),
  });
  const dados = await resposta.json().catch(() => ({}));

  if (!dados.ok) {
    const restantes =
      typeof dados.tentativasRestantes === 'number'
        ? ` Restam ${dados.tentativasRestantes} tentativa(s).`
        : '';
    mostrarErro('erro-entrar', `${dados.mensagem ?? 'Não foi possível continuar.'}${restantes}`);
    return;
  }

  cpfConfirmado = elemento('cpf').value;
  ofertasEmTela = dados.ofertas;

  elemento('saudacao').textContent = `Olá, ${dados.nome.split(' ')[0]}`;
  elemento('saldo').textContent = moeda(dados.saldoCentavos);
  elemento('lista-ofertas').replaceChildren(...dados.ofertas.map(cartaoDeOferta));
  elemento('tela-entrar').hidden = true;
  elemento('tela-ofertas').hidden = false;
});

function cartaoDeOferta(oferta) {
  const li = document.createElement('li');
  li.className = 'oferta';

  const titulo = document.createElement('p');
  titulo.className = 'oferta-titulo';
  titulo.textContent =
    oferta.tipo === 'a_vista'
      ? `À vista${oferta.descontoPct > 0 ? ` com ${oferta.descontoPct}% de desconto` : ''}`
      : `${oferta.parcelas}x de ${moeda(oferta.valorParcelaCentavos)}`;

  const total = document.createElement('p');
  total.className = 'oferta-total';
  total.textContent = `Total ${moeda(oferta.totalCentavos)}`;

  const botao = document.createElement('button');
  botao.type = 'button';
  botao.className = 'botao';
  botao.textContent = 'Escolher';
  botao.addEventListener('click', () => fechar(oferta.indice, botao));

  li.append(titulo, total, botao);
  return li;
}

async function fechar(indice, botao) {
  elemento('erro-ofertas').hidden = true;
  // Duplo clique fecharia dois acordos. O botao sai de cena na hora.
  for (const b of document.querySelectorAll('.oferta .botao')) b.disabled = true;
  botao.textContent = 'Gerando…';

  const resposta = await fetch('/acordo/fechar', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ token, cpf: cpfConfirmado, indice }),
  });
  const dados = await resposta.json().catch(() => ({}));

  if (!dados.ok) {
    mostrarErro('erro-ofertas', dados.mensagem ?? 'Não foi possível fechar o acordo.');
    for (const b of document.querySelectorAll('.oferta .botao')) b.disabled = false;
    botao.textContent = 'Escolher';
    return;
  }

  const escolhida = ofertasEmTela[indice];
  elemento('resumo-acordo').textContent =
    escolhida.tipo === 'a_vista'
      ? `Pagamento à vista de ${moeda(dados.totalCentavos)}.`
      : `${dados.parcelas} parcelas de ${moeda(dados.valorParcelaCentavos)}.`;
  elemento('link-pagamento').href = dados.linkPagamento;
  elemento('tela-ofertas').hidden = true;
  elemento('tela-pronto').hidden = false;
}
```

- [ ] **Step 3: Estilo**

`portal/estilos.css` — folha própria, independente do painel, porque o
público é outro e a tela é de celular:

```css
:root {
  --azul: #2f6bff;
  --tinta: #161b26;
  --medio: #5b6474;
  --borda: rgba(15, 19, 27, 0.12);
  --alerta: #d92d20;
  --fundo: #f2f6ff;
}
* { box-sizing: border-box; }
[hidden] { display: none !important; }
body {
  margin: 0; padding: 20px; background: var(--fundo); color: var(--tinta);
  font: 16px/1.5 -apple-system, "Segoe UI", system-ui, sans-serif;
}
.folha { max-width: 460px; margin: 0 auto; }
.marca { font-size: 1.1rem; margin: 8px 0 18px; }
.cartao {
  padding: 22px; border-radius: 18px; background: #fff;
  box-shadow: 0 2px 14px rgba(15, 19, 27, 0.08);
}
h2 { margin: 0 0 6px; font-size: 1.3rem; }
.ajuda { margin: 0 0 16px; color: var(--medio); font-size: 0.9rem; }
label { display: block; margin-bottom: 6px; font-size: 0.85rem; font-weight: 600; }
input {
  width: 100%; min-height: 48px; padding: 0 14px; margin-bottom: 14px;
  border: 1px solid var(--borda); border-radius: 12px; font-size: 1rem;
}
.botao {
  display: inline-flex; align-items: center; justify-content: center;
  width: 100%; min-height: 48px; padding: 0 18px; border: 0; border-radius: 12px;
  background: var(--azul); color: #fff; font-size: 1rem; font-weight: 600;
  text-decoration: none; cursor: pointer;
}
.botao[disabled] { opacity: 0.55; cursor: default; }
.erro { margin: 12px 0 0; color: var(--alerta); font-weight: 600; font-size: 0.9rem; }
.saldo { margin: 0 0 14px; }
.ofertas { list-style: none; margin: 0; padding: 0; display: grid; gap: 12px; }
.oferta { padding: 16px; border: 1px solid var(--borda); border-radius: 14px; }
.oferta-titulo { margin: 0 0 2px; font-weight: 650; }
.oferta-total { margin: 0 0 12px; color: var(--medio); font-size: 0.88rem; }
```

- [ ] **Step 4: Servir**

`backend/src/portal/servir.ts`, no mesmo padrão de `src/painel/servir.ts`:

```ts
import { ARQUIVOS_PORTAL } from './arquivos-portal.ts';

// O portal e publico: sem no-store, um cache compartilhado poderia
// devolver a pagina de um devedor para outro. A pagina em si nao tem dado
// nenhum — os dados vem por fetch depois do CPF — mas a regra vale igual.
export function servirPortal(url: URL): Response {
  const nome = url.pathname.replace(/^\/acordo\/?/, '');
  const arquivo =
    ARQUIVOS_PORTAL[nome] ?? (nome.includes('.') ? undefined : ARQUIVOS_PORTAL['index.html']);

  if (!arquivo) return new Response('Nao encontrado', { status: 404 });

  return new Response(arquivo.conteudo, {
    headers: {
      'content-type': arquivo.tipo,
      'cache-control': 'private, no-store',
      'x-content-type-options': 'nosniff',
      'referrer-policy': 'no-referrer',
    },
  });
}
```

Qualquer caminho sem ponto cai no `index.html` — é o que faz
`/acordo/<token>` servir a página em vez de 404.

- [ ] **Step 5: Embutir os arquivos**

Em `backend/scripts/gerar-painel.mjs`, acrescente uma segunda lista e um
segundo arquivo gerado:

```js
const ARQUIVOS_PORTAL = [
  ['portal/index.html', 'text/html; charset=utf-8'],
  ['portal/estilos.css', 'text/css; charset=utf-8'],
  ['portal/app.js', 'text/javascript; charset=utf-8'],
];
```

gerando `src/portal/arquivos-portal.ts` com as chaves sem o prefixo
`portal/` (`index.html`, `estilos.css`, `app.js`), aplicando a mesma
verificação de credenciais que já existe para o painel.

- [ ] **Step 6: Verificar na tela**

```bash
cd backend && npm run dev
```

Crie um devedor de teste com CPF fictício válido e gere um link pelo D1
local, depois abra `http://127.0.0.1:8787/acordo/<token>` — **sem
autenticação**, que é o ponto. Confirme:

1. A página abre sem pedir senha.
2. Com o portal fechado (padrão), enviar o CPF devolve a mensagem de indisponível.
3. Abrindo o portal no D1 local e enviando o CPF **errado** cinco vezes, o link morre e passa a responder a mensagem de link inválido.
4. Com o CPF certo, aparecem as ofertas calculadas pela política do credor.
5. Escolher uma fecha o acordo, mostra o resumo e o link de pagamento de teste.
6. Recarregar e tentar de novo devolve a mensagem de link inválido — o link foi consumido.
7. Trocar um caractere do token na URL devolve a mesma mensagem, sem revelar nada.

- [ ] **Step 7: Commitar**

```bash
git add portal backend/src/portal backend/scripts/gerar-painel.mjs && git commit -m "Poe no ar as telas do portal de autonegociacao" && git push
```

---

### Task 8: Painel — gerar link, ver acordos, abrir e fechar o portal

**Files:**
- Modify: `backend/src/api/painel.ts`, `index.html`, `estilos.css`, `app.js`, `dados-remotos.js`

**Interfaces:**
- Produces: `POST /api/link-acordo?credor=` (corpo `{devedorId}`), `GET /api/acordos?credor=`, `POST /api/portal` (corpo `{aberto}`).

- [ ] **Step 1: Rotas**

Na seção com escopo de `backend/src/api/painel.ts`:

```ts
  if (url.pathname === '/api/link-acordo' && metodo === 'POST') {
    if (sessao.escopo.tipo !== 'operador') {
      return new Response('Somente a assessoria gera link', { status: 403 });
    }
    const { devedorId } = (await requisicao.json()) as { devedorId: string };
    if (typeof devedorId !== 'string' || devedorId.length === 0) {
      return new Response('Informe o devedor', { status: 400 });
    }

    // Sem CPF cadastrado nao ha como conferir quem abre o link. Melhor
    // recusar aqui, com motivo, do que servir a divida sem conferencia.
    const devedor = await db
      .prepare('SELECT documento FROM devedores WHERE id = ? AND credor_id = ?')
      .bind(devedorId, credorId)
      .first<{ documento: string | null }>();
    if (!devedor) return new Response('Devedor nao encontrado', { status: 404 });
    if (!cpfValido(devedor.documento ?? '')) {
      return new Response('Devedor sem CPF cadastrado: importe a planilha com a coluna de CPF', {
        status: 409,
      });
    }

    const { token, expiraEm } = await criarLink(db, credorId, devedorId);
    await registrarAuditoria(db, {
      acao: 'link-acordo-gerado',
      telefone: null,
      detalhe: `credor ${credorId}, devedor ${devedorId}`,
    });
    // O token aparece UMA vez. Depois disso so existe o hash.
    return Response.json({ token, expiraEm });
  }

  if (url.pathname === '/api/acordos' && metodo === 'GET') {
    return Response.json({ acordos: await acordosDoCredor(db, credorId) });
  }
```

E na seção sem escopo, junto de `/api/pausa`:

```ts
  if (url.pathname === '/api/portal' && metodo === 'POST') {
    const { aberto } = (await requisicao.json()) as { aberto: boolean };
    if (typeof aberto !== 'boolean') {
      return new Response('Campo aberto deve ser booleano', { status: 400 });
    }
    await definirPortalAberto(db, aberto, 'painel');
    return Response.json({ aberto });
  }
```

Em `/api/estado`, devolva também `portalAberto: await lerPortalAberto(db)`.

- [ ] **Step 2: Botão de pânico**

No `app.js` do painel, o botão de pausa passa a fechar o portal junto ao
pausar — e **não** o reabre ao retomar:

```js
      const { pausado } = await definirPausa(!servidor.pausado);
      // Pausar e emergencia: fecha o portal junto. Retomar NAO reabre o
      // portal — abrir um canal que fecha acordo sozinho e decisao propria,
      // tomada de proposito.
      if (pausado) await definirPortal(false);
```

- [ ] **Step 3: Tela**

Acrescente ao cartão de regras, em `index.html`, um bloco com o estado do
portal e um botão "Abrir portal" / "Fechar portal", mais uma seção
`#secao-acordos` listando os acordos fechados com valor, parcelas, data e
se a confirmação foi enviada. Use as classes existentes (`.cartao`,
`.botao-discreto`, `.tabela`) — não invente tokens de cor: os que existem
estão no bloco `:root` de `estilos.css`.

- [ ] **Step 4: Verificar e commitar**

Suba o painel, gere um link para o devedor de teste, confirme que o token
aparece uma única vez e que gerar link para devedor sem CPF devolve 409 com
a mensagem explicativa.

```bash
git add backend/src/api/painel.ts index.html estilos.css app.js dados-remotos.js && git commit -m "Gera link de acordo pelo painel e mostra os acordos fechados" && git push
```

---

### Task 9: Confirmação por WhatsApp, atrás do portão

**Files:**
- Modify: `backend/src/api/portal.ts`

**Interfaces:**
- Consumes: `avaliarPortao`, `lerPausaGlobal`, `estaSilenciado`, `podeEnviarPara`, `enviarTexto`, `marcarConfirmacaoEnviada`, `telefonesDoDevedor`.

- [ ] **Step 1: Enviar depois de gravar**

Em `/acordo/fechar`, depois de `consumirLink`, dentro de `ctx.waitUntil` —
a rota precisa receber `ctx`, como o webhook já faz:

```ts
// O acordo ja esta gravado. A confirmacao e envio, e envio passa pelo
// portao: com a pausa global ligada ela nao sai, e o painel mostra o
// acordo como "confirmacao pendente". Nunca o contrario.
ctx.waitUntil(
  confirmarPorWhatsapp(config, db, link.credorId, link.devedorId, acordoId, escolhida).catch(
    async (erro) => {
      await registrarAuditoria(db, {
        acao: 'erro-na-confirmacao-do-acordo',
        telefone: null,
        detalhe: String(erro).slice(0, 300),
      }).catch(() => {});
    },
  ),
);
```

E a função, no mesmo arquivo:

```ts
async function confirmarPorWhatsapp(
  config: Config,
  db: D1Database,
  credorId: CredorId,
  devedorId: string,
  acordoId: number,
  oferta: Oferta,
): Promise<void> {
  const telefones = await telefonesDoDevedor(db, credorId, devedorId);
  // So o telefone ja confirmado, ou o de melhor prioridade se nenhum foi.
  const alvo = telefones.find((t) => t.status === 'tem_whatsapp') ?? telefones[0];
  if (!alvo) return;

  const [pausa, silenciado, ultima] = await Promise.all([
    lerPausaGlobal(db),
    estaSilenciado(db, alvo.numero),
    ultimaEntradaDe(db, alvo.numero),
  ]);

  const portao = avaliarPortao({
    pausaGlobal: pausa,
    silenciado,
    naAllowlist: podeEnviarPara(alvo.numero, config.destinatariosTeste),
    tipo: 'livre',
    dentroDaJanela: dentroDaJanela(ultima, new Date()),
  });

  if (!portao.permitido) {
    await registrarAuditoria(db, {
      acao: 'confirmacao-de-acordo-bloqueada',
      telefone: alvo.numero,
      detalhe: `acordo ${acordoId}: ${portao.motivo}`,
    });
    return;
  }

  const texto =
    oferta.tipo === 'a_vista'
      ? `Acordo registrado: pagamento à vista. Obrigado!`
      : `Acordo registrado: ${oferta.parcelas} parcelas. Obrigado!`;

  const envio = await enviarTexto(config, alvo.numero, texto);
  if (envio.ok) await marcarConfirmacaoEnviada(db, acordoId);

  await registrarAuditoria(db, {
    acao: envio.ok ? 'confirmacao-de-acordo-enviada' : 'falha-na-confirmacao-do-acordo',
    telefone: alvo.numero,
    detalhe: envio.erro ?? `acordo ${acordoId}`,
  });
}
```

O texto não menciona valor: o validador da Fase 2 barra cifras, e a
confirmação com número exigiria passar pela mesma revisão. O valor está no
link de pagamento.

- [ ] **Step 2: Verificar e commitar**

Com a pausa ligada (estado atual), feche um acordo no portal local e
confirme na auditoria: `acordo-fechado` seguido de
`confirmacao-de-acordo-bloqueada` com motivo "pausa global". O acordo existe;
a mensagem não saiu.

```bash
git add backend/src/api/portal.ts backend/src/index.ts && git commit -m "Confirma o acordo por WhatsApp sem furar o portao de envio" && git push
```

---

### Task 10: Integração real com o Asaas

**Files:**
- Create: `backend/src/pagamento/asaas.ts`
- Modify: `backend/src/config.ts`, `backend/src/api/portal.ts`, `.env.exemplo`

**Interfaces:**
- Produces: `criarProvedorAsaas(chave: string, base: string): ProvedorPagamento`.

- [ ] **Step 1: Variáveis**

`ASAAS_API_KEY` e `ASAAS_BASE` entram em `Ambiente` e `Config`. **Não** na
lista `OBRIGATORIAS`: sem elas o Worker sobe e o portal usa o provedor de
teste. Acrescente as duas ao `.env.exemplo`, com valores vazios.

- [ ] **Step 2: Implementar**

`backend/src/pagamento/asaas.ts`:

```ts
import type { Cobranca, DadosCobranca, ProvedorPagamento } from './provedor.ts';

// Asaas cobra em reais com ponto decimal, nao em centavos.
function emReais(centavos: number): number {
  return Number((centavos / 100).toFixed(2));
}

export function criarProvedorAsaas(chave: string, base: string): ProvedorPagamento {
  return {
    async criarCobranca(dados: DadosCobranca): Promise<Cobranca> {
      const cliente = await chamar(base, chave, '/customers', {
        name: dados.nomeCliente,
        cpfCnpj: dados.cpf,
      });

      const vencimento = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000)
        .toISOString()
        .slice(0, 10);

      const cobranca = await chamar(base, chave, '/payments', {
        customer: (cliente as { id: string }).id,
        // UNDEFINED deixa o devedor escolher Pix ou boleto na tela do Asaas.
        billingType: 'UNDEFINED',
        dueDate: vencimento,
        description: dados.descricao,
        ...(dados.parcelas > 1
          ? { installmentCount: dados.parcelas, totalValue: emReais(dados.valorCentavos) }
          : { value: emReais(dados.valorCentavos) }),
      });

      const c = cobranca as { id: string; invoiceUrl?: string };
      return { idExterno: c.id, linkPagamento: c.invoiceUrl ?? '' };
    },
  };
}

async function chamar(base: string, chave: string, caminho: string, corpo: unknown) {
  const resposta = await fetch(`${base}${caminho}`, {
    method: 'POST',
    headers: { access_token: chave, 'content-type': 'application/json' },
    body: JSON.stringify(corpo),
  });

  if (!resposta.ok) {
    // Nunca ecoar o corpo inteiro: a resposta de erro pode devolver trechos
    // da requisicao, incluindo CPF. Mesmo cuidado do enviar.ts.
    const dados = (await resposta.json().catch(() => ({}))) as {
      errors?: Array<{ description?: string }>;
    };
    throw new Error(dados.errors?.[0]?.description ?? `Asaas HTTP ${resposta.status}`);
  }

  return resposta.json();
}
```

- [ ] **Step 3: Escolher o provedor pela configuração**

Em `backend/src/api/portal.ts`, troque a constante por uma função:

```ts
// Sem chave configurada, o provedor de teste. E o modo de falha certo: o
// portal continua funcionando para verificacao e nenhuma cobranca real e
// criada por engano.
function provedorDe(config: Config): ProvedorPagamento {
  if (!config.asaas.chave) return provedorDeTeste;
  return criarProvedorAsaas(config.asaas.chave, config.asaas.base);
}
```

- [ ] **Step 4: Gravar o segredo e testar no sandbox**

O **usuário** roda, com a chave de sandbox do Asaas:

```bash
cd backend && npx wrangler secret put ASAAS_API_KEY
```

Aponte `ASAAS_BASE` para `https://api-sandbox.asaas.com/v3` em
`wrangler.toml`, feche um acordo no portal e confirme que a cobrança
aparece no painel do Asaas em sandbox, com o valor certo.

- [ ] **Step 5: Commitar**

```bash
git add backend/src/pagamento/asaas.ts backend/src/config.ts backend/src/api/portal.ts .env.exemplo && git commit -m "Integra o Asaas atras da interface de pagamento" && git push
```

---

### Task 11: Migrar produção e publicar

**Files:** nenhum.

- [ ] **Step 1: Conferir as duas travas no remoto**

```bash
cd backend && npx wrangler d1 execute cobranca --remote --json --command "SELECT pausado FROM pausa_global"
```

Esperado: `1`. **Se vier 0, pare e avise o usuário.**

- [ ] **Step 2: Contagens antes**

```bash
cd backend && npx wrangler d1 execute cobranca --remote --json --command "SELECT (SELECT count(*) FROM conversas) AS conversas, (SELECT count(*) FROM auditoria) AS auditoria, (SELECT count(*) FROM devedores) AS devedores"
```

Anote. Precisam bater depois.

- [ ] **Step 3: Migrar e conferir que o portal nasceu fechado**

```bash
cd backend && npm run migrar:remoto && npx wrangler d1 execute cobranca --remote --json --command "SELECT aberto FROM portal_estado"
```

Esperado: `aberto = 0`. **Se vier 1, pare:** significa que a migração não é
a que está no repositório.

- [ ] **Step 4: Varredura de segredos, da raiz**

```bash
cd "C:/Users/thesc/OneDrive/Documentos/GitHub/Plataforma Cobrança" && pwd && git grep -nE "EAA[A-Za-z0-9]{20,}|sk-ant-[A-Za-z0-9]{10,}|\\\$aact_" -- . ; git ls-files | grep -E "^\.env$|\.dev\.vars" ; echo "fim"
```

O padrão `$aact_` é o prefixo das chaves do Asaas. Nada antes de "fim".

- [ ] **Step 5: Publicar e verificar**

```bash
cd backend && npm run deploy
```

```bash
B=https://cobranca-backend.juridicoagio01.workers.dev; curl -s -o /dev/null -w "portal:%{http_code}\n" $B/acordo/token-inexistente-para-teste-123456; curl -s -o /dev/null -w "painel:%{http_code}\n" $B/; curl -s -o /dev/null -w "api:%{http_code}\n" $B/api/acordos
```

Esperado: **portal 200** (é público, e a página não revela nada sem CPF),
**painel 401**, **api 401**. Se o portal devolver 401, a rota pública ficou
depois da autenticação; se o painel devolver 200, a rota pública ficou larga
demais e engoliu o painel.

```bash
curl -s -X POST -H 'content-type: application/json' -d '{"token":"inexistente","cpf":"52998224725"}' $B/acordo/entrar
```

Esperado: a mensagem de indisponível, porque o portal está fechado.

- [ ] **Step 6: Registrar na memória**

Anote em `~/.claude/projects/.../memory/plataforma-cobranca-fases.md`: Fase 5
entregue, portal público em `/acordo/<token>`, **nasce fechado**, trava
`portal_estado` separada da pausa global, e o botão de emergência do painel
aciona as duas.

---

## Self-review

**Cobertura do que foi pedido:**

| Pedido | Tarefa |
|---|---|
| Link único e individual, com validade, não adivinhável | Task 4 |
| Não reutilizável por outra pessoa | Tasks 4, 5 (CPF) e 6 (consumo) |
| Autenticação leve por CPF antes de mostrar valor | Tasks 1, 5 |
| Dívida e opções da política daquele credor | Tasks 2, 5 |
| Devedor escolhe, confirma, sistema gera pagamento | Tasks 6, 7, 10 |
| Registrar o acordo | Task 6 |
| Confirmação por WhatsApp | Task 9 |
| Só condições que a política permite | Task 2 + revalidação na Task 6 |
| Nenhuma condição gerada por IA | Task 2 — função pura, sem chamada de modelo |
| Nenhum dado de outro devedor trocando parâmetro na URL | Task 5 — não existe parâmetro |
| Pausa global e portal | Tasks 3, 8 — travas separadas, botão de pânico |

**Premissa que precisa de confirmação antes da Task 1:** que a exportação do
Cobmais tenha coluna de CPF. Sem ela, nenhum devedor recebe link e a fase
para; a alternativa é o código por WhatsApp, que depende do template
aprovado.

**Fora de escopo, de propósito:** webhook de baixa do Asaas (saber que o
devedor pagou é fase própria); renegociação de acordo quebrado; cálculo e
fechamento de comissão; portal em nome de mais de uma dívida separada por
contrato — hoje o saldo é a soma das dívidas abertas do devedor naquele
credor.
