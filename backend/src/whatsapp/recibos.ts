import { efeitoDoErro } from '../dominio/erros-meta.ts';
import { definirStatusTelefone, fecharTentativa } from '../db/telefones.ts';
import { registrarAuditoria } from '../dominio/travas.ts';

export interface Recibo {
  idExterno: string;
  destinatario: string;
  status: 'sent' | 'delivered' | 'read' | 'failed';
  codigoErro: number | null;
}

const CONHECIDOS = new Set(['sent', 'delivered', 'read', 'failed']);

// A Meta ja manda os recibos no mesmo campo 'messages' que recebemos hoje,
// no array irmao 'statuses'. Ate agora eles vinham e eram descartados.
export function extrairRecibos(corpo: unknown): Recibo[] {
  const dados = corpo as {
    entry?: Array<{ changes?: Array<{ value?: { statuses?: unknown[] } }> }>;
  } | null;

  const entradas = Array.isArray(dados?.entry) ? dados!.entry : [];

  return entradas.flatMap((e) =>
    (Array.isArray(e?.changes) ? e.changes : []).flatMap((c) =>
      (Array.isArray(c?.value?.statuses) ? c.value!.statuses! : []).flatMap((bruto) => {
        const s = bruto as {
          id?: string;
          status?: string;
          recipient_id?: string;
          errors?: Array<{ code?: number }>;
        };
        if (!s.id || !s.status || !CONHECIDOS.has(s.status)) return [];
        return [
          {
            idExterno: s.id,
            destinatario: String(s.recipient_id ?? ''),
            status: s.status as Recibo['status'],
            codigoErro: s.errors?.[0]?.code ?? null,
          },
        ];
      }),
    ),
  );
}

export async function processarRecibo(db: D1Database, recibo: Recibo): Promise<void> {
  // 'sent' significa apenas que a Meta aceitou. Nao prova WhatsApp e nao
  // fecha a tentativa: fechar aqui encerraria o escalonamento no primeiro
  // numero, que e o defeito que esta fase corrige.
  if (recibo.status === 'sent') {
    await registrarAuditoria(db, {
      acao: 'recibo-aceito',
      telefone: recibo.destinatario,
      detalhe: recibo.idExterno,
    });
    return;
  }

  const fechada = await fecharTentativa(db, recibo.idExterno, recibo.status);
  if (!fechada) {
    // Recibo de mensagem que nao saiu de uma tentativa nossa (resposta da
    // IA, por exemplo). Registrar e suficiente.
    await registrarAuditoria(db, {
      acao: 'recibo-sem-tentativa',
      telefone: recibo.destinatario,
      detalhe: `${recibo.status} para ${recibo.idExterno}`,
    });
    return;
  }

  if (recibo.status === 'delivered' || recibo.status === 'read') {
    await definirStatusTelefone(db, fechada.telefoneId, 'tem_whatsapp', `recibo ${recibo.status}`);
    await registrarAuditoria(db, {
      acao: 'telefone-confirmado',
      telefone: recibo.destinatario,
      detalhe: `entregue: tem WhatsApp (${recibo.status})`,
    });
    return;
  }

  const efeito = efeitoDoErro(recibo.codigoErro);
  if (efeito.novoStatus) {
    await definirStatusTelefone(db, fechada.telefoneId, efeito.novoStatus, efeito.motivo);
  }
  await registrarAuditoria(db, {
    acao: efeito.novoStatus ? 'telefone-descartado' : 'falha-sem-efeito-no-telefone',
    telefone: recibo.destinatario,
    detalhe: efeito.motivo,
  });
}
