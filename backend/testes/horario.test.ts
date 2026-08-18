import test from 'node:test';
import assert from 'node:assert/strict';
import { dentroDoHorarioPermitido } from '../src/dominio/horario.ts';

// Datas fixas em UTC, convertidas mentalmente para America/Sao_Paulo
// (UTC-3, sem horario de verao desde 2019).

test('10h de Brasilia (13h UTC), terca-feira, esta dentro do horario', () => {
  const data = new Date('2026-08-18T13:00:00Z'); // terca
  assert.equal(dentroDoHorarioPermitido(data), true);
});

test('7h59 de Brasilia esta fora (antes das 8h)', () => {
  const data = new Date('2026-08-18T10:59:00Z');
  assert.equal(dentroDoHorarioPermitido(data), false);
});

test('20h de Brasilia esta fora (borda fechada)', () => {
  const data = new Date('2026-08-18T23:00:00Z');
  assert.equal(dentroDoHorarioPermitido(data), false);
});

test('19h59 de Brasilia ainda esta dentro', () => {
  const data = new Date('2026-08-18T22:59:00Z');
  assert.equal(dentroDoHorarioPermitido(data), true);
});

test('domingo bloqueia mesmo em horario comercial', () => {
  const domingo = new Date('2026-08-16T13:00:00Z'); // domingo, 10h BRT
  assert.equal(dentroDoHorarioPermitido(domingo), false);
});

test('sabado a tarde e permitido (so domingo e bloqueado)', () => {
  const sabado = new Date('2026-08-15T13:00:00Z'); // sabado, 10h BRT
  assert.equal(dentroDoHorarioPermitido(sabado), true);
});
