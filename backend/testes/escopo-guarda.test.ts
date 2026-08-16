import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

// join(import.meta.dirname, ...) e nao new URL(...): o tsconfig carrega
// @cloudflare/workers-types, entao URL global e a da plataforma Workers, de
// tipo incompativel com a URL do Node que readFileSync aceita. Os testes
// rodariam; o tsc e que reclamaria (TS2769).
const raizSrc = join(import.meta.dirname, '..', 'src');

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

// src/painel/arquivos.ts e gerado por scripts/gerar-painel.mjs e carrega o
// HTML e o JS do painel como texto. Nada ali fala com o D1, mas os template
// literals do painel caem na peneira de SQL abaixo e viram alarme falso.
// Varrer codigo gerado tambem nao protege ninguem: a fonte de verdade sao
// os arquivos da raiz, e um problema real apareceria neles primeiro.
const GERADOS = new Set(['painel/arquivos.ts']);

function arquivosTs(dir: string): string[] {
  return readdirSync(dir).flatMap((nome) => {
    const caminho = join(dir, nome);
    if (statSync(caminho).isDirectory()) return arquivosTs(caminho);
    return nome.endsWith('.ts') ? [caminho] : [];
  });
}

function relativoDe(caminho: string): string {
  // +1 descarta o separador que sobra depois da raiz.
  return caminho.slice(raizSrc.length + 1).replace(/\\/g, '/');
}

interface ComandoSql {
  sql: string;
  funcao: string;
}

// A chave da excecao aponta uma FUNCAO, nao um arquivo. Por isso cada SQL
// carrega o nome da funcao que o cerca: liberar o arquivo inteiro deixaria
// toda consulta futura de repositorio.ts entrar sem escopo e sem ninguem
// reparar — o oposto do que este teste existe para fazer.
function comandos(texto: string): ComandoSql[] {
  return [...texto.matchAll(/`([^`]*(?:SELECT|INSERT|UPDATE|DELETE)[^`]*)`/gi)].map((m) => {
    const antes = texto.slice(0, m.index);
    const declaracoes = [...antes.matchAll(/\bfunction\s+([A-Za-z0-9_$]+)/g)];
    const ultima = declaracoes[declaracoes.length - 1];
    return { sql: m[1], funcao: ultima ? ultima[1] : '(fora de funcao)' };
  });
}

test('nenhuma consulta a tabela de carteira roda sem credor_id', () => {
  const faltas: string[] = [];

  for (const caminho of arquivosTs(raizSrc)) {
    const relativo = relativoDe(caminho);
    if (GERADOS.has(relativo)) continue;
    for (const { sql, funcao } of comandos(readFileSync(caminho, 'utf8'))) {
      if (!TABELAS_DE_CARTEIRA.test(sql)) continue;
      if (/credor_id/i.test(sql)) continue;
      if (LIBERADOS.has(`${relativo}:${funcao}`)) continue;

      faltas.push(`${relativo}:${funcao}: ${sql.replace(/\s+/g, ' ').trim().slice(0, 120)}`);
    }
  }

  assert.deepEqual(faltas, [], `consultas sem escopo de credor:\n${faltas.join('\n')}`);
});

test('toda excecao liberada tem justificativa escrita', () => {
  for (const [chave, motivo] of LIBERADOS) {
    assert.ok(motivo.length > 40, `excecao sem justificativa util: ${chave}`);
  }
});
