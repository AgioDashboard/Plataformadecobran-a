import type { CredorId } from '../dominio/credor.ts';
import type { StatusTelefone } from '../dominio/telefone.ts';
import { classificarTelefone, prioridadeInicial, LIMITE_TELEFONES } from '../dominio/telefone.ts';
import { normalizarNumero } from '../destinatarios.ts';

export interface TelefoneDoDevedor {
  id: number;
  devedorId: string;
  credorId: CredorId;
  numero: string;
  status: StatusTelefone;
  prioridade: number;
  ultimaTentativa: string | null;
  ultimoMotivo: string | null;
}

function daLinha(l: Record<string, string | number | null>): TelefoneDoDevedor {
  return {
    id: Number(l.id),
    devedorId: String(l.devedor_id),
    credorId: String(l.credor_id) as CredorId,
    numero: String(l.numero),
    status: String(l.status) as StatusTelefone,
    prioridade: Number(l.prioridade),
    ultimaTentativa: l.ultima_tentativa === null ? null : String(l.ultima_tentativa),
    ultimoMotivo: l.ultimo_motivo === null ? null : String(l.ultimo_motivo),
  };
}

export async function cadastrarTelefones(
  db: D1Database,
  credorId: CredorId,
  devedorId: string,
  numeros: string[],
): Promise<number> {
  const agora = new Date().toISOString();
  // Repetido na planilha nao vira duas linhas, e o teto de 5 e aplicado
  // aqui e nao so no banco, para o resto entrar na auditoria.
  const unicos = [...new Set(numeros.map(normalizarNumero).filter((n) => n.length > 0))];
  let gravados = 0;

  for (const [ordem, numero] of unicos.slice(0, LIMITE_TELEFONES).entries()) {
    const tipo = classificarTelefone(numero);
    await db
      .prepare(
        `INSERT OR IGNORE INTO telefones
          (devedor_id, credor_id, numero, status, prioridade, criado_em)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        devedorId,
        credorId,
        numero,
        // Formato quebrado ja nasce invalido: nunca sera tentado.
        tipo === 'invalido' ? 'invalido' : 'desconhecido',
        prioridadeInicial(tipo, ordem),
        agora,
      )
      .run();
    gravados += 1;
  }

  return gravados;
}

export async function telefonesDoDevedor(
  db: D1Database,
  credorId: CredorId,
  devedorId: string,
): Promise<TelefoneDoDevedor[]> {
  const { results } = await db
    .prepare(
      `SELECT id, devedor_id, credor_id, numero, status, prioridade, ultima_tentativa, ultimo_motivo
       FROM telefones WHERE credor_id = ? AND devedor_id = ? ORDER BY prioridade`,
    )
    .bind(credorId, devedorId)
    .all<Record<string, string | number | null>>();
  return results.map(daLinha);
}

// Chamada pelo caminho do recibo, que conhece o telefone pelo wamid e nao
// tem credor nenhum em maos. A chave primaria ja identifica uma linha so.
export async function definirStatusTelefone(
  db: D1Database,
  telefoneId: number,
  status: StatusTelefone,
  motivo: string,
): Promise<void> {
  await db
    .prepare(`UPDATE telefones SET status = ?, ultimo_motivo = ? WHERE id = ?`)
    .bind(status, motivo.slice(0, 300), telefoneId)
    .run();
}

export async function abrirTentativa(
  db: D1Database,
  credorId: CredorId,
  devedorId: string,
  telefoneId: number,
  idExterno: string,
): Promise<void> {
  const agora = new Date().toISOString();
  await db
    .prepare(
      `INSERT INTO tentativas_contato
        (devedor_id, credor_id, telefone_id, id_externo, aberta_em)
       VALUES (?, ?, ?, ?, ?)`,
    )
    .bind(devedorId, credorId, telefoneId, idExterno, agora)
    .run();
  // O credor_id entra no WHERE porque aqui ele existe: marcar tentativa num
  // telefone de outra carteira seria escrita cruzada silenciosa.
  await db
    .prepare(`UPDATE telefones SET ultima_tentativa = ? WHERE id = ? AND credor_id = ?`)
    .bind(agora, telefoneId, credorId)
    .run();
}

export async function tentativaAberta(
  db: D1Database,
  devedorId: string,
): Promise<{ id: number; telefoneId: number } | null> {
  const l = await db
    .prepare(
      `SELECT id, telefone_id FROM tentativas_contato
       WHERE devedor_id = ? AND fechada_em IS NULL ORDER BY aberta_em DESC LIMIT 1`,
    )
    .bind(devedorId)
    .first<{ id: number; telefone_id: number }>();
  return l ? { id: Number(l.id), telefoneId: Number(l.telefone_id) } : null;
}

// O recibo chega com o wamid, nao com o id da tentativa. Devolve o telefone
// para quem chamou aplicar o efeito do status.
export async function fecharTentativa(
  db: D1Database,
  idExterno: string,
  desfecho: string,
): Promise<{ telefoneId: number } | null> {
  const l = await db
    .prepare(`SELECT id, telefone_id FROM tentativas_contato WHERE id_externo = ?`)
    .bind(idExterno)
    .first<{ id: number; telefone_id: number }>();
  if (!l) return null;

  await db
    .prepare(`UPDATE tentativas_contato SET fechada_em = ?, desfecho = ? WHERE id = ?`)
    .bind(new Date().toISOString(), desfecho.slice(0, 200), l.id)
    .run();
  return { telefoneId: Number(l.telefone_id) };
}
