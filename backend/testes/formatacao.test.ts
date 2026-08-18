import test from 'node:test';
import assert from 'node:assert/strict';
import { formatarData, formatarMoeda } from '../src/dominio/formatacao.ts';

test('formata centavos como reais com virgula e ponto de milhar', () => {
  assert.equal(formatarMoeda(120000), 'R$ 1.200,00');
  assert.equal(formatarMoeda(85000), 'R$ 850,00');
  assert.equal(formatarMoeda(50), 'R$ 0,50');
});

// O formato precisa bater com PADRAO_VALOR em ia/responder.ts: valor errado
// e um defeito de compliance, nao so de exibicao.
test('o formato bate com o padrao que validarResposta procura', () => {
  const PADRAO_VALOR = /R\$\s?[\d.]+,\d{2}/;
  assert.match(formatarMoeda(123456), PADRAO_VALOR);
});

test('formata data ISO como dd/mm/aaaa', () => {
  assert.equal(formatarData('2026-08-18'), '18/08/2026');
});

test('formata data de virada de ano sem deslizar de dia', () => {
  assert.equal(formatarData('2026-01-01'), '01/01/2026');
  assert.equal(formatarData('2026-12-31'), '31/12/2026');
});
