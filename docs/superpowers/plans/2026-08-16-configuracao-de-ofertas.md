# Configuração de ofertas por credor — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** O operador define, por credor, quanto de desconto cada quantidade de parcelas recebe — numa tela com prévia ao vivo do que o devedor veria — e o portal passa a oferecer exatamente isso.

**Architecture:** As três regras escalares da Fase 3 dão lugar a uma tabela de faixas de parcelamento por credor, mais três campos globais. Uma função pura valida a tabela e outra gera as ofertas a partir dela; as duas servem tanto à prévia do painel quanto ao portal, de modo que o que se vê configurando é o que o devedor vê negociando. A validação que vale é sempre a do servidor.

**Tech Stack:** Cloudflare Workers, D1, TypeScript com type-stripping nativo do Node 24, wrangler 3, painel em HTML/CSS/JS puro sem build.

**Spec:** `docs/superpowers/specs/2026-08-16-configuracao-de-ofertas-design.md`

**Substitui:** a **Task 2 do plano da Fase 5** (`docs/superpowers/plans/2026-08-16-fase-5-portal-autonegociacao.md`). Aquela versão de `gerarOfertas` calculava sobre `descontoMaximoPct` e `parcelamentoMaximo`, que deixam de existir. **Não execute a Task 2 da Fase 5.** As Tasks 3 a 11 da Fase 5 continuam válidas e consomem o `gerarOfertas` definido aqui.

---

## Global Constraints

- **A pausa global fica LIGADA e o portal continua FECHADO.** Nenhuma tarefa altera as travas.
- Nenhuma credencial em arquivo. NENHUM CPF, telefone ou nome real em teste ou fixture — use os CPFs fictícios `52998224725` e `11144477735` e telefones `5535900000001` em diante.
- Nenhuma dependência nova. Nenhum CDN, nenhum passo de build.
- Código e comentários em português sem acento; texto de tela em português com acento.
- Rode `npx tsc --noEmit` **de dentro de `backend/`** — na raiz o npx pega outro pacote e não verifica nada.
- Depois de mexer em arquivo do painel, rode `cd backend && node scripts/gerar-painel.mjs`.
- Ao final de cada tarefa: os dois conjuntos de testes, `tsc`, varredura de segredos a partir da raiz, commit e push.
- Modo de falha é sempre **não oferecer**: sem faixa configurada, sem oferta; configuração inválida, nenhuma oferta.

---

## Estado ao começar

Fases 1 a 4 publicadas; Fase 5 com a Task 1 concluída (commit `054a2d4`).
143 testes no backend, 34 no painel, `tsc` limpo.

O que existe hoje e vai mudar:

- `backend/src/dominio/credor.ts`: `RegrasCredor { descontoMaximoPct, parcelamentoMaximo, comissaoSobreRecuperadoPct }` e `validarRegras`.
- `backend/src/db/credores.ts`: `listarCredores`, `lerCredor`, `salvarRegras`.
- `backend/src/api/painel.ts`: `GET /api/regras?credor=` e `POST /api/regras?credor=`.
- `index.html` / `app.js` / `estilos.css`: a seção `#secao-regras` com três campos numéricos e `montarRegras()`.
- `backend/src/cobmais/importar.ts`: `importarParaCarteira` deduplica por telefone.
- `backend/src/dominio/ofertas.ts` **não existe** — nasce na Task 2 deste plano.

---

### Task 1: Validação de faixas

**Files:**
- Create: `backend/src/dominio/faixas.ts`, `backend/testes/faixas.test.ts`

**Interfaces:**
- Produces:
  - `interface FaixaParcelamento { de: number; ate: number; descontoPct: number }`
  - `interface RegrasCredor { faixas: FaixaParcelamento[]; parcelaMinimaCentavos: number; descontoTetoPct: number; comissaoSobreRecuperadoPct: number }`
  - `type Validacao = { ok: true } | { ok: false; motivo: string }`
  - `function validarRegras(r: RegrasCredor): Validacao`
  - `const PARCELAS_MAXIMO = 60`

- [ ] **Step 1: Escrever o teste (vai falhar)**

`backend/testes/faixas.test.ts`:

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { validarRegras, PARCELAS_MAXIMO } from '../src/dominio/faixas.ts';

const base = {
  faixas: [
    { de: 1, ate: 1, descontoPct: 20 },
    { de: 2, ate: 3, descontoPct: 10 },
    { de: 4, ate: 6, descontoPct: 0 },
  ],
  parcelaMinimaCentavos: 2000,
  descontoTetoPct: 20,
  comissaoSobreRecuperadoPct: 15,
};

test('configuracao coerente passa', () => {
  assert.deepEqual(validarRegras(base), { ok: true });
});

test('sem faixa nenhuma e recusado', () => {
  // Nao e o mesmo que "nao oferecer nada": salvar vazio por engano deixaria
  // o portal mudo sem ninguem perceber. Recusar obriga a decisao explicita.
  const r = validarRegras({ ...base, faixas: [] });
  assert.equal(r.ok, false);
});

test('a primeira faixa precisa comecar em 1', () => {
  const r = validarRegras({ ...base, faixas: [{ de: 2, ate: 6, descontoPct: 0 }] });
  assert.equal(r.ok, false);
  assert.match(r.ok === false ? r.motivo : '', /primeira faixa/i);
});

test('faixa com de maior que ate e recusada', () => {
  const r = validarRegras({ ...base, faixas: [{ de: 1, ate: 0, descontoPct: 0 }] });
  assert.equal(r.ok, false);
});

test('faixas sobrepostas sao recusadas', () => {
  // 1..3 e 3..6 deixariam 3x com dois descontos possiveis.
  const r = validarRegras({
    ...base,
    faixas: [
      { de: 1, ate: 3, descontoPct: 20 },
      { de: 3, ate: 6, descontoPct: 10 },
    ],
  });
  assert.equal(r.ok, false);
  assert.match(r.ok === false ? r.motivo : '', /sobrep/i);
});

test('buraco entre faixas e recusado', () => {
  // 1..2 e 5..6 deixaria 3x e 4x sem regra: o portal simplesmente nao as
  // ofereceria, e ninguem entenderia por que.
  const r = validarRegras({
    ...base,
    faixas: [
      { de: 1, ate: 2, descontoPct: 20 },
      { de: 5, ate: 6, descontoPct: 0 },
    ],
  });
  assert.equal(r.ok, false);
  assert.match(r.ok === false ? r.motivo : '', /sequ|buraco|continu/i);
});

