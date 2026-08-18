import type { Config } from '../config.ts';
import type { CredorId } from '../dominio/credor.ts';
import { verificarAssinatura } from './assinatura.ts';
import { separarPorNumero } from './roteamento.ts';
import { extrairRecibos, processarRecibo } from './recibos.ts';
import { enviarBotoes, enviarTexto } from './enviar.ts';
import { gerarBoletoFicticio, gerarLinkCartaoFicticio, gerarPixFicticio } from '../dominio/pagamento.ts';
import { avaliarPortao } from '../dominio/portao.ts';
import { dentroDaJanela } from '../dominio/janela.ts';
import {
  definirSilencio,
  estaSilenciado,
  lerPausaGlobal,
  registrarAuditoria,
} from '../dominio/travas.ts';
import { conversaDe, gravarMensagem, ultimaEntradaDe } from '../db/repositorio.ts';
import { agendarRetorno, marcarRetornoEnviado, retornosDevidos } from '../db/retornos.ts';
import {
  marcarPerguntaRespondida,
  perguntasAbertasDe,
  registrarPerguntaPendente,
} from '../db/perguntas.ts';
import {
  avancarNegociacao,
  contextoDeCobranca,
  credorDoTelefone,
  definirEstadoNegociacao,
  fecharNegociacao,
  incrementarPedidoHumano,
  registrarDescoberta,
  registrarFallback,
  resetarFallbacks,
} from '../db/cadastro.ts';
import { lerCredor } from '../db/credores.ts';
import { formatarData, formatarMoeda } from '../dominio/formatacao.ts';
import {
  avaliarContraproposta,
  blocoOfertasLiberadas,
  MENSAGEM_ESCALAMENTO,
  montarContextoFechado,
  montarContextoNegociacao,
  ofertaDoGrau,
} from '../dominio/negociacao.ts';
import type { ValoresPermitidos } from '../dominio/negociacao.ts';
import { blocoFatosLiberados, FATOS_PADRAO } from '../dominio/fatos.ts';
import { resolverTurno } from '../dominio/turno.ts';
import { formaDeEnvio, podeEnviarPara } from '../destinatarios.ts';
import { decidir, percentuaisCitadosPct, valoresCitadosCentavos } from '../ia/responder.ts';
import type { Decisao } from '../ia/responder.ts';

// Tatica de espera estrategica (ia/prompt.ts): quanto tempo entre a frase
// de espera e a resposta de verdade, entregue pelo cron de a cada minuto.
const ATRASO_ESPERA_ESTRATEGICA_MS = 60_000;

// A Meta chama este GET uma vez, ao cadastrar a URL do webhook.
export function verificarInscricao(url: URL, config: Config): Response {
  const modo = url.searchParams.get('hub.mode');
  const token = url.searchParams.get('hub.verify_token');
  const desafio = url.searchParams.get('hub.challenge');

  if (modo === 'subscribe' && token === config.whatsapp.verifyToken && desafio) {
    return new Response(desafio, { status: 200 });
  }
  return new Response('Falha na verificacao', { status: 403 });
}

