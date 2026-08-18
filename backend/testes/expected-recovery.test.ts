import test from 'node:test';
import assert from 'node:assert/strict';
import { PARAMETROS_PADRAO, calcularER, melhorOferta } from '../src/dominio/expected-recovery.ts';

test('a vista com 100% de chance de aceite e honra recupera o valor cheio (fator tempo = 1)', () => {
  const er = calcularER(
    { entradaCentavos: 100000, parcelasCentavos: [], pAceite: 1 },
    { ...PARAMETROS_PADRAO, pHonrarBase: 1, descontoTemporalAnual: 0 },
  );
  assert.equal(er, 100000);
});

test('quebra reduz a recuperacao esperada de parcelas mais distantes', () => {
  const erSemQuebra = calcularER(
    { entradaCentavos: 0, parcelasCentavos: [10000, 10000, 10000], pAceite: 1 },
    { ...PARAMETROS_PADRAO, pHonrarBase: 1, sobrevivenciaMensal: 1, descontoTemporalAnual: 0, custoPorParcelaCentavos: 0 },
  );
  const erComQuebra = calcularER(
    { entradaCentavos: 0, parcelasCentavos: [10000, 10000, 10000], pAceite: 1 },
    { ...PARAMETROS_PADRAO, pHonrarBase: 1, sobrevivenciaMensal: 0.8, descontoTemporalAnual: 0, custoPorParcelaCentavos: 0 },
  );
  assert.equal(erSemQuebra, 30000);
  assert.ok(erComQuebra < erSemQuebra);
});

test('custo por parcela reduz o ER proporcionalmente ao numero de parcelas', () => {
  const semCusto = calcularER(
    { entradaCentavos: 0, parcelasCentavos: [10000, 10000], pAceite: 1 },
    { ...PARAMETROS_PADRAO, pHonrarBase: 1, sobrevivenciaMensal: 1, descontoTemporalAnual: 0, custoPorParcelaCentavos: 0 },
  );
  const comCusto = calcularER(
    { entradaCentavos: 0, parcelasCentavos: [10000, 10000], pAceite: 1 },
    { ...PARAMETROS_PADRAO, pHonrarBase: 1, sobrevivenciaMensal: 1, descontoTemporalAnual: 0, custoPorParcelaCentavos: 500 },
  );
  assert.equal(semCusto - comCusto, 1000); // 2 parcelas * 500 centavos de custo
});

test('probabilidade de aceite zero nao recupera nada, so o custo de cobranca negativa', () => {
  // Recebido esperado zera, mas o custo operacional de tentar cobrar (o
  // lembrete da parcela) continua existindo — ER fica negativo, nao zero.
  const er = calcularER(
    { entradaCentavos: 100000, parcelasCentavos: [50000], pAceite: 0 },
    PARAMETROS_PADRAO,
  );
  assert.equal(er, -PARAMETROS_PADRAO.custoPorParcelaCentavos);
});

test('a estrutura mais generosa nao e automaticamente a de maior ER (spec 4.3)', () => {
  // Reproduz o exemplo numerico da spec: um desconto grande com pAceite
  // alto mas honra baixa pode perder para uma estrutura mais conservadora.
  const generosa = calcularER({
    entradaCentavos: 0,
    parcelasCentavos: Array(12).fill(8750),
    pAceite: 0.68,
  }, { ...PARAMETROS_PADRAO, pHonrarBase: 0.55, sobrevivenciaMensal: 0.9 });

  const moderada = calcularER({
    entradaCentavos: 30000,
    parcelasCentavos: Array(6).fill(15000),
    pAceite: 0.55,
  }, { ...PARAMETROS_PADRAO, pHonrarBase: 0.78, sobrevivenciaMensal: 0.95 });

  assert.ok(moderada > generosa, `esperava moderada (${moderada}) > generosa (${generosa})`);
});

test('melhorOferta escolhe o maior ER entre candidatas', () => {
  const resultado = melhorOferta([
    { id: 'ruim', estrutura: { entradaCentavos: 10000, parcelasCentavos: [], pAceite: 0.1 } },
    { id: 'boa', estrutura: { entradaCentavos: 100000, parcelasCentavos: [], pAceite: 0.5 } },
  ]);
  assert.equal(resultado?.id, 'boa');
});

test('com ER parecido, melhorOferta prefere o prazo mais curto (regra de ouro 4.5)', () => {
  const resultado = melhorOferta([
    { id: 'curto', estrutura: { entradaCentavos: 0, parcelasCentavos: [50000, 50000], pAceite: 0.5 } },
    {
      id: 'longo',
      // ER quase identico ao curto, mas em mais parcelas.
      estrutura: { entradaCentavos: 0, parcelasCentavos: [26000, 26000, 26000, 26000], pAceite: 0.5 },
    },
  ]);
  assert.equal(resultado?.id, 'curto');
});

test('lista vazia devolve null', () => {
  assert.equal(melhorOferta([]), null);
});
