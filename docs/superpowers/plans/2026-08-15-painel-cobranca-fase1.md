# Painel de Cobrança — Fase 1 — Plano de Implementação

> **Para executores agênticos:** SUB-SKILL OBRIGATÓRIA: use
> `superpowers:subagent-driven-development` (recomendado) ou
> `superpowers:executing-plans` para implementar tarefa a tarefa. Os passos
> usam checkbox (`- [ ]`) para acompanhamento.

**Goal:** Construir o painel estático de cobrança com clientes inadimplentes
fictícios, histórico de mensagens e pausa de emergência persistida, sem
nenhuma chamada de rede.

**Architecture:** Site estático sem build e sem dependências instaladas. A
lógica pura fica em módulos ES testáveis (`logica.js`, `estado-pausa.js`),
separada da renderização (`app.js`) e da origem dos dados (`dados-mock.js`).
Na Fase 2 só `dados-mock.js` é substituído.

**Tech Stack:** HTML5, CSS3 com tokens, JavaScript ES modules. Node 24 apenas
como ferramenta local: `node --test` para os testes e `servidor-local.js`
para servir os arquivos. Zero pacotes instalados, `node_modules/` nunca
existe.

**Spec:** `docs/superpowers/specs/2026-08-15-painel-cobranca-fase1-design.md`

## Global Constraints

- Nenhuma chave, senha ou token em qualquer arquivo do repositório, incluindo
  `index.html` e qualquer `.js`.
- `.gitignore` com `.env` já é o primeiro commit (`ffac53d`). Não removê-lo
  nem afrouxá-lo.
- Nenhuma chamada de rede nesta fase: nada de `fetch`, `XMLHttpRequest`,
  `<script src>` externo, `@import` de CDN, webfont remota.
- Todo dado é fictício. Telefones do mock seguem o padrão `55119000000NN` e
  não correspondem a linhas reais.
- Valores monetários são inteiros em centavos; formatação só na exibição.
- Nenhuma dependência instalada. `package.json` existe apenas para declarar
  `"type": "module"` e não tem chave `dependencies`.
- Idioma da interface e dos commits: português.
- Ao final de cada tarefa: commit. O push fica pendente até o usuário
  fornecer a URL do remote.

## Estrutura de arquivos

| Arquivo | Responsabilidade |
| --- | --- |
| `package.json` | Só `"type": "module"`. Sem dependências. |
| `servidor-local.js` | Servidor estático em Node puro, para desenvolvimento. |
| `.env` | Local, ignorado. Nomes das variáveis da Fase 2, valores vazios. |
| `.env.exemplo` | Versionado. Mesmos nomes, sem valores. |
| `README.md` | Fases, como rodar, aviso do GitHub Pages. |
| `logica.js` | Funções puras: moeda, atraso, máscara, totais. |
| `estado-pausa.js` | Leitura e escrita do estado de pausa e seus eventos. |
| `dados-mock.js` | Clientes e histórico fictícios. Único lugar com dados. |
| `index.html` | Estrutura semântica do painel. |
| `estilos.css` | Tema claro em tokens, responsivo. |
| `app.js` | Renderização e ligação com o DOM. |
| `testes/logica.test.js` | Testes de `logica.js`. |
| `testes/estado-pausa.test.js` | Testes de `estado-pausa.js`. |

---

### Task 1: Fundação do projeto

Prepara o esqueleto: declaração de módulos ES, servidor local, arquivos de
ambiente e README. Sem lógica de domínio.

**Files:**
- Create: `package.json`
- Create: `servidor-local.js`
- Create: `.env` (não será versionado)
- Create: `.env.exemplo`
- Create: `README.md`

**Interfaces:**
- Consumes: nada.
- Produces: `node servidor-local.js` serve o diretório do projeto em
  `http://localhost:4173`. `package.json` com `"type": "module"` permite
  `import`/`export` em `.js` tanto no navegador quanto no Node.

- [ ] **Step 1: Criar `package.json`**

```json
{
  "name": "plataforma-cobranca",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "description": "Painel de cobranca — Fase 1 (dados ficticios, sem integracao)",
  "scripts": {
    "servir": "node servidor-local.js",
    "teste": "node --test testes/"
  }
}
```

- [ ] **Step 2: Criar `servidor-local.js`**

```js
// Servidor estatico minimo para desenvolvimento. Nao vai para producao:
// no GitHub Pages os arquivos sao servidos pela propria plataforma.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';

const PORTA = 4173;
const RAIZ = process.cwd();

const TIPOS = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
};

createServer(async (requisicao, resposta) => {
  const caminhoPedido = decodeURIComponent(new URL(requisicao.url, `http://localhost:${PORTA}`).pathname);
  const relativo = normalize(caminhoPedido === '/' ? '/index.html' : caminhoPedido).replace(/^([/\\])+/, '');

  // Impede sair da raiz do projeto via "..".
  if (relativo.split(/[/\\]/).includes('..')) {
    resposta.writeHead(403).end('Acesso negado');
    return;
  }

  try {
    const conteudo = await readFile(join(RAIZ, relativo));
    resposta.writeHead(200, { 'content-type': TIPOS[extname(relativo)] ?? 'application/octet-stream' });
    resposta.end(conteudo);
  } catch {
    resposta.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    resposta.end('Arquivo nao encontrado');
  }
}).listen(PORTA, () => {
  console.log(`Painel em http://localhost:${PORTA}`);
});
```

- [ ] **Step 3: Criar `.env.exemplo` (versionado, sem valores)**

```
# Variaveis da Fase 2. Este arquivo e versionado e NAO deve conter valores.
# Copie para .env e preencha localmente. O .env esta no .gitignore.
COBMAIS_API_URL=
COBMAIS_API_TOKEN=
VOLL_API_URL=
VOLL_API_TOKEN=
```

- [ ] **Step 4: Criar `.env` local com os mesmos nomes e valores vazios**

Conteúdo idêntico ao `.env.exemplo`. Nada de valor real: as credenciais só
entram aqui na Fase 2, e no computador do usuário.

- [ ] **Step 5: Confirmar que o `.env` está fora do git**

Run: `git status --porcelain --untracked-files=all`
Expected: `.env.exemplo` aparece como não rastreado; **`.env` não aparece**.
Se `.env` aparecer, parar e corrigir o `.gitignore` antes de seguir.

- [ ] **Step 6: Criar `README.md`**

```markdown
# Plataforma de Cobrança