test('desconto acima do teto e recusado', () => {
  const r = validarRegras({
    ...base,
    descontoTetoPct: 10,
    faixas: [{ de: 1, ate: 6, descontoPct: 20 }],
  });
  assert.equal(r.ok, false);
  assert.match(r.ok === false ? r.motivo : '', /teto/i);
});

test('desconto negativo ou acima de 100 e recusado', () => {
  assert.equal(validarRegras({ ...base, faixas: [{ de: 1, ate: 1, descontoPct: -1 }] }).ok, false);
  assert.equal(
    validarRegras({ ...base, descontoTetoPct: 100, faixas: [{ de: 1, ate: 1, descontoPct: 101 }] }).ok,
    false,
  );
});

test('teto fora de 0 a 100 e recusado', () => {
  assert.equal(validarRegras({ ...base, descontoTetoPct: 101 }).ok, false);
  assert.equal(validarRegras({ ...base, descontoTetoPct: -1 }).ok, false);
});

test('parcela minima precisa ser positiva e inteira', () => {
  assert.equal(validarRegras({ ...base, parcelaMinimaCentavos: 0 }).ok, false);
  assert.equal(validarRegras({ ...base, parcelaMinimaCentavos: -100 }).ok, false);
  assert.equal(validarRegras({ ...base, parcelaMinimaCentavos: 10.5 }).ok, false);
});

test('parcelas nao inteiras sao recusadas', () => {
  assert.equal(validarRegras({ ...base, faixas: [{ de: 1, ate: 2.5, descontoPct: 0 }] }).ok, false);
});

test('passar do maximo de parcelas e recusado', () => {
  const r = validarRegras({
    ...base,
    faixas: [{ de: 1, ate: PARCELAS_MAXIMO + 1, descontoPct: 0 }],
  });
  assert.equal(r.ok, false);
});

test('comissao fora de 0 a 100 e recusada', () => {
  assert.equal(validarRegras({ ...base, comissaoSobreRecuperadoPct: 120 }).ok, false);
});

test('uma faixa unica cobrindo tudo passa', () => {
  // E o formato para o qual os credores da Fase 3 sao migrados.
  assert.deepEqual(
    validarRegras({ ...base, descontoTetoPct: 0, faixas: [{ de: 1, ate: 1, descontoPct: 0 }] }),
    { ok: true },
  );
});
```

- [ ] **Step 2: Rodar e confirmar a falha**

```bash
cd backend && npm run teste
```

Esperado: `Cannot find module '../src/dominio/faixas.ts'`.

- [ ] **Step 3: Implementar**

`backend/src/dominio/faixas.ts`:

```ts
// Faixas de parcelamento por credor. Substituem o par
// (descontoMaximoPct, parcelamentoMaximo) da Fase 3, que descrevia um
// limite e nao uma oferta: com ele o portal so sabia dar o desconto maximo
// a vista e nada nas demais parcelas.
//
// A validacao vive aqui, pura e testada. O formulario do painel apenas
// espelha estas regras — a que vale e esta, no servidor.

export interface FaixaParcelamento {
  de: number;
  ate: number;
  descontoPct: number;
}

export interface RegrasCredor {
  faixas: FaixaParcelamento[];
  parcelaMinimaCentavos: number;
  descontoTetoPct: number;
  comissaoSobreRecuperadoPct: number;
}

export type Validacao = { ok: true } | { ok: false; motivo: string };

export const PARCELAS_MAXIMO = 60;

function percentualValido(v: number): boolean {
  return Number.isFinite(v) && v >= 0 && v <= 100;
}

