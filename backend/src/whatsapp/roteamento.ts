// Filtro de destinatario do webhook.
//
// Uma conta do WhatsApp Business pode ter varios numeros registrados, e a
// inscricao no webhook e da CONTA, nao do numero. Sem este filtro, o Worker
// recebe as mensagens de todos os numeros da conta — inclusive numeros
// reais que ja rodam em outras plataformas, com clientes de verdade.
//
// Em 2026-08-16 isso aconteceu: chegaram mensagens de dois numeros alheios.
// So nao houve dano porque a pausa global estava ligada. Com ela desligada,
// a IA teria respondido a clientes de um sistema em producao que nao e
// nosso.
//
// O filtro vive aqui, do nosso lado, de proposito: mexer na configuracao da
// Meta poderia desconfigurar os sistemas que ja funcionam.

export interface MensagemBruta {
  from: string;
  id: string;
  text?: { body: string };
  // Resposta a um botao (dominio/pagamento.ts: "Gerar PIX" / "Gerar
  // boleto") chega assim, sem "text" nenhum — tratado a parte no webhook,
  // nunca passa pela IA: e uma acao deterministica, nao uma mensagem para
  // interpretar.
  type?: string;
  interactive?: {
    type: string;
    button_reply?: { id: string; title: string };
  };
}

export interface ValorDeMudanca {
  metadata?: { phone_number_id?: string };
  messages?: MensagemBruta[];
  statuses?: unknown[];
}

export interface EntradaWebhook {
  entry?: Array<{ changes?: Array<{ value?: ValorDeMudanca }> }>;
}

export interface EventoAlheio {
  numeroId: string;
  mensagens: number;
  statuses: number;
}

export interface Separacao {
  /** Corpo contendo apenas as mudancas do nosso numero. */
  proprio: EntradaWebhook;
  /** Resumo do que foi descartado. Sem conteudo e sem telefone de cliente:
   *  sao pessoas de outro sistema, e guardar a conversa delas seria reter
   *  dado alheio sem proposito nenhum. */
  alheios: EventoAlheio[];
}

export function separarPorNumero(corpo: unknown, numeroId: string): Separacao {
  const dados = corpo as EntradaWebhook | null;
  const entradas = Array.isArray(dados?.entry) ? dados!.entry! : [];

  const proprias: Array<{ value?: ValorDeMudanca }> = [];
  const alheios: EventoAlheio[] = [];

  for (const entrada of entradas) {
    const mudancas = Array.isArray(entrada?.changes) ? entrada.changes : [];
    for (const mudanca of mudancas) {
      const valor = mudanca?.value;
      const destino = valor?.metadata?.phone_number_id;

      // Sem metadata nao da para saber a quem o evento pertence. O modo de
      // falha e descartar: processar um evento de origem desconhecida e
      // arriscar responder por um numero que nao e nosso.
      if (destino === numeroId && numeroId.length > 0) {
        proprias.push(mudanca);
        continue;
      }

      alheios.push({
        numeroId: destino ?? '(sem metadata)',
        mensagens: Array.isArray(valor?.messages) ? valor!.messages!.length : 0,
        statuses: Array.isArray(valor?.statuses) ? valor!.statuses!.length : 0,
      });
    }
  }

  return { proprio: { entry: [{ changes: proprias }] }, alheios };
}