Painel de acompanhamento de cobrança. Em construção, por fases.

## Estado atual: Fase 1

Painel estático com **dados fictícios**. Nenhuma integração ativa, nenhuma
chamada de rede, nenhuma credencial envolvida.

- Lista de clientes inadimplentes (nome, valor, vencimento, dias em atraso,
  status, telefone mascarado)
- Histórico de mensagens
- Botão de pausa de emergência, com estado persistido no navegador

## Como rodar

```bash
node servidor-local.js
```

Depois abra `http://localhost:4173`. Não abra o `index.html` direto pelo
sistema de arquivos: o navegador bloqueia módulos ES em `file://`.

Testes:

```bash
node --test testes/
```

Não há dependências para instalar.

## Segurança

**O GitHub Pages publica o conteúdo do repositório, mesmo que o repositório
seja privado.** Portanto:

- Nenhuma chave, senha ou token em qualquer arquivo versionado.
- `.env` está no `.gitignore` desde o primeiro commit. `.env.exemplo` é
  versionado e contém apenas nomes de variáveis, sem valores.
- Os dados desta fase são fictícios. Nenhum dado real de cliente e nenhum
  telefone verdadeiro entram em arquivo que vá para o Pages.

## Fase 2 (planejada)

Consulta ao Cobmais e disparo de WhatsApp pela Voll, em backend separado, com
as credenciais em variáveis de ambiente do provedor — nunca no frontend. A
escolha entre Vercel e Cloudflare Workers será feita no início da fase.
```

- [ ] **Step 7: Subir o servidor e verificar**

Run: `node servidor-local.js` e, em outro terminal,
`curl -s -o /dev/null -w "%{http_code}" http://localhost:4173/package.json`
Expected: `200`. E `curl -s -o /dev/null -w "%{http_code}" http://localhost:4173/nao-existe`
Expected: `404`. Encerrar o servidor depois.

- [ ] **Step 8: Commit**

```bash
git add package.json servidor-local.js .env.exemplo README.md
git commit -m "Adiciona fundacao do projeto: servidor local, ambiente e README"
```

Conferir que o `git add` não incluiu `.env`: `git show --stat --name-only HEAD`.

---

### Task 2: Funções puras de apresentação (`logica.js`)

**Files:**
- Create: `logica.js`
- Test: `testes/logica.test.js`

**Interfaces:**
- Consumes: nada.
- Produces:
  - `formatarMoeda(centavos: number): string` — `128790` → `"R$ 1.287,90"`
  - `diasEmAtraso(vencimentoISO: string, hoje: Date): number` — positivo em
    atraso, negativo a vencer, `0` no dia
  - `rotuloAtraso(dias: number): string`
  - `mascararTelefone(telefone: string): string`
  - `calcularTotais(clientes, historico, hoje): { totalCentavos, quantidadeClientes, enviadasHoje }`

- [ ] **Step 1: Escrever os testes que falham**

Criar `testes/logica.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  formatarMoeda,
  diasEmAtraso,
  rotuloAtraso,
  mascararTelefone,
  calcularTotais,
} from '../logica.js';

test('formatarMoeda converte centavos em reais', () => {
  assert.equal(formatarMoeda(128790).replace(/ /g, ' '), 'R$ 1.287,90');
  assert.equal(formatarMoeda(0).replace(/ /g, ' '), 'R$ 0,00');
  assert.equal(formatarMoeda(5).replace(/ /g, ' '), 'R$ 0,05');
});

test('diasEmAtraso conta dias inteiros desde o vencimento', () => {
  const hoje = new Date(2026, 7, 15, 14, 30); // 15/08/2026, meio da tarde
  assert.equal(diasEmAtraso('2026-08-15', hoje), 0);
  assert.equal(diasEmAtraso('2026-08-05', hoje), 10);
  assert.equal(diasEmAtraso('2026-08-20', hoje), -5);
});

test('diasEmAtraso ignora a hora do dia', () => {
  const cedo = new Date(2026, 7, 15, 0, 5);
  const tarde = new Date(2026, 7, 15, 23, 55);
  assert.equal(diasEmAtraso('2026-08-05', cedo), diasEmAtraso('2026-08-05', tarde));
});

test('rotuloAtraso descreve atraso, vencimento hoje e a vencer', () => {
  assert.equal(rotuloAtraso(10), '10 dias');
  assert.equal(rotuloAtraso(1), '1 dia');
  assert.equal(rotuloAtraso(0), 'vence hoje');
  assert.equal(rotuloAtraso(-5), 'a vencer');
});

test('mascararTelefone esconde o miolo do numero', () => {
  assert.equal(mascararTelefone('5511900000001'), '(11) 9****-0001');
  assert.equal(mascararTelefone('5521912345678'), '(21) 9****-5678');
});

test('mascararTelefone devolve marcador para entrada invalida', () => {
  assert.equal(mascararTelefone(''), 'sem telefone');
  assert.equal(mascararTelefone('123'), 'sem telefone');
});

test('calcularTotais soma divida, conta clientes e mensagens de hoje', () => {
  const hoje = new Date(2026, 7, 15, 9, 0);
  const clientes = [
    { id: 'c-1', valorCentavos: 100000 },
    { id: 'c-2', valorCentavos: 25050 },
  ];
  const historico = [
    { id: 'h-1', quando: '2026-08-15T08:00:00-03:00', resultado: 'enviada' },
    { id: 'h-2', quando: '2026-08-14T08:00:00-03:00', resultado: 'enviada' },
    { id: 'h-3', quando: '2026-08-15T09:30:00-03:00', resultado: 'falhou' },
  ];
  assert.deepEqual(calcularTotais(clientes, historico, hoje), {
    totalCentavos: 125050,
    quantidadeClientes: 2,
    enviadasHoje: 1,
  });
});

test('calcularTotais lida com listas vazias', () => {
  assert.deepEqual(calcularTotais([], [], new Date(2026, 7, 15)), {
    totalCentavos: 0,
    quantidadeClientes: 0,
    enviadasHoje: 0,
  });
});
```

