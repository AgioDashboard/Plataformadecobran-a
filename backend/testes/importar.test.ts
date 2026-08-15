import test from 'node:test';
import assert from 'node:assert/strict';
import { interpretarCsv } from '../src/cobmais/importar.ts';

const CSV = `nome;telefone;valor;vencimento
Aurora Comercio;5511900000001;1287,90;18/06/2026
Benedito Nunes;+55 11 90000-0002;459,00;02/07/2026`;

test('interpreta linhas validas', () => {
  const linhas = interpretarCsv(CSV);
  assert.equal(linhas.length, 2);
  assert.equal(linhas[0].nome, 'Aurora Comercio');
  assert.equal(linhas[0].valorCentavos, 128790);
  assert.equal(linhas[0].vencimento, '2026-06-18');
});

test('normaliza o telefone', () => {
  const linhas = interpretarCsv(CSV);
  assert.equal(linhas[1].telefone, '5511900000002');
});

test('descarta linha sem telefone em vez de enviar para lugar nenhum', () => {
  const semTelefone = `nome;telefone;valor;vencimento\nX;;10,00;01/01/2026`;
  assert.deepEqual(interpretarCsv(semTelefone), []);
});

test('descarta valor ilegivel', () => {
  const ruim = `nome;telefone;valor;vencimento\nX;5511900000001;abc;01/01/2026`;
  assert.deepEqual(interpretarCsv(ruim), []);
});

test('csv so com cabecalho devolve lista vazia', () => {
  assert.deepEqual(interpretarCsv('nome;telefone;valor;vencimento'), []);
});
