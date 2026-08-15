// Estado da pausa de emergencia. O armazenamento e injetado para o modulo
// ser testavel e para tolerar navegador com localStorage bloqueado.
//
// Na Fase 2 este mesmo estado e a trava consultada antes de qualquer disparo.

export const CHAVE_PAUSA = 'cobranca:pausa';
export const CHAVE_EVENTOS = 'cobranca:eventos-pausa';

const ESTADO_PADRAO = { pausado: false, desde: null };

function lerJson(armazenamento, chave, padrao) {
  try {
    const bruto = armazenamento.getItem(chave);
    if (bruto === null) return padrao;
    return JSON.parse(bruto);
  } catch {
    // Armazenamento bloqueado ou conteudo corrompido: seguir com o padrao.
    return padrao;
  }
}

function gravarJson(armazenamento, chave, valor) {
  try {
    armazenamento.setItem(chave, JSON.stringify(valor));
  } catch {
    // Sem persistencia disponivel; a interface continua funcionando.
  }
}

export function lerPausa(armazenamento) {
  const estado = lerJson(armazenamento, CHAVE_PAUSA, ESTADO_PADRAO);
  if (typeof estado !== 'object' || estado === null || typeof estado.pausado !== 'boolean') {
    return { ...ESTADO_PADRAO };
  }
  return { pausado: estado.pausado, desde: estado.desde ?? null };
}

export function lerEventosPausa(armazenamento) {
  const eventos = lerJson(armazenamento, CHAVE_EVENTOS, []);
  return Array.isArray(eventos) ? eventos : [];
}

export function alternarPausa(armazenamento, agora) {
  const anterior = lerPausa(armazenamento);
  const quando = agora.toISOString();
  const novo = { pausado: !anterior.pausado, desde: quando };

  gravarJson(armazenamento, CHAVE_PAUSA, novo);

  const eventos = lerEventosPausa(armazenamento);
  eventos.unshift({ id: `p-${quando}`, quando, pausado: novo.pausado });
  gravarJson(armazenamento, CHAVE_EVENTOS, eventos);

  return novo;
}
