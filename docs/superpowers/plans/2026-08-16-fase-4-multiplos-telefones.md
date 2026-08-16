# Fase 4 — Múltiplos telefones e descoberta de WhatsApp: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Um devedor passa a ter até 5 telefones, cada um com status de WhatsApp descoberto de graça — pelo formato do número antes de tentar, e pelo recibo de entrega da Meta depois de tentar — com disparo de um número por vez, na ordem de prioridade, parando no primeiro que entregar.

**Architecture:** Uma tabela `telefones` ligada ao devedor guarda status e prioridade. Um classificador puro separa celular de fixo pelo formato, sem custo nenhum, e monta a prioridade inicial. O webhook passa a ler o array `statuses` que a Meta já envia, e cada recibo `delivered` ou `failed` volta ao telefone que o originou por uma tabela de tentativas que guarda o `id_externo` devolvido no envio. Uma máquina de escalonamento decide qual telefone tentar em seguida — e nunca dois ao mesmo tempo.

**Tech Stack:** Cloudflare Workers, D1, TypeScript com type-stripping nativo do Node 24, wrangler 3, painel em HTML/CSS/JS puro.

**Spec:** este documento — seções "Correção sobre a assinatura do webhook" e "Decisões de projeto".

**Depende de:** `docs/superpowers/plans/2026-08-16-fase-3-multi-credor.md`, concluído. A tabela `telefones` referencia `devedores`, que a Fase 3 cria.

---

## Global Constraints

- **A pausa global fica LIGADA durante toda a Fase 4.** Nenhuma tarefa a desliga. Nenhuma mensagem sai para número real.
- Nenhum telefone real entra em arquivo do repositório, em teste ou em fixture. Use a faixa fictícia `5535900000001` em diante.
- Credenciais só de variável de ambiente. `.env` e `.dev.vars` nunca rastreados.
- Ao final de cada tarefa: testes, varredura de segredos a partir da raiz, commit e push.
- Nenhuma dependência nova. Nenhum passo de build no painel.
- Código e comentários em português sem acento; texto de tela com acento.
- Modo de falha é sempre **não enviar**.

---

## Correção sobre a assinatura do webhook

O pedido diz "assinar também o campo `message_status`". Não existe esse campo separado no webhook da WhatsApp Business Account. Os recibos de entrega chegam **dentro do mesmo campo `messages` que já está assinado**, num array irmão:

```json
{ "entry": [ { "changes": [ { "field": "messages", "value": {
  "messages": [ ... ],
  "statuses": [ { "id": "wamid...", "status": "delivered", "recipient_id": "5535...",
                  "timestamp": "...", "errors": [ { "code": 131026, "title": "..." } ] } ]
} } ] } ] }
```

Hoje o `webhook.ts` lê `value.messages` e **descarta `value.statuses` em silêncio** — os recibos já estão chegando e sendo jogados fora. Não há nada a assinar: há um array a ler. Isso torna a Task 4 mais barata do que o pedido supunha.

**Uma coisa para conferir no painel da Meta**, que só o usuário consegue: em *WhatsApp → Configuration → Webhook fields*, o campo `messages` precisa estar assinado (já está, foi o que resolveu o problema na Fase 2). Se aparecer alguma chave separada para status na interface, ligar não faz mal — mas não é ela que faz os recibos chegarem.

---

## Decisões de projeto

**1. O filtro grátis despriorriza, não elimina.** Fixo entra na tabela com prioridade pior, não fora dela. Fixo com WhatsApp Business existe, é raro, e apagar o número perderia a informação de que ele foi cadastrado. Só tentamos depois de esgotar os celulares.

**2. Só `delivered` e `read` provam WhatsApp. `sent` não prova nada** — significa apenas que a Meta aceitou a requisição. Marcar `tem_whatsapp` no `sent` encerraria o escalonamento no primeiro número, que é exatamente o defeito que esta fase existe para corrigir.

**3. Nem todo `failed` significa "não tem WhatsApp".** O código do erro decide. `131026` (mensagem não entregável) é evidência de que o número não recebe WhatsApp. Já `131047` (é preciso reengajar, fora da janela de 24 h) **prova o contrário**: o número existe no WhatsApp, só não pode receber texto livre agora. Confundir os dois marcaria como morto um telefone bom. Código desconhecido não muda status nenhum — apenas registra.

**4. Uma tentativa em aberto por devedor, no máximo.** O escalonamento é uma fila, não um leque. Enquanto houver tentativa sem recibo, nenhum outro telefone é tentado. É isso que impede o disparo para 5 números de uma vez.

**5. Tentativa sem recibo não trava a fila para sempre.** O cron destrava tentativas com mais de 60 minutos sem resposta, marcando-as `sem_recibo` — o telefone **não** vira `sem_whatsapp`, continua `desconhecido`, e a fila anda. Silêncio da Meta não é prova de nada.

**6. Toda tentativa vai para a auditoria, entregue ou não.** Mensagem não entregue não gera cobrança de conversa, então testar número ruim custa zero em dinheiro — mas custa nota de qualidade no número, e a única forma de perceber isso a tempo é ter o registro.

**7. A Fase 4 não liga o disparo em lote.** O cron continua sem enviar nada; ele só destrava fila e classifica. Quem dispara é o mesmo caminho da Fase 2, ainda atrás do portão e da pausa global.

---

## Estrutura de arquivos

**Criar:**

| Arquivo | Responsabilidade |
|---|---|
| `backend/migracoes/0005_telefones.sql` | `telefones` e `tentativas_contato` + backfill |
| `backend/src/dominio/telefone.ts` | Classificação de formato e prioridade — puro |
| `backend/src/dominio/erros-meta.ts` | Código de erro da Meta → efeito no status |
| `backend/src/db/telefones.ts` | Leitura/escrita de telefones e tentativas |
| `backend/src/dominio/escalonamento.ts` | Qual telefone tentar em seguida — puro |
| `backend/src/whatsapp/recibos.ts` | Interpreta `value.statuses` |
| `backend/testes/telefone.test.ts` | Classificação e prioridade |
| `backend/testes/erros-meta.test.ts` | Mapa de erros |
| `backend/testes/escalonamento.test.ts` | Máquina de fila |
| `backend/testes/recibos.test.ts` | Parsing dos recibos |

**Modificar:** `backend/src/whatsapp/webhook.ts`, `backend/src/index.ts` (cron), `backend/src/cobmais/importar.ts`, `backend/src/api/painel.ts`, `detalhe-cliente.js`, `estilos.css`.