- [ ] **Step 2: Rodar os testes e confirmar que falham**

Run: `node --test testes/logica.test.js`
Expected: FAIL — `Cannot find module .../logica.js`.

- [ ] **Step 3: Implementar `logica.js`**

```js
// Funcoes puras de apresentacao. Sem DOM, sem rede, sem estado global.

const FORMATADOR_BRL = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
});

const MILISSEGUNDOS_POR_DIA = 24 * 60 * 60 * 1000;

export function formatarMoeda(centavos) {
  return FORMATADOR_BRL.format(centavos / 100);
}

// Converte 'AAAA-MM-DD' em Date local a meia-noite. Usar new Date(iso)
// interpretaria como UTC e deslocaria o dia no fuso do Brasil.
function meiaNoiteLocal(dataISO) {
  const [ano, mes, dia] = dataISO.split('-').map(Number);
  return new Date(ano, mes - 1, dia);
}

function inicioDoDia(data) {
  return new Date(data.getFullYear(), data.getMonth(), data.getDate());
}

export function diasEmAtraso(vencimentoISO, hoje) {
  const diferenca = inicioDoDia(hoje) - meiaNoiteLocal(vencimentoISO);
  return Math.round(diferenca / MILISSEGUNDOS_POR_DIA);
}

export function rotuloAtraso(dias) {
  if (dias < 0) return 'a vencer';
  if (dias === 0) return 'vence hoje';
  return dias === 1 ? '1 dia' : `${dias} dias`;
}

// Espera o formato 55DDNNNNNNNNN (13 digitos). Exibe DDD, primeiro digito
// e os quatro ultimos; o miolo nunca aparece na tela.
export function mascararTelefone(telefone) {
  const digitos = String(telefone ?? '').replace(/\D/g, '');
  if (digitos.length !== 13) return 'sem telefone';
  const ddd = digitos.slice(2, 4);
  const primeiro = digitos.slice(4, 5);
  const finais = digitos.slice(-4);
  return `(${ddd}) ${primeiro}****-${finais}`;
}

function mesmoDia(dataISO, referencia) {
  const data = new Date(dataISO);
  return (
    data.getFullYear() === referencia.getFullYear() &&
    data.getMonth() === referencia.getMonth() &&
    data.getDate() === referencia.getDate()
  );
}

export function calcularTotais(clientes, historico, hoje) {
  return {
    totalCentavos: clientes.reduce((soma, cliente) => soma + cliente.valorCentavos, 0),
    quantidadeClientes: clientes.length,
    enviadasHoje: historico.filter(
      (entrada) => entrada.resultado === 'enviada' && mesmoDia(entrada.quando, hoje),
    ).length,
  };
}
```

- [ ] **Step 4: Rodar os testes e confirmar que passam**

Run: `node --test testes/logica.test.js`
Expected: PASS, 7 testes.

- [ ] **Step 5: Commit**

```bash
git add logica.js testes/logica.test.js
git commit -m "Adiciona funcoes puras de moeda, atraso, mascara e totais"
```

---

### Task 3: Estado da pausa de emergência (`estado-pausa.js`)

O `localStorage` é injetado como parâmetro para o módulo ser testável no Node
e resistente a navegador com armazenamento bloqueado.

**Files:**
- Create: `estado-pausa.js`
- Test: `testes/estado-pausa.test.js`

**Interfaces:**
- Consumes: nada.
- Produces:
  - `CHAVE_PAUSA = 'cobranca:pausa'`, `CHAVE_EVENTOS = 'cobranca:eventos-pausa'`
  - `lerPausa(armazenamento): { pausado: boolean, desde: string | null }`
  - `alternarPausa(armazenamento, agora: Date): { pausado, desde }`
  - `lerEventosPausa(armazenamento): Array<{ id, quando, pausado }>`

- [ ] **Step 1: Escrever os testes que falham**

