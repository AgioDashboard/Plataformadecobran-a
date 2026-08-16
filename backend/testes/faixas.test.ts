import test from 'node:test';
import assert from 'node:assert/strict';
import { validarRegras, PARCELAS_MAXIMO } from '../src/dominio/faixas.ts';

const base = {
  faixas: [
    { de: 1, ate: 1, descontoPct: 20 },
    { de: 2, ate: 3, descontoPct: 10 },
    { de: 4, ate: 6, descontoPct: 0 },
  ],
  parcelaMinimaCentavos: 2000,
  descontoTetoPct: 20,
  comissaoSobreRecuperadoPct: 15,
};

test('configuracao coerente passa', () => {
  assert.deepEqual(validarRegras(base), { ok: true });
});

test('sem faixa nenhuma e recusado', () => {
  // Nao e o mesmo que "nao oferecer nada": salvar vazio por engano deixaria
  // o portal mudo sem ninguem perceber. Recusar obriga a decisao explicita.
  const r = validarRegras({ ...base, faixas: [] });
  assert.equal(r.ok, false);
});

test('a primeira faixa precisa comecar em 1', () => {
  const r = validarRegras({ ...base, faixas: [{ de: 2, ate: 6, descontoPct: 0 }] });
  assert.equal(r.ok, false);
  assert.match(r.ok === false ? r.motivo : '', /primeira faixa/i);
});

test('faixa com de maior que ate e recusada', () => {
  const r = validarRegras({ ...base, faixas: [{ de: 1, ate: 0, descontoPct: 0 }] });
  assert.equal(r.ok, false);
});

test('faixas sobrepostas sao recusadas', () => {
  // 1..3 e 3..6 deixariam 3x com dois descontos possiveis.
  const r = validarRegras({
    ...base,
    faixas: [
      { de: 1, ate: 3, descontoPct: 20 },
      { de: 3, ate: 6, descontoPct: 10 },
    ],
  });
  assert.equal(r.ok, false);
  assert.match(r.ok === false ? r.motivo : '', /sobrep/i);
});

test('buraco entre faixas e recusado', () => {
  // 1..2 e 5..6 deixaria 3x e 4x sem regra: o portal simplesmente nao as
  // ofereceria, e ninguem entenderia por que.
  const r = validarRegras({
    ...base,
    faixas: [
      { de: 1, ate: 2, descontoPct: 20 },
      { de: 5, ate: 6, descontoPct: 0 },
    ],
  });
  assert.equal(r.ok, false);
  assert.match(r.ok === false ? r.motivo : '', /sequ|buraco|continu/i);
});

test('desconto acima do teto e recusado', () => {
  const r = validarRegras({
    ...base,
    descontoTetoPct: 10,
    faixas: [{ de: 1, ate: 6, descontoPct: 20 }],
  });
  assert.equal(r.ok, false);
  assert.match(r.ok === false ? r.motivo : '', /teto/i);
});

test('desconto negativo ou acima de 100 e recusado', () => {
  assert.equal(validarRegras({ ...base, faixas: [{ de: 1, ate: 1, descontoPct: -1 }] }).ok, false);
  assert.equal(
    validarRegras({ ...base, descontoTetoPct: 100, faixas: [{ de: 1, ate: 1, descontoPct: 101 }] }).ok,
    false,
  );
});

test('teto fora de 0 a 100 e recusado', () => {
  assert.equal(validarRegras({ ...base, descontoTetoPct: 101 }).ok, false);
  assert.equal(validarRegras({ ...base, descontoTetoPct: -1 }).ok, false);
});

test('parcela minima precisa ser positiva e inteira', () => {
  assert.equal(validarRegras({ ...base, parcelaMinimaCentavos: 0 }).ok, false);
  assert.equal(validarRegras({ ...base, parcelaMinimaCentavos: -100 }).ok, false);
  assert.equal(validarRegras({ ...base, parcelaMinimaCentavos: 10.5 }).ok, false);
});

test('parcelas nao inteiras sao recusadas', () => {
  assert.equal(validarRegras({ ...base, faixas: [{ de: 1, ate: 2.5, descontoPct: 0 }] }).ok, false);
});

test('passar do maximo de parcelas e recusado', () => {
  const r = validarRegras({
    ...base,
    faixas: [{ de: 1, ate: PARCELAS_MAXIMO + 1, descontoPct: 0 }],
  });
  assert.equal(r.ok, false);
});

test('comissao fora de 0 a 100 e recusada', () => {
  assert.equal(validarRegras({ ...base, comissaoSobreRecuperadoPct: 120 }).ok, false);
});

test('uma faixa unica cobrindo tudo passa', () => {
  // E o formato para o qual os credores da Fase 3 sao migrados.
  assert.deepEqual(
    validarRegras({ ...base, descontoTetoPct: 0, faixas: [{ de: 1, ate: 1, descontoPct: 0 }] }),
    { ok: true },
  );
});