---

### Task 1: Classificar telefone pelo formato, de graça

**Files:**
- Create: `backend/src/dominio/telefone.ts`
- Create: `backend/testes/telefone.test.ts`

**Interfaces:**
- Consumes: `normalizarNumero` de `../destinatarios.ts`.
- Produces:
  - `type TipoTelefone = 'celular' | 'fixo' | 'invalido'`
  - `type StatusTelefone = 'desconhecido' | 'tem_whatsapp' | 'sem_whatsapp' | 'invalido'`
  - `function classificarTelefone(bruto: string): TipoTelefone`
  - `function prioridadeInicial(tipo: TipoTelefone, ordemDeCadastro: number): number`
  - `const LIMITE_TELEFONES = 5`

- [ ] **Step 1: Escrever o teste (vai falhar)**

`backend/testes/telefone.test.ts`:

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { classificarTelefone, prioridadeInicial, LIMITE_TELEFONES } from '../src/dominio/telefone.ts';

// Todos os numeros abaixo sao FICTICIOS.
test('celular brasileiro de 9 digitos comecando com 9 e celular', () => {
  assert.equal(classificarTelefone('5535900000001'), 'celular');
  assert.equal(classificarTelefone('+55 (35) 90000-0001'), 'celular');
});

test('fixo de 8 digitos e fixo', () => {
  assert.equal(classificarTelefone('553530000001'), 'fixo');
});

test('nove digitos que nao comecam com 9 e fixo, nao celular', () => {
  // 55 35 800000001 — nono digito presente mas assinante comeca com 8.
  assert.equal(classificarTelefone('5535800000001'), 'fixo');
});

test('numero curto demais e invalido', () => {
  assert.equal(classificarTelefone('5535900'), 'invalido');
  assert.equal(classificarTelefone(''), 'invalido');
});

test('numero longo demais e invalido', () => {
  assert.equal(classificarTelefone('553590000000123456'), 'invalido');
});

test('numero de outro pais nao e chutado como fixo brasileiro', () => {
  // 351 e Portugal. Sem regra local, entra como celular para nao
  // despriorizar por engano quem esta fora do Brasil.
  assert.equal(classificarTelefone('351912345678'), 'celular');
});

test('celular tem prioridade melhor que fixo', () => {
  assert.ok(prioridadeInicial('celular', 0) < prioridadeInicial('fixo', 0));
});

test('entre dois celulares vale a ordem de cadastro', () => {
  assert.ok(prioridadeInicial('celular', 0) < prioridadeInicial('celular', 1));
});

test('o ultimo celular ainda vem antes do primeiro fixo', () => {
  assert.ok(prioridadeInicial('celular', LIMITE_TELEFONES - 1) < prioridadeInicial('fixo', 0));
});

test('invalido fica atras de tudo', () => {
  assert.ok(prioridadeInicial('invalido', 0) > prioridadeInicial('fixo', LIMITE_TELEFONES - 1));
});
```

- [ ] **Step 2: Rodar e confirmar a falha**

```bash
cd backend && npm run teste
```

Esperado: módulo não encontrado.

- [ ] **Step 3: Implementar**

`backend/src/dominio/telefone.ts`:

```ts
import { normalizarNumero } from '../destinatarios.ts';

export type TipoTelefone = 'celular' | 'fixo' | 'invalido';
export type StatusTelefone = 'desconhecido' | 'tem_whatsapp' | 'sem_whatsapp' | 'invalido';

// Cinco e o teto que o cadastro do Cobmais traz. Mais que isso, alguem
// digitou errado.
export const LIMITE_TELEFONES = 5;

// Filtro que nao custa nada: celular brasileiro tem 9 digitos de assinante
// comecando com 9, e praticamente todo celular brasileiro tem WhatsApp.
// Fixo nao deixa de ser tentado — so vai para o fim da fila.
export function classificarTelefone(bruto: string): TipoTelefone {
  const d = normalizarNumero(bruto);
  if (d.length < 10 || d.length > 15) return 'invalido';

  if (!d.startsWith('55')) {
    // Sem regra local para outros paises, nao ha como distinguir. Chutar
    // 'fixo' despriorizaria um numero possivelmente bom.
    return 'celular';
  }

  const assinante = d.slice(4);
  if (assinante.length === 9) return assinante.startsWith('9') ? 'celular' : 'fixo';
  if (assinante.length === 8) return 'fixo';
  return 'invalido';
}

// Faixas separadas por tipo, com espaco para o LIMITE_TELEFONES de cada
// uma: assim nenhum fixo consegue passar na frente de um celular por causa
// da ordem de cadastro.
const BASE: Record<TipoTelefone, number> = { celular: 100, fixo: 200, invalido: 900 };

export function prioridadeInicial(tipo: TipoTelefone, ordemDeCadastro: number): number {
  const posicao = Math.min(Math.max(ordemDeCadastro, 0), LIMITE_TELEFONES - 1);
  return BASE[tipo] + posicao;
}
```

- [ ] **Step 4: Rodar os testes**

```bash
cd backend && npm run teste
```

Esperado: os 10 novos passam.

- [ ] **Step 5: Commit**

```bash
git add backend/src/dominio/telefone.ts backend/testes/telefone.test.ts && git commit -m "Classifica telefone por formato e define a prioridade inicial" && git push
```

---

### Task 2: Traduzir código de erro da Meta em efeito

**Files:**
- Create: `backend/src/dominio/erros-meta.ts`
- Create: `backend/testes/erros-meta.test.ts`

**Interfaces:**
- Consumes: `StatusTelefone` da Task 1.
- Produces: `function efeitoDoErro(codigo: number | null): { novoStatus: StatusTelefone | null; motivo: string }`.

- [ ] **Step 1: Escrever o teste (vai falhar)**

`backend/testes/erros-meta.test.ts`:

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { efeitoDoErro } from '../src/dominio/erros-meta.ts';

test('mensagem nao entregavel marca o telefone como sem whatsapp', () => {
  assert.equal(efeitoDoErro(131026).novoStatus, 'sem_whatsapp');
});

test('erro de reengajamento NAO marca sem whatsapp', () => {
  // 131047 significa "fora da janela de 24 horas". O numero existe no
  // WhatsApp; marca-lo como morto perderia um telefone bom para sempre.
  const efeito = efeitoDoErro(131047);
  assert.equal(efeito.novoStatus, null);
  assert.match(efeito.motivo, /janela/i);
});

test('remetente igual ao destinatario e cadastro invalido', () => {
  assert.equal(efeitoDoErro(131021).novoStatus, 'invalido');
});

test('codigo desconhecido nao muda status nenhum', () => {
  const efeito = efeitoDoErro(999999);
  assert.equal(efeito.novoStatus, null);
  assert.match(efeito.motivo, /desconhecido/i);
});

test('falha sem codigo nao muda status', () => {
  assert.equal(efeitoDoErro(null).novoStatus, null);
});

test('erro de template nao condena o telefone', () => {
  // 132001: template inexistente. O problema e nosso, nao do numero.
  assert.equal(efeitoDoErro(132001).novoStatus, null);
});
```

