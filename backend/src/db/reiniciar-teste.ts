// Comando de teste manual: "/reiniciarteste" mandado pelo proprio numero de
// teste (whatsapp/webhook.ts intercepta antes de chamar a IA). Apaga o
// historico e devolve a(s) divida(s) daquele telefone ao estado inicial da
// negociacao, para o operador testar outro caminho de conversa do zero sem
// abrir o painel nem mexer no D1 na mao.
//
// So chamado depois que o chamador ja confirmou (via destinatarios.ts::
// podeEnviarPara) que o telefone esta na allowlist de teste — nunca deve
// existir um caminho que aceite este comando de um cliente de verdade.

export interface ResultadoReinicioTeste {
  dividasReiniciadas: number;
}

export async function reiniciarConversaDeTeste(
  db: D1Database,
  telefone: string,
): Promise<ResultadoReinicioTeste> {
  const { results: dividas } = await db
    .prepare(
      `SELECT dv.id AS id, dv.credor_id AS credor_id
       FROM dividas dv
       JOIN devedores d ON d.id = dv.devedor_id AND d.credor_id = dv.credor_id
       WHERE d.telefone = ?`,
    )
    .bind(telefone)
    .all<{ id: number; credor_id: string }>();

  const agora = new Date().toISOString();
  const comandos: D1PreparedStatement[] = [];

  for (const divida of dividas) {
    comandos.push(
      db
        .prepare(
          `UPDATE dividas
           SET situacao = 'aberta',
               estagio_negociacao = 0,
               estado_negociacao = 'ENGAGED',
               pedidos_humano = 0,
               data_renda = NULL,
               capacidade_declarada_centavos = NULL,
               valor_acordado_centavos = NULL,
               parcelas_acordadas = NULL,
               fallbacks_consecutivos = 0,
               ultimo_fallback_texto = NULL
           WHERE id = ? AND credor_id = ?`,
        )
        .bind(divida.id, divida.credor_id),
      db
        .prepare(`DELETE FROM ofertas_negociacao WHERE divida_id = ? AND credor_id = ?`)
        .bind(divida.id, divida.credor_id),
      db
        .prepare(`DELETE FROM perguntas_pendentes WHERE divida_id = ? AND credor_id = ?`)
        .bind(divida.id, divida.credor_id),
    );
  }

  comandos.push(
    db.prepare(`DELETE FROM retornos_pendentes WHERE telefone = ? AND enviado_em IS NULL`).bind(telefone),
    db.prepare(`DELETE FROM conversas WHERE telefone = ?`).bind(telefone),
    // Silenciado (cliente pediu para parar) tambem some no reinicio: senao o
    // proximo teste ficaria bloqueado pela mesma trava sem nenhum aviso.
    db.prepare(`UPDATE nao_perturbe SET silenciado = 0 WHERE telefone = ?`).bind(telefone),
  );

  await db.batch(comandos);

  return { dividasReiniciadas: dividas.length };
}
