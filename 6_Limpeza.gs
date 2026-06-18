/**
 * INTEGRAÇÃO BLING → DFC 2026 — A Marca da Corujinha (v4.1)
 * PARTE 6 — Limpar período (remove linhas com vencimento fora de 2026)
 * Cada arquivo .gs é uma PARTE do MESMO projeto Apps Script.
 */

// ══════════════════════════════════════════════════════════════
//  LIMPAR PERÍODO — remove linhas com vencimento fora de 2026
// ══════════════════════════════════════════════════════════════

/**
 * Remove de uma aba as linhas cujo vencimento está fora da janela
 * [DATA_CORTE_ISO, DATA_FIM_ISO]. Reescreve as mantidas e apaga o resto.
 * Retorna a quantidade de linhas removidas.
 */
function limparForaDoPeriodoAba(nomeAba, numCols, colVenc) {
  const aba = sheet(nomeAba);
  if (!aba) { log("Aba não encontrada: " + nomeAba); return 0; }

  const ultima = aba.getLastRow();
  if (ultima < 2) { log(nomeAba + ": sem dados."); return 0; }

  const dados = aba.getRange(2, 1, ultima - 1, numCols).getValues();
  const manter = dados.filter(function(linha) {
    const venc = paraISO(linha[colVenc - 1]);
    return venc && venc >= DATA_CORTE_ISO && venc <= DATA_FIM_ISO;
  });

  const removidos = dados.length - manter.length;
  if (removidos === 0) { log(nomeAba + ": nada a remover."); return 0; }

  if (manter.length > 0) aba.getRange(2, 1, manter.length, numCols).setValues(manter);
  // Apaga as linhas excedentes (de baixo), preservando o cabeçalho.
  aba.deleteRows(2 + manter.length, removidos);

  log(nomeAba + ": " + removidos + " linha(s) fora de " +
      DATA_CORTE_ISO + ".." + DATA_FIM_ISO + " removida(s).");
  return removidos;
}

/**
 * Limpa as DUAS abas (Receber e Pagar), removendo lançamentos cujo
 * vencimento esteja fora de 2026, e reformata. Rode manualmente quando
 * quiser higienizar (ex.: após testes que trouxeram contas de 2027+).
 */
function limparPeriodo() {
  log("=== LIMPANDO LINHAS FORA DO PERÍODO (" +
      DATA_CORTE_ISO + " a " + DATA_FIM_ISO + ") ===");
  limparForaDoPeriodoAba(NOME_ABA_RECEBER, CR_COLS, CR_VENCIMENTO);
  limparForaDoPeriodoAba(NOME_ABA_PAGAR, CP_COLS, CP_VENCIMENTO);
  formatarAbaReceber();
  formatarAbaPagar();
  log("=== LIMPEZA CONCLUÍDA ===");
}
