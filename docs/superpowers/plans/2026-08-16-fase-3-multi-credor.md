# Fase 3 — Multi-credor: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transformar a plataforma de "uma carteira" em "várias carteiras de credores diferentes", com separação real de dados, regras comerciais por credor e migração do que já existe para um credor padrão.

**Architecture:** Um novo par de tabelas (`credores`, `devedores`, `dividas`) passa a ser o cadastro de verdade — hoje ele não existe, o painel usa `dados-mock.js` e o CSV do Cobmais é interpretado mas nunca gravado. Todas as consultas por carteira passam a exigir um `CredorId` explícito, por um repositório único que não expõe função sem escopo, e um teste-guarda varre o código-fonte procurando SQL que toque tabela de carteira sem `credor_id`. As travas de segurança (pausa global e não-perturbe) permanecem **globais**, não por credor, pelo argumento registrado em "Decisões de projeto".

**Tech Stack:** Cloudflare Workers, D1 (SQLite), TypeScript com type-stripping nativo do Node 24 (`node --test "testes/*.test.ts"`), wrangler 3, painel em HTML/CSS/JS puro sem build.

**Spec:** este documento — seção "Decisões de projeto" abaixo. A Fase 3 não teve spec separada; o raciocínio de projeto viaja aqui.

---

## Global Constraints

Copiadas literalmente das regras que o usuário estabeleceu e que continuam valendo:

- **A pausa global fica LIGADA durante toda a Fase 3.** Nenhuma tarefa a desliga. Nenhuma tarefa dispara mensagem para número real.
- Nunca escrever chave de API, senha ou token direto em nenhum arquivo do projeto.
- Toda integração externa lê credencial de variável de ambiente, nunca de valor fixo.
- `.env` e `.dev.vars` no `.gitignore`, nunca rastreados.
- Ao final de cada tarefa: rodar os testes, rodar a varredura de segredos, commit e push automáticos.
- Nenhuma dependência nova de runtime. Nenhum CDN, nenhum passo de build no painel.
- Todo texto de código e comentário em português sem acento (padrão do repositório); texto de tela em português com acento.
- Modo de falha é sempre **bloquear**: escopo ausente devolve erro, nunca "todos".

---

## Decisões de projeto

Registradas aqui porque cada uma fecha uma alternativa que parece razoável à primeira vista.

**1. Não existe cadastro hoje.** `backend/src/cobmais/importar.ts` interpreta o CSV e devolve objetos em memória; nada é gravado. As únicas tabelas com dado real são `conversas`, `nao_perturbe`, `auditoria` e `pausa_global`, todas chaveadas por telefone. Portanto "migrar os dados que já existem" significa: criar o cadastro do zero e atribuir as conversas e a auditoria existentes ao credor padrão.

**2. Pausa global e não-perturbe continuam globais, não por credor.** Todos os credores são cobrados **pelo mesmo número de WhatsApp**. Um não-perturbe por credor permitiria que a mesma pessoa continuasse recebendo mensagem do mesmo número em nome de outro credor — que é exatamente o comportamento que derruba a nota de qualidade do número e desrespeita o pedido de quem disse "pare". A pessoa falou com *nós*, não com o credor. O mesmo vale para a pausa global: é o freio de mão da operação inteira.

**3. Separação de dados é imposta por tipo, não por disciplina.** `CredorId` é um tipo ramificado (branded); nenhuma função do repositório de carteira aceita `string` cru. Uma consulta que esqueça o `WHERE credor_id = ?` não compila por acidente — ela sequer chega a ser escrita, porque a única porta de entrada exige o parâmetro. O teste-guarda da Task 5 é a segunda linha de defesa, para SQL escrito fora do repositório.

**4. A porta para o login do credor fica aberta, mas fechada à chave.** A autenticação passa a devolver uma `Sessao` com `escopo`, que hoje só assume `{ tipo: 'operador' }`. O dia em que existir login de credor, basta a autenticação passar a devolver `{ tipo: 'credor', credorId }` — nenhum endpoint muda, porque todos já derivam o escopo da sessão. Não construímos login agora.

**5. Regras comerciais moram no credor, não no código.** Desconto máximo, parcelamento máximo e comissão são colunas de `credores`. A IA da Fase 2 hoje tem bloqueio duro contra qualquer menção a desconto; a Fase 3 **não** afrouxa esse bloqueio. As regras ficam gravadas e disponíveis para o painel e para o cálculo de comissão; autorizar a IA a negociar desconto é uma decisão separada, sua, numa fase futura.

**6. Migrações versionadas substituem o `esquema.sql` aplicado à mão.** Hoje o schema é aplicado manualmente e já houve um incidente por isso (o banco local ficou vazio porque o schema fora aplicado com o `database_id` errado). A partir daqui, `wrangler d1 migrations`. A migração `0001` é o schema atual inteiro, e como todo comando dela é `IF NOT EXISTS`, aplicá-la num banco que já existe é inofensiva.

---

## Estrutura de arquivos

**Criar:**

| Arquivo | Responsabilidade |
|---|---|
| `backend/migracoes/0001_esquema_inicial.sql` | Schema da Fase 2, idempotente |
| `backend/migracoes/0002_credores.sql` | Tabela `credores` + credor padrão |
| `backend/migracoes/0003_cadastro.sql` | `devedores` e `dividas` |
| `backend/migracoes/0004_escopo_nas_tabelas_existentes.sql` | `credor_id` em `conversas` e `auditoria` + backfill |
| `backend/src/dominio/credor.ts` | Tipo `CredorId`, validação das regras comerciais |
| `backend/src/db/credores.ts` | Leitura/escrita de credores |
| `backend/src/db/cadastro.ts` | Devedores e dívidas, sempre com escopo |
| `backend/src/api/sessao.ts` | `Sessao` e derivação de escopo a partir da requisição |
| `backend/testes/credor.test.ts` | Regras comerciais |
| `backend/testes/escopo-guarda.test.ts` | Teste-guarda anti-vazamento entre carteiras |
| `backend/testes/sessao.test.ts` | Derivação e recusa de escopo |
| `backend/testes/cadastro-sql.test.ts` | SQL do cadastro tem escopo em toda consulta |
| `credores.js` (raiz) | Estado do credor selecionado no painel |

**Modificar:**

| Arquivo | Mudança |
|---|---|
| `backend/wrangler.toml` | `migrations_dir` |
| `backend/package.json` | scripts `migrar` e `migrar:remoto` |
| `backend/src/db/repositorio.ts` | `credor_id` em conversas |
| `backend/src/api/painel.ts` | escopo obrigatório em todo endpoint; `/api/credores` |
| `backend/src/api/autenticacao.ts` | devolve `Sessao` em vez de booleano |
| `backend/src/index.ts` | roteamento usa a sessão |
| `backend/src/whatsapp/webhook.ts` | resolve o credor pelo telefone ao gravar |
| `backend/src/cobmais/importar.ts` | recebe `CredorId` e persiste |
| `backend/scripts/gerar-painel.mjs` | inclui `credores.js` |
| `index.html`, `estilos.css`, `app.js`, `dados-remotos.js` | seletor de credor |

**Não tocar:** `backend/src/dominio/portao.ts`, `janela.ts`, `travas.ts`, `seguranca/comparar.ts`, `whatsapp/assinatura.ts`, `ia/*`. As travas e o portão continuam como estão, de propósito.

---

### Task 1: Migrações versionadas e a tabela de credores

**Files:**
- Create: `backend/migracoes/0001_esquema_inicial.sql`
- Create: `backend/migracoes/0002_credores.sql`
- Create: `backend/src/dominio/credor.ts`
- Create: `backend/testes/credor.test.ts`
- Modify: `backend/wrangler.toml`, `backend/package.json`
- Delete: `backend/src/db/esquema.sql` (só depois da 0001 existir)

**Interfaces:**
- Consumes: nada.
- Produces: `type CredorId`, `function comoCredorId(bruto: string): CredorId | null`, `interface RegrasCredor { descontoMaximoPct: number; parcelamentoMaximo: number; comissaoSobreRecuperadoPct: number }`, `function validarRegras(r: RegrasCredor): { ok: true } | { ok: false; motivo: string }`.

- [x] **Step 1: Criar o diretório de migrações com o schema atual**

Copie o conteúdo integral de `backend/src/db/esquema.sql` para `backend/migracoes/0001_esquema_inicial.sql`, sem alterar uma linha. Todo comando lá já é `CREATE TABLE IF NOT EXISTS` / `INSERT OR IGNORE`, então aplicar num banco que já tem essas tabelas não faz nada — é isso que permite adotar migrações sem recriar o banco de produção.

- [x] **Step 2: Escrever a migração dos credores**

`backend/migracoes/0002_credores.sql`:

