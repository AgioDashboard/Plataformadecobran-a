import test from 'node:test';
import assert from 'node:assert/strict';
import { interpretarCsv, resumoDaImportacao } from '../src/cobmais/importar.ts';

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

test('planilha sem colunas extras nao inventa telefone adicional', () => {
  assert.deepEqual(interpretarCsv(CSV)[0].telefonesExtras, []);
});

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