export async function receber(
  requisicao: Request,
  config: Config,
  db: D1Database,
  ctx: ExecutionContext,
): Promise<Response> {
  const corpo = await requisicao.text();

  const assinaturaOk = await verificarAssinatura(
    corpo,
    requisicao.headers.get('x-hub-signature-256'),
    config.whatsapp.appSecret,
  );
  if (!assinaturaOk) {
    // A recusa nao pode depender do log funcionar. Se a auditoria falhar,
    // a requisicao continua rejeitada — 500 aqui faria a Meta reenviar.
    try {
      await registrarAuditoria(db, {
        acao: 'webhook-assinatura-invalida',
        telefone: null,
        detalhe: 'requisicao descartada',
      });
    } catch {
      // Sem banco, sem registro. A rejeicao vale do mesmo jeito.
    }
    return new Response('Assinatura invalida', { status: 401 });
  }

  let corpoCru: unknown;
  try {
    corpoCru = JSON.parse(corpo);
  } catch {
    return new Response('Corpo invalido', { status: 400 });
  }

  // A inscricao no webhook e da CONTA, nao do numero: sem este filtro
  // chegam aqui as mensagens de todos os numeros da conta, inclusive os que
  // ja rodam em outras plataformas com clientes reais. Tudo o que vem
  // depois so enxerga o que e do nosso numero.
  const { proprio: dados, alheios } = separarPorNumero(corpoCru, config.whatsapp.numeroId);

  for (const alheio of alheios) {
    // So a contagem. Guardar telefone ou texto de cliente de outro sistema
    // seria reter dado alheio sem proposito nenhum.
    await registrarAuditoria(db, {
      acao: 'evento-de-outro-numero-ignorado',
      telefone: null,
      detalhe: `numero ${alheio.numeroId}: ${alheio.mensagens} mensagem(ns), ${alheio.statuses} recibo(s)`,
    }).catch(() => {
      // Sem banco nao ha registro, mas o descarte vale do mesmo jeito.
    });
  }

  // Os recibos chegam no mesmo POST das mensagens. Ficam fora do caminho
  // da resposta pelo mesmo motivo: a Meta reenvia o webhook se demorarmos.
  for (const recibo of extrairRecibos(dados)) {
    ctx.waitUntil(
      processarRecibo(db, recibo).catch(async (erro) => {
        await registrarAuditoria(db, {
          acao: 'erro-ao-processar-recibo',
          telefone: recibo.destinatario,
          detalhe: String(erro).slice(0, 300),
        }).catch(() => {
          // Sem banco nao ha o que registrar; nao derrubar o waitUntil.
        });
      }),
    );
  }

  const mensagens =
    dados.entry?.flatMap((e) => e.changes?.flatMap((c) => c.value?.messages ?? []) ?? []) ?? [];

  for (const mensagem of mensagens) {
    const botaoId = mensagem.interactive?.type === 'button_reply' ? mensagem.interactive.button_reply?.id : undefined;
    if (botaoId) {
      // Botao ("Gerar PIX" / "Gerar boleto") e acao deterministica — nunca
      // passa pela IA, nunca arrisca inventar numero: so gera e envia.
      const credorIdBotao = await credorDoTelefone(db, mensagem.from);
      ctx.waitUntil(
        processarBotaoDePagamento(config, db, mensagem.from, botaoId, credorIdBotao).catch(async (erro) => {
          await registrarAuditoria(db, {
            acao: 'erro-ao-processar-botao',
            telefone: mensagem.from,
            detalhe: String(erro).slice(0, 300),
          }).catch(() => {});
        }),
      );
      continue;
    }

    const texto = mensagem.text?.body;

    if (!texto) {
      // Audio, imagem e figurinha ficam para depois — mas o recebimento
      // fica registrado, para nao parecer que o cliente nunca respondeu.
      await registrarAuditoria(db, {
        acao: 'mensagem-sem-texto-ignorada',
        telefone: mensagem.from,
        detalhe: mensagem.id,
      });
      continue;
    }

    const credorId = await credorDoTelefone(db, mensagem.from);
    if (credorId === null) {
      await registrarAuditoria(db, {
        acao: 'telefone-sem-carteira-unica',
        telefone: mensagem.from,
        detalhe: 'conversa gravada sem credor; resolver no painel do operador',
      });
    }

    await gravarMensagem(db, {
      telefone: mensagem.from,
      credorId,
      direcao: 'entrada',
      texto,
      tipo: 'livre',
      origem: 'cliente',
      idExterno: mensagem.id,
    });

    // A decisao da IA leva segundos. A Meta espera 200 rapido e reenvia o
    // webhook se demorarmos — o cliente receberia a mesma resposta duas
    // vezes. Por isso o processamento sai do caminho da resposta.
    ctx.waitUntil(
      responderCliente(config, db, mensagem.from, texto, credorId).catch(async (erro) => {
        await registrarAuditoria(db, {
          acao: 'erro-ao-responder',
          telefone: mensagem.from,
          detalhe: String(erro).slice(0, 300),
        }).catch(() => {
          // Sem banco nao ha o que registrar; nao derrubar o waitUntil.
        });
      }),
    );
  }

  return new Response('ok', { status: 200 });
}

