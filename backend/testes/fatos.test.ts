import test from 'node:test';
import assert from 'node:assert/strict';
import { blocoFatosLiberados, FATOS_PADRAO } from '../src/dominio/fatos.ts';

test('blocoFatosLiberados produz JSON valido com os fatos configurados', () => {
  const bloco = JSON.parse(blocoFatosLiberados(FATOS_PADRAO));
  assert.deepEqual(bloco.formas_pagamento_aceitas, FATOS_PADRAO.formasPagamentoAceitas);
  assert.equal(bloco.cartao_credito_disponivel, FATOS_PADRAO.cartaoCreditoDisponivel);
  assert.equal(bloco.prazo_baixa_serasa_dias, FATOS_PADRAO.prazoBaixaSerasaDias);
  assert.equal(bloco.condicao_baixa, FATOS_PADRAO.condicaoBaixa);
});

// FATOS_PADRAO so pode afirmar uma forma de pagamento disponivel se houver
// ferramenta de verdade por tras (Adendo 1, Defeito 5) — cartao passou a
// ser true quando o botao "Pagar com cartao" (link ficticio) foi
// implementado, junto com PIX e boleto.
test('cartao de credito so esta marcado disponivel porque ha ferramenta (botao) por tras', () => {
  assert.equal(FATOS_PADRAO.cartaoCreditoDisponivel, true);
  assert.ok(FATOS_PADRAO.formasPagamentoAceitas.includes('cartao'));
});