```sql
-- Um credor e uma empresa de formatura que nos entrega uma carteira.
-- As regras comerciais moram aqui porque variam de contrato para contrato.
--
-- A comissao incide sobre o VALOR RECUPERADO, nao sobre o valor da divida:
-- a assessoria so ganha quando recupera. O nome da coluna carrega isso
-- porque um dia alguem vai calcular comissao lendo so o schema. Nada
-- calcula comissao nesta fase — ainda nao existe registro de pagamento.
CREATE TABLE IF NOT EXISTS credores (
  id TEXT PRIMARY KEY,
  nome TEXT NOT NULL,
  documento TEXT,
  ativo INTEGER NOT NULL DEFAULT 1,
  desconto_maximo_pct REAL NOT NULL DEFAULT 0 CHECK (desconto_maximo_pct >= 0 AND desconto_maximo_pct <= 100),
  parcelamento_maximo INTEGER NOT NULL DEFAULT 1 CHECK (parcelamento_maximo >= 1 AND parcelamento_maximo <= 60),
  comissao_sobre_recuperado_pct REAL NOT NULL DEFAULT 0 CHECK (comissao_sobre_recuperado_pct >= 0 AND comissao_sobre_recuperado_pct <= 100),
  criado_em TEXT NOT NULL
);

-- Credor padrao: destino de tudo que existe hoje. Regras zeradas de
-- proposito — desconto so passa a existir quando alguem configurar.
INSERT OR IGNORE INTO credores
  (id, nome, documento, ativo, desconto_maximo_pct, parcelamento_maximo, comissao_sobre_recuperado_pct, criado_em)
VALUES
  ('credor-padrao', 'Carteira inicial', NULL, 1, 0, 1, 0, '2026-08-16T00:00:00.000Z');
```

- [x] **Step 3: Apontar o wrangler para o diretório**

Em `backend/wrangler.toml`, dentro do bloco `[[d1_databases]]`, acrescente a última linha:

```toml
[[d1_databases]]
binding = "DB"
database_name = "cobranca"
database_id = "02b87870-9e17-4c4f-b384-0e6bf335cba2"
migrations_dir = "migracoes"
```

Em `backend/package.json`, acrescente aos `scripts`:

```json
"migrar": "wrangler d1 migrations apply cobranca --local",
"migrar:remoto": "wrangler d1 migrations apply cobranca --remote"
```

- [x] **Step 4: Escrever o teste das regras comerciais (vai falhar)**

`backend/testes/credor.test.ts`:

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { comoCredorId, validarRegras } from '../src/dominio/credor.ts';

const validas = { descontoMaximoPct: 20, parcelamentoMaximo: 6, comissaoSobreRecuperadoPct: 15 };

test('regras dentro dos limites passam', () => {
  assert.deepEqual(validarRegras(validas), { ok: true });
});

test('desconto acima de 100 por cento e recusado', () => {
  const r = validarRegras({ ...validas, descontoMaximoPct: 101 });
  assert.equal(r.ok, false);
});

test('desconto negativo e recusado', () => {
  const r = validarRegras({ ...validas, descontoMaximoPct: -1 });
  assert.equal(r.ok, false);
});

test('parcelamento menor que uma parcela e recusado', () => {
  const r = validarRegras({ ...validas, parcelamentoMaximo: 0 });
  assert.equal(r.ok, false);
});

test('parcelamento nao inteiro e recusado', () => {
  const r = validarRegras({ ...validas, parcelamentoMaximo: 2.5 });
  assert.equal(r.ok, false);
});

test('comissao acima de 100 por cento e recusada', () => {
  const r = validarRegras({ ...validas, comissaoSobreRecuperadoPct: 120 });
  assert.equal(r.ok, false);
});

test('identificador de credor aceita minusculas com hifen', () => {
  assert.equal(comoCredorId('formatura-abc'), 'formatura-abc');
});

test('identificador com aspas ou espaco e recusado', () => {
  assert.equal(comoCredorId("a' OR 1=1"), null);
  assert.equal(comoCredorId('com espaco'), null);
  assert.equal(comoCredorId(''), null);
});
```

- [x] **Step 5: Rodar e confirmar a falha**

```bash
cd backend && npm run teste
```

Esperado: falha em `Cannot find module '../src/dominio/credor.ts'`.

- [x] **Step 6: Implementar**

`backend/src/dominio/credor.ts`:

```ts
// Identificador de credor. E um tipo ramificado: nenhuma string crua entra
// numa consulta de carteira por acidente, porque as funcoes do repositorio
// so aceitam CredorId — e a unica forma de obter um e passar por
// comoCredorId, que valida o formato.
declare const marcaCredor: unique symbol;
export type CredorId = string & { readonly [marcaCredor]: true };

const FORMATO = /^[a-z0-9][a-z0-9-]{1,48}[a-z0-9]$/;

export function comoCredorId(bruto: string): CredorId | null {
  const limpo = String(bruto ?? '').trim();
  return FORMATO.test(limpo) ? (limpo as CredorId) : null;
}

export interface RegrasCredor {
  descontoMaximoPct: number;
  parcelamentoMaximo: number;
  comissaoSobreRecuperadoPct: number;
}

export type Validacao = { ok: true } | { ok: false; motivo: string };

function percentualValido(valor: number): boolean {
  return Number.isFinite(valor) && valor >= 0 && valor <= 100;
}

// O CHECK do SQLite ja barra valor fora de faixa, mas errar aqui devolve
// 400 com explicacao em vez de 500 com erro de banco.
export function validarRegras(r: RegrasCredor): Validacao {
  if (!percentualValido(r.descontoMaximoPct)) {
    return { ok: false, motivo: 'desconto maximo deve ficar entre 0 e 100' };
  }
  if (!percentualValido(r.comissaoSobreRecuperadoPct)) {
    return { ok: false, motivo: 'comissao deve ficar entre 0 e 100' };
  }
  if (
    !Number.isInteger(r.parcelamentoMaximo) ||
    r.parcelamentoMaximo < 1 ||
    r.parcelamentoMaximo > 60
  ) {
    return { ok: false, motivo: 'parcelamento maximo deve ser inteiro entre 1 e 60' };
  }
  return { ok: true };
}
```

- [x] **Step 7: Rodar os testes**

```bash
cd backend && npm run teste
```

Esperado: os 8 testes novos passam, os 67 anteriores continuam passando.

- [x] **Step 8: Aplicar as migrações no banco local e conferir**

```bash
cd backend && npm run migrar
```

```bash
cd backend && npx wrangler d1 execute cobranca --local --command "SELECT id, nome, parcelamento_maximo FROM credores"
```

Esperado: uma linha, `credor-padrao | Carteira inicial | 1`.

- [x] **Step 9: Remover o schema antigo e commitar**

Apague `backend/src/db/esquema.sql` — ele agora é a migração `0001` e manter duas cópias garante que uma vai divergir. Confira antes que nenhum arquivo o importe:

```bash
cd backend && grep -rn "esquema.sql" src scripts package.json ../README.md
```

Se aparecer no README, atualize o comando para `npm run migrar`.

```bash
git add backend/migracoes backend/src/dominio/credor.ts backend/testes/credor.test.ts backend/wrangler.toml backend/package.json && git rm backend/src/db/esquema.sql && git commit -m "Adota migracoes versionadas e cria a tabela de credores" && git push
```

---

### Task 2: Cadastro de devedores e dívidas

**Files:**
- Create: `backend/migracoes/0003_cadastro.sql`
- Create: `backend/src/db/cadastro.ts`
- Create: `backend/testes/cadastro-sql.test.ts`

**Interfaces:**
- Consumes: `CredorId` de `../dominio/credor.ts`.
- Produces:
  - `interface Devedor { id: string; credorId: CredorId; nome: string; documento: string | null; telefone: string; criadoEm: string }`
  - `interface Divida { id: number; credorId: CredorId; devedorId: string; referencia: string; valorCentavos: number; vencimento: string; situacao: 'aberta' | 'negociada' | 'paga' | 'cancelada' }`
  - `async function inserirDevedor(db, credorId: CredorId, d: { nome; documento; telefone }): Promise<string>`
  - `async function listarDevedores(db, credorId: CredorId, limite?: number): Promise<Devedor[]>`
  - `async function inserirDivida(db, credorId: CredorId, devedorId: string, d: { referencia; valorCentavos; vencimento }): Promise<void>`
  - `async function listarDividas(db, credorId: CredorId, limite?: number): Promise<Divida[]>`
  - `async function credorDoTelefone(db, telefone: string): Promise<CredorId | null>`

- [ ] **Step 1: Escrever a migração**

`backend/migracoes/0003_cadastro.sql`:

```sql
-- Todo devedor pertence a exatamente um credor. Duas empresas de formatura
-- podem cobrar a mesma pessoa: sao dois devedores, um em cada carteira.
CREATE TABLE IF NOT EXISTS devedores (
  id TEXT PRIMARY KEY,
  credor_id TEXT NOT NULL REFERENCES credores (id),
  nome TEXT NOT NULL,
  documento TEXT,
  telefone TEXT NOT NULL,
  criado_em TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_devedores_credor ON devedores (credor_id, nome);
CREATE INDEX IF NOT EXISTS idx_devedores_telefone ON devedores (telefone);

-- O mesmo documento nao pode entrar duas vezes na mesma carteira. Em
-- carteiras diferentes, pode.
CREATE UNIQUE INDEX IF NOT EXISTS idx_devedores_documento
  ON devedores (credor_id, documento) WHERE documento IS NOT NULL;

CREATE TABLE IF NOT EXISTS dividas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  credor_id TEXT NOT NULL REFERENCES credores (id),
  devedor_id TEXT NOT NULL REFERENCES devedores (id),
  referencia TEXT NOT NULL,
  valor_centavos INTEGER NOT NULL CHECK (valor_centavos > 0),
  vencimento TEXT NOT NULL,
  situacao TEXT NOT NULL DEFAULT 'aberta'
    CHECK (situacao IN ('aberta', 'negociada', 'paga', 'cancelada')),
  criado_em TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_dividas_credor ON dividas (credor_id, vencimento);
CREATE INDEX IF NOT EXISTS idx_dividas_devedor ON dividas (devedor_id);
```

O `credor_id` é redundante em `dividas` — daria para chegar nele pelo `devedor_id`. É proposital: permite que **toda** consulta de dívida filtre por credor diretamente, sem `JOIN`, o que torna o teste-guarda da Task 3 possível de escrever.

- [ ] **Step 2: Escrever o teste do SQL (vai falhar)**

`backend/testes/cadastro-sql.test.ts`:

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { comoCredorId } from '../src/dominio/credor.ts';

const fonte = readFileSync(new URL('../src/db/cadastro.ts', import.meta.url), 'utf8');

// Cada string de SQL do modulo precisa carregar o filtro de carteira.
// Uma consulta sem ele mistura devedores de credores diferentes — o
// defeito que esta fase existe para impedir.
function comandosSql(texto: string): string[] {
  return [...texto.matchAll(/`([^`]*(?:SELECT|INSERT|UPDATE|DELETE)[^`]*)`/gi)].map((m) => m[1]);
}

test('o modulo tem comandos SQL para inspecionar', () => {
  assert.ok(comandosSql(fonte).length >= 4);
});

test('toda consulta de devedores ou dividas filtra por credor_id', () => {
  for (const sql of comandosSql(fonte)) {
    const tocaCarteira = /\b(devedores|dividas)\b/i.test(sql);
    if (!tocaCarteira) continue;
    assert.ok(
      /credor_id/i.test(sql),
      `consulta sem escopo de credor: ${sql.replace(/\s+/g, ' ').trim()}`,
    );
  }
});

test('nenhuma consulta monta filtro por concatenacao de string', () => {
  for (const sql of comandosSql(fonte)) {
    assert.ok(!sql.includes('${'), `SQL interpolado: ${sql.replace(/\s+/g, ' ').trim()}`);
  }
});

test('credorDoTelefone existe e e exportada', () => {
  assert.match(fonte, /export async function credorDoTelefone/);
});

test('comoCredorId continua sendo a unica porta de entrada', () => {
  assert.equal(comoCredorId('credor-padrao'), 'credor-padrao');
});
```

- [ ] **Step 3: Rodar e confirmar a falha**

```bash
cd backend && npm run teste
```

Esperado: falha ao ler `src/db/cadastro.ts` (ENOENT).

- [ ] **Step 4: Implementar o repositório**

`backend/src/db/cadastro.ts`:

```ts
import type { CredorId } from '../dominio/credor.ts';

export interface Devedor {
  id: string;
  credorId: CredorId;
  nome: string;
  documento: string | null;
  telefone: string;
  criadoEm: string;
}

export interface Divida {
  id: number;
  credorId: CredorId;
  devedorId: string;
  referencia: string;
  valorCentavos: number;
  vencimento: string;
  situacao: 'aberta' | 'negociada' | 'paga' | 'cancelada';
}

// Nenhuma funcao deste modulo aceita credorId opcional. Nao existe
// "listar tudo": quem precisa de visao geral pede carteira por carteira.
export async function inserirDevedor(
  db: D1Database,
  credorId: CredorId,
  d: { nome: string; documento: string | null; telefone: string },
): Promise<string> {
  const id = crypto.randomUUID();
  await db
    .prepare(
      `INSERT INTO devedores (id, credor_id, nome, documento, telefone, criado_em)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .bind(id, credorId, d.nome, d.documento, d.telefone, new Date().toISOString())
    .run();
  return id;
}

