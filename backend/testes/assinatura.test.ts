import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { verificarAssinatura } from '../src/whatsapp/assinatura.ts';

const SEGREDO = 'segredo-de-teste';
const CORPO = '{"object":"whatsapp_business_account"}';

function assinar(corpo: string, segredo = SEGREDO): string {
  return 'sha256=' + createHmac('sha256', segredo).update(corpo).digest('hex');
}

test('assinatura correta e aceita', async () => {
  assert.equal(await verificarAssinatura(CORPO, assinar(CORPO), SEGREDO), true);
});

test('assinatura de outro segredo e rejeitada', async () => {
  assert.equal(await verificarAssinatura(CORPO, assinar(CORPO, 'outro'), SEGREDO), false);
});

test('corpo adulterado e rejeitado', async () => {
  const valida = assinar(CORPO);
  assert.equal(await verificarAssinatura(CORPO + ' ', valida, SEGREDO), false);
});

test('cabecalho ausente e rejeitado', async () => {
  assert.equal(await verificarAssinatura(CORPO, null, SEGREDO), false);
});

test('cabecalho sem o prefixo sha256 e rejeitado', async () => {
  const semPrefixo = assinar(CORPO).replace('sha256=', '');
  assert.equal(await verificarAssinatura(CORPO, semPrefixo, SEGREDO), false);
});

test('cabecalho com tamanho errado e rejeitado sem lancar', async () => {
  assert.equal(await verificarAssinatura(CORPO, 'sha256=abc', SEGREDO), false);
});
