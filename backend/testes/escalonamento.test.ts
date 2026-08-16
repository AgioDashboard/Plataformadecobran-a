import test from 'node:test';
import assert from 'node:assert/strict';
import { proximoPasso } from '../src/dominio/escalonamento.ts';

const cel1 = { id: 1, numero: '5535900000001', status: 'desconhecido' as const, prioridade: 100 };
const cel2 = { id: 2, numero: '5535900000002', status: 'desconhecido' as const, prioridade: 101 };
const fixo = { id: 3, numero: '553530000003', status: 'desconhecido' as const, prioridade: 200 };

test('tenta o de melhor prioridade primeiro', () => {
  const d = proximoPasso([fixo, cel2, cel1], false);
  assert.deepEqual(d, { acao: 'tentar', telefone: cel1 });
});

test('nunca tenta um segundo enquanto o primeiro nao respondeu', () => {
  const d = proximoPasso([cel1, cel2], true);
  assert.equal(d.acao, 'esperar');
});

test('telefone ja confirmado vence a prioridade', () => {
  // Descobrir custa caro; nao gastar tentativa em quem ja provou.
  const confirmado = { ...fixo, status: 'tem_whatsapp' as const };
  const d = proximoPasso([cel1, cel2, confirmado], false);
  assert.deepEqual(d, { acao: 'tentar', telefone: confirmado });
});

test('telefone sem whatsapp nunca mais e tentado', () => {
  const morto = { ...cel1, status: 'sem_whatsapp' as const };
  const d = proximoPasso([morto, cel2], false);
  assert.deepEqual(d, { acao: 'tentar', telefone: cel2 });
});

test('telefone invalido nunca e tentado', () => {
  const invalido = { ...cel1, status: 'invalido' as const };
  const d = proximoPasso([invalido, cel2], false);
  assert.deepEqual(d, { acao: 'tentar', telefone: cel2 });
});

test('todos descartados: desiste em vez de tentar de novo', () => {
  const d = proximoPasso(
    [
      { ...cel1, status: 'sem_whatsapp' as const },
      { ...cel2, status: 'invalido' as const },
    ],
    false,
  );
  assert.equal(d.acao, 'desistir');
});

test('devedor sem telefone nenhum desiste', () => {
  assert.equal(proximoPasso([], false).acao, 'desistir');
});

test('fixo e tentado depois que os celulares se esgotam', () => {
  const d = proximoPasso([{ ...cel1, status: 'sem_whatsapp' as const }, fixo], false);
  assert.deepEqual(d, { acao: 'tentar', telefone: fixo });
});