Criar `testes/estado-pausa.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  lerPausa,
  alternarPausa,
  lerEventosPausa,
  CHAVE_PAUSA,
} from '../estado-pausa.js';

// Dublê de localStorage: mesma interface, em memoria.
function armazenamentoFalso(inicial = {}) {
  const dados = new Map(Object.entries(inicial));
  return {
    getItem: (chave) => (dados.has(chave) ? dados.get(chave) : null),
    setItem: (chave, valor) => dados.set(chave, String(valor)),
  };
}

function armazenamentoQueFalha() {
  return {
    getItem() {
      throw new Error('armazenamento bloqueado');
    },
    setItem() {
      throw new Error('armazenamento bloqueado');
    },
  };
}

test('lerPausa devolve ativo quando nao ha nada gravado', () => {
  assert.deepEqual(lerPausa(armazenamentoFalso()), { pausado: false, desde: null });
});

test('lerPausa devolve ativo quando o conteudo esta corrompido', () => {
  const armazenamento = armazenamentoFalso({ [CHAVE_PAUSA]: 'nao é json{{' });
  assert.deepEqual(lerPausa(armazenamento), { pausado: false, desde: null });
});

test('lerPausa devolve ativo quando o armazenamento esta indisponivel', () => {
  assert.deepEqual(lerPausa(armazenamentoQueFalha()), { pausado: false, desde: null });
});

test('alternarPausa liga a pausa e registra a data', () => {
  const armazenamento = armazenamentoFalso();
  const agora = new Date(2026, 7, 15, 10, 0);
  const estado = alternarPausa(armazenamento, agora);
  assert.equal(estado.pausado, true);
  assert.equal(estado.desde, agora.toISOString());
  assert.deepEqual(lerPausa(armazenamento), estado);
});

test('alternarPausa desliga a pausa na segunda chamada', () => {
  const armazenamento = armazenamentoFalso();
  alternarPausa(armazenamento, new Date(2026, 7, 15, 10, 0));
  const estado = alternarPausa(armazenamento, new Date(2026, 7, 15, 11, 0));
  assert.equal(estado.pausado, false);
  assert.equal(lerPausa(armazenamento).pausado, false);
});

test('cada alternancia acrescenta um evento, do mais recente para o mais antigo', () => {
  const armazenamento = armazenamentoFalso();
  alternarPausa(armazenamento, new Date(2026, 7, 15, 10, 0));
  alternarPausa(armazenamento, new Date(2026, 7, 15, 11, 0));
  const eventos = lerEventosPausa(armazenamento);
  assert.equal(eventos.length, 2);
  assert.equal(eventos[0].pausado, false);
  assert.equal(eventos[1].pausado, true);
  assert.notEqual(eventos[0].id, eventos[1].id);
});

test('alternarPausa nao lanca quando o armazenamento falha', () => {
  const estado = alternarPausa(armazenamentoQueFalha(), new Date(2026, 7, 15, 10, 0));
  assert.equal(estado.pausado, true);
});

test('lerEventosPausa devolve lista vazia quando nao ha eventos', () => {
  assert.deepEqual(lerEventosPausa(armazenamentoFalso()), []);
});
```

- [ ] **Step 2: Rodar os testes e confirmar que falham**

Run: `node --test testes/estado-pausa.test.js`
Expected: FAIL — `Cannot find module .../estado-pausa.js`.

- [ ] **Step 3: Implementar `estado-pausa.js`**

```js
// Estado da pausa de emergencia. O armazenamento e injetado para o modulo
// ser testavel e para tolerar navegador com localStorage bloqueado.
//
// Na Fase 2 este mesmo estado e a trava consultada antes de qualquer disparo.

export const CHAVE_PAUSA = 'cobranca:pausa';
export const CHAVE_EVENTOS = 'cobranca:eventos-pausa';

const ESTADO_PADRAO = { pausado: false, desde: null };

function lerJson(armazenamento, chave, padrao) {
  try {
    const bruto = armazenamento.getItem(chave);
    if (bruto === null) return padrao;
    return JSON.parse(bruto);
  } catch {
    // Armazenamento bloqueado ou conteudo corrompido: seguir com o padrao.
    return padrao;
  }
}

function gravarJson(armazenamento, chave, valor) {
  try {
    armazenamento.setItem(chave, JSON.stringify(valor));
  } catch {
    // Sem persistencia disponivel; a interface continua funcionando.
  }
}

export function lerPausa(armazenamento) {
  const estado = lerJson(armazenamento, CHAVE_PAUSA, ESTADO_PADRAO);
  if (typeof estado !== 'object' || estado === null || typeof estado.pausado !== 'boolean') {
    return { ...ESTADO_PADRAO };
  }
  return { pausado: estado.pausado, desde: estado.desde ?? null };
}

export function lerEventosPausa(armazenamento) {
  const eventos = lerJson(armazenamento, CHAVE_EVENTOS, []);
  return Array.isArray(eventos) ? eventos : [];
}

export function alternarPausa(armazenamento, agora) {
  const anterior = lerPausa(armazenamento);
  const quando = agora.toISOString();
  const novo = { pausado: !anterior.pausado, desde: quando };

  gravarJson(armazenamento, CHAVE_PAUSA, novo);

  const eventos = lerEventosPausa(armazenamento);
  eventos.unshift({ id: `p-${quando}`, quando, pausado: novo.pausado });
  gravarJson(armazenamento, CHAVE_EVENTOS, eventos);

  return novo;
}
```

- [ ] **Step 4: Rodar os testes e confirmar que passam**

Run: `node --test testes/`
Expected: PASS, 15 testes no total (7 da Task 2 + 8 desta).

- [ ] **Step 5: Commit**

```bash
git add estado-pausa.js testes/estado-pausa.test.js
git commit -m "Adiciona estado persistido da pausa de emergencia"
```

---

### Task 4: Dados fictícios (`dados-mock.js`)

**Files:**
- Create: `dados-mock.js`

**Interfaces:**
- Consumes: nada.
- Produces: `clientes: Cliente[]` e `historico: Entrada[]`, nos formatos da
  spec. Na Fase 2 este arquivo é trocado por um módulo com as mesmas
  exportações, alimentado pelo backend.

- [ ] **Step 1: Criar `dados-mock.js`**

As datas são fixas de propósito: mudam o rótulo de atraso conforme o dia em
que o painel é aberto, o que é exatamente o comportamento a observar.