- [ ] **Step 2: Rodar e confirmar a falha**

```bash
cd backend && npm run teste
```

- [ ] **Step 3: Implementar**

`backend/src/dominio/erros-meta.ts`:

```ts
import type { StatusTelefone } from './telefone.ts';

export interface EfeitoDoErro {
  novoStatus: StatusTelefone | null;
  motivo: string;
}

// Lista curta e explicita. O default e NAO mexer no status: condenar um
// telefone por engano custa um devedor que nunca mais e contatado, e o
// erro nao aparece em lugar nenhum depois.
const MAPA = new Map<number, EfeitoDoErro>([
  [131026, { novoStatus: 'sem_whatsapp', motivo: 'mensagem nao entregavel: destinatario nao recebe WhatsApp' }],
  [131021, { novoStatus: 'invalido', motivo: 'remetente e destinatario iguais: cadastro invalido' }],
  [131047, { novoStatus: null, motivo: 'fora da janela de 24 horas: o numero tem WhatsApp, so exige template' }],
  [131051, { novoStatus: null, motivo: 'tipo de mensagem nao suportado: problema nosso, nao do numero' }],
  [132001, { novoStatus: null, motivo: 'template inexistente ou nao aprovado: problema nosso' }],
  [132000, { novoStatus: null, motivo: 'parametros do template nao batem: problema nosso' }],
  [130429, { novoStatus: null, motivo: 'limite de envio atingido: tentar de novo depois' }],
]);

export function efeitoDoErro(codigo: number | null): EfeitoDoErro {
  if (codigo === null) return { novoStatus: null, motivo: 'falha sem codigo de erro' };
  return (
    MAPA.get(codigo) ?? {
      novoStatus: null,
      motivo: `codigo de erro desconhecido (${codigo}): status preservado`,
    }
  );
}
```

- [ ] **Step 4: Rodar os testes e commitar**

```bash
cd backend && npm run teste
```

```bash
git add backend/src/dominio/erros-meta.ts backend/testes/erros-meta.test.ts && git commit -m "Traduz codigo de erro da Meta em efeito sobre o status do telefone" && git push
```

---

### Task 3: Tabelas de telefones e tentativas

**Files:**
- Create: `backend/migracoes/0005_telefones.sql`
- Create: `backend/src/db/telefones.ts`
- Modify: `backend/src/cobmais/importar.ts`

**Interfaces:**
- Consumes: `CredorId`, `classificarTelefone`, `prioridadeInicial`, `LIMITE_TELEFONES`.
- Produces:
  - `interface TelefoneDoDevedor { id: number; devedorId: string; credorId: CredorId; numero: string; status: StatusTelefone; prioridade: number; ultimaTentativa: string | null; ultimoMotivo: string | null }`
  - `async function cadastrarTelefones(db, credorId, devedorId, numeros: string[]): Promise<number>`
  - `async function telefonesDoDevedor(db, credorId, devedorId): Promise<TelefoneDoDevedor[]>`
  - `async function definirStatusTelefone(db, telefoneId: number, status: StatusTelefone, motivo: string): Promise<void>`
  - `async function abrirTentativa(db, credorId, devedorId, telefoneId, idExterno: string): Promise<void>`
  - `async function tentativaAberta(db, devedorId): Promise<{ id: number; telefoneId: number } | null>`
  - `async function fecharTentativa(db, idExterno: string, desfecho: string): Promise<{ telefoneId: number } | null>`

- [ ] **Step 1: Escrever a migração**

`backend/migracoes/0005_telefones.sql`:

```sql
-- Um devedor tem ate 5 telefones. O credor_id e repetido aqui, e nao so
-- herdado do devedor, para que toda consulta possa filtrar carteira
-- diretamente — e o mesmo motivo da tabela de dividas.
CREATE TABLE IF NOT EXISTS telefones (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  devedor_id TEXT NOT NULL REFERENCES devedores (id),
  credor_id TEXT NOT NULL REFERENCES credores (id),
  numero TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'desconhecido'
    CHECK (status IN ('desconhecido', 'tem_whatsapp', 'sem_whatsapp', 'invalido')),
  prioridade INTEGER NOT NULL,
  ultima_tentativa TEXT,
  ultimo_motivo TEXT,
  criado_em TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_telefones_unicos ON telefones (devedor_id, numero);
CREATE INDEX IF NOT EXISTS idx_telefones_fila ON telefones (devedor_id, prioridade);
CREATE INDEX IF NOT EXISTS idx_telefones_numero ON telefones (numero);

-- Uma tentativa por vez, por devedor. O id_externo e o wamid devolvido
-- pela Meta no envio: e por ele que o recibo volta ao telefone certo.
CREATE TABLE IF NOT EXISTS tentativas_contato (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  devedor_id TEXT NOT NULL REFERENCES devedores (id),
  credor_id TEXT NOT NULL REFERENCES credores (id),
  telefone_id INTEGER NOT NULL REFERENCES telefones (id),
  id_externo TEXT NOT NULL,
  aberta_em TEXT NOT NULL,
  fechada_em TEXT,
  desfecho TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_tentativas_externo ON tentativas_contato (id_externo);
CREATE INDEX IF NOT EXISTS idx_tentativas_abertas
  ON tentativas_contato (devedor_id, fechada_em);

-- Backfill: o telefone unico que cada devedor tem hoje vira o telefone de
-- prioridade 100. A classificacao real acontece na primeira execucao do
-- cron; aqui nao da para chamar codigo TypeScript.
INSERT OR IGNORE INTO telefones (devedor_id, credor_id, numero, status, prioridade, criado_em)
SELECT id, credor_id, telefone, 'desconhecido', 100, '2026-08-16T00:00:00.000Z'
FROM devedores;
```

- [ ] **Step 2: Implementar o repositório**

`backend/src/db/telefones.ts`:

