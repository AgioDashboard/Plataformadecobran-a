import { normalizarNumero } from '../destinatarios.ts';
import type { CredorId } from '../dominio/credor.ts';
import { inserirDevedor, inserirDivida } from '../db/cadastro.ts';
import { cadastrarTelefones } from '../db/telefones.ts';
import { cpfValido, normalizarCpf } from '../dominio/cpf.ts';

export interface Cliente {
  nome: string;
  cpf: string | null;
  telefone: string;
  telefonesExtras: string[];
  valorCentavos: number;
  vencimento: string;
}

// A coluna de CPF e localizada pelo cabecalho, nao por posicao: o Cobmais
// exporta layouts diferentes conforme o relatorio, e assumir a quinta
// coluna quebraria em silencio no dia em que alguem trocasse o layout.
function indiceDoCpf(cabecalho: string): number {
  const colunas = cabecalho.split(';').map((c) => c.trim().toLowerCase());
  return colunas.findIndex((c) => c === 'cpf' || c === 'documento' || c === 'cpf/cnpj');
}

// Planilha exportada do Cobmais: ponto e virgula, valor em pt-BR,
// data em dd/mm/aaaa.
//
// Linha que nao interpreta e DESCARTADA, nunca adivinhada. Cobrar o valor
// errado e pior do que nao cobrar.
export function interpretarCsv(texto: string): Cliente[] {
  const todas = texto.trim().split(/\r?\n/);
  const cabecalho = todas[0] ?? '';
  const iCpf = indiceDoCpf(cabecalho);
  const linhas = todas.slice(1);

  return linhas.flatMap((linha) => {
    const colunas = linha.split(';');
    const [nome, telefoneBruto, valorBruto, vencimentoBruto] = colunas;
    if (!nome || !telefoneBruto || !valorBruto || !vencimentoBruto) return [];

    // Colunas 5 em diante sao telefones adicionais, ate o teto de 5 no
    // total. Planilha sem essas colunas continua funcionando. A coluna de
    // CPF fica de fora: 11 digitos passariam no filtro de tamanho e o
    // devedor ganharia um telefone que nunca existiu.
    const extras = colunas
      .map((c, i) => (i >= 4 && i !== iCpf ? normalizarNumero(c) : ''))
      .filter((c) => c.length >= 10);

    const telefone = normalizarNumero(telefoneBruto);
    if (telefone.length < 12) return [];

    const centavos = Math.round(
      Number(valorBruto.trim().replace(/\./g, '').replace(',', '.')) * 100,
    );
    if (!Number.isFinite(centavos) || centavos <= 0) return [];

    const [dia, mes, ano] = vencimentoBruto.trim().split('/');
    if (!dia || !mes || !ano) return [];

    // CPF invalido entra como null, nao como texto qualquer: e melhor o
    // devedor ficar sem link do que receber um portal que nao consegue
    // conferir quem ele e.
    const cpfBruto = iCpf >= 0 ? (colunas[iCpf] ?? '') : '';
    const cpf = cpfValido(cpfBruto) ? normalizarCpf(cpfBruto) : null;

    return [
      {
        nome: nome.trim(),
        cpf,
        telefone,
        telefonesExtras: extras,
        valorCentavos: centavos,
        vencimento: `${ano}-${mes.padStart(2, '0')}-${dia.padStart(2, '0')}`,
      },
    ];
  });
}

// Contagem separada porque o operador precisa saber que a planilha tinha
// linha ruim — silenciar isso e como cobrar menos gente sem avisar.
export function resumoDaImportacao(csv: string): { aproveitadas: number; descartadas: number } {
  const linhas = csv
    .trim()
    .split(/\r?\n/)
    .slice(1)
    .filter((l) => l.trim().length > 0);
  const aproveitadas = interpretarCsv(csv).length;
  return { aproveitadas, descartadas: linhas.length - aproveitadas };
}

export async function importarParaCarteira(
  db: D1Database,
  credorId: CredorId,
  csv: string,
): Promise<{ criados: number; atualizados: number; descartados: number }> {
  const clientes = interpretarCsv(csv);
  const { descartadas } = resumoDaImportacao(csv);

  let criados = 0;
  let atualizados = 0;

  for (const cliente of clientes) {
    // Mesmo CPF na mesma carteira e a mesma pessoa. Procurar por documento
    // ANTES do telefone evita violar o indice unico (credor_id, documento) e,
    // melhor que isso, trata telefone novo como o que ele e: mais um contato
    // da mesma pessoa, que a descoberta de WhatsApp da Fase 4 vai testar.
    const porDocumento = cliente.cpf
      ? await db
          .prepare('SELECT id FROM devedores WHERE credor_id = ? AND documento = ?')
          .bind(credorId, cliente.cpf)
          .first<{ id: string }>()
      : null;

    // Linha sem CPF valido continua existindo, e para ela o telefone segue
    // sendo a unica chave possivel: sem esta busca, reimportar a mesma
    // planilha duplicaria esses devedores.
    const existente =
      porDocumento ??
      (await db
        .prepare('SELECT id FROM devedores WHERE credor_id = ? AND telefone = ?')
        .bind(credorId, cliente.telefone)
        .first<{ id: string }>());

    let devedorId: string;
    if (existente) {
      devedorId = existente.id;
      atualizados += 1;
    } else {
      devedorId = await inserirDevedor(db, credorId, {
        nome: cliente.nome,
        documento: cliente.cpf,
        telefone: cliente.telefone,
      });
      criados += 1;
    }

    // Reimportar nao duplica: o indice unico (devedor_id, numero) segura, e
    // o INSERT e OR IGNORE. Telefone novo numa reimportacao entra.
    await cadastrarTelefones(db, credorId, devedorId, [
      cliente.telefone,
      ...cliente.telefonesExtras,
    ]);

    // A referencia identifica a divida dentro da carteira. Mesma
    // referencia na mesma carteira nao entra duas vezes.
    const referencia = `${cliente.vencimento}-${cliente.valorCentavos}`;
    const jaTem = await db
      .prepare('SELECT id FROM dividas WHERE credor_id = ? AND devedor_id = ? AND referencia = ?')
      .bind(credorId, devedorId, referencia)
      .first<{ id: number }>();

    if (!jaTem) {
      await inserirDivida(db, credorId, devedorId, {
        referencia,
        valorCentavos: cliente.valorCentavos,
        vencimento: cliente.vencimento,
      });
    }
  }

  return { criados, atualizados, descartados: descartadas };
}