```js
// DADOS FICTICIOS. Nenhum nome, telefone ou valor aqui corresponde a pessoa
// real. Este arquivo vai para o GitHub Pages, que e publico — nunca colocar
// dado real de cliente aqui.
//
// Fase 2: substituir por um modulo com as mesmas exportacoes, alimentado
// pelo backend que consulta o Cobmais.

export const clientes = [
  { id: 'c-001', nome: 'Aurora Comercio de Tecidos', telefone: '5511900000001', valorCentavos: 128790, vencimento: '2026-06-18', status: 'sem-resposta' },
  { id: 'c-002', nome: 'Benedito Ferreira Nunes', telefone: '5511900000002', valorCentavos: 45900, vencimento: '2026-07-02', status: 'mensagem-enviada' },
  { id: 'c-003', nome: 'Cristal Servicos Digitais', telefone: '5521900000003', valorCentavos: 987650, vencimento: '2026-07-25', status: 'aguardando' },
  { id: 'c-004', nome: 'Dalva Monteiro Rocha', telefone: '5531900000004', valorCentavos: 21050, vencimento: '2026-08-05', status: 'mensagem-enviada' },
  { id: 'c-005', nome: 'Estrela Norte Transportes', telefone: '5511900000005', valorCentavos: 350000, vencimento: '2026-08-14', status: 'aguardando' },
  { id: 'c-006', nome: 'Fabio Andrade Peixoto', telefone: '5541900000006', valorCentavos: 7830, vencimento: '2026-08-15', status: 'aguardando' },
  { id: 'c-007', nome: 'Girassol Alimentos ME', telefone: '5511900000007', valorCentavos: 162400, vencimento: '2026-08-28', status: 'aguardando' },
];

export const historico = [
  { id: 'h-001', clienteId: 'c-004', quando: '2026-08-15T09:12:00-03:00', canal: 'whatsapp', resultado: 'enviada', trecho: 'Ola, Dalva. Identificamos uma pendencia em aberto…' },
  { id: 'h-002', clienteId: 'c-002', quando: '2026-08-15T09:10:00-03:00', canal: 'whatsapp', resultado: 'falhou', trecho: 'Numero sem WhatsApp ativo.' },
  { id: 'h-003', clienteId: 'c-001', quando: '2026-08-14T16:40:00-03:00', canal: 'whatsapp', resultado: 'enviada', trecho: 'Ola. Consta um valor vencido em 18/06…' },
  { id: 'h-004', clienteId: 'c-002', quando: '2026-08-13T11:05:00-03:00', canal: 'whatsapp', resultado: 'enviada', trecho: 'Bom dia, Benedito. Segue o lembrete…' },
  { id: 'h-005', clienteId: 'c-001', quando: '2026-08-11T10:00:00-03:00', canal: 'whatsapp', resultado: 'enviada', trecho: 'Primeiro contato sobre a pendencia…' },
];
```

- [ ] **Step 2: Verificar que não há telefone plausivelmente real**

Run: `grep -oE "55[0-9]{11}" dados-mock.js | sort -u`
Expected: todos batem com `55DD9000000NN` — sequenciais e claramente
fictícios. Nenhum outro padrão.

- [ ] **Step 3: Commit**

```bash
git add dados-mock.js
git commit -m "Adiciona dados ficticios de clientes e historico"
```

---

### Task 5: Estrutura e estilo do painel (`index.html`, `estilos.css`)

Marcação e tema. Sem dados renderizados ainda — os contêineres ficam vazios,
preenchidos na Task 6.

**Files:**
- Create: `index.html`
- Create: `estilos.css`

**Interfaces:**
- Consumes: nada.
- Produces: os `id` que `app.js` procura no DOM —
  `faixa-pausa`, `botao-pausa`, `total-divida`, `total-clientes`,
  `total-enviadas`, `corpo-clientes`, `vazio-clientes`, `tabela-clientes`,
  `lista-historico`, `vazio-historico`, `painel`.

- [ ] **Step 1: Criar `index.html`**

```html
<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Painel de Cobrança</title>
    <link rel="stylesheet" href="estilos.css" />
  </head>
  <body>
    <div id="painel" class="painel">
      <header class="cabecalho">
        <div>
          <h1>Painel de Cobrança</h1>
          <p class="subtitulo">Fase 1 — dados fictícios, nenhum disparo ativo</p>
        </div>
        <button
          id="botao-pausa"
          type="button"
          class="botao-pausa"
          aria-pressed="false"
        >
          Pausar disparos
        </button>
      </header>

      <div id="faixa-pausa" class="faixa-pausa" role="status" aria-live="assertive" hidden>
        Disparos pausados. Nenhuma mensagem será enviada até você retomar.
      </div>

      <section class="totais" aria-label="Resumo">
        <article class="cartao">
          <h2>Total inadimplente</h2>
          <p id="total-divida" class="cartao-valor">—</p>
        </article>
        <article class="cartao">
          <h2>Clientes</h2>
          <p id="total-clientes" class="cartao-valor">—</p>
        </article>
        <article class="cartao">
          <h2>Mensagens hoje</h2>
          <p id="total-enviadas" class="cartao-valor">—</p>
        </article>
      </section>

      <section class="bloco" aria-labelledby="titulo-clientes">
        <h2 id="titulo-clientes">Clientes inadimplentes</h2>
        <table id="tabela-clientes" class="tabela">
          <caption class="oculto-visualmente">
            Clientes com valores em aberto, com valor, vencimento e situação
          </caption>
          <thead>
            <tr>
              <th scope="col">Cliente</th>
              <th scope="col">Telefone</th>
              <th scope="col" class="numerico">Valor</th>
              <th scope="col">Vencimento</th>
              <th scope="col">Atraso</th>
              <th scope="col">Situação</th>
            </tr>
          </thead>
          <tbody id="corpo-clientes"></tbody>
        </table>
        <p id="vazio-clientes" class="vazio" hidden>Nenhum cliente inadimplente.</p>
      </section>

      <section class="bloco" aria-labelledby="titulo-historico">
        <h2 id="titulo-historico">Histórico de mensagens</h2>
        <ul id="lista-historico" class="historico"></ul>
        <p id="vazio-historico" class="vazio" hidden>Nenhuma mensagem enviada ainda.</p>
      </section>
    </div>

    <script type="module" src="app.js"></script>
  </body>
</html>
```

- [ ] **Step 2: Criar `estilos.css`**

