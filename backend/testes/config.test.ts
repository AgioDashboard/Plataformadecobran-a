import test from 'node:test';
import assert from 'node:assert/strict';
import { lerConfig } from '../src/config.ts';

const completo = {
  WHATSAPP_TOKEN: 't',
  WHATSAPP_PHONE_NUMBER_ID: '1',
  WHATSAPP_BUSINESS_ACCOUNT_ID: '2',
  WHATSAPP_VERIFY_TOKEN: 'v',
  WHATSAPP_APP_SECRET: 's',
  ANTHROPIC_API_KEY: 'k',
  PAINEL_TOKEN: 'p',
};

test('lerConfig aceita ambiente completo', () => {
  const c = lerConfig(completo);
  assert.equal(c.whatsapp.numeroId, '1');
  assert.equal(c.ambiente, 'teste');
});

test('lerConfig lista todas as variaveis ausentes de uma vez', () => {
  const { WHATSAPP_TOKEN, ANTHROPIC_API_KEY, ...parcial } = completo;
  assert.throws(
    () => lerConfig(parcial),
    /WHATSAPP_TOKEN.*ANTHROPIC_API_KEY/s,
  );
});

test('DESTINATARIOS_TESTE vira lista limpa', () => {
  const c = lerConfig({ ...completo, DESTINATARIOS_TESTE: ' 5511900000001 , 5511900000002 ,, ' });
  assert.deepEqual(c.destinatariosTeste, ['5511900000001', '5511900000002']);
});