```ts
import type { CredorId } from '../dominio/credor.ts';
import type { StatusTelefone } from '../dominio/telefone.ts';
import { classificarTelefone, prioridadeInicial, LIMITE_TELEFONES } from '../dominio/telefone.ts';
import { normalizarNumero } from '../destinatarios.ts';

export interface TelefoneDoDevedor {
  id: number;
  devedorId: string;
  credorId: CredorId;
  numero: string;
  status: StatusTelefone;
  prioridade: number;
  ultimaTentativa: string | null;
  ultimoMotivo: string | null;
}

function daLinha(l: Record<string, string | number | null>): TelefoneDoDevedor {
  return {
    id: Number(l.id),
    devedorId: String(l.devedor_id),
    credorId: String(l.credor_id) as CredorId,
    numero: String(l.numero),
    status: String(l.status) as StatusTelefone,
    prioridade: Number(l.prioridade),
    ultimaTentativa: l.ultima_tentativa === null ? null : String(l.ultima_tentativa),
    ultimoMotivo: l.ultimo_motivo === null ? null : String(l.ultimo_motivo),
  };
}

export async function cadastrarTelefones(
  db: D1Database,
  credorId: CredorId,
  devedorId: string,
  numeros: string[],
): Promise<number> {
  const agora = new Date().toISOString();
  // Repetido na planilha nao vira duas linhas, e o teto de 5 e aplicado
  // aqui e nao so no banco, para o resto entrar na auditoria.
  const unicos = [...new Set(numeros.map(normalizarNumero).filter((n) => n.length > 0))];
  let gravados = 0;

  for (const [ordem, numero] of unicos.slice(0, LIMITE_TELEFONES).entries()) {
    const tipo = classificarTelefone(numero);
    await db
      .prepare(
        `INSERT OR IGNORE INTO telefones
          (devedor_id, credor_id, numero, status, prioridade, criado_em)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        devedorId,
        credorId,
        numero,
        // Formato quebrado ja nasce invalido: nunca sera tentado.
        tipo === 'invalido' ? 'invalido' : 'desconhecido',
        prioridadeInicial(tipo, ordem),
        agora,
      )
      .run();
    gravados += 1;
  }

  return gravados;
}

export async function telefonesDoDevedor(
  db: D1Database,
  credorId: CredorId,
  devedorId: string,
): Promise<TelefoneDoDevedor[]> {
  const { results } = await db
    .prepare(
      `SELECT id, devedor_id, credor_id, numero, status, prioridade, ultima_tentativa, ultimo_motivo
       FROM telefones WHERE credor_id = ? AND devedor_id = ? ORDER BY prioridade`,
    )
    .bind(credorId, devedorId)
    .all<Record<string, string | number | null>>();
  return results.map(daLinha);
}

export async function definirStatusTelefone(
  db: D1Database,
  telefoneId: number,
  status: StatusTelefone,
  motivo: string,
): Promise<void> {
  await db
    .prepare('UPDATE telefones SET status = ?, ultimo_motivo = ? WHERE id = ?')
    .bind(status, motivo.slice(0, 300), telefoneId)
    .run();
}

export async function abrirTentativa(
  db: D1Database,
  credorId: CredorId,
  devedorId: string,
  telefoneId: number,
  idExterno: string,
): Promise<void> {
  const agora = new Date().toISOString();
  await db
    .prepare(
      `INSERT INTO tentativas_contato
        (devedor_id, credor_id, telefone_id, id_externo, aberta_em)
       VALUES (?, ?, ?, ?, ?)`,
    )
    .bind(devedorId, credorId, telefoneId, idExterno, agora)
    .run();
  await db
    .prepare('UPDATE telefones SET ultima_tentativa = ? WHERE id = ?')
    .bind(agora, telefoneId)
    .run();
}

export async function tentativaAberta(
  db: D1Database,
  devedorId: string,
): Promise<{ id: number; telefoneId: number } | null> {
  const l = await db
    .prepare(
      `SELECT id, telefone_id FROM tentativas_contato
       WHERE devedor_id = ? AND fechada_em IS NULL ORDER BY aberta_em DESC LIMIT 1`,
    )
    .bind(devedorId)
    .first<{ id: number; telefone_id: number }>();
  return l ? { id: Number(l.id), telefoneId: Number(l.telefone_id) } : null;
}

// O recibo chega com o wamid, nao com o id da tentativa. Devolve o telefone
// para quem chamou aplicar o efeito do status.
export async function fecharTentativa(
  db: D1Database,
  idExterno: string,
  desfecho: string,
): Promise<{ telefoneId: number } | null> {
  const l = await db
    .prepare('SELECT id, telefone_id FROM tentativas_contato WHERE id_externo = ?')
    .bind(idExterno)
    .first<{ id: number; telefone_id: number }>();
  if (!l) return null;

  await db
    .prepare('UPDATE tentativas_contato SET fechada_em = ?, desfecho = ? WHERE id = ?')
    .bind(new Date().toISOString(), desfecho.slice(0, 200), l.id)
    .run();
  return { telefoneId: Number(l.telefone_id) };
}
```

- [ ] **Step 3: Ligar na importação do Cobmais**

Em `backend/src/cobmais/importar.ts`, a interface `Cliente` ganha os telefones extras. Substitua a desestruturação e o retorno de `interpretarCsv`:

```ts
export interface Cliente {
  nome: string;
  telefone: string;
  telefonesExtras: string[];
  valorCentavos: number;
  vencimento: string;
}
```

```ts
    const colunas = linha.split(';');
    const [nome, telefoneBruto, valorBruto, vencimentoBruto] = colunas;
    // Colunas 5 em diante sao telefones adicionais, ate o teto de 5 no
    // total. Planilha sem essas colunas continua funcionando.
    const extras = colunas.slice(4).map((c) => normalizarNumero(c)).filter((c) => c.length >= 10);
```

e no objeto devolvido, `telefonesExtras: extras,`.

Em `importarParaCarteira`, depois de obter `devedorId`:

```ts
    await cadastrarTelefones(db, credorId, devedorId, [
      cliente.telefone,
      ...cliente.telefonesExtras,
    ]);
```

Ajuste os testes existentes de `importar.test.ts` que comparam o objeto inteiro — eles vão falhar por causa do campo novo. Acrescente também:

```ts
test('colunas extras viram telefones adicionais', () => {
  const csv = [
    'nome;telefone;valor;vencimento;tel2;tel3',
    'Ana Ficticia;5535900000001;10,00;10/09/2026;553530000002;5535900000003',
  ].join('\n');
  assert.deepEqual(interpretarCsv(csv)[0].telefonesExtras, ['553530000002', '5535900000003']);
});