```css
/* Tema claro em tokens. Contraste conferido para WCAG AA. */
:root {
  --cor-fundo: #f5f6f8;
  --cor-superficie: #ffffff;
  --cor-borda: #d8dbe0;
  --cor-texto: #1b1f24;
  --cor-texto-suave: #59606a;
  --cor-acento: #1f6feb;
  --cor-alerta: #b3261e;
  --cor-alerta-fundo: #fdecea;
  --cor-ok: #1a7f4b;
  --cor-atencao-fundo: #fff4e5;
  --cor-atencao-texto: #8a5300;
  --raio: 10px;
  --sombra: 0 1px 3px rgba(16, 24, 40, 0.08);
  --espaco: 16px;
}

* {
  box-sizing: border-box;
}

body {
  margin: 0;
  background: var(--cor-fundo);
  color: var(--cor-texto);
  font-family: "Segoe UI", system-ui, -apple-system, Arial, sans-serif;
  line-height: 1.5;
}

.painel {
  max-width: 1100px;
  margin: 0 auto;
  padding: calc(var(--espaco) * 1.5);
}

.cabecalho {
  display: flex;
  flex-wrap: wrap;
  gap: var(--espaco);
  align-items: center;
  justify-content: space-between;
}

.cabecalho h1 {
  margin: 0;
  font-size: 1.6rem;
}

.subtitulo {
  margin: 4px 0 0;
  color: var(--cor-texto-suave);
  font-size: 0.9rem;
}

/* Pausa de emergencia: sempre visivel, alvo grande, alto contraste. */
.botao-pausa {
  min-height: 52px;
  padding: 0 28px;
  border: 2px solid var(--cor-alerta);
  border-radius: var(--raio);
  background: var(--cor-alerta);
  color: #ffffff;
  font-size: 1.05rem;
  font-weight: 700;
  cursor: pointer;
}

.botao-pausa:hover {
  filter: brightness(0.93);
}

.botao-pausa:focus-visible {
  outline: 3px solid var(--cor-texto);
  outline-offset: 2px;
}

.botao-pausa[aria-pressed="true"] {
  background: var(--cor-superficie);
  color: var(--cor-alerta);
}

.faixa-pausa {
  margin-top: var(--espaco);
  padding: 14px 16px;
  border: 1px solid var(--cor-alerta);
  border-left-width: 6px;
  border-radius: var(--raio);
  background: var(--cor-alerta-fundo);
  color: var(--cor-alerta);
  font-weight: 600;
}

.totais {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: var(--espaco);
  margin-top: calc(var(--espaco) * 1.5);
}

.cartao {
  padding: var(--espaco);
  border: 1px solid var(--cor-borda);
  border-radius: var(--raio);
  background: var(--cor-superficie);
  box-shadow: var(--sombra);
}

.cartao h2 {
  margin: 0;
  color: var(--cor-texto-suave);
  font-size: 0.85rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.03em;
}

.cartao-valor {
  margin: 6px 0 0;
  font-size: 1.7rem;
  font-weight: 700;
}

.bloco {
  margin-top: calc(var(--espaco) * 1.5);
  padding: var(--espaco);
  border: 1px solid var(--cor-borda);
  border-radius: var(--raio);
  background: var(--cor-superficie);
  box-shadow: var(--sombra);
}

.bloco h2 {
  margin: 0 0 var(--espaco);
  font-size: 1.1rem;
}

.tabela {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.95rem;
}

.tabela th,
.tabela td {
  padding: 10px 12px;
  border-bottom: 1px solid var(--cor-borda);
  text-align: left;
  vertical-align: top;
}

.tabela th {
  color: var(--cor-texto-suave);
  font-size: 0.8rem;
  text-transform: uppercase;
  letter-spacing: 0.03em;
}

.tabela tbody tr:last-child td {
  border-bottom: none;
}

.numerico {
  text-align: right;
  font-variant-numeric: tabular-nums;
}

.etiqueta {
  display: inline-block;
  padding: 2px 10px;
  border-radius: 999px;
  font-size: 0.8rem;
  font-weight: 600;
}

.etiqueta-aguardando {
  background: #eef1f5;
  color: var(--cor-texto-suave);
}

.etiqueta-mensagem-enviada {
  background: #e7f4ec;
  color: var(--cor-ok);
}

.etiqueta-sem-resposta {
  background: var(--cor-atencao-fundo);
  color: var(--cor-atencao-texto);
}

.atraso-vencido {
  color: var(--cor-alerta);
  font-weight: 600;
}

.historico {
  margin: 0;
  padding: 0;
  list-style: none;
}

.historico li {
  padding: 12px 0;
  border-bottom: 1px solid var(--cor-borda);
}

.historico li:last-child {
  border-bottom: none;
}

.historico-topo {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: baseline;
  justify-content: space-between;
}

.historico-nome {
  font-weight: 600;
}

.historico-quando {
  color: var(--cor-texto-suave);
  font-size: 0.85rem;
}

.historico-trecho {
  margin: 4px 0 0;
  color: var(--cor-texto-suave);
  font-size: 0.9rem;
}

.historico-falhou .historico-nome {
  color: var(--cor-alerta);
}

.historico-sistema {
  border-left: 4px solid var(--cor-alerta);
  padding-left: 12px;
}

.vazio {
  margin: 0;
  padding: 24px 0;
  color: var(--cor-texto-suave);
  text-align: center;
}

/* Painel pausado: conteudo esmaecido, botao de pausa intacto. */
.painel-pausado .totais,
.painel-pausado .bloco {
  opacity: 0.55;
}

.oculto-visualmente {
  position: absolute;
  width: 1px;
  height: 1px;
  margin: -1px;
  padding: 0;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
  border: 0;
}

@media (max-width: 640px) {
  .painel {
    padding: var(--espaco);
  }

  .botao-pausa {
    width: 100%;
  }
}
```

- [ ] **Step 3: Verificar no navegador**

Run: `node servidor-local.js`, abrir `http://localhost:4173`.
Expected: cabeçalho, botão vermelho "Pausar disparos", três cartões com `—`,
tabela só com o cabeçalho, dois blocos vazios. Sem erro no console.