export function validarRegras(r: RegrasCredor): Validacao {
  if (!percentualValido(r.descontoTetoPct)) {
    return { ok: false, motivo: 'o teto de desconto deve ficar entre 0 e 100' };
  }
  if (!percentualValido(r.comissaoSobreRecuperadoPct)) {
    return { ok: false, motivo: 'a comissao deve ficar entre 0 e 100' };
  }
  if (!Number.isInteger(r.parcelaMinimaCentavos) || r.parcelaMinimaCentavos <= 0) {
    return { ok: false, motivo: 'a parcela minima deve ser um valor positivo' };
  }

  const faixas = Array.isArray(r.faixas) ? r.faixas : [];
  if (faixas.length === 0) {
    // Salvar vazio por engano deixaria o portal mudo sem ninguem perceber.
    return { ok: false, motivo: 'configure ao menos uma faixa de parcelamento' };
  }

  // A cobertura precisa ser continua a partir de 1: sobreposicao daria dois
  // descontos possiveis para a mesma quantidade de parcelas, e buraco faria
  // uma quantidade sumir do portal sem explicacao nenhuma.
  let esperado = 1;
  for (const [i, f] of faixas.entries()) {
    if (!Number.isInteger(f.de) || !Number.isInteger(f.ate)) {
      return { ok: false, motivo: 'as quantidades de parcelas devem ser numeros inteiros' };
    }
    if (f.de > f.ate) {
      return { ok: false, motivo: `na faixa ${i + 1}, o inicio e maior que o fim` };
    }
    if (f.ate > PARCELAS_MAXIMO) {
      return { ok: false, motivo: `o maximo e ${PARCELAS_MAXIMO} parcelas` };
    }
    if (!percentualValido(f.descontoPct)) {
      return { ok: false, motivo: `na faixa ${i + 1}, o desconto deve ficar entre 0 e 100` };
    }
    if (f.descontoPct > r.descontoTetoPct) {
      return {
        ok: false,
        motivo: `na faixa ${i + 1}, o desconto de ${f.descontoPct}% passa do teto de ${r.descontoTetoPct}%`,
      };
    }
    if (f.de < esperado) {
      return {
        ok: false,
        motivo: i === 0 ? 'a primeira faixa precisa comecar em 1' : `a faixa ${i + 1} se sobrepoe a anterior`,
      };
    }
    if (f.de > esperado) {
      return {
        ok: false,
        motivo:
          i === 0
            ? 'a primeira faixa precisa comecar em 1'
            : `faltam faixas entre ${esperado} e ${f.de - 1} parcelas: a sequencia precisa ser continua`,
      };
    }
    esperado = f.ate + 1;
  }

  return { ok: true };
}
```

- [ ] **Step 4: Rodar os testes**

```bash
cd backend && npm run teste && npx tsc --noEmit
```

Esperado: os 14 novos passam. O `tsc` ainda acusa `credor.ts` e `credores.ts`
se você já tiver mexido neles — não mexa ainda; a Task 3 faz a troca.

- [ ] **Step 5: Commit**

```bash
git add backend/src/dominio/faixas.ts backend/testes/faixas.test.ts && git commit -m "Valida as faixas de parcelamento por credor" && git push
```

---

### Task 2: Geração de ofertas a partir das faixas

**Files:**
- Create: `backend/src/dominio/ofertas.ts`, `backend/testes/ofertas.test.ts`

**Interfaces:**
- Consumes: `RegrasCredor`, `FaixaParcelamento` de `./faixas.ts`.
- Produces:
  - `interface Oferta { indice: number; parcelas: number; valorParcelaCentavos: number; totalCentavos: number; descontoPct: number }`
  - `function gerarOfertas(saldoCentavos: number, regras: RegrasCredor): Oferta[]`

Repare que `tipo` **não** existe: "à vista" é simplesmente `parcelas === 1`.
Guardar um campo que se deduz de outro é criar duas fontes de verdade.

- [ ] **Step 1: Escrever o teste (vai falhar)**

`backend/testes/ofertas.test.ts`:

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { gerarOfertas } from '../src/dominio/ofertas.ts';

const regras = {
  faixas: [
    { de: 1, ate: 1, descontoPct: 20 },
    { de: 2, ate: 3, descontoPct: 10 },
    { de: 4, ate: 6, descontoPct: 0 },
  ],
  parcelaMinimaCentavos: 2000,
  descontoTetoPct: 20,
  comissaoSobreRecuperadoPct: 15,
};

test('gera uma oferta por quantidade de parcelas coberta', () => {
  const o = gerarOfertas(100000, regras);
  assert.deepEqual(o.map((x) => x.parcelas), [1, 2, 3, 4, 5, 6]);
});

test('cada faixa aplica o proprio desconto', () => {
  const o = gerarOfertas(100000, regras);
  assert.equal(o.find((x) => x.parcelas === 1)!.descontoPct, 20);
  assert.equal(o.find((x) => x.parcelas === 3)!.descontoPct, 10);
  assert.equal(o.find((x) => x.parcelas === 5)!.descontoPct, 0);
});

test('o desconto sai do total, nao da parcela', () => {
  const tresVezes = gerarOfertas(100000, regras).find((x) => x.parcelas === 3)!;
  assert.equal(tresVezes.totalCentavos, 90000);
  assert.equal(tresVezes.valorParcelaCentavos, 30000);
});

test('a vista e simplesmente uma parcela', () => {
  const aVista = gerarOfertas(100000, regras)[0];
  assert.equal(aVista.parcelas, 1);
  assert.equal(aVista.totalCentavos, 80000);
  assert.equal(aVista.valorParcelaCentavos, 80000);
});

test('parcela abaixo da minima nao e oferecida', () => {
  // Divida de R$ 60,00 com parcela minima de R$ 20,00: so ate 3x.
  const o = gerarOfertas(6000, regras);
  assert.deepEqual(o.map((x) => x.parcelas), [1, 2, 3]);
});

test('divida pequena demais ainda oferece a vista', () => {
  // R$ 15,00 com parcela minima de R$ 20,00. A vista sai R$ 12,00, abaixo
  // do minimo — mas recusar seria impedir a pessoa de quitar. A parcela
  // minima governa PARCELAMENTO, nao pagamento unico.
  const o = gerarOfertas(1500, regras);
  assert.deepEqual(o.map((x) => x.parcelas), [1]);
});

test('a soma das parcelas cobre o total, sem centavo faltando', () => {
  for (const o of gerarOfertas(100003, regras)) {
    assert.ok(o.valorParcelaCentavos * o.parcelas >= o.totalCentavos,
      `${o.parcelas}x nao cobre o total`);
    assert.ok(o.valorParcelaCentavos * o.parcelas - o.totalCentavos < o.parcelas,
      `${o.parcelas}x cobra mais que um centavo por parcela a mais`);
  }
});

test('indices sao sequenciais a partir de zero', () => {
  const o = gerarOfertas(100000, regras);
  assert.deepEqual(o.map((x) => x.indice), o.map((_, i) => i));
});

test('saldo zero ou negativo nao gera oferta', () => {
  assert.deepEqual(gerarOfertas(0, regras), []);
  assert.deepEqual(gerarOfertas(-100, regras), []);
});

test('configuracao invalida nao gera oferta nenhuma', () => {
  // O portal nunca inventa condicao. Sem faixa valida, nao ha o que oferecer.
  assert.deepEqual(gerarOfertas(100000, { ...regras, faixas: [] }), []);
  assert.deepEqual(
    gerarOfertas(100000, { ...regras, faixas: [{ de: 2, ate: 3, descontoPct: 0 }] }),
    [],
  );
});

test('desconto acima do teto nao gera oferta', () => {
  // Defesa em profundidade: se uma configuracao invalida chegar ao banco por
  // outro caminho, o portal nao a executa.
  assert.deepEqual(
    gerarOfertas(100000, {
      ...regras,
      descontoTetoPct: 5,
      faixas: [{ de: 1, ate: 1, descontoPct: 20 }],
    }),
    [],
  );
});
```

- [ ] **Step 2: Rodar e confirmar a falha**

```bash
cd backend && npm run teste
```

- [ ] **Step 3: Implementar**

`backend/src/dominio/ofertas.ts`:

```ts
import type { RegrasCredor } from './faixas.ts';
import { validarRegras } from './faixas.ts';

export interface Oferta {
  indice: number;
  parcelas: number;
  valorParcelaCentavos: number;
  totalCentavos: number;
  descontoPct: number;
}

// Calculo deterministico: mesma divida e mesma configuracao produzem sempre
// as mesmas opcoes. E isso que permite ao portal recalcular a lista para
// validar a escolha do devedor, em vez de confiar no que o navegador mandou
// — e que faz a previa do painel mostrar exatamente o que ele vera.
export function gerarOfertas(saldoCentavos: number, regras: RegrasCredor): Oferta[] {
  if (!Number.isFinite(saldoCentavos) || saldoCentavos <= 0) return [];

  // Configuracao invalida nao gera oferta. Defesa em profundidade: a mesma
  // checagem ja barra na gravacao, mas o portal nao depende disso.
  if (!validarRegras(regras).ok) return [];

  const ofertas: Array<Omit<Oferta, 'indice'>> = [];

  for (const faixa of regras.faixas) {
    for (let n = faixa.de; n <= faixa.ate; n += 1) {
      const total = Math.round(saldoCentavos * (1 - faixa.descontoPct / 100));
      // Arredonda para cima: a soma das parcelas nunca fica abaixo do total,
      // e a sobra de centavos favorece o devedor na ultima.
      const parcela = Math.ceil(total / n);

      // A parcela minima governa PARCELAMENTO. Recusar o pagamento unico por
      // ser pequeno impediria a pessoa de simplesmente quitar a divida.
      if (n > 1 && parcela < regras.parcelaMinimaCentavos) continue;

      ofertas.push({
        parcelas: n,
        valorParcelaCentavos: parcela,
        totalCentavos: total,
        descontoPct: faixa.descontoPct,
      });
    }
  }

  return ofertas.map((o, indice) => ({ indice, ...o }));
}
```

