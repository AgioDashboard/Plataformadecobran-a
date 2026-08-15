import type { Config } from '../config.ts';
import { verificarAssinatura } from './assinatura.ts';
import { enviarTexto } from './enviar.ts';
import { avaliarPortao } from '../dominio/portao.ts';
import { dentroDaJanela } from '../dominio/janela.ts';
import {
  definirSilencio,
  estaSilenciado,
  lerPausaGlobal,
  registrarAuditoria,
} from '../dominio/travas.ts';
import { conversaDe, gravarMensagem, ultimaEntradaDe } from '../db/repositorio.ts';
import { podeEnviarPara } from '../destinatarios.ts';
import { decidir, validarResposta } from '../ia/responder.ts';

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

interface EntradaWebhook {
  entry?: Array<{
    changes?: Array<{
      value?: {
        messages?: Array<{ from: string; id: string; text?: { body: string } }>;
      };
    }>;
  }>;
}

export async function receber(
  requisicao: Request,
  config: Config,
  db: D1Database,
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

  let dados: EntradaWebhook;
  try {
    dados = JSON.parse(corpo) as EntradaWebhook;
  } catch {
    return new Response('Corpo invalido', { status: 400 });
  }

  const mensagens =
    dados.entry?.flatMap((e) => e.changes?.flatMap((c) => c.value?.messages ?? []) ?? []) ?? [];

  for (const mensagem of mensagens) {
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

    await gravarMensagem(db, {
      telefone: mensagem.from,
      direcao: 'entrada',
      texto,
      tipo: 'livre',
      origem: 'cliente',
      idExterno: mensagem.id,
    });

    try {
      await responderCliente(config, db, mensagem.from, texto);
    } catch (erro) {
      // Falha ao responder nunca vira 500: a Meta reenviaria o webhook e o
      // cliente receberia a mesma mensagem duas vezes.
      await registrarAuditoria(db, {
        acao: 'erro-ao-responder',
        telefone: mensagem.from,
        detalhe: String(erro).slice(0, 300),
      });
    }
  }

  return new Response('ok', { status: 200 });
}

async function responderCliente(
  config: Config,
  db: D1Database,
  telefone: string,
  texto: string,
): Promise<void> {
  const [pausa, silenciado, ultimaEntrada, historico] = await Promise.all([
    lerPausaGlobal(db),
    estaSilenciado(db, telefone),
    ultimaEntradaDe(db, telefone),
    conversaDe(db, telefone),
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

  // Na Fase 2 inicial os dados do cadastro ainda vem da planilha importada.
  // Ate a Task 9 existir, o contexto vai sem valor — e o validador barra
  // qualquer cifra na resposta, que e o comportamento desejado.
  const decisao = await decidir(config, {
    nomeCliente: 'Cliente',
    valorFormatado: 'nao informado',
    vencimentoFormatado: 'nao informado',
    historico,
    mensagemAtual: texto,
  });

  // O silencio e gravado ANTES da validacao e do envio. Se o cliente pediu
  // para parar, ele fica silenciado mesmo que a resposta seja barrada logo
  // em seguida.
  if (decisao.silenciar) {
    await definirSilencio(db, telefone, true, 'cliente pediu para nao ser contatado');
  }

  const validacao = validarResposta(decisao, null);
  if (!validacao.ok || decisao.encaminhar_humano) {
    await registrarAuditoria(db, {
      acao: 'encaminhado-para-humano',
      telefone,
      detalhe: validacao.ok ? decisao.intencao : validacao.motivo,
    });
    return;
  }

  const envio = await enviarTexto(config, telefone, decisao.resposta);
  await gravarMensagem(db, {
    telefone,
    direcao: 'saida',
    texto: decisao.resposta,
    tipo: 'livre',
    origem: 'ia',
    idExterno: envio.idExterno,
  });
  await registrarAuditoria(db, {
    acao: envio.ok ? 'resposta-enviada' : 'falha-no-envio',
    telefone,
    detalhe: envio.erro ?? decisao.intencao,
  });
}