- [ ] **Step 4: Commit**

```bash
git add index.html estilos.css
git commit -m "Adiciona estrutura e tema claro do painel"
```

---

### Task 6: Renderização dos dados (`app.js`)

**Files:**
- Create: `app.js`

**Interfaces:**
- Consumes: `clientes` e `historico` de `dados-mock.js`; `formatarMoeda`,
  `diasEmAtraso`, `rotuloAtraso`, `mascararTelefone`, `calcularTotais` de
  `logica.js`.
- Produces: função `renderizar()` chamada no carregamento; a ligação da
  pausa entra na Task 7.

- [ ] **Step 1: Criar `app.js` com a renderização**

```js
// Renderizacao do painel. Toda a logica calculavel vive em logica.js;
// aqui so ha manipulacao de DOM.

import { clientes, historico } from './dados-mock.js';
import {
  formatarMoeda,
  diasEmAtraso,
  rotuloAtraso,
  mascararTelefone,
  calcularTotais,
} from './logica.js';

const ROTULOS_STATUS = {
  aguardando: 'Aguardando',
  'mensagem-enviada': 'Mensagem enviada',
  'sem-resposta': 'Sem resposta',
};

const elemento = (id) => document.getElementById(id);

const formatadorData = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short' });
const formatadorDataHora = new Intl.DateTimeFormat('pt-BR', {
  dateStyle: 'short',
  timeStyle: 'short',
});

function nomeDoCliente(clienteId) {
  return clientes.find((cliente) => cliente.id === clienteId)?.nome ?? 'Cliente removido';
}

function renderizarTotais(hoje) {
  const totais = calcularTotais(clientes, historico, hoje);
  elemento('total-divida').textContent = formatarMoeda(totais.totalCentavos);
  elemento('total-clientes').textContent = String(totais.quantidadeClientes);
  elemento('total-enviadas').textContent = String(totais.enviadasHoje);
}

function linhaDeCliente(cliente, hoje) {
  const dias = diasEmAtraso(cliente.vencimento, hoje);
  const linha = document.createElement('tr');

  const celulas = [
    { texto: cliente.nome },
    { texto: mascararTelefone(cliente.telefone) },
    { texto: formatarMoeda(cliente.valorCentavos), classe: 'numerico' },
    { texto: formatadorData.format(new Date(`${cliente.vencimento}T00:00:00`)) },
    { texto: rotuloAtraso(dias), classe: dias > 0 ? 'atraso-vencido' : '' },
  ];

  for (const celula of celulas) {
    const td = document.createElement('td');
    td.textContent = celula.texto;
    if (celula.classe) td.className = celula.classe;
    linha.append(td);
  }

  const tdStatus = document.createElement('td');
  const etiqueta = document.createElement('span');
  etiqueta.className = `etiqueta etiqueta-${cliente.status}`;
  etiqueta.textContent = ROTULOS_STATUS[cliente.status] ?? cliente.status;
  tdStatus.append(etiqueta);
  linha.append(tdStatus);

  return linha;
}

function renderizarClientes(hoje) {
  const corpo = elemento('corpo-clientes');
  corpo.replaceChildren(...clientes.map((cliente) => linhaDeCliente(cliente, hoje)));

  const vazio = clientes.length === 0;
  elemento('vazio-clientes').hidden = !vazio;
  elemento('tabela-clientes').hidden = vazio;
}

function itemDeMensagem(entrada) {
  const item = document.createElement('li');
  if (entrada.resultado === 'falhou') item.classList.add('historico-falhou');

  const topo = document.createElement('div');
  topo.className = 'historico-topo';

  const nome = document.createElement('span');
  nome.className = 'historico-nome';
  const sufixo = entrada.resultado === 'falhou' ? ' — falhou' : '';
  nome.textContent = `${nomeDoCliente(entrada.clienteId)}${sufixo}`;

  const quando = document.createElement('span');
  quando.className = 'historico-quando';
  quando.textContent = formatadorDataHora.format(new Date(entrada.quando));

  topo.append(nome, quando);

  const trecho = document.createElement('p');
  trecho.className = 'historico-trecho';
  trecho.textContent = entrada.trecho;

  item.append(topo, trecho);
  return item;
}

function renderizarHistorico() {
  const ordenado = [...historico].sort((a, b) => new Date(b.quando) - new Date(a.quando));
  elemento('lista-historico').replaceChildren(...ordenado.map(itemDeMensagem));
  elemento('vazio-historico').hidden = ordenado.length > 0;
}

function renderizar() {
  const hoje = new Date();
  renderizarTotais(hoje);
  renderizarClientes(hoje);
  renderizarHistorico();
}

renderizar();
```

- [ ] **Step 2: Verificar no navegador**

Run: `node servidor-local.js`, abrir `http://localhost:4173`.
Expected, conferindo contra `dados-mock.js`:
- sete linhas na tabela, valores como `R$ 1.287,90`;
- telefones no formato `(11) 9****-0001`;
- `c-006` (vencimento 15/08/2026) mostra `vence hoje` se hoje for esse dia,
  e `c-007` (28/08/2026) mostra `a vencer`;
- total inadimplente `R$ 17.036,20`, clientes `7`;
- histórico com cinco itens, o mais recente no topo, o item `h-002` marcado
  como falhou;
- console sem erro.

- [ ] **Step 3: Verificar o estado vazio**

Comentar temporariamente os itens do array `clientes` em `dados-mock.js`,
recarregar.
Expected: a tabela some e aparece "Nenhum cliente inadimplente." Desfazer a
alteração depois: `git checkout -- dados-mock.js`.

- [ ] **Step 4: Commit**

```bash
git add app.js
git commit -m "Renderiza clientes, totais e historico a partir do mock"
```

---

### Task 7: Ligar a pausa de emergência ao painel

**Files:**
- Modify: `app.js`