- [ ] **Step 4: Rodar os testes e commitar**

```bash
cd backend && npm run teste && npx tsc --noEmit
```

```bash
git add backend/src/dominio/ofertas.ts backend/testes/ofertas.test.ts && git commit -m "Gera ofertas percorrendo as faixas de parcelamento" && git push
```

---

### Task 3: Banco e repositório

**Files:**
- Create: `backend/migracoes/0007_faixas.sql`
- Modify: `backend/src/dominio/credor.ts`, `backend/src/db/credores.ts`

**Interfaces:**
- Consumes: `RegrasCredor`, `validarRegras` de `../dominio/faixas.ts`.
- Produces: `lerCredor` e `listarCredores` devolvem `regras` no formato novo; `salvarRegras(db, credorId, r: RegrasCredor)` grava faixas e escalares juntos.

- [ ] **Step 1: Escrever a migração**

`backend/migracoes/0007_faixas.sql`:

```sql
-- Faixas de parcelamento por credor. Uma linha por faixa, lidas em ordem.
CREATE TABLE IF NOT EXISTS faixas_parcelamento (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  credor_id TEXT NOT NULL REFERENCES credores (id),
  de INTEGER NOT NULL CHECK (de >= 1),
  ate INTEGER NOT NULL CHECK (ate >= de AND ate <= 60),
  desconto_pct REAL NOT NULL CHECK (desconto_pct >= 0 AND desconto_pct <= 100)
);

CREATE INDEX IF NOT EXISTS idx_faixas_credor ON faixas_parcelamento (credor_id, de);

-- Campos novos. O SQLite nao permite ADD COLUMN NOT NULL sem DEFAULT, e o
-- default aqui e tambem o valor de migracao desejado.
ALTER TABLE credores ADD COLUMN parcela_minima_centavos INTEGER NOT NULL DEFAULT 2000;
ALTER TABLE credores ADD COLUMN desconto_teto_pct REAL NOT NULL DEFAULT 0;

-- O teto de cada credor passa a ser o desconto maximo que ele ja tinha:
-- ninguem ganha nem perde permissao na migracao.
UPDATE credores SET desconto_teto_pct = desconto_maximo_pct;

-- Cada credor existente vira uma faixa unica, 1..parcelamento_maximo, com o
-- desconto que ele ja praticava. Para o credor-padrao (1x, 0%) nada muda.
INSERT INTO faixas_parcelamento (credor_id, de, ate, desconto_pct)
SELECT id, 1, parcelamento_maximo, desconto_maximo_pct FROM credores;

-- desconto_maximo_pct e parcelamento_maximo continuam na tabela, sem uso.
-- Removidos numa migracao futura, depois de confirmado em producao que nada
-- os le: DROP COLUMN no SQLite reescreve a tabela, e nao vale o risco agora.
```

- [ ] **Step 2: Trocar o módulo de regras**

`backend/src/dominio/credor.ts` mantém apenas `CredorId` e `comoCredorId`.
Remova de lá `RegrasCredor` e `validarRegras`, e faça o arquivo reexportar do
novo módulo para não quebrar quem importa:

```ts
// As regras comerciais mudaram de forma na configuracao de ofertas e
// mudaram de arquivo junto. Reexportadas aqui para que os importadores
// existentes continuem funcionando.
export type { FaixaParcelamento, RegrasCredor, Validacao } from './faixas.ts';
export { validarRegras, PARCELAS_MAXIMO } from './faixas.ts';
```

- [ ] **Step 3: Reescrever o repositório**

Em `backend/src/db/credores.ts`, `daLinha` passa a receber as faixas, e:

```ts
async function faixasDe(db: D1Database, credorId: string): Promise<FaixaParcelamento[]> {
  const { results } = await db
    .prepare('SELECT de, ate, desconto_pct FROM faixas_parcelamento WHERE credor_id = ? ORDER BY de')
    .bind(credorId)
    .all<{ de: number; ate: number; desconto_pct: number }>();
  return results.map((f) => ({
    de: Number(f.de),
    ate: Number(f.ate),
    descontoPct: Number(f.desconto_pct),
  }));
}
```

`lerCredor` e `listarCredores` montam `regras` com `faixas`,
`parcelaMinimaCentavos`, `descontoTetoPct` e `comissaoSobreRecuperadoPct`.

`salvarRegras` troca as faixas inteiras, em vez de tentar casar linha a linha:

```ts
export async function salvarRegras(
  db: D1Database,
  credorId: CredorId,
  r: RegrasCredor,
): Promise<void> {
  // Apagar e reinserir, e nao atualizar linha a linha: a lista pode ter
  // ganhado ou perdido faixas, e casar posicoes seria inventar identidade
  // para algo que nao tem. Em lote, para que nao exista instante com o
  // credor sem faixa nenhuma.
  const comandos = [
    db.prepare('DELETE FROM faixas_parcelamento WHERE credor_id = ?').bind(credorId),
    db
      .prepare(
        `UPDATE credores
         SET parcela_minima_centavos = ?, desconto_teto_pct = ?, comissao_sobre_recuperado_pct = ?
         WHERE id = ?`,
      )
      .bind(r.parcelaMinimaCentavos, r.descontoTetoPct, r.comissaoSobreRecuperadoPct, credorId),
    ...r.faixas.map((f) =>
      db
        .prepare(
          'INSERT INTO faixas_parcelamento (credor_id, de, ate, desconto_pct) VALUES (?, ?, ?, ?)',
        )
        .bind(credorId, f.de, f.ate, f.descontoPct),
    ),
  ];

  await db.batch(comandos);
}
```

- [ ] **Step 4: Aplicar a migração e conferir**

```bash
cd backend && npm run migrar && npx wrangler d1 execute cobranca --local --json --command "SELECT c.id, c.desconto_teto_pct, c.parcela_minima_centavos, f.de, f.ate, f.desconto_pct FROM credores c LEFT JOIN faixas_parcelamento f ON f.credor_id = c.id"
```

Esperado: `credor-padrao` com uma faixa `1..1`, desconto 0, teto 0, parcela
mínima 2000.

- [ ] **Step 5: Rodar tudo e commitar**

```bash
cd backend && npm run teste && npx tsc --noEmit
```