export async function listarDevedores(
  db: D1Database,
  credorId: CredorId,
  limite = 500,
): Promise<Devedor[]> {
  const { results } = await db
    .prepare(
      `SELECT id, credor_id, nome, documento, telefone, criado_em
       FROM devedores WHERE credor_id = ? ORDER BY nome LIMIT ?`,
    )
    .bind(credorId, limite)
    .all<Record<string, string>>();
  return results.map((l) => ({
    id: l.id,
    credorId: l.credor_id as CredorId,
    nome: l.nome,
    documento: l.documento ?? null,
    telefone: l.telefone,
    criadoEm: l.criado_em,
  }));
}

export async function inserirDivida(
  db: D1Database,
  credorId: CredorId,
  devedorId: string,
  d: { referencia: string; valorCentavos: number; vencimento: string },
): Promise<void> {
  // O devedor_id vem junto do credor_id no WHERE do SELECT de conferencia:
  // gravar divida num devedor de outra carteira seria vazamento silencioso.
  const dono = await db
    .prepare('SELECT id FROM devedores WHERE id = ? AND credor_id = ?')
    .bind(devedorId, credorId)
    .first<{ id: string }>();
  if (!dono) throw new Error('devedor nao pertence a este credor');

  await db
    .prepare(
      `INSERT INTO dividas
        (credor_id, devedor_id, referencia, valor_centavos, vencimento, situacao, criado_em)
       VALUES (?, ?, ?, ?, ?, 'aberta', ?)`,
    )
    .bind(credorId, devedorId, d.referencia, d.valorCentavos, d.vencimento, new Date().toISOString())
    .run();
}

export async function listarDividas(
  db: D1Database,
  credorId: CredorId,
  limite = 500,
): Promise<Divida[]> {
  const { results } = await db
    .prepare(
      `SELECT id, credor_id, devedor_id, referencia, valor_centavos, vencimento, situacao
       FROM dividas WHERE credor_id = ? ORDER BY vencimento LIMIT ?`,
    )
    .bind(credorId, limite)
    .all<Record<string, string | number>>();
  return results.map((l) => ({
    id: Number(l.id),
    credorId: String(l.credor_id) as CredorId,
    devedorId: String(l.devedor_id),
    referencia: String(l.referencia),
    valorCentavos: Number(l.valor_centavos),
    vencimento: String(l.vencimento),
    situacao: String(l.situacao) as Divida['situacao'],
  }));
}

// O webhook recebe um telefone, nao um credor. Se o mesmo telefone estiver
// em duas carteiras, nao ha como saber de quem e a conversa — devolve null
// e quem chamou registra o caso em vez de chutar.
export async function credorDoTelefone(
  db: D1Database,
  telefone: string,
): Promise<CredorId | null> {
  const { results } = await db
    .prepare('SELECT DISTINCT credor_id FROM devedores WHERE telefone = ? LIMIT 2')
    .bind(telefone)
    .all<{ credor_id: string }>();
  if (results.length !== 1) return null;
  return results[0].credor_id as CredorId;
}
```

- [ ] **Step 5: Rodar os testes**

```bash
cd backend && npm run teste
```

Esperado: os 5 novos passam. Verifique também a compilação:

```bash
cd backend && npx tsc --noEmit
```

- [ ] **Step 6: Aplicar a migração e conferir**

```bash
cd backend && npm run migrar && npx wrangler d1 execute cobranca --local --command "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
```

Esperado: `auditoria, credores, devedores, dividas, conversas, d1_migrations, nao_perturbe, pausa_global`.

- [ ] **Step 7: Commit**

```bash
git add backend/migracoes/0003_cadastro.sql backend/src/db/cadastro.ts backend/testes/cadastro-sql.test.ts && git commit -m "Cria o cadastro de devedores e dividas com escopo obrigatorio de credor" && git push
```

---

### Task 3: Escopo nas tabelas que já existem e teste-guarda geral

**Files:**
- Create: `backend/migracoes/0004_escopo_nas_tabelas_existentes.sql`
- Create: `backend/testes/escopo-guarda.test.ts`
- Modify: `backend/src/db/repositorio.ts`

**Interfaces:**
- Consumes: `CredorId`, `credorDoTelefone` da Task 2.
- Produces: `Mensagem` ganha `credorId: CredorId | null`; `gravarMensagem` grava a coluna; nova `conversasDoCredor(db, credorId: CredorId, limite?): Promise<...>`.

- [ ] **Step 1: Escrever a migração**

`backend/migracoes/0004_escopo_nas_tabelas_existentes.sql`:

```sql
-- SQLite nao permite ADD COLUMN NOT NULL sem DEFAULT. O default e o credor
-- padrao, que e exatamente o backfill desejado: tudo que existe hoje
-- pertence a carteira inicial.
ALTER TABLE conversas ADD COLUMN credor_id TEXT NOT NULL DEFAULT 'credor-padrao';
ALTER TABLE auditoria ADD COLUMN credor_id TEXT;

CREATE INDEX IF NOT EXISTS idx_conversas_credor ON conversas (credor_id, quando DESC);

