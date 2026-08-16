import type { Config } from '../config.ts';
import type { CredorId } from '../dominio/credor.ts';
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
import { credorDoTelefone } from '../db/cadastro.ts';
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
  const [pausa, silenciado, ultimaEntrada, historico] = await Promise.all([
    lerPausaGlobal(db),
    estaSilenciado(db, telefone),
    ultimaEntradaDe(db, telefone),
    // Sem carteira resolvida nao ha historico a mostrar para a IA: buscar
    // por telefone misturaria conversas de credores diferentes.
    credorId ? conversaDe(db, credorId, telefone) : Promise.resolve([]),
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
    credorId,
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
