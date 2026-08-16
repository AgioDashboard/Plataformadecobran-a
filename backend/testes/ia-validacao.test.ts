import test from 'node:test';
import assert from 'node:assert/strict';
import { validarResposta } from '../src/ia/responder.ts';

const base = {
  intencao: 'pede_boleto' as const,
  resposta: 'Claro, vou providenciar a segunda via.',
  encaminhar_humano: false,
  silenciar: false,
};

test('resposta sem valor monetario passa', () => {
  assert.equal(validarResposta(base, 'R$ 1.287,90').ok, true);
});

test('resposta com o valor correto da divida passa', () => {
  const d = { ...base, resposta: 'O valor em aberto e R$ 1.287,90.' };
  assert.equal(validarResposta(d, 'R$ 1.287,90').ok, true);
});

test('resposta inventando outro valor e barrada', () => {
  const d = { ...base, resposta: 'Consigo fechar por R$ 800,00.' };
  const r = validarResposta(d, 'R$ 1.287,90');
  assert.equal(r.ok, false);
  assert.match(r.motivo, /valor/);
});

test('resposta com percentual de desconto e barrada', () => {
  const d = { ...base, resposta: 'Posso dar 20% de desconto.' };
  const r = validarResposta(d, 'R$ 1.287,90');
  assert.equal(r.ok, false);
  assert.match(r.motivo, /desconto/);
});

test('resposta vazia e barrada', () => {
  assert.equal(validarResposta({ ...base, resposta: '   ' }, null).ok, false);
});

test('resposta longa demais e barrada', () => {
  const d = { ...base, resposta: 'a'.repeat(1001) };
  assert.equal(validarResposta(d, null).ok, false);
});

test('pedido de parar sempre silencia, mesmo se a IA esquecer', () => {
  const d = { ...base, intencao: 'pede_para_parar' as const, silenciar: false };
  const r = validarResposta(d, null);
  assert.equal(r.ok, false);
  assert.match(r.motivo, /silenciar/);
});

// --- Endurecimento: o validador antes so via cifra numerica e "%" ---

test('valor por extenso e barrado', () => {
  const d = { ...base, resposta: 'Consigo fechar por mil e duzentos reais.' };
  const r = validarResposta(d, 'R$ 1.287,90');
  assert.equal(r.ok, false);
  assert.match(r.motivo, /valor/);
});

test('valor em digitos sem cifra e barrado', () => {
  const d = { ...base, resposta: 'Fica 800,00 reais entao.' };
  const r = validarResposta(d, 'R$ 1.287,90');
  assert.equal(r.ok, false);
  assert.match(r.motivo, /valor/);
});

test('palavras de abatimento sao barradas', () => {
  for (const texto of [
    'Dou metade de abatimento.',
    'Posso abater uma parte.',
    'Consigo reduzir o total.',
  ]) {
    const r = validarResposta({ ...base, resposta: texto }, 'R$ 1.287,90');
    assert.equal(r.ok, false, `deveria barrar: ${texto}`);
    assert.match(r.motivo, /desconto|abatimento/);
  }
});

test('percentual por extenso e barrado', () => {
  const d = { ...base, resposta: 'Posso tirar 20 por cento do valor.' };
  const r = validarResposta(d, 'R$ 1.287,90');
  assert.equal(r.ok, false);
  assert.match(r.motivo, /desconto|abatimento/);
});

test('ameaca de negativacao e barrada', () => {
  for (const texto of [
    'Se nao pagar, seu nome vai para o SPC.',
    'Vamos negativar seu CPF.',
    'O caso segue para o Serasa.',
  ]) {
    const r = validarResposta({ ...base, resposta: texto }, 'R$ 1.287,90');
    assert.equal(r.ok, false, `deveria barrar: ${texto}`);
    assert.match(r.motivo, /coercao/);
  }
});

test('ameaca juridica e barrada, com ou sem acento', () => {
  for (const texto of [
    'Vamos entrar com acao judicial.',
    'O protesto em cartório ja foi solicitado.',
    'Nosso advogado vai entrar em contato.',
  ]) {
    const r = validarResposta({ ...base, resposta: texto }, 'R$ 1.287,90');
    assert.equal(r.ok, false, `deveria barrar: ${texto}`);
    assert.match(r.motivo, /coercao/);
  }
});

// Guarda contra excesso: se o validador barrar resposta legitima, a IA vira
// inutil e tudo cai no humano.
test('respostas legitimas continuam passando', () => {
  for (const texto of [
    'Claro, vou providenciar a segunda via.',
    'Registrei seu pedido de prazo. Um atendente confirma em breve.',
    'O valor em aberto e R$ 1.287,90, com vencimento em 18/06/2026.',
    'Entendi, vou encaminhar para um atendente retomar o contato.',
    'Certo, nao enviaremos mais mensagens para este numero.',
  ]) {
    const r = validarResposta({ ...base, resposta: texto }, 'R$ 1.287,90');
    assert.equal(r.ok, true, `nao deveria barrar: ${texto} (${r.motivo})`);
  }
});