O teste-guarda vigia consultas a tabelas de carteira. `faixas_parcelamento`
é configuração do credor, não carteira, e todas as consultas acima já
filtram por `credor_id` — não deve ser preciso mexer nele.

```bash
git add backend/migracoes/0007_faixas.sql backend/src/dominio/credor.ts backend/src/db/credores.ts && git commit -m "Guarda as faixas de parcelamento e migra os credores existentes" && git push
```

---

### Task 4: API — regras no formato novo e prévia

**Files:**
- Modify: `backend/src/api/painel.ts`

**Interfaces:**
- Produces: `GET /api/regras?credor=` devolve `regras` com faixas; `POST /api/regras?credor=` aceita o formato novo; `POST /api/previa-ofertas?credor=` calcula sem gravar.

- [ ] **Step 1: Aceitar o formato novo em POST /api/regras**

Substitua a montagem de `regras` na rota `POST /api/regras`:

```ts
    const corpo = (await requisicao.json()) as Record<string, unknown>;
    const regras = {
      faixas: Array.isArray(corpo.faixas)
        ? (corpo.faixas as unknown[]).map((f) => {
            const bruto = f as Record<string, unknown>;
            return {
              de: Number(bruto.de),
              ate: Number(bruto.ate),
              descontoPct: Number(bruto.descontoPct),
            };
          })
        : [],
      parcelaMinimaCentavos: Number(corpo.parcelaMinimaCentavos),
      descontoTetoPct: Number(corpo.descontoTetoPct),
      comissaoSobreRecuperadoPct: Number(corpo.comissaoSobreRecuperadoPct),
    };

    const v = validarRegras(regras);
    if (!v.ok) return new Response(v.motivo, { status: 400 });
```

O resto da rota (403 para credor logado, 404 para credor inexistente,
`salvarRegras`) fica como está.

- [ ] **Step 2: Acrescentar a prévia**

Na seção com escopo resolvido:

```ts
  if (url.pathname === '/api/previa-ofertas' && metodo === 'POST') {
    // Calcula e NAO grava. Existe para que a previa do painel use exatamente
    // a mesma funcao que o portal — reimplementar o calculo no navegador
    // criaria duas fontes de verdade, e a previa mostraria uma coisa
    // enquanto o portal faria outra.
    const corpo = (await requisicao.json()) as Record<string, unknown>;
    const saldo = Number(corpo.saldoCentavos);
    if (!Number.isFinite(saldo) || saldo <= 0) {
      return new Response('Informe um valor de exemplo maior que zero', { status: 400 });
    }

    const regras = {
      faixas: Array.isArray(corpo.faixas)
        ? (corpo.faixas as unknown[]).map((f) => {
            const bruto = f as Record<string, unknown>;
            return {
              de: Number(bruto.de),
              ate: Number(bruto.ate),
              descontoPct: Number(bruto.descontoPct),
            };
          })
        : [],
      parcelaMinimaCentavos: Number(corpo.parcelaMinimaCentavos),
      descontoTetoPct: Number(corpo.descontoTetoPct),
      comissaoSobreRecuperadoPct: Number(corpo.comissaoSobreRecuperadoPct),
    };

    const v = validarRegras(regras);
    if (!v.ok) return Response.json({ ok: false, motivo: v.motivo, ofertas: [] });

    return Response.json({ ok: true, motivo: '', ofertas: gerarOfertas(saldo, regras) });
  }
```

A prévia devolve **200 com `ok: false`** para configuração inválida, e não
400: enquanto a pessoa digita, a configuração passa por estados inválidos o
tempo todo, e tratar isso como erro de requisição encheria o console de
falhas que não são falhas.

- [ ] **Step 3: Valor de exemplo sugerido**

Em `GET /api/regras`, devolva também a média das dívidas em aberto, para a
prévia começar num caso real:

```ts
    const media = await db
      .prepare(
        `SELECT CAST(AVG(valor_centavos) AS INTEGER) AS media FROM dividas
         WHERE credor_id = ? AND situacao = 'aberta'`,
      )
      .bind(credorId)
      .first<{ media: number | null }>();

    return Response.json({ ...credor, exemploCentavos: media?.media ?? 100000 });
```

Carteira vazia cai em R$ 1.000,00 — número redondo, fácil de conferir de
cabeça.

- [ ] **Step 4: Verificar localmente**

Com `npm run dev` e a senha do `.dev.vars`:

```bash
curl -s -u ":SENHA" -X POST -H 'content-type: application/json' -d '{"saldoCentavos":100000,"faixas":[{"de":1,"ate":1,"descontoPct":20},{"de":2,"ate":3,"descontoPct":10}],"parcelaMinimaCentavos":2000,"descontoTetoPct":20,"comissaoSobreRecuperadoPct":15}' "http://127.0.0.1:8787/api/previa-ofertas?credor=credor-padrao"
```

Esperado: três ofertas — 1x de R$ 800, 2x de R$ 450, 3x de R$ 300.

```bash
curl -s -u ":SENHA" -X POST -H 'content-type: application/json' -d '{"saldoCentavos":100000,"faixas":[{"de":2,"ate":3,"descontoPct":10}],"parcelaMinimaCentavos":2000,"descontoTetoPct":20,"comissaoSobreRecuperadoPct":15}' "http://127.0.0.1:8787/api/previa-ofertas?credor=credor-padrao"
```

Esperado: `ok: false`, motivo sobre a primeira faixa, lista vazia.

- [ ] **Step 5: Commit**

```bash
git add backend/src/api/painel.ts && git commit -m "Aceita faixas na API e acrescenta a previa de ofertas" && git push
```

---

### Task 5: A tela

**Files:**
- Modify: `index.html`, `estilos.css`, `app.js`, `dados-remotos.js`

**Interfaces:**
- Consumes: `GET /api/regras?credor=`, `POST /api/regras?credor=`, `POST /api/previa-ofertas?credor=`.
- Produces: `previaDeOfertas(regras, saldoCentavos)` em `dados-remotos.js`.

- [ ] **Step 1: Chamada da prévia**

Em `dados-remotos.js`:

```js
export async function previaDeOfertas(regras, saldoCentavos) {
  return chamar(comCredor('/api/previa-ofertas'), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ...regras, saldoCentavos }),
  });
}
```

- [ ] **Step 2: A marcação**

Substitua o conteúdo de `#secao-regras` em `index.html`:

```html
          <div class="regras-colunas">
            <form id="forma-regras" class="forma-regras">
              <table class="tabela tabela-faixas">
                <caption class="oculto-visualmente">Faixas de parcelamento</caption>
                <thead>
                  <tr>
                    <th scope="col">De</th>
                    <th scope="col">Até</th>
                    <th scope="col">Desconto (%)</th>
                    <th scope="col"><span class="oculto-visualmente">Remover</span></th>
                  </tr>
                </thead>
                <tbody id="corpo-faixas"></tbody>
              </table>

              <button type="button" id="acrescentar-faixa" class="botao-discreto">
                Acrescentar faixa
              </button>

              <label class="campo-regra">
                <span>Parcela mínima (R$)</span>
                <input id="regra-parcela-minima" class="entrada" type="number" min="1" step="1" required />
              </label>

              <label class="campo-regra">
                <span>Teto de desconto da assessoria (%)</span>
                <input id="regra-teto" class="entrada" type="number" min="0" max="100" step="0.5" required />
              </label>

              <label class="campo-regra">
                <span>Comissão sobre o valor recuperado (%)</span>
                <input id="regra-comissao" class="entrada" type="number" min="0" max="100" step="0.5" required />
              </label>

              <div class="acoes-regras">
                <button type="submit" class="botao-discreto">Salvar regras</button>
                <span id="aviso-regras" class="aviso-regras" role="status"></span>
              </div>
            </form>

            <aside class="previa" aria-labelledby="titulo-previa">
              <h3 id="titulo-previa">Prévia</h3>
              <label class="campo-regra">
                <span>Dívida de exemplo (R$)</span>
                <input id="previa-valor" class="entrada" type="number" min="1" step="1" />
              </label>
              <p class="ajuda-previa">É exatamente isto que o devedor veria.</p>
              <ul id="previa-ofertas" class="previa-lista"></ul>
              <p id="previa-erro" class="aviso-regras" data-estado="erro" hidden></p>
            </aside>
          </div>
```

O aviso obrigatório sobre a IA (`.aviso-bloqueio`) permanece onde está, ao
final da seção. Ele continua valendo: desconto configurado aqui não autoriza
a IA a oferecê-lo nas conversas.

- [ ] **Step 3: Estilo**

Em `estilos.css`, junto do bloco de regras:

```css
.regras-colunas { display: grid; grid-template-columns: minmax(0, 1.4fr) minmax(240px, 1fr); gap: var(--gap); }
.tabela-faixas { margin-top: 4px; }
.tabela-faixas .entrada { min-height: 34px; padding: 0 8px; }
.tabela-faixas td { padding: 6px 6px; }
.previa { padding: 16px; border-radius: var(--raio-medio); background: var(--azul-050); }
.previa h3 { margin: 0 0 10px; font-size: 0.95rem; }
.ajuda-previa { margin: 0 0 10px; color: var(--texto-medio); font-size: 0.8rem; }
.previa-lista { list-style: none; margin: 0; padding: 0; display: grid; gap: 8px; }
.previa-item { padding: 10px 12px; border-radius: var(--raio-medio); background: var(--superficie); }
.previa-parcelas { font-weight: 650; }
.previa-total { display: block; margin-top: 2px; color: var(--texto-medio); font-size: 0.82rem; }

@media (max-width: 900px) {
  .regras-colunas { grid-template-columns: minmax(0, 1fr); }
}
```

Antes de colar, confira no bloco `:root` que `--azul-050` existe. Token
inexistente não dá erro: a cor simplesmente não se aplica, em silêncio.

- [ ] **Step 4: O comportamento**

Em `app.js`, substitua `montarRegras()`:

