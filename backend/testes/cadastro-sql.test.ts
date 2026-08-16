import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { comoCredorId } from '../src/dominio/credor.ts';

// Caminho montado a partir de import.meta.dirname, e nao de um URL: o
// projeto compila com os tipos do Workers, onde URL e o global da
// plataforma e nao o do Node, e readFileSync recusa esse tipo.
const fonte = readFileSync(join(import.meta.dirname, '../src/db/cadastro.ts'), 'utf8');

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