test('coluna extra vazia nao vira telefone', () => {
  const csv = ['nome;telefone;valor;vencimento;tel2', 'Ana Ficticia;5535900000001;10,00;10/09/2026;'].join('\n');
  assert.deepEqual(interpretarCsv(csv)[0].telefonesExtras, []);
});
```

- [ ] **Step 4: Rodar tudo**

```bash
cd backend && npm run teste && npx tsc --noEmit
```

- [ ] **Step 5: Aplicar a migração e conferir o backfill**

```bash
cd backend && npm run migrar && npx wrangler d1 execute cobranca --local --command "SELECT t.numero, t.status, t.prioridade FROM telefones t ORDER BY t.prioridade"
```

Esperado: um telefone por devedor existente, `desconhecido`, prioridade 100.

- [ ] **Step 6: Commit**

```bash
git add backend/migracoes/0005_telefones.sql backend/src/db/telefones.ts backend/src/cobmais/importar.ts backend/testes/importar.test.ts && git commit -m "Modela varios telefones por devedor e importa as colunas extras da planilha" && git push
```

---

### Task 4: Ler os recibos que já estão chegando

**Files:**
- Create: `backend/src/whatsapp/recibos.ts`
- Create: `backend/testes/recibos.test.ts`
- Modify: `backend/src/whatsapp/webhook.ts`

**Interfaces:**
- Consumes: `efeitoDoErro`, `fecharTentativa`, `definirStatusTelefone`, `registrarAuditoria`.
- Produces:
  - `interface Recibo { idExterno: string; destinatario: string; status: 'sent' | 'delivered' | 'read' | 'failed'; codigoErro: number | null }`
  - `function extrairRecibos(corpo: unknown): Recibo[]`
  - `async function processarRecibo(db, recibo: Recibo): Promise<void>`

- [ ] **Step 1: Escrever o teste (vai falhar)**

`backend/testes/recibos.test.ts`:

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { extrairRecibos } from '../src/whatsapp/recibos.ts';

function envelope(statuses: unknown[]) {
  return { entry: [{ changes: [{ field: 'messages', value: { statuses } }] }] };
}

test('recibo de entrega e extraido', () => {
  const r = extrairRecibos(
    envelope([{ id: 'wamid.AAA', status: 'delivered', recipient_id: '5535900000001' }]),
  );
  assert.deepEqual(r, [
    { idExterno: 'wamid.AAA', destinatario: '5535900000001', status: 'delivered', codigoErro: null },
  ]);
});

test('recibo de falha traz o codigo do erro', () => {
  const r = extrairRecibos(
    envelope([
      {
        id: 'wamid.BBB',
        status: 'failed',
        recipient_id: '5535900000002',
        errors: [{ code: 131026, title: 'Message undeliverable' }],
      },
    ]),
  );
  assert.equal(r[0].codigoErro, 131026);
});

test('envelope so com mensagens nao produz recibo', () => {
  const r = extrairRecibos({
    entry: [{ changes: [{ value: { messages: [{ from: '5535900000001', id: 'x' }] } }] }],
  });
  assert.deepEqual(r, []);
});

test('status desconhecido e descartado em vez de virar recibo torto', () => {
  const r = extrairRecibos(envelope([{ id: 'wamid.CCC', status: 'inventado', recipient_id: '55' }]));
  assert.deepEqual(r, []);
});

test('recibo sem id e descartado', () => {
  const r = extrairRecibos(envelope([{ status: 'delivered', recipient_id: '5535900000001' }]));
  assert.deepEqual(r, []);
});

test('corpo vazio ou torto nao lanca', () => {
  assert.deepEqual(extrairRecibos(null), []);
  assert.deepEqual(extrairRecibos({}), []);
  assert.deepEqual(extrairRecibos({ entry: 'nao e array' }), []);
});

test('varios recibos no mesmo envelope saem todos', () => {
  const r = extrairRecibos(
    envelope([
      { id: 'wamid.A', status: 'sent', recipient_id: '5535900000001' },
      { id: 'wamid.B', status: 'read', recipient_id: '5535900000002' },
    ]),
  );
  assert.equal(r.length, 2);
});
```

- [ ] **Step 2: Rodar e confirmar a falha**

```bash
cd backend && npm run teste
```

- [ ] **Step 3: Implementar**

`backend/src/whatsapp/recibos.ts`:

```ts
import { efeitoDoErro } from '../dominio/erros-meta.ts';
import { definirStatusTelefone, fecharTentativa } from '../db/telefones.ts';
import { registrarAuditoria } from '../dominio/travas.ts';

export interface Recibo {
  idExterno: string;
  destinatario: string;
  status: 'sent' | 'delivered' | 'read' | 'failed';
  codigoErro: number | null;
}

const CONHECIDOS = new Set(['sent', 'delivered', 'read', 'failed']);

// A Meta ja manda os recibos no mesmo campo 'messages' que recebemos hoje,
// no array irmao 'statuses'. Ate agora eles vinham e eram descartados.
export function extrairRecibos(corpo: unknown): Recibo[] {
  const dados = corpo as {
    entry?: Array<{ changes?: Array<{ value?: { statuses?: unknown[] } }> }>;
  } | null;

  const entradas = Array.isArray(dados?.entry) ? dados!.entry : [];

  return entradas.flatMap((e) =>
    (Array.isArray(e?.changes) ? e.changes : []).flatMap((c) =>
      (Array.isArray(c?.value?.statuses) ? c.value!.statuses! : []).flatMap((bruto) => {
        const s = bruto as {
          id?: string;
          status?: string;
          recipient_id?: string;
          errors?: Array<{ code?: number }>;
        };
        if (!s.id || !s.status || !CONHECIDOS.has(s.status)) return [];
        return [
          {
            idExterno: s.id,
            destinatario: String(s.recipient_id ?? ''),
            status: s.status as Recibo['status'],
            codigoErro: s.errors?.[0]?.code ?? null,
          },
        ];
      }),
    ),
  );
}

export async function processarRecibo(db: D1Database, recibo: Recibo): Promise<void> {
  // 'sent' significa apenas que a Meta aceitou. Nao prova WhatsApp e nao
  // fecha a tentativa: fechar aqui encerraria o escalonamento no primeiro
  // numero, que e o defeito que esta fase corrige.
  if (recibo.status === 'sent') {
    await registrarAuditoria(db, {
      acao: 'recibo-aceito',
      telefone: recibo.destinatario,
      detalhe: recibo.idExterno,
    });
    return;
  }

  const fechada = await fecharTentativa(db, recibo.idExterno, recibo.status);
  if (!fechada) {
    // Recibo de mensagem que nao saiu de uma tentativa nossa (resposta da
    // IA, por exemplo). Registrar e suficiente.
    await registrarAuditoria(db, {
      acao: 'recibo-sem-tentativa',
      telefone: recibo.destinatario,
      detalhe: `${recibo.status} para ${recibo.idExterno}`,
    });
    return;
  }

  if (recibo.status === 'delivered' || recibo.status === 'read') {
    await definirStatusTelefone(db, fechada.telefoneId, 'tem_whatsapp', `recibo ${recibo.status}`);
    await registrarAuditoria(db, {
      acao: 'telefone-confirmado',
      telefone: recibo.destinatario,
      detalhe: `entregue: tem WhatsApp (${recibo.status})`,
    });
    return;
  }

  const efeito = efeitoDoErro(recibo.codigoErro);
  if (efeito.novoStatus) {
    await definirStatusTelefone(db, fechada.telefoneId, efeito.novoStatus, efeito.motivo);
  }
  await registrarAuditoria(db, {
    acao: efeito.novoStatus ? 'telefone-descartado' : 'falha-sem-efeito-no-telefone',
    telefone: recibo.destinatario,
    detalhe: efeito.motivo,
  });
}
```