```js
let faixasEmEdicao = [];
let regrasSalvas = null;

function lerRegrasDaTela() {
  return {
    faixas: faixasEmEdicao.map((f) => ({
      de: Number(f.de),
      ate: Number(f.ate),
      descontoPct: Number(f.descontoPct),
    })),
    parcelaMinimaCentavos: Math.round(Number(elemento('regra-parcela-minima').value) * 100),
    descontoTetoPct: Number(elemento('regra-teto').value),
    comissaoSobreRecuperadoPct: Number(elemento('regra-comissao').value),
  };
}

function linhaDeFaixa(faixa, indice) {
  const tr = document.createElement('tr');

  for (const campo of ['de', 'ate', 'descontoPct']) {
    const td = document.createElement('td');
    const input = document.createElement('input');
    input.className = 'entrada';
    input.type = 'number';
    input.min = campo === 'descontoPct' ? '0' : '1';
    input.step = campo === 'descontoPct' ? '0.5' : '1';
    input.value = faixa[campo];
    input.setAttribute('aria-label', `${campo} da faixa ${indice + 1}`);
    input.addEventListener('input', () => {
      faixasEmEdicao[indice][campo] = input.value;
      agendarPrevia();
    });
    td.append(input);
    tr.append(td);
  }

  const tdRemover = document.createElement('td');
  const remover = document.createElement('button');
  remover.type = 'button';
  remover.className = 'botao-linha';
  remover.textContent = 'Remover';
  remover.setAttribute('aria-label', `Remover a faixa ${indice + 1}`);
  remover.addEventListener('click', () => {
    faixasEmEdicao.splice(indice, 1);
    renderizarFaixas();
    agendarPrevia();
  });
  tdRemover.append(remover);
  tr.append(tdRemover);

  return tr;
}

function renderizarFaixas() {
  elemento('corpo-faixas').replaceChildren(...faixasEmEdicao.map(linhaDeFaixa));
}

// Espera curta para nao chamar o servidor a cada tecla.
let temporizadorPrevia = null;
function agendarPrevia() {
  clearTimeout(temporizadorPrevia);
  temporizadorPrevia = setTimeout(atualizarPrevia, 350);
}

async function atualizarPrevia() {
  const saldo = Math.round(Number(elemento('previa-valor').value) * 100);
  const lista = elemento('previa-ofertas');
  const erro = elemento('previa-erro');

  if (!Number.isFinite(saldo) || saldo <= 0) {
    lista.replaceChildren();
    erro.textContent = 'Informe um valor de exemplo.';
    erro.hidden = false;
    return;
  }

  let resposta;
  try {
    resposta = await previaDeOfertas(lerRegrasDaTela(), saldo);
  } catch (e) {
    lista.replaceChildren();
    erro.textContent = `Não foi possível calcular a prévia: ${e.message}`;
    erro.hidden = false;
    return;
  }

  erro.hidden = resposta.ok;
  if (!resposta.ok) {
    erro.textContent = resposta.motivo;
    lista.replaceChildren();
    return;
  }

  lista.replaceChildren(
    ...resposta.ofertas.map((o) => {
      const li = document.createElement('li');
      li.className = 'previa-item';

      const titulo = document.createElement('span');
      titulo.className = 'previa-parcelas';
      titulo.textContent =
        o.parcelas === 1
          ? `À vista ${formatarMoeda(o.totalCentavos)}`
          : `${o.parcelas}x de ${formatarMoeda(o.valorParcelaCentavos)}`;

      const total = document.createElement('span');
      total.className = 'previa-total';
      total.textContent =
        o.descontoPct > 0
          ? `Total ${formatarMoeda(o.totalCentavos)} — ${o.descontoPct}% de desconto`
          : `Total ${formatarMoeda(o.totalCentavos)}`;

      li.append(titulo, total);
      return li;
    }),
  );
}

// Mudanca grande pede confirmacao: pega o 90 digitado no lugar do 9.
const SALTO_QUE_PEDE_CONFIRMACAO = 10;

function saltoDeDesconto(antes, depois) {
  let maior = 0;
  for (const nova of depois.faixas) {
    const equivalente = antes.faixas.find((f) => f.de === nova.de && f.ate === nova.ate);
    const anterior = equivalente ? equivalente.descontoPct : 0;
    maior = Math.max(maior, nova.descontoPct - anterior);
  }
  return maior;
}

async function montarRegras() {
  const secao = elemento('secao-regras');
  let credor;
  try {
    credor = await carregarRegras();
  } catch {
    // 403 = sessao de credor, que nao edita as proprias regras.
    secao.hidden = true;
    return;
  }

  regrasSalvas = credor.regras;
  faixasEmEdicao = credor.regras.faixas.map((f) => ({ ...f }));
  renderizarFaixas();

  elemento('regra-parcela-minima').value = credor.regras.parcelaMinimaCentavos / 100;
  elemento('regra-teto').value = credor.regras.descontoTetoPct;
  elemento('regra-comissao').value = credor.regras.comissaoSobreRecuperadoPct;
  elemento('previa-valor').value = (credor.exemploCentavos ?? 100000) / 100;
  secao.hidden = false;

  for (const id of ['regra-parcela-minima', 'regra-teto', 'regra-comissao', 'previa-valor']) {
    elemento(id).addEventListener('input', agendarPrevia);
  }

  elemento('acrescentar-faixa').addEventListener('click', () => {
    const ultima = faixasEmEdicao[faixasEmEdicao.length - 1];
    const inicio = ultima ? Number(ultima.ate) + 1 : 1;
    faixasEmEdicao.push({ de: inicio, ate: inicio, descontoPct: 0 });
    renderizarFaixas();
    agendarPrevia();
  });

  elemento('forma-regras').addEventListener('submit', async (evento) => {
    evento.preventDefault();
    const aviso = elemento('aviso-regras');
    const novas = lerRegrasDaTela();

    const salto = saltoDeDesconto(regrasSalvas, novas);
    if (salto > SALTO_QUE_PEDE_CONFIRMACAO) {
      const ok = confirm(
        `Uma faixa sobe ${salto} pontos de desconto de uma vez.\n\n` +
          `Antes: ${regrasSalvas.faixas.map((f) => `${f.de}-${f.ate}x ${f.descontoPct}%`).join(', ')}\n` +
          `Depois: ${novas.faixas.map((f) => `${f.de}-${f.ate}x ${f.descontoPct}%`).join(', ')}\n\n` +
          'Confirma?',
      );
      if (!ok) return;
    }

    aviso.textContent = 'Salvando…';
    aviso.removeAttribute('data-estado');

    try {
      await salvarRegras(novas);
      regrasSalvas = novas;
      aviso.textContent = 'Regras salvas.';
    } catch (erro) {
      aviso.textContent = `Não foi possível salvar: ${erro.message}`;
      aviso.dataset.estado = 'erro';
    }
  });

  await atualizarPrevia();
}
```

Importe `previaDeOfertas` junto das outras funções de `dados-remotos.js`.

- [ ] **Step 5: Verificar na tela**

`cd backend && npm run dev`, painel em `http://127.0.0.1:8787/`. A senha está
em `backend/.dev.vars`; não a imprima. O navegador não passa pelo prompt de
Basic auth — use o proxy em
`…/scratchpad/proxy.mjs` e acesse `http://127.0.0.1:8799/?credor=credor-padrao`.

Confirme, olhando a tela:

1. A tabela mostra a faixa migrada, `1..1` com 0%.
2. "Acrescentar faixa" cria a linha seguinte já começando onde a anterior terminou.
3. Digitar 20% na primeira faixa com teto 0 mostra o motivo do teto na prévia, sem ofertas.
4. Subindo o teto para 20, a prévia passa a mostrar "À vista R$ 800,00" para o exemplo de R$ 1.000,00.
5. Acrescentando a faixa 2-3x com 10%, aparecem 2x de R$ 450 e 3x de R$ 300.
6. Pondo parcela mínima de R$ 400, a opção de 3x some da prévia.
7. Salvar com o desconto subindo de 0 para 20 pede confirmação; recusar não salva.
8. Recarregar traz tudo de volta como salvo.
9. Nenhum erro no console.

- [ ] **Step 6: Commit**

```bash
cd backend && node scripts/gerar-painel.mjs
```

```bash
git add index.html estilos.css app.js dados-remotos.js backend/src/painel/arquivos.ts && git commit -m "Poe a tela de faixas de parcelamento com previa ao vivo" && git push
```

---

### Task 6: Deduplicar a importação por CPF

**Files:**
- Modify: `backend/src/cobmais/importar.ts`, `backend/testes/importar.test.ts`

**Interfaces:** nenhuma mudança de assinatura.

- [ ] **Step 1: Escrever o teste (vai falhar)**

Acrescente a `backend/testes/importar.test.ts`:

```ts
test('duas linhas com o mesmo CPF descrevem a mesma pessoa', () => {
  // Mesma pessoa recadastrada com telefone novo. Antes desta mudanca a
  // segunda linha violava o indice unico de documento e abortava a
  // importacao no meio, com parte da carteira ja gravada.
  const csv = [
    'nome;telefone;valor;vencimento;cpf',
    'Ana Ficticia;5535900000001;10,00;10/09/2026;52998224725',
    'Ana Ficticia;5535900000002;20,00;11/09/2026;52998224725',
  ].join('\n');

  const linhas = interpretarCsv(csv);
  assert.equal(linhas.length, 2);
  assert.equal(linhas[0].cpf, linhas[1].cpf);
});
```

A deduplicação em si acontece em `importarParaCarteira`, que fala com o D1 e
não tem teste unitário no repositório — a verificação dela é o Step 4.

- [ ] **Step 2: Implementar**

Em `importarParaCarteira`, antes da busca por telefone:

