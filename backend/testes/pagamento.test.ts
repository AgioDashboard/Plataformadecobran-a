import test from 'node:test';
import assert from 'node:assert/strict';
import { gerarBoletoFicticio, gerarLinkCartaoFicticio, gerarPixFicticio } from '../src/dominio/pagamento.ts';

test('gerarPixFicticio produz uma chave marcada como ficticia, nunca um PIX real', () => {
  const pix = gerarPixFicticio(120000, 'divida-42');
  assert.match(pix.chaveCopiaECola, /TESTFICTICIO/);
  assert.equal(pix.valorCentavos, 120000);
  assert.equal(pix.referencia, 'divida-42');
});

test('gerarPixFicticio e deterministico para a mesma referencia e valor', () => {
  const a = gerarPixFicticio(120000, 'divida-42');
  const b = gerarPixFicticio(120000, 'divida-42');
  assert.equal(a.chaveCopiaECola, b.chaveCopiaECola);
});

test('gerarPixFicticio muda a chave se o valor ou a referencia mudar', () => {
  const a = gerarPixFicticio(120000, 'divida-42');
  const b = gerarPixFicticio(150000, 'divida-42');
  const c = gerarPixFicticio(120000, 'divida-43');
  assert.notEqual(a.chaveCopiaECola, b.chaveCopiaECola);
  assert.notEqual(a.chaveCopiaECola, c.chaveCopiaECola);
});

test('gerarBoletoFicticio produz uma linha digitavel com 5 blocos, formato visual de boleto', () => {
  const boleto = gerarBoletoFicticio(120000, '2026-09-01', 'divida-42');
  const blocos = boleto.linhaDigitavel.split(' ');
  assert.equal(blocos.length, 5);
  assert.equal(boleto.valorCentavos, 120000);
  assert.equal(boleto.vencimento, '2026-09-01');
});

test('gerarBoletoFicticio e deterministico para os mesmos dados', () => {
  const a = gerarBoletoFicticio(120000, '2026-09-01', 'divida-42');
  const b = gerarBoletoFicticio(120000, '2026-09-01', 'divida-42');
  assert.equal(a.linhaDigitavel, b.linhaDigitavel);
});

test('gerarLinkCartaoFicticio produz um link de dominio de teste, nunca um gateway real', () => {
  const link = gerarLinkCartaoFicticio(120000, 'divida-42');
  assert.match(link.url, /^https:\/\/pagamento-teste\.agio\.local\/c\//);
  assert.equal(link.valorCentavos, 120000);
  assert.equal(link.referencia, 'divida-42');
});

test('gerarLinkCartaoFicticio e deterministico e muda se o valor mudar', () => {
  const a = gerarLinkCartaoFicticio(120000, 'divida-42');
  const b = gerarLinkCartaoFicticio(120000, 'divida-42');
  const c = gerarLinkCartaoFicticio(150000, 'divida-42');
  assert.equal(a.url, b.url);
  assert.notEqual(a.url, c.url);
});
