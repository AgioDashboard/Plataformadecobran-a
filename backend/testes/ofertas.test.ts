import test from 'node:test';
import assert from 'node:assert/strict';
import { gerarOfertas } from '../src/dominio/ofertas.ts';

const regras = {
  faixas: [
    { de: 1, ate: 1, descontoPct: 20 },
    { de: 2, ate: 3, descontoPct: 10 },
    { de: 4, ate: 6, descontoPct: 0 },
  ],
  parcelaMinimaCentavos: 2000,
  descontoTetoPct: 20,
  comissaoSobreRecuperadoPct: 15,
};

test('gera uma oferta por quantidade de parcelas coberta', () => {
  const o = gerarOfertas(100000, regras);
  assert.deepEqual(o.map((x) => x.parcelas), [1, 2, 3, 4, 5, 6]);
});

test('cada faixa aplica o proprio desconto', () => {
  const o = gerarOfertas(100000, regras);
  assert.equal(o.find((x) => x.parcelas === 1)!.descontoPct, 20);
  assert.equal(o.find((x) => x.parcelas === 3)!.descontoPct, 10);
  assert.equal(o.find((x) => x.parcelas === 5)!.descontoPct, 0);
});

test('o desconto sai do total, nao da parcela', () => {
  const tresVezes = gerarOfertas(100000, regras).find((x) => x.parcelas === 3)!;
  assert.equal(tresVezes.totalCentavos, 90000);
  assert.equal(tresVezes.valorParcelaCentavos, 30000);
});

test('a vista e simplesmente uma parcela', () => {
  const aVista = gerarOfertas(100000, regras)[0];
  assert.equal(aVista.parcelas, 1);
  assert.equal(aVista.totalCentavos, 80000);
  assert.equal(aVista.valorParcelaCentavos, 80000);
});

test('parcela abaixo da minima nao e oferecida', () => {
  // Divida de R$ 70,00 com parcela minima de R$ 20,00: so ate 3x.
  // O minimo vale sobre a parcela JA descontada, que e o que a pessoa paga:
  // 3x sai de R$ 63,00 (10% de desconto), R$ 21,00 cada, e passa; 4x nao tem
  // desconto e cairia para R$ 17,50, abaixo do minimo.
  const o = gerarOfertas(7000, regras);
  assert.deepEqual(o.map((x) => x.parcelas), [1, 2, 3]);
});

test('divida pequena demais ainda oferece a vista', () => {
  // R$ 15,00 com parcela minima de R$ 20,00. A vista sai R$ 12,00, abaixo
  // do minimo — mas recusar seria impedir a pessoa de quitar. A parcela
  // minima governa PARCELAMENTO, nao pagamento unico.
  const o = gerarOfertas(1500, regras);
  assert.deepEqual(o.map((x) => x.parcelas), [1]);
});

test('a soma das parcelas cobre o total, sem centavo faltando', () => {
  for (const o of gerarOfertas(100003, regras)) {
    assert.ok(o.valorParcelaCentavos * o.parcelas >= o.totalCentavos,
      `${o.parcelas}x nao cobre o total`);
    assert.ok(o.valorParcelaCentavos * o.parcelas - o.totalCentavos < o.parcelas,
      `${o.parcelas}x cobra mais que um centavo por parcela a mais`);
  }
});

test('indices sao sequenciais a partir de zero', () => {
  const o = gerarOfertas(100000, regras);
  assert.deepEqual(o.map((x) => x.indice), o.map((_, i) => i));
});

test('saldo zero ou negativo nao gera oferta', () => {
  assert.deepEqual(gerarOfertas(0, regras), []);
  assert.deepEqual(gerarOfertas(-100, regras), []);
});

test('configuracao invalida nao gera oferta nenhuma', () => {
  // O portal nunca inventa condicao. Sem faixa valida, nao ha o que oferecer.
  assert.deepEqual(gerarOfertas(100000, { ...regras, faixas: [] }), []);
  assert.deepEqual(
    gerarOfertas(100000, { ...regras, faixas: [{ de: 2, ate: 3, descontoPct: 0 }] }),
    [],
  );
});

test('desconto acima do teto nao gera oferta', () => {
  // Defesa em profundidade: se uma configuracao invalida chegar ao banco por
  // outro caminho, o portal nao a executa.
  assert.deepEqual(
    gerarOfertas(100000, {
      ...regras,
      descontoTetoPct: 5,
      faixas: [{ de: 1, ate: 1, descontoPct: 20 }],
    }),
    [],
  );
});