- [ ] **Step 4: Ligar no webhook**

Em `backend/src/whatsapp/webhook.ts`, depois do `JSON.parse` e **antes** do laço de mensagens:

```ts
import { extrairRecibos, processarRecibo } from './recibos.ts';
```

```ts
  // Os recibos chegam no mesmo POST das mensagens. Ficam fora do caminho
  // da resposta pelo mesmo motivo: a Meta reenvia o webhook se demorarmos.
  for (const recibo of extrairRecibos(dados)) {
    ctx.waitUntil(
      processarRecibo(db, recibo).catch(async (erro) => {
        await registrarAuditoria(db, {
          acao: 'erro-ao-processar-recibo',
          telefone: recibo.destinatario,
          detalhe: String(erro).slice(0, 300),
        }).catch(() => {});
      }),
    );
  }
```

Amplie o tipo `EntradaWebhook` para incluir `statuses?: unknown[]` no `value`.

- [ ] **Step 5: Rodar tudo**

```bash
cd backend && npm run teste && npx tsc --noEmit
```

Esperado: os 7 novos passam.

- [ ] **Step 6: Commit**

```bash
git add backend/src/whatsapp/recibos.ts backend/testes/recibos.test.ts backend/src/whatsapp/webhook.ts && git commit -m "Le os recibos de entrega que a Meta ja envia e classifica o telefone" && git push
```

---

### Task 5: Máquina de escalonamento — um telefone por vez

**Files:**
- Create: `backend/src/dominio/escalonamento.ts`
- Create: `backend/testes/escalonamento.test.ts`

**Interfaces:**
- Consumes: `StatusTelefone`.
- Produces:
  - `interface CandidatoTelefone { id: number; numero: string; status: StatusTelefone; prioridade: number }`
  - `type Decisao = { acao: 'tentar'; telefone: CandidatoTelefone } | { acao: 'esperar'; motivo: string } | { acao: 'desistir'; motivo: string }`
  - `function proximoPasso(telefones: CandidatoTelefone[], temTentativaAberta: boolean): Decisao`

- [ ] **Step 1: Escrever o teste (vai falhar)**

`backend/testes/escalonamento.test.ts`:

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { proximoPasso } from '../src/dominio/escalonamento.ts';

const cel1 = { id: 1, numero: '5535900000001', status: 'desconhecido' as const, prioridade: 100 };
const cel2 = { id: 2, numero: '5535900000002', status: 'desconhecido' as const, prioridade: 101 };
const fixo = { id: 3, numero: '553530000003', status: 'desconhecido' as const, prioridade: 200 };

test('tenta o de melhor prioridade primeiro', () => {
  const d = proximoPasso([fixo, cel2, cel1], false);
  assert.deepEqual(d, { acao: 'tentar', telefone: cel1 });
});

test('nunca tenta um segundo enquanto o primeiro nao respondeu', () => {
  const d = proximoPasso([cel1, cel2], true);
  assert.equal(d.acao, 'esperar');
});

test('telefone ja confirmado vence a prioridade', () => {
  // Descobrir custa caro; nao gastar tentativa em quem ja provou.
  const confirmado = { ...fixo, status: 'tem_whatsapp' as const };
  const d = proximoPasso([cel1, cel2, confirmado], false);
  assert.deepEqual(d, { acao: 'tentar', telefone: confirmado });
});

test('telefone sem whatsapp nunca mais e tentado', () => {
  const morto = { ...cel1, status: 'sem_whatsapp' as const };
  const d = proximoPasso([morto, cel2], false);
  assert.deepEqual(d, { acao: 'tentar', telefone: cel2 });
});

test('telefone invalido nunca e tentado', () => {
  const invalido = { ...cel1, status: 'invalido' as const };
  const d = proximoPasso([invalido, cel2], false);
  assert.deepEqual(d, { acao: 'tentar', telefone: cel2 });
});

test('todos descartados: desiste em vez de tentar de novo', () => {
  const d = proximoPasso(
    [
      { ...cel1, status: 'sem_whatsapp' as const },
      { ...cel2, status: 'invalido' as const },
    ],
    false,
  );
  assert.equal(d.acao, 'desistir');
});

test('devedor sem telefone nenhum desiste', () => {
  assert.equal(proximoPasso([], false).acao, 'desistir');
});

test('fixo e tentado depois que os celulares se esgotam', () => {
  const d = proximoPasso([{ ...cel1, status: 'sem_whatsapp' as const }, fixo], false);
  assert.deepEqual(d, { acao: 'tentar', telefone: fixo });
});
```

- [ ] **Step 2: Rodar e confirmar a falha**

```bash
cd backend && npm run teste
```

- [ ] **Step 3: Implementar**

`backend/src/dominio/escalonamento.ts`:

```ts
import type { StatusTelefone } from './telefone.ts';

export interface CandidatoTelefone {
  id: number;
  numero: string;
  status: StatusTelefone;
  prioridade: number;
}

