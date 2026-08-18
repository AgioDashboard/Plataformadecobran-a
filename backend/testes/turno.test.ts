import test from 'node:test';
import assert from 'node:assert/strict';
import { resolverTurno } from '../src/dominio/turno.ts';
import type { Decisao } from '../src/ia/responder.ts';
import { montarContextoNegociacao } from '../src/dominio/negociacao.ts';

function decisaoInvalida(resposta: string): Decisao {
  return {
    intencao: 'negociacao',
    resposta,
    motivo_escalar: 'nenhum',
    silenciar: false,
    proposta_do_cliente_centavos: null,
    cliente_aceitou: false,
    grau_apresentado: null,
    data_renda_declarada: null,
    capacidade_declarada_centavos: null,
    usar_espera_estrategica: false,
    resposta_apos_espera: null,
    grau_apresentado_apos_espera: null,
    valor_fechado_centavos: null,
    parcelas_fechadas: null,
    perguntas_novas: [],
    perguntas_resolvidas: [],
  };
}

function decisaoValida(): Decisao {
  return {
    intencao: 'pede_boleto',
    resposta: 'Claro, vou providenciar a segunda via.',
    motivo_escalar: 'nenhum',
    silenciar: false,
    proposta_do_cliente_centavos: null,
    cliente_aceitou: false,
    grau_apresentado: null,
    data_renda_declarada: null,
    capacidade_declarada_centavos: null,
    usar_espera_estrategica: false,
    resposta_apos_espera: null,
    grau_apresentado_apos_espera: null,
    valor_fechado_centavos: null,
    parcelas_fechadas: null,
    perguntas_novas: [],
    perguntas_resolvidas: [],
  };
}

// Fase 1, Principio 1, criterio de aceite explicito: "existe um teste que
// simula validacao falhando 3x e confirma que uma mensagem sai mesmo
// assim".
test('validacao falha nas 3 tentativas — ainda assim ha texto para enviar (fallback)', async () => {
  let chamadas = 0;
  const negociacao = montarContextoNegociacao(120000, 30, 0);

  const resultado = await resolverTurno(
    async () => {
      chamadas++;
      // Cita um percentual (25%) que nunca esta autorizado neste turno —
      // falha sempre, nas 3 tentativas.
      return decisaoInvalida('Posso fazer 25% de desconto.');
    },
    negociacao.permitido,
    negociacao,
    'Maria',
  );

  assert.equal(chamadas, 3, 'deveria tentar exatamente 3 vezes antes de desistir do LLM');
  assert.equal(resultado.viaFallback, true);
  assert.equal(resultado.textoFinal.length > 0, true, 'o fallback nunca pode ser texto vazio');
  assert.notEqual(resultado.textoFinal, 'Posso fazer 25% de desconto.');
  assert.match(resultado.textoFinal, /Maria/);
  // O fallback usa a oferta do motor (15% = abertura, degrau 1) — nao
  // repete o numero invalido que a IA tentou.
  assert.match(resultado.textoFinal, /15% de desconto/);
});

test('resolverTurno nao engole excecao do callback — quem chama precisa tratar', async () => {
  // resolverTurno so orquestra retry+fallback para respostas REJEITADAS
  // pelo validador. Se a propria chamada a IA lancar (rede fora do ar), a
  // responsabilidade de virar isso em decisao de reserva e de quem injeta
  // o callback (webhook.ts::tentarDecidir) — e o proximo teste confirma
  // que, fazendo isso, o resultado final ainda tem texto para enviar.
  const negociacao = montarContextoNegociacao(120000, 30, 0);
  await assert.rejects(
    () =>
      resolverTurno(
        async () => {
          throw new Error('Anthropic API fora do ar');
        },
        negociacao.permitido,
        negociacao,
        'Joao',
      ),
    /Anthropic API fora do ar/,
  );
});

test('callback que converte excecao em decisao de reserva (como webhook.ts faz) ainda produz fallback com texto', async () => {
  const negociacao = montarContextoNegociacao(120000, 30, 0);
  let chamadas = 0;

  const resultado = await resolverTurno(
    async () => {
      chamadas++;
      try {
        throw new Error('Anthropic API fora do ar');
      } catch {
        return decisaoInvalida(''); // resposta vazia: nunca passa no validador
      }
    },
    negociacao.permitido,
    negociacao,
    'Joao',
  );

  assert.equal(chamadas, 3);
  assert.equal(resultado.viaFallback, true);
  assert.equal(resultado.textoFinal.length > 0, true);
});

test('sem contexto de negociacao, o fallback tecnico ainda assim tem texto', async () => {
  const resultado = await resolverTurno(
    async () => decisaoInvalida('Consigo fechar por R$ 999.999,00.'),
    null,
    null,
    'Ana',
  );
  assert.equal(resultado.viaFallback, true);
  assert.match(resultado.textoFinal, /problema tecnico/);
  assert.equal(resultado.grauApresentado, null);
});

test('resposta valida de primeira nao usa fallback e preserva o texto da IA', async () => {
  let chamadas = 0;
  const resultado = await resolverTurno(
    async () => {
      chamadas++;
      return decisaoValida();
    },
    null,
    null,
    'Carla',
  );
  assert.equal(chamadas, 1);
  assert.equal(resultado.viaFallback, false);
  assert.equal(resultado.textoFinal, 'Claro, vou providenciar a segunda via.');
});

test('segunda tentativa recebe o motivo da primeira rejeicao', async () => {
  const negociacao = montarContextoNegociacao(120000, 30, 0);
  const motivosRecebidos: Array<string | null> = [];

  await resolverTurno(
    async (motivo) => {
      motivosRecebidos.push(motivo);
      if (motivosRecebidos.length === 1) return decisaoInvalida('Posso fazer 99% de desconto.');
      return decisaoValida();
    },
    negociacao.permitido,
    negociacao,
    'Pedro',
  );

  assert.equal(motivosRecebidos[0], null);
  assert.match(motivosRecebidos[1] ?? '', /desconto/);
});

test('motivo_escalar diferente de nenhum sempre produz a mensagem fixa de encaminhamento, mesmo na primeira tentativa', async () => {
  const resultado = await resolverTurno(
    async () => ({
      intencao: 'contesta_divida',
      resposta: 'nao vou pagar isso',
      motivo_escalar: 'contestacao',
      silenciar: false,
      proposta_do_cliente_centavos: null,
      cliente_aceitou: false,
      grau_apresentado: null,
      data_renda_declarada: null,
      capacidade_declarada_centavos: null,
      usar_espera_estrategica: false,
      resposta_apos_espera: null,
      grau_apresentado_apos_espera: null,
      valor_fechado_centavos: null,
      parcelas_fechadas: null,
      perguntas_novas: [],
      perguntas_resolvidas: [],
    }),
    null,
    null,
    'Lucas',
  );
  assert.equal(resultado.viaFallback, false);
  assert.match(resultado.textoFinal, /atendente/);
  assert.notEqual(resultado.textoFinal, 'nao vou pagar isso');
});