-- nao_perturbe e pausa_global NAO ganham credor_id, de proposito. Todos os
-- credores sao cobrados pelo mesmo numero de WhatsApp: quem pediu para
-- parar pediu para nos, nao para um credor. Ver "Decisoes de projeto".
```

`ALTER TABLE ... ADD COLUMN` não é idempotente no SQLite; se precisar reaplicar, o wrangler já controla isso pela tabela `d1_migrations` e não roda duas vezes.

- [ ] **Step 2: Escrever o teste-guarda (vai falhar)**

`backend/testes/escopo-guarda.test.ts`:

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const raizSrc = new URL('../src/', import.meta.url).pathname;

// Tabelas cujo conteudo pertence a uma carteira. Consulta a qualquer uma
// delas sem credor_id mistura credores.
const TABELAS_DE_CARTEIRA = /\b(devedores|dividas|conversas)\b/i;

// Excecoes conscientes, com o motivo. Qualquer nova excecao exige que
// alguem escreva aqui por que ela e segura.
const LIBERADOS = new Map<string, string>([
  [
    'db/repositorio.ts:ultimaEntradaDe',
    'a janela de 24 horas e do numero de telefone, nao da carteira: o mesmo numero nao pode receber texto livre por credor diferente so porque trocou de carteira',
  ],
]);

function arquivosTs(dir: string): string[] {
  return readdirSync(dir).flatMap((nome) => {
    const caminho = join(dir, nome);
    if (statSync(caminho).isDirectory()) return arquivosTs(caminho);
    return nome.endsWith('.ts') ? [caminho] : [];
  });
}

function comandos(texto: string): string[] {
  return [...texto.matchAll(/`([^`]*(?:SELECT|INSERT|UPDATE|DELETE)[^`]*)`/gi)].map((m) => m[1]);
}

test('nenhuma consulta a tabela de carteira roda sem credor_id', () => {
  const faltas: string[] = [];

  for (const caminho of arquivosTs(raizSrc)) {
    const relativo = caminho.slice(raizSrc.length).replace(/\\/g, '/');
    for (const sql of comandos(readFileSync(caminho, 'utf8'))) {
      if (!TABELAS_DE_CARTEIRA.test(sql)) continue;
      if (/credor_id/i.test(sql)) continue;

      const liberado = [...LIBERADOS.keys()].some((chave) => chave.startsWith(relativo));
      if (liberado) continue;

      faltas.push(`${relativo}: ${sql.replace(/\s+/g, ' ').trim().slice(0, 120)}`);
    }
  }

  assert.deepEqual(faltas, [], `consultas sem escopo de credor:\n${faltas.join('\n')}`);
});

test('toda excecao liberada tem justificativa escrita', () => {
  for (const [chave, motivo] of LIBERADOS) {
    assert.ok(motivo.length > 40, `excecao sem justificativa util: ${chave}`);
  }
});
```

- [ ] **Step 3: Rodar e ver quais consultas faltam escopo**

```bash
cd backend && npm run teste
```

Esperado: falha listando as consultas de `conversas` em `src/db/repositorio.ts` e `src/api/painel.ts`. Anote a lista — os próximos passos e a Task 5 a zeram.

- [ ] **Step 4: Adicionar escopo ao repositório de conversas**

Em `backend/src/db/repositorio.ts`, substitua o `interface Mensagem` e `gravarMensagem` por:

```ts
import type { CredorId } from '../dominio/credor.ts';

export interface Mensagem {
  telefone: string;
  credorId: CredorId | null;
  direcao: 'entrada' | 'saida';
  texto: string;
  tipo: 'template' | 'livre';
  origem: 'cliente' | 'ia' | 'humano' | 'sistema';
  idExterno?: string | null;
}

export async function gravarMensagem(db: D1Database, m: Mensagem): Promise<void> {
  await db
    .prepare(
      `INSERT INTO conversas
        (telefone, credor_id, direcao, texto, tipo, quando, id_externo, origem)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      m.telefone,
      // Telefone que ainda nao esta em nenhuma carteira, ou que esta em
      // duas, grava sem credor. Some do painel de credor e aparece so na
      // visao do operador — que e onde alguem precisa resolver o caso.
      m.credorId ?? 'sem-credor',
      m.direcao,
      m.texto,
      m.tipo,
      new Date().toISOString(),
      m.idExterno ?? null,
      m.origem,
    )
    .run();
}
```

Substitua `conversaDe` por uma versão com escopo e acrescente a listagem por credor:

```ts
export async function conversaDe(
  db: D1Database,
  credorId: CredorId,
  telefone: string,
  limite = 20,
): Promise<Array<{ direcao: string; texto: string; quando: string; origem: string }>> {
  const { results } = await db
    .prepare(
      `SELECT direcao, texto, quando, origem FROM conversas
       WHERE credor_id = ? AND telefone = ? ORDER BY quando DESC LIMIT ?`,
    )
    .bind(credorId, telefone, limite)
    .all<{ direcao: string; texto: string; quando: string; origem: string }>();
  return results.reverse();
}

export async function conversasDoCredor(
  db: D1Database,
  credorId: CredorId,
  limite = 200,
): Promise<Array<Record<string, unknown>>> {
  const { results } = await db
    .prepare(
      `SELECT telefone, credor_id, direcao, texto, quando, origem FROM conversas
       WHERE credor_id = ? ORDER BY quando DESC LIMIT ?`,
    )
    .bind(credorId, limite)
    .all();
  return results;
}
```

`ultimaEntradaDe` fica **como está**, sem `credor_id` — está na lista de exceções do teste-guarda com a justificativa.

- [ ] **Step 5: Rodar o teste-guarda de novo**

```bash
cd backend && npm run teste
```

Esperado: ainda falha, agora só por causa de `src/api/painel.ts` (corrigido na Task 5) e dos chamadores de `gravarMensagem`/`conversaDe` em `whatsapp/webhook.ts`, que o `tsc` também acusa. Corrija o webhook agora:

Em `backend/src/whatsapp/webhook.ts`, importe o resolvedor e use-o. Na função `receber`, antes de `gravarMensagem`:

```ts
import { credorDoTelefone } from '../db/cadastro.ts';
```

```ts
    const credorId = await credorDoTelefone(db, mensagem.from);
    if (credorId === null) {
      await registrarAuditoria(db, {
        acao: 'telefone-sem-carteira-unica',
        telefone: mensagem.from,
        detalhe: 'conversa gravada sem credor; resolver no painel do operador',
      });
    }

    await gravarMensagem(db, {
      telefone: mensagem.from,
      credorId,
      direcao: 'entrada',
      texto,
      tipo: 'livre',
      origem: 'cliente',
      idExterno: mensagem.id,
    });