export type Decisao =
  | { acao: 'tentar'; telefone: CandidatoTelefone }
  | { acao: 'esperar'; motivo: string }
  | { acao: 'desistir'; motivo: string };

// Fila, nao leque. Disparar para os 5 numeros de uma vez incomodaria quatro
// pessoas por engano e derrubaria a nota de qualidade do nosso numero.
export function proximoPasso(
  telefones: CandidatoTelefone[],
  temTentativaAberta: boolean,
): Decisao {
  if (temTentativaAberta) {
    return { acao: 'esperar', motivo: 'ja existe uma tentativa aguardando recibo' };
  }

  const confirmado = telefones.find((t) => t.status === 'tem_whatsapp');
  if (confirmado) return { acao: 'tentar', telefone: confirmado };

  const candidatos = telefones
    .filter((t) => t.status === 'desconhecido')
    .sort((a, b) => a.prioridade - b.prioridade);

  if (candidatos.length === 0) {
    return { acao: 'desistir', motivo: 'nenhum telefone com WhatsApp possivel' };
  }

  return { acao: 'tentar', telefone: candidatos[0] };
}
```

- [ ] **Step 4: Rodar os testes e commitar**

```bash
cd backend && npm run teste
```

```bash
git add backend/src/dominio/escalonamento.ts backend/testes/escalonamento.test.ts && git commit -m "Decide um telefone por vez, parando no primeiro que entregar" && git push
```

---

### Task 6: O cron destrava filas paradas — e continua sem disparar

**Files:**
- Modify: `backend/src/index.ts`

**Interfaces:**
- Consumes: `lerPausaGlobal`, `registrarAuditoria`.
- Produces: nada exportado.

- [ ] **Step 1: Substituir o handler `scheduled`**

Em `backend/src/index.ts`:

```ts
// Tentativa sem recibo nao pode travar a fila para sempre: silencio da
// Meta nao e prova de nada. Depois de uma hora, a tentativa e encerrada
// como 'sem_recibo' e o telefone CONTINUA 'desconhecido' — so a fila anda.
const MINUTOS_ATE_DESTRAVAR = 60;

  async scheduled(_evento: ScheduledController, env: Ambiente): Promise<void> {
    const config = lerConfig(env);

    const limite = new Date(Date.now() - MINUTOS_ATE_DESTRAVAR * 60_000).toISOString();
    const paradas = await env.DB.prepare(
      `UPDATE tentativas_contato SET fechada_em = ?, desfecho = 'sem_recibo'
       WHERE fechada_em IS NULL AND aberta_em < ?`,
    )
      .bind(new Date().toISOString(), limite)
      .run();

    const destravadas = paradas.meta.changes ?? 0;
    if (destravadas > 0) {
      await registrarAuditoria(env.DB, {
        acao: 'tentativas-destravadas',
        telefone: null,
        detalhe: `${destravadas} tentativa(s) sem recibo apos ${MINUTOS_ATE_DESTRAVAR} minutos`,
      });
    }

    if (await lerPausaGlobal(env.DB)) {
      await registrarAuditoria(env.DB, {
        acao: 'cron-ignorado',
        telefone: null,
        detalhe: 'pausa global ligada',
      });
      return;
    }

    // O disparo em lote continua DESLIGADO. Liga-lo e uma decisao separada,
    // tomada depois de ver o escalonamento funcionando com um devedor so.
    await registrarAuditoria(env.DB, {
      acao: 'cron-executado',
      telefone: null,
      detalhe: `ambiente ${config.ambiente}, disparo em lote desativado`,
    });
  },
```

Repare que o destravamento roda **antes** da checagem de pausa: limpar fila travada não envia nada e precisa acontecer mesmo com a operação parada. Foi por isso que ficou nessa ordem.

- [ ] **Step 2: Verificar localmente**

```bash
cd backend && npm run dev
```

Em outro terminal, dispare o cron manualmente:

```bash
curl -s "http://127.0.0.1:8787/__scheduled?cron=0+12+*+*+1-5"
```

Isto só funciona porque o script `dev` passa `--test-scheduled`. Sem a flag,
o Miniflare não intercepta `/__scheduled`, a URL cai no roteador normal e
devolve 404 — e é fácil ler esse 404 como "o cron não fez nada".

```bash
cd backend && npx wrangler d1 execute cobranca --local --command "SELECT acao, detalhe FROM auditoria ORDER BY id DESC LIMIT 3"
```

Esperado: `cron-ignorado | pausa global ligada`. Nenhum envio.

- [ ] **Step 3: Commit**

```bash
git add backend/src/index.ts && git commit -m "Cron destrava tentativas sem recibo sem disparar nada" && git push
```

---

### Task 7: Telefones na tela, com o status de cada um

**Files:**
- Modify: `backend/src/api/painel.ts`, `detalhe-cliente.js`, `estilos.css`

**Interfaces:**
- Consumes: `telefonesDoDevedor`.
- Produces: `GET /api/telefones?credor=<id>&devedor=<id>`.

- [ ] **Step 1: Expor o endpoint**

Em `backend/src/api/painel.ts`, na seção com escopo resolvido:

```ts
  if (url.pathname === '/api/telefones' && metodo === 'GET') {
    const devedorId = url.searchParams.get('devedor') ?? '';
    if (devedorId.length === 0) {
      return new Response('Informe o devedor', { status: 400 });
    }
    // telefonesDoDevedor filtra por credor_id tambem: pedir o telefone de
    // um devedor de outra carteira devolve lista vazia, nao os dados dele.
    return Response.json({ telefones: await telefonesDoDevedor(db, credorId, devedorId) });
  }
```

- [ ] **Step 2: Mostrar na gaveta de detalhe**

Em `detalhe-cliente.js`, acrescente o bloco de telefones ao conteúdo da gaveta:

```js
const ROTULO_STATUS = {
  desconhecido: 'ainda não sabemos',
  tem_whatsapp: 'tem WhatsApp',
  sem_whatsapp: 'sem WhatsApp',
  invalido: 'número inválido',
};