async function responderCliente(
  config: Config,
  db: D1Database,
  telefone: string,
  texto: string,
  credorId: CredorId | null,
): Promise<void> {
  const [pausa, silenciado, ultimaEntrada, historico, contexto, credor] = await Promise.all([
    lerPausaGlobal(db),
    estaSilenciado(db, telefone),
    ultimaEntradaDe(db, telefone),
    // Sem carteira resolvida nao ha historico a mostrar para a IA: buscar
    // por telefone misturaria conversas de credores diferentes.
    credorId ? conversaDe(db, credorId, telefone) : Promise.resolve([]),
    // Mesma logica: sem carteira nao ha divida a buscar. Com carteira mas
    // sem divida aberta, contextoDeCobranca ja devolve null sozinho.
    credorId ? contextoDeCobranca(db, credorId, telefone) : Promise.resolve(null),
    // O teto de desconto e por credor: sem ele o motor de negociacao nao
    // tem com que degrau calcular.
    credorId ? lerCredor(db, credorId) : Promise.resolve(null),
  ]);

  const portao = avaliarPortao({
    pausaGlobal: pausa,
    silenciado,
    naAllowlist: podeEnviarPara(telefone, config.destinatariosTeste),
    tipo: 'livre',
    dentroDaJanela: dentroDaJanela(ultimaEntrada, new Date()),
  });

  if (!portao.permitido) {
    await registrarAuditoria(db, {
      acao: 'resposta-bloqueada',
      telefone,
      detalhe: portao.motivo,
    });
    return;
  }

  // Adendo 1, Defeito 2: uma vez escalada por fallback repetido, a resposta
  // automatica para de sair — um humano precisa assumir pelo painel. Sem
  // isto, o bot continuaria tentando (e possivelmente falhando de novo)
  // indefinidamente.
  if (contexto?.estadoNegociacao === 'ESCALATED') {
    await registrarAuditoria(db, {
      acao: 'resposta-bloqueada',
      telefone,
      detalhe: 'negociacao escalada para atendimento humano',
    });
    return;
  }

  // Adendo 1, Defeito 6: pergunta que o cliente ja fez e ainda nao foi
  // respondida, se aparecer de novo, escala em vez de repetir o mesmo
  // impasse — checagem deterministica, nao depende da IA se autoescalar.
  const perguntasAbertas = contexto ? await perguntasAbertasDe(db, credorId as CredorId, contexto.dividaId) : [];
  const perguntaTravada = perguntasAbertas.find((p) => p.vezes >= 2);
  if (perguntaTravada && contexto) {
    const credorIdConfirmado = credorId as CredorId;
    await definirEstadoNegociacao(db, credorIdConfirmado, contexto.dividaId, 'ESCALATED');
    const envioEscalar = await enviarTexto(config, formaDeEnvio(telefone), MENSAGEM_ESCALAMENTO);
    await gravarMensagem(db, {
      telefone,
      credorId,
      direcao: 'saida',
      texto: MENSAGEM_ESCALAMENTO,
      tipo: 'livre',
      origem: 'ia',
      idExterno: envioEscalar.idExterno,
    });
    await registrarAuditoria(db, {
      acao: 'encaminhado-para-humano',
      telefone,
      detalhe: `pergunta "${perguntaTravada.tema}" sem resposta 2x`,
    });
    return;
  }

  // Sem divida aberta encontrada (carteira nao resolvida, ou devedor sem
  // registro ainda), o contexto vai sem valor — e o validador barra
  // qualquer cifra na resposta, que e o comportamento desejado: a IA nunca
  // inventa um valor que nao esta no cadastro.
  const valorFormatado = contexto ? formatarMoeda(contexto.valorCentavos) : 'nao informado';

  // Adendo 1, Defeito 1: uma vez fechado, o motor para de oferecer
  // desconto — sem isto, o fallback (e a propria IA) podiam reabrir uma
  // negociacao ja ganha reapresentando a escada do zero.
  const negociacaoFechada = contexto
    ? contexto.estadoNegociacao === 'AGREEMENT' ||
      contexto.estadoNegociacao === 'PAYMENT_PENDING' ||
      contexto.estadoNegociacao === 'PAID'
    : false;

  const contextoFechado =
    negociacaoFechada && contexto?.valorAcordadoCentavos != null
      ? montarContextoFechado(contexto.nome, contexto.valorAcordadoCentavos, contexto.parcelasAcordadas ?? 1)
      : null;

  // O motor calcula ANTES de chamar a IA: ela so escolhe qual dos numeros
  // ja prontos apresentar, nunca inventa um.
  const negociacao =
    contexto && credor && !negociacaoFechada
      ? montarContextoNegociacao(
          contexto.valorCentavos,
          credor.regras.descontoTetoPct,
          contexto.estagioNegociacao,
          credor.regras,
        )
      : null;

  const ofertaTexto = contextoFechado?.ofertaTexto ?? negociacao?.texto ?? null;
  const fallbackOverrideTexto = contextoFechado?.fallbackOverride;

  const permitido: ValoresPermitidos | null = contexto
    ? {
        centavos: [
          contexto.valorCentavos,
          ...(negociacao?.permitido.centavos ?? []),
          ...(contextoFechado?.centavosPermitidosExtra ?? []),
          // Todo numero que o CLIENTE mesmo escreveu pode ser ecoado de
          // volta — "nao consigo chegar nos R$ 400" ou "bem menor que os
          // R$ 500 que voce mencionou" nao sao a IA inventando nada, sao
          // ela citando o que ja esta na tela do cliente. Repetir nao e
          // aceitar; quem decide o acordo e avaliacao.aceitar, sozinho, em
          // codigo — nunca o texto.
          ...valoresCitadosCentavos(texto),
        ],
        percentuaisPct: [
          ...(negociacao?.permitido.percentuaisPct ?? []),
          ...percentuaisCitadosPct(texto),
        ],
        descontosPorDegrau: negociacao?.permitido.descontosPorDegrau,
      }
    : null;

  // Decisao de reserva: usada so se TODAS as tentativas de chamar a IA
  // lancarem excecao (API fora do ar, rede, schema inesperado). Sem isto, o
  // erro subia direto para o catch generico em receber() e o turno
  // terminava em silencio total (AUDITORIA.md, ponto 2) — a mesma classe de
  // falha do ponto 3, so que antes mesmo de haver uma resposta para validar.
  const decisaoDeReserva: Decisao = {
    intencao: 'outro',
    resposta: '',
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

  const perguntasPendentesJson =
    perguntasAbertas.length > 0
      ? JSON.stringify(perguntasAbertas.map((p) => ({ tema: p.tema, vezes: p.vezes })))
      : null;

  async function tentarDecidir(motivoRejeicaoAnterior: string | null): Promise<Decisao> {
    try {
      return await decidir(config, {
        nomeCliente: contexto?.nome ?? 'Cliente',
        valorFormatado,
        vencimentoFormatado: contexto ? formatarData(contexto.vencimento) : 'nao informado',
        historico,
        mensagemAtual: texto,
        ofertaTexto,
        ofertasLiberadasJson: negociacao ? blocoOfertasLiberadas(negociacao) : null,
        fatosLiberadosJson: blocoFatosLiberados(FATOS_PADRAO),
        perguntasPendentesJson,
        motivoRejeicaoAnterior,
      });
    } catch (erro) {
      await registrarAuditoria(db, {
        acao: 'erro-ao-chamar-ia',
        telefone,
        detalhe: String(erro).slice(0, 300),
      });
      return decisaoDeReserva;
    }
  }

  // A logica de retry + fallback e pura (dominio/turno.ts, testada la sem
  // rede nem banco) — aqui so se injeta a chamada real a IA e se grava o
  // resultado.
  const resultado = await resolverTurno(
    tentarDecidir,
    permitido,
    negociacao,
    contexto?.nome ?? 'Cliente',
    fallbackOverrideTexto,
  );
  const { decisaoFinal: decisao, textoFinal, grauApresentado, tentativas, viaFallback, motivoFallback } = resultado;

  // O silencio e gravado ANTES do envio. Se o cliente pediu para parar, ele
  // fica silenciado mesmo que a resposta final seja o fallback.
  if (decisao.silenciar) {
    await definirSilencio(db, telefone, true, 'cliente pediu para nao ser contatado');
  }

  // A proposta do cliente e avaliada aqui, em codigo — nunca pelo texto que
  // a IA escreveu. E esta avaliacao, e so ela, que decide se um valor
  // "aceito" pode aparecer na lista do que a resposta tem permissao de citar.
  const avaliacao =
    contexto && decisao.proposta_do_cliente_centavos !== null
      ? avaliarContraproposta(
          decisao.proposta_do_cliente_centavos,
          contexto.valorCentavos,
          contexto.estagioNegociacao,
          credor?.regras.descontoTetoPct ?? 0,
        )
      : null;

  // Adendo 1, Defeito 2: fallback nunca pode repetir sem consequencia. A
  // contagem e da divida (nao da memoria da conversa), entao sobrevive a
  // qualquer truncamento de historico.
  let textoParaEnviar = textoFinal;
  let escalarPorFallbackRepetido = false;

  if (decisao.motivo_escalar !== 'nenhum') {
    await registrarAuditoria(db, {
      acao: 'encaminhado-para-humano',
      telefone,
      detalhe: decisao.motivo_escalar,
    });
  } else if (viaFallback && contexto) {
    const credorIdParaContagem = credorId as CredorId;
    const contagem = await registrarFallback(db, credorIdParaContagem, contexto.dividaId, textoFinal);
    if (contagem >= 3) {
      textoParaEnviar = MENSAGEM_ESCALAMENTO;
      escalarPorFallbackRepetido = true;
      await registrarAuditoria(db, {
        acao: 'encaminhado-para-humano',
        telefone,
        detalhe: `fallback repetido ${contagem}x seguidas nesta divida`,
      });
    } else {
      if (contagem === 2) {
        textoParaEnviar = `${textoFinal} Ja estou verificando com atencao, um instante.`;
        await registrarAuditoria(db, {
          acao: 'alerta-fallback-repetido',
          telefone,
          detalhe: '2a fallback seguida nesta divida',
        });
      }
      await registrarAuditoria(db, {
        acao: 'fallback-usado',
        telefone,
        detalhe: `${motivoFallback} apos ${tentativas} tentativa(s) — texto tentado: "${decisao.resposta.slice(0, 600)}"`,
      });
    }
  } else if (viaFallback) {
    await registrarAuditoria(db, {
      acao: 'fallback-usado',
      telefone,
      detalhe: `${motivoFallback} apos ${tentativas} tentativa(s) — texto tentado: "${decisao.resposta.slice(0, 600)}"`,
    });
  } else if (contexto) {
    // Turno bem sucedido, sem fallback: quebra a sequencia.
    await resetarFallbacks(db, credorId as CredorId, contexto.dividaId);
  }

  const envio = await enviarTexto(config, formaDeEnvio(telefone), textoParaEnviar);
  await gravarMensagem(db, {
    telefone,
    credorId,
    direcao: 'saida',
    texto: textoParaEnviar,
    tipo: 'livre',
    origem: 'ia',
    idExterno: envio.idExterno,
  });
  await registrarAuditoria(db, {
    acao: envio.ok ? 'resposta-enviada' : 'falha-no-envio',
    telefone,
    detalhe: envio.erro ?? decisao.intencao,
  });
  if (!envio.ok) {
    // Alerta visivel e separado da linha de auditoria de rotina: token
    // invalido, janela de 24h fechada ou destinatario fora da lista nao se
    // resolvem tentando de novo — precisam de intervencao humana, e o
    // silencio sobre isso foi a causa raiz dos bugs 1, 2 e 3 ja vividos.
    await registrarAuditoria(db, {
      acao: 'alerta-envio-sem-recuperacao',
      telefone,
      detalhe: `mensagem nao chegou ao cliente: ${envio.erro ?? 'erro desconhecido'}`,
    });
  }

  // Tatica de espera estrategica: a mensagem imediata foi so a frase de
  // espera — a resposta de verdade, com os numeros, fica agendada e sai
  // pelo cron de a cada minuto (processarRetornosPendentes), sem chamar a
  // IA de novo. So agenda quando a decisao passou de verdade (nunca em
  // fallback ou escalamento, que ja sao respostas imediatas e definitivas).
  if (
    envio.ok &&
    contexto &&
    credorId &&
    !viaFallback &&
    decisao.motivo_escalar === 'nenhum' &&
    decisao.usar_espera_estrategica &&
    decisao.resposta_apos_espera
  ) {
    await agendarRetorno(db, {
      credorId: credorId as CredorId,
      dividaId: contexto.dividaId,
      telefone,
      texto: decisao.resposta_apos_espera,
      grauApresentado: decisao.grau_apresentado_apos_espera,
      atrasoMs: ATRASO_ESPERA_ESTRATEGICA_MS,
    });
    await registrarAuditoria(db, {
      acao: 'espera-estrategica-agendada',
      telefone,
      detalhe: `retorno em ${ATRASO_ESPERA_ESTRATEGICA_MS / 1000}s`,
    });
  }

  // O estado da negociacao so muda se a mensagem de fato saiu: se o envio
  // falhou, o cliente nunca viu a oferta, e avancar o degrau mesmo assim
  // queimaria uma etapa da escalada por nada.
  if (envio.ok && contexto) {
    // credorId nao pode ser null aqui: contexto so existe quando credorId
    // existia no momento em que foi buscado.
    const credorIdConfirmado = credorId as CredorId;
    if (avaliacao?.aceitar) {
      await fecharNegociacao(
        db,
        credorIdConfirmado,
        contexto.dividaId,
        avaliacao.valorAceitoCentavos as number,
      );
      await registrarAuditoria(db, {
        acao: 'negociacao-fechada',
        telefone,
        detalhe: `valor acordado ${formatarMoeda(avaliacao.valorAceitoCentavos as number)}`,
      });
      await definirEstadoNegociacao(db, credorIdConfirmado, contexto.dividaId, 'PAYMENT_PENDING');
      await enviarBotoesDePagamento(config, db, telefone);
    } else if (!viaFallback && decisao.cliente_aceitou && decisao.valor_fechado_centavos !== null) {
      // Adendo 1, Defeito 1/7: fecha tambem quando o cliente aceita a
      // oferta que a PROPRIA IA ja apresentou (sem repetir o numero como
      // proposta) — antes disso so avaliarContraproposta fechava, e um
      // "ótimo, fico em 4x" sem novo numero nunca virava acordo registrado,
      // deixando a negociacao "aberta" para sempre reabrir.
      await fecharNegociacao(
        db,
        credorIdConfirmado,
        contexto.dividaId,
        decisao.valor_fechado_centavos,
        decisao.parcelas_fechadas ?? 1,
      );
      await registrarAuditoria(db, {
        acao: 'negociacao-fechada',
        telefone,
        detalhe: `valor acordado ${formatarMoeda(decisao.valor_fechado_centavos)}${
          decisao.parcelas_fechadas && decisao.parcelas_fechadas > 1 ? ` em ${decisao.parcelas_fechadas}x` : ''
        }`,
      });
      await definirEstadoNegociacao(db, credorIdConfirmado, contexto.dividaId, 'PAYMENT_PENDING');
      await enviarBotoesDePagamento(config, db, telefone);
    } else if (negociacao && grauApresentado !== null && grauApresentado !== contexto.estagioNegociacao) {
      const oferta = ofertaDoGrau(negociacao, grauApresentado);
      if (oferta) {
        await avancarNegociacao(db, credorIdConfirmado, contexto.dividaId, grauApresentado, oferta);
      }
    }

    // Adendo 1, Defeito 6: pergunta nova entra na fila; pergunta que esta
    // resposta resolveu sai. So processa quando a resposta de fato passou
    // (fallback nao tem os campos estruturados confiaveis, ja que veio de
    // uma tentativa rejeitada).
    if (!viaFallback) {
      for (const tema of decisao.perguntas_novas) {
        await registrarPerguntaPendente(db, credorIdConfirmado, contexto.dividaId, tema);
      }
      for (const tema of decisao.perguntas_resolvidas) {
        await marcarPerguntaRespondida(db, credorIdConfirmado, contexto.dividaId, tema);
      }
    }

    // Sinais de descoberta (spec §4.4/§6.3): gravados sempre que a IA os
    // extraiu, independente de ter havido oferta ou aceite neste turno.
    await registrarDescoberta(db, credorIdConfirmado, contexto.dividaId, {
      dataRenda: decisao.data_renda_declarada,
      capacidadeDeclaradaCentavos: decisao.capacidade_declarada_centavos,
    });

    // Maquina de estados (spec §9): so os saltos que um turno reativo sabe
    // reconhecer com seguranca. contestacao/ja_pagou sao DISPUTED
    // (absorvente ate revisao humana); os demais motivos de escalamento
    // sao ESCALATED. Regra 1-2-3 do pedido de humano: contagem duravel,
    // independente do que a IA "lembrou" do historico truncado.
    if (decisao.motivo_escalar === 'contestacao' || decisao.motivo_escalar === 'ja_pagou') {
      await definirEstadoNegociacao(db, credorIdConfirmado, contexto.dividaId, 'DISPUTED');
    } else if (decisao.motivo_escalar !== 'nenhum') {
      await definirEstadoNegociacao(db, credorIdConfirmado, contexto.dividaId, 'ESCALATED');
      if (decisao.motivo_escalar === 'exigencia_humano') {
        await incrementarPedidoHumano(db, credorIdConfirmado, contexto.dividaId);
      }
    } else if (escalarPorFallbackRepetido) {
      // Adendo 1, Defeito 2: 3a fallback seguida na mesma divida — para de
      // responder automaticamente, um humano assume pelo painel.
      await definirEstadoNegociacao(db, credorIdConfirmado, contexto.dividaId, 'ESCALATED');
    }
  }
}

// Enviado logo depois que um acordo fecha (nas duas rotas de fechamento
// acima) — a IA so confirma em texto; e o sistema, deterministico, que
// oferece os botoes. Nunca falha o turno principal: qualquer problema aqui
// so vira auditoria, o acordo ja esta fechado de qualquer jeito.
async function enviarBotoesDePagamento(
  config: Config,
  db: D1Database,
  telefone: string,
): Promise<void> {
  const envio = await enviarBotoes(config, telefone, 'Como prefere pagar?', [
    { id: 'gerar_pix', titulo: 'Gerar PIX' },
    { id: 'gerar_boleto', titulo: 'Gerar boleto' },
    { id: 'gerar_cartao', titulo: 'Pagar com cartão' },
  ]);
  await gravarMensagem(db, {
    telefone,
    credorId: await credorDoTelefone(db, telefone),
    direcao: 'saida',
    texto: '[botoes] Como prefere pagar? — Gerar PIX / Gerar boleto / Pagar com cartão',
    tipo: 'livre',
    origem: 'ia',
    idExterno: envio.idExterno,
  });
  await registrarAuditoria(db, {
    acao: envio.ok ? 'botoes-pagamento-enviados' : 'falha-no-envio',
    telefone,
    detalhe: envio.erro ?? 'botoes de pagamento',
  });
}

// Resposta a um clique de botao — SEMPRE deterministica, nunca passa pela
// IA. So gera PIX/boleto FICTICIO (dominio/pagamento.ts): nao ha
// integracao real com nenhum banco ainda, entao o texto deixa isso
// explicito para nao ser confundido com cobranca de verdade.
async function processarBotaoDePagamento(
  config: Config,
  db: D1Database,
  telefone: string,
  botaoId: string,
  credorId: CredorId | null,
): Promise<void> {
  const [pausa, silenciado, ultimaEntrada, contexto] = await Promise.all([
    lerPausaGlobal(db),
    estaSilenciado(db, telefone),
    ultimaEntradaDe(db, telefone),
    credorId ? contextoDeCobranca(db, credorId, telefone) : Promise.resolve(null),
  ]);

  const portao = avaliarPortao({
    pausaGlobal: pausa,
    silenciado,
    naAllowlist: podeEnviarPara(telefone, config.destinatariosTeste),
    tipo: 'livre',
    dentroDaJanela: dentroDaJanela(ultimaEntrada, new Date()),
  });
  if (!portao.permitido) {
    await registrarAuditoria(db, { acao: 'resposta-bloqueada', telefone, detalhe: portao.motivo });
    return;
  }
  if (!contexto) {
    await registrarAuditoria(db, {
      acao: 'botao-pagamento-sem-divida',
      telefone,
      detalhe: `botao ${botaoId} sem divida aberta para gerar`,
    });
    return;
  }

  // O valor a cobrar e o do acordo, se ja fechou — nunca o valor original
  // depois que um desconto foi combinado (mesma logica do Adendo 1,
  // Defeito 1: nunca contradizer a condicao ja acertada).
  const valorParaGerar = contexto.valorAcordadoCentavos ?? contexto.valorCentavos;
  const referencia = `divida-${contexto.dividaId}`;

  let texto: string;
  if (botaoId === 'gerar_pix') {
    const pix = gerarPixFicticio(valorParaGerar, referencia);
    texto = `[AMBIENTE DE TESTE — nao e um PIX real] Chave copia e cola:\n${pix.chaveCopiaECola}\n\nValor: ${formatarMoeda(pix.valorCentavos)}`;
  } else if (botaoId === 'gerar_boleto') {
    const boleto = gerarBoletoFicticio(valorParaGerar, contexto.vencimento, referencia);
    texto = `[AMBIENTE DE TESTE — nao e um boleto real] Linha digitavel:\n${boleto.linhaDigitavel}\n\nValor: ${formatarMoeda(boleto.valorCentavos)} — vencimento ${formatarData(boleto.vencimento)}`;
  } else if (botaoId === 'gerar_cartao') {
    const link = gerarLinkCartaoFicticio(valorParaGerar, referencia);
    texto = `[AMBIENTE DE TESTE — nao e um link real] Pagamento com cartao:\n${link.url}\n\nValor: ${formatarMoeda(link.valorCentavos)}`;
  } else {
    await registrarAuditoria(db, { acao: 'botao-pagamento-desconhecido', telefone, detalhe: botaoId });
    return;
  }

  const envio = await enviarTexto(config, formaDeEnvio(telefone), texto);
  await gravarMensagem(db, {
    telefone,
    credorId,
    direcao: 'saida',
    texto,
    tipo: 'livre',
    origem: 'sistema',
    idExterno: envio.idExterno,
  });
  await registrarAuditoria(db, {
    acao: envio.ok ? `${botaoId}-gerado` : 'falha-no-envio',
    telefone,
    detalhe: envio.erro ?? referencia,
  });
}

// Entrega das mensagens da tatica de espera estrategica — chamado pelo cron
// de a cada minuto (index.ts::scheduled), nunca pelo webhook em si. As
// mesmas travas de portao do turno normal valem aqui: se o cliente foi
// silenciado ou a janela de 24h fechou no meio da espera, o retorno NAO sai
// sozinho — fica marcado como enviado (para nao tentar de novo para sempre)
// mas com o bloqueio registrado em auditoria.
export async function processarRetornosPendentes(config: Config, db: D1Database): Promise<void> {
  const devidos = await retornosDevidos(db, new Date());
  if (devidos.length === 0) return;

  const pausa = await lerPausaGlobal(db);

  for (const retorno of devidos) {
    const [silenciado, ultimaEntrada] = await Promise.all([
      estaSilenciado(db, retorno.telefone),
      ultimaEntradaDe(db, retorno.telefone),
    ]);

    const portao = avaliarPortao({
      pausaGlobal: pausa,
      silenciado,
      naAllowlist: podeEnviarPara(retorno.telefone, config.destinatariosTeste),
      tipo: 'livre',
      dentroDaJanela: dentroDaJanela(ultimaEntrada, new Date()),
    });

    if (!portao.permitido) {
      await registrarAuditoria(db, {
        acao: 'retorno-estrategico-bloqueado',
        telefone: retorno.telefone,
        detalhe: portao.motivo,
      });
      await marcarRetornoEnviado(db, retorno.id);
      continue;
    }

    const envio = await enviarTexto(config, formaDeEnvio(retorno.telefone), retorno.texto);
    await gravarMensagem(db, {
      telefone: retorno.telefone,
      credorId: retorno.credorId,
      direcao: 'saida',
      texto: retorno.texto,
      tipo: 'livre',
      origem: 'ia',
      idExterno: envio.idExterno,
    });
    await registrarAuditoria(db, {
      acao: envio.ok ? 'retorno-estrategico-enviado' : 'falha-no-envio',
      telefone: retorno.telefone,
      detalhe: envio.erro ?? 'retorno da espera estrategica',
    });
    await marcarRetornoEnviado(db, retorno.id);

    // Avanca o degrau so se o envio de fato saiu, com o estagio LIDO AGORA
    // (nao o de quando a espera foi agendada) — evita queimar uma etapa da
    // escalada se algo mudou a negociacao nesse meio-minuto.
    if (envio.ok && retorno.grauApresentado !== null && retorno.dividaId !== null) {
      const contexto = await contextoDeCobranca(db, retorno.credorId, retorno.telefone);
      const credor = await lerCredor(db, retorno.credorId);
      if (contexto && credor && retorno.grauApresentado !== contexto.estagioNegociacao) {
        const negociacao = montarContextoNegociacao(
          contexto.valorCentavos,
          credor.regras.descontoTetoPct,
          contexto.estagioNegociacao,
          credor.regras,
        );
        const oferta = ofertaDoGrau(negociacao, retorno.grauApresentado);
        if (oferta) {
          await avancarNegociacao(db, retorno.credorId, retorno.dividaId, retorno.grauApresentado, oferta);
        }
      }
    }
  }
}