```

Passe `credorId` adiante para `responderCliente(config, db, mensagem.from, texto, credorId)` e ajuste a assinatura:

```ts
async function responderCliente(
  config: Config,
  db: D1Database,
  telefone: string,
  texto: string,
  credorId: CredorId | null,
): Promise<void> {
```

Dentro dela, o histórico só é buscado quando há credor:

```ts
  const historico = credorId ? await conversaDe(db, credorId, telefone) : [];
```

e a gravação da saída passa `credorId`. Importe o tipo: `import type { CredorId } from '../dominio/credor.ts';`.

- [ ] **Step 6: Rodar tudo**

```bash
cd backend && npm run teste && npx tsc --noEmit
```

Esperado: o teste-guarda ainda aponta `api/painel.ts`. Isso é esperado e some na Task 5 — **não** adicione `painel.ts` à lista de liberados. Se quiser o commit verde agora, faça a Task 5 antes de commitar; caso contrário, marque o teste-guarda com `{ skip: 'ligar na Task 5' }` e **remova o skip na Task 5**.

- [ ] **Step 7: Aplicar a migração e conferir o backfill**

```bash
cd backend && npm run migrar && npx wrangler d1 execute cobranca --local --command "SELECT credor_id, count(*) FROM conversas GROUP BY credor_id"
```

Esperado: toda conversa existente com `credor-padrao`.

- [ ] **Step 8: Commit**

```bash
git add backend/migracoes/0004_escopo_nas_tabelas_existentes.sql backend/testes/escopo-guarda.test.ts backend/src/db/repositorio.ts backend/src/whatsapp/webhook.ts && git commit -m "Poe credor nas conversas e adiciona o teste-guarda de vazamento entre carteiras" && git push
```

---

### Task 4: Sessão com escopo — a porta aberta para o login do credor

**Files:**
- Create: `backend/src/api/sessao.ts`
- Create: `backend/testes/sessao.test.ts`
- Modify: `backend/src/api/autenticacao.ts`, `backend/src/index.ts`

**Interfaces:**
- Consumes: `autorizado(requisicao, config)` (atual, devolve boolean), `CredorId`, `comoCredorId`.
- Produces:
  - `type Escopo = { tipo: 'operador' } | { tipo: 'credor'; credorId: CredorId }`
  - `interface Sessao { escopo: Escopo }`
  - `function abrirSessao(requisicao: Request, config: Config): Sessao | null`
  - `function escopoDaConsulta(sessao: Sessao, url: URL): { ok: true; credorId: CredorId } | { ok: false; motivo: string }`

- [ ] **Step 1: Escrever o teste (vai falhar)**

`backend/testes/sessao.test.ts`:

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { abrirSessao, escopoDaConsulta } from '../src/api/sessao.ts';
import { comoCredorId } from '../src/dominio/credor.ts';

const config = {
  ambiente: 'teste',
  whatsapp: { token: 'x', numeroId: 'x', contaId: 'x', verifyToken: 'x', appSecret: 'x' },
  anthropicApiKey: 'x',
  painelToken: 'segredo-do-painel',
  destinatariosTeste: [],
  origemPainel: '',
};

function req(autorizacao: string | null): Request {
  return new Request('https://exemplo/api/conversas', {
    headers: autorizacao ? { authorization: autorizacao } : {},
  });
}

test('sem credencial nao abre sessao', () => {
  assert.equal(abrirSessao(req(null), config), null);
});

test('token do painel abre sessao de operador', () => {
  const s = abrirSessao(req('Bearer segredo-do-painel'), config);
  assert.deepEqual(s, { escopo: { tipo: 'operador' } });
});

test('operador precisa dizer de qual credor quer os dados', () => {
  const s = { escopo: { tipo: 'operador' as const } };
  const r = escopoDaConsulta(s, new URL('https://exemplo/api/conversas'));
  assert.equal(r.ok, false);
});

test('operador escolhe o credor pela query', () => {
  const s = { escopo: { tipo: 'operador' as const } };
  const r = escopoDaConsulta(s, new URL('https://exemplo/api/conversas?credor=credor-padrao'));
  assert.deepEqual(r, { ok: true, credorId: 'credor-padrao' });
});

test('credor invalido na query e recusado, nao ignorado', () => {
  const s = { escopo: { tipo: 'operador' as const } };
  const r = escopoDaConsulta(s, new URL("https://exemplo/api/conversas?credor=x'+OR+1=1"));
  assert.equal(r.ok, false);
});

test('sessao de credor ignora a query e usa o proprio escopo', () => {
  const s = { escopo: { tipo: 'credor' as const, credorId: comoCredorId('formatura-abc')! } };
  const r = escopoDaConsulta(s, new URL('https://exemplo/api/conversas?credor=credor-padrao'));
  assert.deepEqual(r, { ok: true, credorId: 'formatura-abc' });
});
```

O último teste é o coração desta tarefa: no dia em que existir login de credor, tentar trocar o `?credor=` na URL não vai levar a lugar nenhum.

- [ ] **Step 2: Rodar e confirmar a falha**

```bash
cd backend && npm run teste
```

Esperado: módulo `src/api/sessao.ts` não encontrado.

- [ ] **Step 3: Implementar**

`backend/src/api/sessao.ts`:

```ts
import type { Config } from '../config.ts';
import type { CredorId } from '../dominio/credor.ts';
import { comoCredorId } from '../dominio/credor.ts';
import { autorizado } from './autenticacao.ts';

// Hoje so existe um tipo de sessao: o operador interno, que enxerga
// qualquer carteira desde que diga qual. O tipo 'credor' ja esta previsto
// para quando houver login proprio — nenhum endpoint precisara mudar,
// porque todos derivam o escopo daqui.
export type Escopo = { tipo: 'operador' } | { tipo: 'credor'; credorId: CredorId };

export interface Sessao {
  escopo: Escopo;
}

export function abrirSessao(requisicao: Request, config: Config): Sessao | null {
  if (!autorizado(requisicao, config)) return null;
  return { escopo: { tipo: 'operador' } };
}

export type EscopoResolvido =
  | { ok: true; credorId: CredorId }
  | { ok: false; motivo: string };

// Nao existe consulta "de todos os credores". Operador sem ?credor= recebe
// 400: e melhor uma tela que pede a escolha do que uma tela que mistura
// carteiras sem ninguem perceber.
export function escopoDaConsulta(sessao: Sessao, url: URL): EscopoResolvido {
  if (sessao.escopo.tipo === 'credor') {
    return { ok: true, credorId: sessao.escopo.credorId };
  }

  const bruto = url.searchParams.get('credor');
  if (!bruto) return { ok: false, motivo: 'informe o credor na consulta' };

  const credorId = comoCredorId(bruto);
  if (!credorId) return { ok: false, motivo: 'identificador de credor invalido' };

  return { ok: true, credorId };
}
```

- [ ] **Step 4: Rodar os testes**

```bash
cd backend && npm run teste
```

Esperado: os 6 novos passam.

- [ ] **Step 5: Usar a sessão no roteador**

Em `backend/src/index.ts`, troque o bloco autenticado:

```ts
import { abrirSessao } from './api/sessao.ts';
```

```ts
    if (url.pathname.startsWith('/api/') || ehRotaDoPainel(url)) {
      const sessao = abrirSessao(requisicao, config);
      if (!sessao) return pedirCredencial();

      if (url.pathname.startsWith('/api/')) {
        return rotearPainel(requisicao, url, sessao, env.DB);
      }
      return servirPainel(url);
    }
```

`rotearPainel` ainda não tem essa assinatura — o `tsc` vai reclamar até a Task 5. Faça as duas em sequência.

- [ ] **Step 6: Commit (depois da Task 5, junto)**

Esta tarefa e a próxima formam um commit só, porque entre elas o projeto não compila. Siga direto para a Task 5.

---

### Task 5: API por credor

**Files:**
- Modify: `backend/src/api/painel.ts`
- Create: `backend/src/db/credores.ts`

**Interfaces:**
- Consumes: `Sessao`, `escopoDaConsulta`, `conversasDoCredor`, `listarDevedores`, `listarDividas`, `validarRegras`.
- Produces:
  - `async function listarCredores(db): Promise<Array<{ id; nome; ativo; regras: RegrasCredor }>>`
  - `async function lerCredor(db, credorId: CredorId)`
  - `async function salvarRegras(db, credorId: CredorId, r: RegrasCredor): Promise<void>`
  - Endpoints: `GET /api/credores`, `GET /api/credores/:id/regras`, `POST /api/credores/:id/regras`, `GET /api/devedores?credor=`, `GET /api/dividas?credor=`, `GET /api/conversas?credor=`.

- [ ] **Step 1: Implementar o repositório de credores**

`backend/src/db/credores.ts`:

```ts
import type { CredorId, RegrasCredor } from '../dominio/credor.ts';

export interface CredorResumo {
  id: string;
  nome: string;
  ativo: boolean;
  regras: RegrasCredor;
}

function daLinha(l: Record<string, string | number>): CredorResumo {
  return {
    id: String(l.id),
    nome: String(l.nome),
    ativo: Number(l.ativo) === 1,
    regras: {
      descontoMaximoPct: Number(l.desconto_maximo_pct),
      parcelamentoMaximo: Number(l.parcelamento_maximo),
      comissaoSobreRecuperadoPct: Number(l.comissao_sobre_recuperado_pct),
    },
  };
}

// A lista de credores nao e dado de carteira: e o menu de escolha do
// operador. Quando houver login de credor, este endpoint devolvera so o
// proprio — a filtragem fica no roteador, junto com o escopo da sessao.
export async function listarCredores(db: D1Database): Promise<CredorResumo[]> {
  const { results } = await db
    .prepare(
      `SELECT id, nome, ativo, desconto_maximo_pct, parcelamento_maximo, comissao_sobre_recuperado_pct
       FROM credores WHERE ativo = 1 ORDER BY nome`,
    )
    .all<Record<string, string | number>>();
  return results.map(daLinha);
}

export async function lerCredor(db: D1Database, credorId: CredorId): Promise<CredorResumo | null> {
  const l = await db
    .prepare(
      `SELECT id, nome, ativo, desconto_maximo_pct, parcelamento_maximo, comissao_sobre_recuperado_pct
       FROM credores WHERE id = ?`,
    )
    .bind(credorId)
    .first<Record<string, string | number>>();
  return l ? daLinha(l) : null;
}

export async function salvarRegras(
  db: D1Database,
  credorId: CredorId,
  r: RegrasCredor,
): Promise<void> {
  await db
    .prepare(
      `UPDATE credores
       SET desconto_maximo_pct = ?, parcelamento_maximo = ?, comissao_sobre_recuperado_pct = ?
       WHERE id = ?`,
    )
    .bind(r.descontoMaximoPct, r.parcelamentoMaximo, r.comissaoSobreRecuperadoPct, credorId)
    .run();
}
```

- [ ] **Step 2: Reescrever o roteador**

`backend/src/api/painel.ts`, arquivo inteiro:

```ts
import type { Sessao } from './sessao.ts';
import { escopoDaConsulta } from './sessao.ts';
import { validarRegras } from '../dominio/credor.ts';
import { definirPausaGlobal, definirSilencio, lerPausaGlobal } from '../dominio/travas.ts';
import { conversasDoCredor } from '../db/repositorio.ts';
import { listarDevedores, listarDividas } from '../db/cadastro.ts';
import { listarCredores, lerCredor, salvarRegras } from '../db/credores.ts';

// A autenticacao acontece no roteador principal. Aqui a preocupacao e
// outra: nenhum endpoint de carteira responde sem um credor resolvido.
export async function rotearPainel(
  requisicao: Request,
  url: URL,
  sessao: Sessao,
  db: D1Database,
): Promise<Response> {
  const metodo = requisicao.method;

  // --- Rotas sem escopo de carteira -------------------------------------

  if (url.pathname === '/api/credores' && metodo === 'GET') {
    const todos = await listarCredores(db);
    const visiveis =
      sessao.escopo.tipo === 'credor'
        ? todos.filter((c) => c.id === sessao.escopo.credorId)
        : todos;
    return Response.json({ credores: visiveis });
  }

  if (url.pathname === '/api/estado' && metodo === 'GET') {
    // Pausa global e nao-perturbe sao da operacao inteira, nao de uma
    // carteira. Ver "Decisoes de projeto".
    const pausado = await lerPausaGlobal(db);
    const { results } = await db
      .prepare('SELECT telefone FROM nao_perturbe WHERE silenciado = 1')
      .all<{ telefone: string }>();
    return Response.json({ pausado, silenciados: results.map((s) => s.telefone) });
  }

  if (url.pathname === '/api/pausa' && metodo === 'POST') {
    const { pausado } = (await requisicao.json()) as { pausado: boolean };
    if (typeof pausado !== 'boolean') {
      return new Response('Campo pausado deve ser booleano', { status: 400 });
    }
    await definirPausaGlobal(db, pausado, 'painel');
    return Response.json({ pausado });
  }

  if (url.pathname === '/api/silencio' && metodo === 'POST') {
    const { telefone, silenciado } = (await requisicao.json()) as {
      telefone: string;
      silenciado: boolean;
    };
    if (typeof telefone !== 'string' || telefone.length === 0) {
      return new Response('Campo telefone obrigatorio', { status: 400 });
    }
    if (typeof silenciado !== 'boolean') {
      return new Response('Campo silenciado deve ser booleano', { status: 400 });
    }
    await definirSilencio(db, telefone, silenciado, 'painel');
    return Response.json({ telefone, silenciado });
  }

  // --- Daqui para baixo, tudo exige carteira resolvida -------------------

  const escopo = escopoDaConsulta(sessao, url);
  if (!escopo.ok) return new Response(escopo.motivo, { status: 400 });
  const { credorId } = escopo;

  if (url.pathname === '/api/regras' && metodo === 'GET') {
    const credor = await lerCredor(db, credorId);
    if (!credor) return new Response('Credor nao encontrado', { status: 404 });
    return Response.json(credor);
  }

  if (url.pathname === '/api/regras' && metodo === 'POST') {
    // Credor logado nao edita as proprias regras comerciais: quem define
    // desconto e comissao e a assessoria, no contrato.
    if (sessao.escopo.tipo !== 'operador') {
      return new Response('Somente a assessoria altera regras', { status: 403 });
    }
    const corpo = (await requisicao.json()) as Record<string, unknown>;
    const regras = {
      descontoMaximoPct: Number(corpo.descontoMaximoPct),
      parcelamentoMaximo: Number(corpo.parcelamentoMaximo),
      comissaoSobreRecuperadoPct: Number(corpo.comissaoSobreRecuperadoPct),
    };
    const v = validarRegras(regras);
    if (!v.ok) return new Response(v.motivo, { status: 400 });

    const credor = await lerCredor(db, credorId);
    if (!credor) return new Response('Credor nao encontrado', { status: 404 });

    await salvarRegras(db, credorId, regras);
    return Response.json({ credorId, regras });
  }

  if (url.pathname === '/api/devedores' && metodo === 'GET') {
    return Response.json({ devedores: await listarDevedores(db, credorId) });
  }

  if (url.pathname === '/api/dividas' && metodo === 'GET') {
    return Response.json({ dividas: await listarDividas(db, credorId) });
  }

  if (url.pathname === '/api/conversas' && metodo === 'GET') {
    return Response.json({ conversas: await conversasDoCredor(db, credorId) });
  }

  return new Response('Nao encontrado', { status: 404 });
}
```

- [ ] **Step 3: Remover o skip do teste-guarda**

Se a Task 3 deixou `{ skip: ... }` no teste-guarda, tire agora.

- [ ] **Step 4: Rodar tudo**

```bash
cd backend && npm run teste && npx tsc --noEmit
```

Esperado: tudo verde, incluindo o teste-guarda, que agora não encontra nenhuma consulta de carteira sem escopo.

- [ ] **Step 5: Verificar de ponta a ponta, localmente**

Suba o Worker local (`npm run dev`) e, com a senha de teste do `.dev.vars`:

```bash
curl -s -u :SENHA_DE_TESTE http://127.0.0.1:8787/api/credores
```

Esperado: `{"credores":[{"id":"credor-padrao",...}]}`.

```bash
curl -s -o /dev/null -w "%{http_code}\n" -u :SENHA_DE_TESTE http://127.0.0.1:8787/api/conversas
```

Esperado: **400** — sem `?credor=`, a API recusa. Esta é a verificação central da fase.

```bash
curl -s -u :SENHA_DE_TESTE "http://127.0.0.1:8787/api/conversas?credor=credor-padrao"
```

Esperado: as conversas existentes, todas atribuídas ao credor padrão.

- [ ] **Step 6: Commit**

```bash
git add backend/src/api backend/src/db/credores.ts backend/src/index.ts backend/testes/sessao.test.ts && git commit -m "Deriva o escopo de credor da sessao e exige carteira em toda rota de dados" && git push
```

---

### Task 6: Importação do Cobmais grava na carteira

**Files:**
- Modify: `backend/src/cobmais/importar.ts`
- Modify: `backend/testes/importar.test.ts`
- Modify: `backend/src/api/painel.ts` (rota de importação)

**Interfaces:**
- Consumes: `interpretarCsv` (atual), `inserirDevedor`, `inserirDivida`, `CredorId`.
- Produces: `async function importarParaCarteira(db, credorId: CredorId, csv: string): Promise<{ criados: number; atualizados: number; descartados: number }>`.

- [ ] **Step 1: Escrever o teste da contagem (vai falhar)**

Acrescente ao final de `backend/testes/importar.test.ts`:

```ts
import { resumoDaImportacao } from '../src/cobmais/importar.ts';

test('resumo conta linha descartada separado das aproveitadas', () => {
  const csv = [
    'nome;telefone;valor;vencimento',
    'Ana Fictícia;5535900000001;1.234,56;10/09/2026',
    'Linha quebrada;;;',
    'Bruno Fictício;5535900000002;99,00;11/09/2026',
  ].join('\n');

  assert.deepEqual(resumoDaImportacao(csv), { aproveitadas: 2, descartadas: 1 });
});

test('csv so com cabecalho nao aproveita nada', () => {
  assert.deepEqual(resumoDaImportacao('nome;telefone;valor;vencimento'), {
    aproveitadas: 0,
    descartadas: 0,
  });
});
```

- [ ] **Step 2: Rodar e confirmar a falha**

```bash
cd backend && npm run teste
```

Esperado: `resumoDaImportacao is not a function`.

- [ ] **Step 3: Implementar**

Acrescente a `backend/src/cobmais/importar.ts`:

```ts
import type { CredorId } from '../dominio/credor.ts';
import { inserirDevedor, inserirDivida } from '../db/cadastro.ts';

// Contagem separada porque o operador precisa saber que a planilha tinha
// linha ruim — silenciar isso e como cobrar menos gente sem avisar.
export function resumoDaImportacao(csv: string): { aproveitadas: number; descartadas: number } {
  const linhas = csv.trim().split(/\r?\n/).slice(1).filter((l) => l.trim().length > 0);
  const aproveitadas = interpretarCsv(csv).length;
  return { aproveitadas, descartadas: linhas.length - aproveitadas };
}

export async function importarParaCarteira(
  db: D1Database,
  credorId: CredorId,
  csv: string,
): Promise<{ criados: number; atualizados: number; descartados: number }> {
  const clientes = interpretarCsv(csv);
  const { descartadas } = resumoDaImportacao(csv);

  let criados = 0;
  let atualizados = 0;

  for (const cliente of clientes) {
    // Reimportar a mesma planilha nao pode duplicar devedor. A chave e
    // telefone dentro da carteira: o Cobmais nao exporta documento hoje.
    const existente = await db
      .prepare('SELECT id FROM devedores WHERE credor_id = ? AND telefone = ?')
      .bind(credorId, cliente.telefone)
      .first<{ id: string }>();

    let devedorId: string;
    if (existente) {
      devedorId = existente.id;
      atualizados += 1;
    } else {
      devedorId = await inserirDevedor(db, credorId, {
        nome: cliente.nome,
        documento: null,
        telefone: cliente.telefone,
      });
      criados += 1;
    }

    // A referencia identifica a divida dentro da carteira. Mesma
    // referencia na mesma carteira nao entra duas vezes.
    const referencia = `${cliente.vencimento}-${cliente.valorCentavos}`;
    const jaTem = await db
      .prepare('SELECT id FROM dividas WHERE credor_id = ? AND devedor_id = ? AND referencia = ?')
      .bind(credorId, devedorId, referencia)
      .first<{ id: number }>();

    if (!jaTem) {
      await inserirDivida(db, credorId, devedorId, {
        referencia,
        valorCentavos: cliente.valorCentavos,
        vencimento: cliente.vencimento,
      });
    }
  }

  return { criados, atualizados, descartados: descartadas };
}
```

- [ ] **Step 4: Expor a rota de importação**

Em `backend/src/api/painel.ts`, depois do bloco de `/api/regras`, acrescente:

```ts
  if (url.pathname === '/api/importar' && metodo === 'POST') {
    // Importar mexe na carteira: e trabalho da assessoria, nao do credor.
    if (sessao.escopo.tipo !== 'operador') {
      return new Response('Somente a assessoria importa carteira', { status: 403 });
    }
    const csv = await requisicao.text();
    if (csv.trim().length === 0) return new Response('Planilha vazia', { status: 400 });

    const resultado = await importarParaCarteira(db, credorId, csv);
    await registrarAuditoria(db, {
      acao: 'carteira-importada',
      telefone: null,
      detalhe: `credor ${credorId}: ${resultado.criados} novos, ${resultado.atualizados} ja existentes, ${resultado.descartados} descartados`,
    });
    return Response.json(resultado);
  }
```

Importe `importarParaCarteira` e `registrarAuditoria` no topo do arquivo.

- [ ] **Step 5: Rodar tudo**

```bash
cd backend && npm run teste && npx tsc --noEmit
```

- [ ] **Step 6: Verificar localmente com planilha fictícia**

Crie o arquivo **fora do repositório**, no diretório temporário, com nomes e telefones fictícios (`5535900000001` em diante — nunca telefone real):

```bash
printf 'nome;telefone;valor;vencimento\nAna Ficticia;5535900000001;1.234,56;10/09/2026\n' > "$TEMP/carteira-teste.csv"
```

```bash
curl -s -u :SENHA_DE_TESTE -X POST --data-binary "@$TEMP/carteira-teste.csv" "http://127.0.0.1:8787/api/importar?credor=credor-padrao"
```

Esperado: `{"criados":1,"atualizados":0,"descartados":0}`. Rode de novo: `{"criados":0,"atualizados":1,"descartados":0}` — a reimportação não duplica.

- [ ] **Step 7: Commit**

```bash
git add backend/src/cobmais/importar.ts backend/src/api/painel.ts backend/testes/importar.test.ts && git commit -m "Grava a planilha do Cobmais na carteira do credor sem duplicar" && git push
```

---

### Task 7: Painel com seletor de credor

**Files:**
- Create: `credores.js`
- Modify: `index.html`, `estilos.css`, `dados-remotos.js`, `app.js`, `backend/scripts/gerar-painel.mjs`

**Interfaces:**
- Consumes: `GET /api/credores`, `GET /api/conversas?credor=`, `GET /api/devedores?credor=`, `GET /api/regras?credor=`.
- Produces: `credorSelecionado()`, `definirCredorSelecionado(id)`, `carregarCredores()`.

- [ ] **Step 1: Criar o módulo de credor selecionado**

`credores.js` na raiz:

```js
// O credor escolhido vive na URL, nao em memoria: recarregar a pagina ou
// mandar o link para alguem preserva a carteira que estava aberta — e deixa
// obvio, na barra de endereco, qual carteira esta na tela.
export function credorSelecionado() {
  return new URLSearchParams(location.search).get('credor') ?? '';
}

export function definirCredorSelecionado(id) {
  const url = new URL(location.href);
  if (id) url.searchParams.set('credor', id);
  else url.searchParams.delete('credor');
  location.assign(url.toString());
}
```

- [ ] **Step 2: Acrescentar as chamadas com escopo**

Em `dados-remotos.js`, substitua `carregarConversas` e acrescente as novas:

```js
import { credorSelecionado } from './credores.js';

function comCredor(caminho) {
  const credor = credorSelecionado();
  if (!credor) throw new Error('Escolha um credor para ver a carteira.');
  return `${caminho}?credor=${encodeURIComponent(credor)}`;
}

export async function carregarCredores() {
  const { credores } = await chamar('/api/credores');
  return credores;
}

export async function carregarConversas() {
  const { conversas } = await chamar(comCredor('/api/conversas'));
  return conversas;
}

export async function carregarDevedores() {
  const { devedores } = await chamar(comCredor('/api/devedores'));
  return devedores;
}

export async function carregarRegras() {
  return chamar(comCredor('/api/regras'));
}
```

- [ ] **Step 3: Acrescentar o seletor ao cabeçalho**

Em `index.html`, dentro de `<header class="topo">`, antes do `<button id="botao-pausa">`:

```html
          <div class="campo-credor">
            <label for="seletor-credor" class="oculto-visualmente">Credor</label>
            <select id="seletor-credor" class="entrada entrada-seletor">
              <option value="">Escolha um credor…</option>
            </select>
          </div>
```

Logo abaixo de `<div id="faixa-erro" ...>`:

```html
        <div id="faixa-sem-credor" class="faixa-erro" role="status" hidden>
          Escolha um credor no topo para ver a carteira.
        </div>
```

Em `estilos.css`, junto das outras regras de controle:

```css
.campo-credor { margin-left: auto; margin-right: var(--gap); min-width: 220px; }
.campo-credor .entrada-seletor { width: 100%; }
```

- [ ] **Step 4: Ligar no `app.js`**

Substitua `recarregarDoServidor` e `iniciar`:

```js
import { credorSelecionado, definirCredorSelecionado } from './credores.js';
import { carregarCredores, carregarDevedores, carregarRegras } from './dados-remotos.js';
```

```js
async function montarSeletorDeCredores() {
  const lista = await carregarCredores();
  const seletor = elemento('seletor-credor');
  const atual = credorSelecionado();

  seletor.replaceChildren(
    novoElemento('option', { value: '', textContent: 'Escolha um credor…' }),
    ...lista.map((c) => novoElemento('option', { value: c.id, textContent: c.nome })),
  );
  seletor.value = atual;
  seletor.addEventListener('change', () => definirCredorSelecionado(seletor.value));

  // Uma carteira so: escolher e cerimonia inutil, seleciona sozinho.
  if (!atual && lista.length === 1) {
    definirCredorSelecionado(lista[0].id);
    return false;
  }
  return Boolean(atual);
}

async function recarregarDoServidor() {
  const [estado, lista, devedores] = await Promise.all([
    carregarEstado(),
    carregarConversas(),
    carregarDevedores(),
  ]);
  servidor = estado;
  conversas = lista;
  // A lista de clientes agora vem da carteira do credor. Se ela estiver
  // vazia, o painel mostra o mock e continua avisando que e ficticio.
  clientesEmTela = devedores.length > 0 ? devedores.map(comoClienteDePainel) : clientes;
  aplicarPausa({ pausado: estado.pausado });
  renderizar();
}

async function iniciar() {
  preencherSeletores();
  ligarEventos();
  aplicarPausa({ pausado: true });
  renderizar();

  try {
    const temCredor = await montarSeletorDeCredores();
    elemento('faixa-sem-credor').hidden = temCredor;
    if (!temCredor) return;

    await recarregarDoServidor();
    limparErro();
  } catch (erro) {
    mostrarErro(`Nao foi possivel carregar os dados do servidor: ${erro.message}`);
  }
}
```

E o adaptador, junto das outras funções de apresentação:

```js
// O devedor do banco ainda nao tem situacao calculada; ate a fase que
// cuidar disso, entra como 'aguardando'.
function comoClienteDePainel(devedor) {
  return {
    id: devedor.id,
    nome: devedor.nome,
    telefone: devedor.telefone,
    valorCentavos: 0,
    vencimento: devedor.criadoEm.slice(0, 10),
    status: 'aguardando',
  };
}
```

Troque as leituras de `clientes` no restante do `app.js` por `clientesEmTela`, declarada junto de `conversas`:

```js
let clientesEmTela = clientes;
```

E o selo de dados fictícios passa a depender da origem:

```js
  elemento('titulo-clientes').querySelector('.selo-ficticio').hidden = clientesEmTela !== clientes;
  elemento('secao-clientes').querySelector('.aviso-ficticio').hidden = clientesEmTela !== clientes;
```

- [ ] **Step 5: Incluir o arquivo novo no bundle do Worker**

Em `backend/scripts/gerar-painel.mjs`, acrescente à lista `ARQUIVOS`:

```js
  ['credores.js', 'text/javascript; charset=utf-8'],
```

Sem isso o painel serve um `import` que responde 404 — a tela fica em branco e o erro só aparece no console.

- [ ] **Step 6: Verificar na tela**

Suba `npm run dev`, abra `http://127.0.0.1:8787/`, autentique com a senha de teste e confira:

1. O seletor de credor aparece no topo e lista "Carteira inicial".
2. Com uma carteira só, ele já entra selecionado e a URL vira `/?credor=credor-padrao`.
3. O histórico carrega. A lista de clientes mostra o devedor fictício importado na Task 6, **sem** o selo "dados fictícios".
4. Abrir `/?credor=inexistente` mostra a faixa de erro, não uma tela vazia sem explicação.
5. Nenhum erro no console.

- [ ] **Step 7: Commit**

```bash
git add credores.js index.html estilos.css app.js dados-remotos.js backend/scripts/gerar-painel.mjs && git commit -m "Poe o seletor de credor no painel e liga a lista de clientes na carteira" && git push
```

---

### Task 8: Tela de regras comerciais do credor

**Files:**
- Modify: `index.html`, `estilos.css`, `app.js`, `dados-remotos.js`

**Interfaces:**
- Consumes: `GET /api/regras?credor=`, `POST /api/regras?credor=` (Task 5).
- Produces: `salvarRegras(regras)` em `dados-remotos.js`.

Só o operador da assessoria edita. Um credor logado, quando existir login,
recebe 403 do backend — a regra já está na Task 5 e esta tela não a
contorna: ela apenas esconde o formulário quando a resposta vier 403.

- [ ] **Step 1: Acrescentar a chamada de escrita**

Em `dados-remotos.js`:

```js
export async function salvarRegras(regras) {
  return chamar(comCredor('/api/regras'), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(regras),
  });
}
```

- [ ] **Step 2: Acrescentar o cartão de regras**

Em `index.html`, dentro de `<div class="grade">`, depois da seção de histórico:

```html
          <section id="secao-regras" class="cartao" aria-labelledby="titulo-regras" hidden>
            <div class="cartao-topo">
              <div>
                <h2 id="titulo-regras">Regras comerciais</h2>
                <p class="contador">Valem só para o credor selecionado</p>
              </div>
            </div>

            <form id="forma-regras" class="forma-regras">
              <label class="campo-regra">
                <span>Desconto máximo (%)</span>
                <input id="regra-desconto" class="entrada" type="number" min="0" max="100" step="0.5" required />
              </label>

              <label class="campo-regra">
                <span>Parcelamento máximo</span>
                <input id="regra-parcelas" class="entrada" type="number" min="1" max="60" step="1" required />
              </label>

              <label class="campo-regra">
                <span>Comissão sobre o valor recuperado (%)</span>
                <input id="regra-comissao" class="entrada" type="number" min="0" max="100" step="0.5" required />
              </label>

              <div class="acoes-regras">
                <button type="submit" class="botao-primario">Salvar regras</button>
                <span id="aviso-regras" class="aviso-regras" role="status"></span>
              </div>
            </form>

            <p class="aviso-ficticio">
              Desconto configurado aqui <strong>não</strong> autoriza a IA a
              oferecê-lo. O bloqueio continua valendo até uma decisão separada.
            </p>
          </section>
```

A última frase é obrigatória. Sem ela, alguém configura 20% de desconto e
espera que a IA passe a negociar — e a IA continua barrando toda menção a
desconto, como foi decidido na Fase 2.

- [ ] **Step 3: Estilo**

Em `estilos.css`:

```css
.forma-regras { display: grid; gap: 14px; margin-top: 12px; }
.campo-regra { display: grid; gap: 6px; font-size: 0.85rem; color: var(--texto-medio); font-weight: 600; }
.acoes-regras { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
.aviso-regras { font-size: 0.85rem; font-weight: 600; }
.aviso-regras[data-estado='erro'] { color: var(--atencao-texto); }
```

Se `--atencao-texto` ou a classe `.botao-primario` não existirem, abra
`estilos.css` e use os tokens e a classe de botão que já estão lá.

- [ ] **Step 4: Ligar no `app.js`**

```js
import { carregarRegras, salvarRegras } from './dados-remotos.js';

async function montarRegras() {
  const secao = elemento('secao-regras');
  let credor;
  try {
    credor = await carregarRegras();
  } catch {
    // 403 = sessao de credor, que nao edita as proprias regras. A secao
    // simplesmente nao aparece; nao ha erro a mostrar.
    secao.hidden = true;
    return;
  }

  elemento('regra-desconto').value = credor.regras.descontoMaximoPct;
  elemento('regra-parcelas').value = credor.regras.parcelamentoMaximo;
  elemento('regra-comissao').value = credor.regras.comissaoSobreRecuperadoPct;
  secao.hidden = false;

  elemento('forma-regras').addEventListener('submit', async (evento) => {
    evento.preventDefault();
    const aviso = elemento('aviso-regras');
    aviso.textContent = 'Salvando…';
    aviso.removeAttribute('data-estado');

    try {
      await salvarRegras({
        descontoMaximoPct: Number(elemento('regra-desconto').value),
        parcelamentoMaximo: Number(elemento('regra-parcelas').value),
        comissaoSobreRecuperadoPct: Number(elemento('regra-comissao').value),
      });
      aviso.textContent = 'Regras salvas.';
    } catch (erro) {
      aviso.textContent = `Não foi possível salvar: ${erro.message}`;
      aviso.dataset.estado = 'erro';
    }
  });
}
```

Chame `montarRegras()` dentro de `iniciar()`, depois de `recarregarDoServidor()`.

- [ ] **Step 5: Verificar na tela**

Com `npm run dev`, credor selecionado:

1. O cartão mostra 0 / 1 / 0 — os valores do credor padrão.
2. Salvar 20 / 6 / 15 mostra "Regras salvas."
3. Recarregar a página traz 20 / 6 / 15 de volta.
4. Digitar 150 no desconto: o navegador barra pelo `max`. Se você contornar
   o `max` pelo console e enviar, o backend responde 400 e o aviso mostra a
   mensagem — a validação de verdade está no servidor, não no formulário.
5. Nenhum erro no console.

- [ ] **Step 6: Commit**

```bash
git add index.html estilos.css app.js dados-remotos.js && git commit -m "Poe a tela de regras comerciais por credor no painel" && git push
```

---

### Task 9: Migrar o banco remoto e publicar

**Files:** nenhum arquivo novo.

- [ ] **Step 1: Confirmar que a pausa global continua ligada**

```bash
cd backend && npx wrangler d1 execute cobranca --remote --command "SELECT pausado, desde, por FROM pausa_global"
```

Esperado: `pausado = 1`. **Se vier 0, pare e avise o usuário antes de qualquer outra coisa.**

- [ ] **Step 2: Ver o que a migração vai fazer, antes de fazer**

```bash
cd backend && npx wrangler d1 migrations list cobranca --remote
```

Esperado: as quatro migrações listadas como pendentes (a `0001` inclusive — ela é inofensiva porque é toda `IF NOT EXISTS`).

- [ ] **Step 3: Guardar o estado atual antes de mexer**

```bash
cd backend && npx wrangler d1 execute cobranca --remote --command "SELECT count(*) AS conversas FROM conversas" && npx wrangler d1 execute cobranca --remote --command "SELECT count(*) AS auditoria FROM auditoria"
```

Anote os números: eles têm de continuar iguais depois da migração.

- [ ] **Step 4: Aplicar**

```bash
cd backend && npm run migrar:remoto
```

- [ ] **Step 5: Conferir que nada se perdeu e tudo tem dono**

```bash
cd backend && npx wrangler d1 execute cobranca --remote --command "SELECT credor_id, count(*) FROM conversas GROUP BY credor_id"
```

Esperado: a mesma contagem de antes, toda em `credor-padrao`.

- [ ] **Step 6: Varredura de segredos, da raiz do repositório**

```bash
cd "C:/Users/thesc/OneDrive/Documentos/GitHub/Plataforma Cobrança" && git grep -nE "EAA[A-Za-z0-9]{20,}|sk-ant-[A-Za-z0-9]{10,}" -- . ; git ls-files | grep -E "^\.env|\.dev\.vars" ; echo "fim da varredura"
```

Esperado: nenhuma linha antes de "fim da varredura". Saída vazia só vale se você estiver **na raiz do repositório** — confira com `pwd`.

- [ ] **Step 7: Publicar**

```bash
cd backend && npm run deploy
```

- [ ] **Step 8: Verificar em produção**

```bash
curl -s -o /dev/null -w "%{http_code}\n" https://cobranca-backend.juridicoagio01.workers.dev/api/credores
```

Esperado: **401**. Toda rota nova continua atrás da autenticação.

```bash
curl -s https://cobranca-backend.juridicoagio01.workers.dev/saude
```

Esperado: `{"ok":true,"ambiente":"teste"}`.

O caminho autenticado em produção só o usuário consegue verificar — ele tem o `PAINEL_TOKEN`, você não. Peça a ele para abrir o painel e confirmar o seletor de credor.

- [ ] **Step 9: Commit final e registro na memória**

```bash
git add -A && git commit -m "Fase 3 no ar: multi-credor com separacao de carteira" && git push
```

Atualize `~/.claude/projects/C--Users-thesc-OneDrive-Documentos-GitHub-Plataforma-Cobran-a/memory/plataforma-cobranca-fases.md` com: a Fase 3 entregue, o credor padrão `credor-padrao`, e a decisão de que pausa global e não-perturbe são globais por compartilharem o número de WhatsApp.

---

## Self-review

**Cobertura dos requisitos:**

| Pedido | Tarefa |
|---|---|
| Cada devedor e cada dívida pertence a um credor | Task 2 |
| Nenhuma consulta mistura carteiras — inclusive painel e API | Tasks 3, 5, 7 + teste-guarda |
| Regras por credor: desconto, parcelamento, comissão | Tasks 1, 5, 8 |
| Terreno pronto para login de credor | Task 4 |
| Migrar o que existe para um credor padrão, sem perder nada | Tasks 1, 3, 9 |
| Pausa global ligada durante tudo | Global Constraints + Task 9 Step 1 |

**Importação:** por comando (`curl` no endpoint `POST /api/importar`), por
decisão sua. Não há botão de upload no painel. Cada carteira nova exige um
comando — quando a área de vendas trouxer credores em ritmo que torne isso
incômodo, o botão vira uma tarefa de meia hora sobre o endpoint que já
existe.

**Fora de escopo, de propósito:** login de credor (só a porta fica aberta); cálculo e fechamento de comissão (a regra fica gravada, o cálculo é outra fase); autorizar a IA a oferecer desconto dentro da política — o bloqueio duro da Fase 2 continua valendo.