function listaDeTelefones(telefones) {
  const lista = document.createElement('ul');
  lista.className = 'telefones';

  for (const t of telefones) {
    const item = document.createElement('li');
    item.className = `telefone telefone-${t.status}`;

    const numero = document.createElement('span');
    numero.className = 'telefone-numero';
    numero.textContent = mascararTelefone(t.numero);

    const selo = document.createElement('span');
    selo.className = 'selo-status';
    selo.textContent = ROTULO_STATUS[t.status] ?? t.status;

    item.append(numero, selo);
    if (t.ultimoMotivo) {
      const motivo = document.createElement('p');
      motivo.className = 'telefone-motivo';
      motivo.textContent = t.ultimoMotivo;
      item.append(motivo);
    }
    lista.append(item);
  }

  return lista;
}
```

Chame-a ao abrir a gaveta, buscando `/api/telefones?credor=…&devedor=…`. Se a busca falhar, mostre uma linha de aviso na gaveta — não deixe a seção sumir em silêncio.

- [ ] **Step 3: Estilo**

Em `estilos.css`:

```css
.telefones { list-style: none; margin: 12px 0 0; padding: 0; display: grid; gap: 8px; }
.telefone { display: flex; align-items: center; gap: 10px; flex-wrap: wrap;
  padding: 10px 12px; border-radius: var(--raio-medio); background: var(--fundo-suave); }
.telefone-numero { font-variant-numeric: tabular-nums; font-weight: 600; }
.selo-status { margin-left: auto; padding: 3px 10px; border-radius: var(--raio-pilula);
  font-size: 0.72rem; font-weight: 700; text-transform: uppercase; }
.telefone-desconhecido .selo-status { background: var(--fundo-neutro); color: var(--texto-medio); }
.telefone-tem_whatsapp .selo-status { background: var(--sucesso-fundo); color: var(--sucesso-texto); }
.telefone-sem_whatsapp .selo-status,
.telefone-invalido .selo-status { background: var(--atencao-fundo); color: var(--atencao-texto); }
.telefone-motivo { flex-basis: 100%; margin: 4px 0 0; color: var(--texto-medio); font-size: 0.8rem; }
```

Se algum desses tokens (`--sucesso-fundo`, `--fundo-neutro`) não existir em `estilos.css`, use os que existem — abra o arquivo e confira o bloco `:root` antes de colar.

- [ ] **Step 4: Verificar na tela**

Suba `npm run dev`, importe a planilha fictícia com colunas extras, abra o detalhe do devedor e confirme: os telefones aparecem em ordem de prioridade, celular antes de fixo, todos como "ainda não sabemos". Nenhum erro no console.

- [ ] **Step 5: Commit**

```bash
git add backend/src/api/painel.ts detalhe-cliente.js estilos.css && git commit -m "Mostra os telefones do devedor com o status de descoberta" && git push
```

---

### Task 8: Migrar o remoto, publicar e verificar de ponta a ponta

**Files:** nenhum.

- [ ] **Step 1: Confirmar que a pausa continua ligada**

```bash
cd backend && npx wrangler d1 execute cobranca --remote --command "SELECT pausado FROM pausa_global"
```

Esperado: `1`. **Se vier 0, pare e avise o usuário.**

- [ ] **Step 2: Migrar e publicar**

```bash
cd backend && npm run migrar:remoto && npm run deploy
```

- [ ] **Step 3: Conferir o backfill remoto**

```bash
cd backend && npx wrangler d1 execute cobranca --remote --command "SELECT status, count(*) FROM telefones GROUP BY status"
```

- [ ] **Step 4: Varredura de segredos, da raiz**

```bash
cd "C:/Users/thesc/OneDrive/Documentos/GitHub/Plataforma Cobrança" && pwd && git grep -nE "EAA[A-Za-z0-9]{20,}|sk-ant-[A-Za-z0-9]{10,}" -- . ; git ls-files | grep -E "^\.env|\.dev\.vars" ; echo "fim da varredura"
```

Confira também que nenhum telefone real entrou no repositório:

```bash
git grep -nE "55[0-9]{2}9[0-9]{8}" -- . | grep -v "5535900000\|5511900000\|900000000"
```

Esperado: vazio.

- [ ] **Step 5: Verificação de ponta a ponta com número real — só o usuário**

Este é o único passo que exige o usuário, e ele **liga a pausa de volta ao final**. Peça a ele que:

1. Confirme que o número dele está em `DESTINATARIOS_TESTE`.
2. Desligue a pausa global no painel.
3. Você dispara **uma** mensagem para o devedor de teste (que deve ter dois telefones cadastrados: o real dele em prioridade pior, e um celular fictício em prioridade melhor).
4. O fictício deve falhar com `131026` → o telefone vira `sem_whatsapp`.
5. A segunda tentativa vai para o número real → `delivered` → `tem_whatsapp`.
6. Religue a pausa global.

Confirme na auditoria:

```bash
cd backend && npx wrangler d1 execute cobranca --remote --command "SELECT quando, acao, detalhe FROM auditoria WHERE acao LIKE 'telefone-%' OR acao LIKE 'recibo-%' ORDER BY id DESC LIMIT 10"
```

Esperado, em ordem: `telefone-descartado` para o fictício, depois `telefone-confirmado` para o real. Se o `telefone-descartado` não aparecer, o escalonamento não está lendo os recibos — não siga adiante.

**Não execute este passo sozinho.** Desligar a pausa global é decisão do usuário, sempre.

- [ ] **Step 6: Commit e memória**

```bash
git add -A && git commit -m "Fase 4 no ar: descoberta de WhatsApp por recibo de entrega" && git push
```

Registre na memória do projeto: o status do telefone só avança com recibo `delivered`/`read`; `131047` nunca marca `sem_whatsapp`; o cron destrava tentativas com mais de 60 minutos sem trocar o status do telefone.

---

## Self-review

**Cobertura dos requisitos:**

| Pedido | Tarefa |
|---|---|
| Devedor tem N telefones, cada um com status e prioridade | Task 3 |
| Filtro grátis: despriorizar fixos | Task 1 |
| "Assinar `message_status`" | Corrigido — os recibos já chegam em `messages`; Task 4 passa a lê-los |
| `delivered` → `tem_whatsapp` | Task 4 |
| `failed` com destinatário inválido → `sem_whatsapp`, nunca mais tentar | Tasks 2, 4, 5 |
| Um telefone por vez, parando no primeiro que entregar | Task 5 |
| Toda tentativa registrada na auditoria | Tasks 3, 4, 6 |
| Pausa global ligada durante tudo | Global Constraints + Task 8 Step 1 |

**Fora de escopo, de propósito:** disparo em lote (o cron continua sem enviar); cadastro manual de telefone pelo painel (entra pela planilha); reclassificar automaticamente um `sem_whatsapp` que possa ter mudado de dono — decisão consciente, porque tentar de novo custa nota de qualidade.
