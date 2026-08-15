// Nao-perturbe por cliente. Trava INDEPENDENTE da pausa global de
// estado-pausa.js: na Fase 2 o disparo so acontece se as duas estiverem
// liberadas, e retomar a pausa global nao reativa quem esta silenciado
// individualmente.

export const CHAVE_SILENCIADOS = 'cobranca:nao-perturbe';
export const CHAVE_EVENTOS_SILENCIO = 'cobranca:eventos-nao-perturbe';

function lerJson(armazenamento, chave, padrao) {
  try {
    const bruto = armazenamento.getItem(chave);
    if (bruto === null) return padrao;
    const valor = JSON.parse(bruto);
    return Array.isArray(valor) ? valor : padrao;
  } catch {
    return padrao;
  }
}

function gravarJson(armazenamento, chave, valor) {
  try {
    armazenamento.setItem(chave, JSON.stringify(valor));
  } catch {
    // Sem persistencia; a interface continua funcionando.
  }
}

export function lerSilenciados(armazenamento) {
  return lerJson(armazenamento, CHAVE_SILENCIADOS, []);
}

export function estaSilenciado(armazenamento, clienteId) {
  return lerSilenciados(armazenamento).includes(clienteId);
}

export function lerEventosSilencio(armazenamento) {
  return lerJson(armazenamento, CHAVE_EVENTOS_SILENCIO, []);
}

export function alternarSilencio(armazenamento, clienteId, agora) {
  const atuais = lerSilenciados(armazenamento);
  const jaEstava = atuais.includes(clienteId);
  const novos = jaEstava
    ? atuais.filter((id) => id !== clienteId)
    : [...atuais, clienteId];

  gravarJson(armazenamento, CHAVE_SILENCIADOS, novos);

  const quando = agora.toISOString();
  const eventos = lerEventosSilencio(armazenamento);
  eventos.unshift({
    id: `np-${clienteId}-${quando}`,
    clienteId,
    quando,
    silenciado: !jaEstava,
  });
  gravarJson(armazenamento, CHAVE_EVENTOS_SILENCIO, eventos);

  return { silenciado: !jaEstava, silenciados: novos };
}