**Interfaces:**
- Consumes: `lerPausa`, `alternarPausa`, `lerEventosPausa` de
  `estado-pausa.js`.
- Produces: painel completo da Fase 1.

- [ ] **Step 1: Importar o módulo da pausa em `app.js`**

Acrescentar ao bloco de imports, depois do import de `logica.js`:

```js
import { lerPausa, alternarPausa, lerEventosPausa } from './estado-pausa.js';
```

- [ ] **Step 2: Ler o armazenamento com tolerância a falha**

Acrescentar logo abaixo da constante `elemento`:

```js
// Em modo restrito o proprio acesso a window.localStorage lanca. O dublê
// devolvido mantem o painel funcional, apenas sem persistencia.
function obterArmazenamento() {
  try {
    const teste = '__cobranca_teste__';
    window.localStorage.setItem(teste, '1');
    window.localStorage.removeItem(teste);
    return window.localStorage;
  } catch {
    return {
      getItem: () => null,
      setItem: () => {},
    };
  }
}

const armazenamento = obterArmazenamento();
```

- [ ] **Step 3: Renderizar o histórico mesclado com os eventos de pausa**

Substituir a função `renderizarHistorico` por esta versão, que intercala os
eventos de sistema entre as mensagens, na mesma ordem cronológica:

```js
function itemDeEvento(evento) {
  const item = document.createElement('li');
  item.className = 'historico-sistema';

  const topo = document.createElement('div');
  topo.className = 'historico-topo';

  const nome = document.createElement('span');
  nome.className = 'historico-nome';
  nome.textContent = evento.pausado
    ? 'Sistema — disparos pausados'
    : 'Sistema — disparos retomados';

  const quando = document.createElement('span');
  quando.className = 'historico-quando';
  quando.textContent = formatadorDataHora.format(new Date(evento.quando));

  topo.append(nome, quando);
  item.append(topo);
  return item;
}

function renderizarHistorico() {
  const mensagens = historico.map((entrada) => ({
    quando: entrada.quando,
    elemento: () => itemDeMensagem(entrada),
  }));
  const eventos = lerEventosPausa(armazenamento).map((evento) => ({
    quando: evento.quando,
    elemento: () => itemDeEvento(evento),
  }));

  const tudo = [...mensagens, ...eventos].sort(
    (a, b) => new Date(b.quando) - new Date(a.quando),
  );

  elemento('lista-historico').replaceChildren(...tudo.map((linha) => linha.elemento()));
  elemento('vazio-historico').hidden = tudo.length > 0;
}
```

- [ ] **Step 4: Aplicar o estado da pausa na interface**

Acrescentar antes da função `renderizar`:

```js
function aplicarPausa(estado) {
  const botao = elemento('botao-pausa');
  botao.setAttribute('aria-pressed', String(estado.pausado));
  botao.textContent = estado.pausado ? 'Retomar disparos' : 'Pausar disparos';
  elemento('faixa-pausa').hidden = !estado.pausado;
  elemento('painel').classList.toggle('painel-pausado', estado.pausado);
}
```

- [ ] **Step 5: Ligar o clique e chamar no carregamento**

Substituir a função `renderizar` e a chamada final por:

```js
function renderizar() {
  const hoje = new Date();
  renderizarTotais(hoje);
  renderizarClientes(hoje);
  renderizarHistorico();
}

elemento('botao-pausa').addEventListener('click', () => {
  aplicarPausa(alternarPausa(armazenamento, new Date()));
  renderizarHistorico();
});

aplicarPausa(lerPausa(armazenamento));
renderizar();
```

- [ ] **Step 6: Rodar os testes**

Run: `node --test testes/`
Expected: PASS, 15 testes. (`app.js` não é coberto por teste automatizado; a
lógica que ele consome já está.)

- [ ] **Step 7: Verificar a pausa no navegador**

Run: `node servidor-local.js`, abrir `http://localhost:4173`.
Expected:
1. Clicar em "Pausar disparos": faixa vermelha aparece, painel esmaece, o
   botão vira "Retomar disparos" com `aria-pressed="true"`, e uma linha
   "Sistema — disparos pausados" aparece no topo do histórico.
2. Recarregar a página: continua pausado.
3. Clicar em "Retomar disparos": faixa some, painel volta ao normal, segunda
   linha de sistema no histórico.
4. Navegar até o botão só pelo teclado (Tab) e acioná-lo com Enter e Espaço.
5. Console sem erro.

- [ ] **Step 8: Verificação final de segurança**

Run: `git status --porcelain --untracked-files=all`
Expected: `.env` não aparece.

Run: `grep -rniE "(api[_-]?key|token|senha|password|secret|bearer)" --include="*.js" --include="*.html" --include="*.css" .`
Expected: só as ocorrências de `.env.exemplo` e do README — nenhum valor,
apenas nomes de variáveis. Nenhum resultado em `index.html`, `app.js`,
`logica.js`, `estado-pausa.js`, `dados-mock.js`.

Run: `grep -rnE "fetch\(|XMLHttpRequest|<script src=|https?://" --include="*.js" --include="*.html" .`
Expected: nenhum `fetch(`, nenhum `XMLHttpRequest`, nenhum `<script src>`
externo. As únicas URLs são `http://localhost:4173` em `servidor-local.js`
(uso local) e o `xmlns` do HTML, se houver.

- [ ] **Step 9: Commit**

```bash
git add app.js
git commit -m "Liga a pausa de emergencia ao painel e ao historico"
```

---

## Definição de pronto

- `node --test testes/` passa com 15 testes.
- O painel renderiza os sete clientes com valor, vencimento, atraso, telefone
  mascarado e situação.
- A pausa persiste através de recarga e registra os dois eventos no
  histórico.
- Os estados vazios aparecem quando as listas estão vazias.
- Nenhuma credencial em arquivo versionado; `.env` fora do git; nenhuma
  chamada de rede.
- Sete commits, um por tarefa. Push pendente até a URL do remote.