```ts
    // Mesmo CPF na mesma carteira e a mesma pessoa. Procurar por documento
    // ANTES do telefone evita violar o indice unico (credor_id, documento) e,
    // melhor que isso, trata telefone novo como o que ele e: mais um contato
    // da mesma pessoa, que a descoberta de WhatsApp da Fase 4 vai testar.
    const porDocumento = cliente.cpf
      ? await db
          .prepare('SELECT id FROM devedores WHERE credor_id = ? AND documento = ?')
          .bind(credorId, cliente.cpf)
          .first<{ id: string }>()
      : null;

    const existente =
      porDocumento ??
      (await db
        .prepare('SELECT id FROM devedores WHERE credor_id = ? AND telefone = ?')
        .bind(credorId, cliente.telefone)
        .first<{ id: string }>());
```

O resto do laço continua igual: `cadastrarTelefones` já usa
`INSERT OR IGNORE` com índice único em `(devedor_id, numero)`, então o
telefone novo entra e o repetido não duplica.

- [ ] **Step 3: Rodar os testes**

```bash
cd backend && npm run teste && npx tsc --noEmit
```

- [ ] **Step 4: Verificar contra o banco local**

Com `npm run dev` e a senha do `.dev.vars`, crie o CSV **fora do
repositório**, no diretório temporário:

```bash
printf 'nome;telefone;valor;vencimento;cpf\nAna Ficticia;5535900000001;10,00;10/09/2026;52998224725\nAna Ficticia;5535900000002;20,00;11/09/2026;52998224725\n' > "$TEMP/dedupe.csv"
```

```bash
curl -s -u ":SENHA" -X POST --data-binary "@$TEMP/dedupe.csv" "http://127.0.0.1:8787/api/importar?credor=credor-padrao"
```

Esperado: `{"criados":1,"atualizados":1,"descartados":0}` — **um** devedor, e
a importação **não aborta**.

```bash
cd backend && npx wrangler d1 execute cobranca --local --json --command "SELECT d.nome, count(t.id) AS telefones FROM devedores d LEFT JOIN telefones t ON t.devedor_id = d.id WHERE d.documento = '52998224725' GROUP BY d.id"
```

Esperado: uma linha, com **2 telefones**.

- [ ] **Step 5: Commit**

```bash
git add backend/src/cobmais/importar.ts backend/testes/importar.test.ts && git commit -m "Deduplica a importacao por CPF e acumula os telefones da mesma pessoa" && git push
```

---

### Task 7: Migrar produção e publicar

**Files:** nenhum.

- [ ] **Step 1: Conferir as travas no remoto**

```bash
cd backend && npx wrangler d1 execute cobranca --remote --json --command "SELECT (SELECT pausado FROM pausa_global WHERE id=1) AS pausado"
```

Esperado: `1`. **Se vier 0, pare e avise o usuário.**

- [ ] **Step 2: Contagens antes**

```bash
cd backend && npx wrangler d1 execute cobranca --remote --json --command "SELECT (SELECT count(*) FROM conversas) AS conversas, (SELECT count(*) FROM auditoria) AS auditoria, (SELECT count(*) FROM credores) AS credores, (SELECT count(*) FROM devedores) AS devedores"
```

Anote. Precisam bater depois.

- [ ] **Step 3: Migrar e conferir a conversão**

```bash
cd backend && npm run migrar:remoto && npx wrangler d1 execute cobranca --remote --json --command "SELECT c.id, c.desconto_teto_pct, f.de, f.ate, f.desconto_pct FROM credores c LEFT JOIN faixas_parcelamento f ON f.credor_id = c.id"
```

Esperado: cada credor com **ao menos uma faixa**. Credor sem faixa nenhuma
significa que o `INSERT ... SELECT` da migração não rodou — nesse caso o
portal não ofereceria nada a ninguém daquela carteira. Pare e investigue.

- [ ] **Step 4: Varredura de segredos, da raiz**

```bash
cd "C:/Users/thesc/OneDrive/Documentos/GitHub/Plataforma Cobrança" && pwd && git grep -nE "EAA[A-Za-z0-9]{20,}|sk-ant-[A-Za-z0-9]{10,}" -- . ; git ls-files | grep -E "^\.env$|\.dev\.vars" ; echo "fim"
```

Nada antes de "fim".

- [ ] **Step 5: Publicar e verificar**

```bash
cd backend && npm run deploy
```

```bash
B=https://cobranca-backend.juridicoagio01.workers.dev; curl -s -o /dev/null -w "regras:%{http_code}\n" $B/api/regras; curl -s -o /dev/null -w "previa:%{http_code}\n" -X POST $B/api/previa-ofertas
```

Esperado: **401** nas duas. A prévia calcula dinheiro e não pode responder
sem credencial.

Peça ao usuário para abrir o painel e conferir a tela — o caminho
autenticado em produção só ele consegue exercer, porque tem o `PAINEL_TOKEN`.

- [ ] **Step 6: Registrar na memória**

Anote em `~/.claude/projects/.../memory/plataforma-cobranca-fases.md`: as
regras comerciais passaram de três números para faixas de parcelamento por
credor, editáveis no painel com prévia ao vivo; `gerarOfertas` e
`validarFaixas` são as duas fontes de verdade, usadas pela prévia e pelo
portal.

---

## Self-review

**Cobertura da spec:**

| Requisito da spec | Tarefa |
|---|---|
| Faixas de parcelamento com desconto próprio | Tasks 1, 3 |
| Sem entrada | fora de escopo, registrado |
| Parcela mínima por credor | Tasks 1, 2, 5 |
| `parcelamentoMaximo` deixa de existir | Task 3 |
| Prévia calculada | Tasks 4, 5 |
| Teto da assessoria | Tasks 1, 4, 5 |
| Confirmação de mudança grande | Task 5 |
| Prévia calculada no servidor | Task 4 |
| Deduplicação por CPF | Task 6 |
| Validação no servidor, formulário só espelha | Tasks 1, 4 |
| Migração dos credores existentes | Task 3 |
| Mesma função serve prévia e portal | Tasks 2, 4 |

**Dependência para a Fase 5:** as Tasks 3 a 11 do plano do portal consomem
`gerarOfertas(saldoCentavos, regras)` e `Oferta` **como definidos aqui** —
sem o campo `tipo`. Onde o plano da Fase 5 escreve `oferta.tipo === 'a_vista'`,
leia `oferta.parcelas === 1`. Isso aparece na Task 6 (gravação do acordo, que
tem coluna `tipo` no banco: derive de `parcelas === 1 ? 'a_vista' : 'parcelado'`),
na Task 7 (texto do cartão de oferta) e na Task 9 (texto da confirmação).
