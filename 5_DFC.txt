/**
 * INTEGRAÇÃO BLING → DFC 2026 — A Marca da Corujinha (v4.0)
 * PARTE 5/5 — Lançamento na DFC e diagnósticos
 * Cada arquivo .gs é uma PARTE do MESMO projeto Apps Script.
 * Crie um arquivo de Script por parte e cole o conteúdo inteiro.
 */

// ══════════════════════════════════════════════════════════════
//  LANÇAR NA DFC
// ══════════════════════════════════════════════════════════════

/** "yyyy-MM-dd" → índice da coluna na DFC (datas na linha 3, a partir da col 4). */
function mapearColunasData(abaDFC) {
  const ultimaCol = abaDFC.getLastColumn();
  const mapa = {};
  if (ultimaCol < 4) return mapa;
  const datas = abaDFC.getRange(3, 4, 1, ultimaCol - 3).getValues()[0];
  datas.forEach(function(v, i) {
    if (v instanceof Date) mapa[Utilities.formatDate(v, TZ, "yyyy-MM-dd")] = 4 + i;
  });
  return mapa;
}

/** nome da linha (col A) → índice da linha na DFC. */
function mapearLinhasNome(abaDFC) {
  const ultima = abaDFC.getLastRow();
  const col = abaDFC.getRange(1, 1, ultima, 1).getValues();
  const mapa = {};
  col.forEach(function(r, i) {
    const nome = String(r[0]).trim();
    if (nome && mapa[nome] === undefined) mapa[nome] = i + 1;
  });
  return mapa;
}

/**
 * Limpa a DFC a partir de 01/06/2026 nas linhas mapeadas e relança tudo
 * das abas Contas a Receber e Contas a Pagar.
 *
 * Otimizações vs. versão anterior:
 *  - Datas e linhas mapeadas 1x (antes era O(n) por lançamento).
 *  - Tratamento de data robusto via paraISO (antes String(Date) corrompia).
 *  - Limpeza + escrita feitas em UMA chamada setValues por linha.
 */
function lancarNaDFC() {
  log("=== LANÇANDO NA DFC ===");
  const abaDFC = sheet(NOME_ABA_DFC);
  const abaRec = sheet(NOME_ABA_RECEBER);
  const abaPag = sheet(NOME_ABA_PAGAR);
  if (!abaDFC || !abaRec || !abaPag) { log("ERRO: aba não encontrada."); return; }

  const mapaCol   = mapearColunasData(abaDFC);
  const mapaLinha = mapearLinhasNome(abaDFC);

  const colInicio = mapaCol[DATA_CORTE_ISO];
  if (!colInicio) { log("ERRO: não encontrei a coluna de " + DATA_CORTE_ISO + " na DFC."); return; }
  const ultimaColuna = abaDFC.getLastColumn();
  const qtdColunas = ultimaColuna - colInicio + 1;

  // Acumulador: linhaDFC → { colDFC → valor }
  const acum = {};
  function acumular(nomeLinha, dataISO, valor) {
    if (!nomeLinha || !dataISO || dataISO < DATA_CORTE_ISO) return;
    const col = mapaCol[dataISO];
    const lin = mapaLinha[nomeLinha];
    if (!col || !lin) return;
    if (!acum[lin]) acum[lin] = {};
    acum[lin][col] = (acum[lin][col] || 0) + valor;
  }

  // Define em que data o lançamento entra na DFC, conforme o status.
  function dataDoLancamento(status, vencISO, dtLiquidISO, liquidadoTxt) {
    if (status === liquidadoTxt && dtLiquidISO) return dtLiquidISO;
    if (status === ST_A_VENCER.toLowerCase()) return vencISO;
    if (status === ST_EM_ATRASO.toLowerCase() && INCLUIR_EM_ATRASO_NA_DFC) return vencISO;
    return "";
  }

  // ── Contas a Receber (entradas, valor positivo) ──
  const uRec = abaRec.getLastRow();
  if (uRec >= 2) {
    abaRec.getRange(2, 1, uRec - 1, CR_COLS).getValues().forEach(function(linha) {
      const loja   = String(linha[CR_LOJA - 1]).trim();
      const valor  = Number(linha[CR_VALOR - 1]) || 0;
      const status = String(linha[CR_STATUS - 1]).trim().toLowerCase();
      const nomeLinha = MAPA_LOJA_DFC[loja];
      if (!nomeLinha) return;
      const dataISO = dataDoLancamento(
        status, paraISO(linha[CR_VENCIMENTO - 1]), paraISO(linha[CR_DT_LIQUID - 1]),
        ST_RECEBIDO.toLowerCase());
      acumular(nomeLinha, dataISO, valor);
    });
  }

  // ── Contas a Pagar (saídas, valor negativo) ──
  const uPag = abaPag.getLastRow();
  if (uPag >= 2) {
    abaPag.getRange(2, 1, uPag - 1, CP_COLS).getValues().forEach(function(linha) {
      const categoria = String(linha[CP_CATEGORIA - 1]).trim();
      const valor     = Number(linha[CP_VALOR - 1]) || 0;
      const status    = String(linha[CP_STATUS - 1]).trim().toLowerCase();
      const nomeLinha = MAPA_CAT_DFC[categoria];
      if (!nomeLinha) return;
      const dataISO = dataDoLancamento(
        status, paraISO(linha[CP_VENCIMENTO - 1]), paraISO(linha[CP_DT_PGTO - 1]),
        ST_PAGO.toLowerCase());
      acumular(nomeLinha, dataISO, -Math.abs(valor));
    });
  }

  // ── Escrever: limpa + grava cada linha mapeada em uma única operação ──
  const linhasAlvo = {};
  Object.keys(MAPA_LOJA_DFC).forEach(function(k) {
    const r = mapaLinha[MAPA_LOJA_DFC[k]]; if (r) linhasAlvo[r] = true;
  });
  Object.keys(MAPA_CAT_DFC).forEach(function(k) {
    const r = mapaLinha[MAPA_CAT_DFC[k]]; if (r) linhasAlvo[r] = true;
  });
  Object.keys(acum).forEach(function(r) { linhasAlvo[r] = true; });

  let celulas = 0;
  Object.keys(linhasAlvo).forEach(function(rStr) {
    const r = Number(rStr);
    const arr = [];
    for (let i = 0; i < qtdColunas; i++) arr.push("");
    const vals = acum[r] || {};
    Object.keys(vals).forEach(function(cStr) {
      const c = Number(cStr);
      if (c >= colInicio && c <= ultimaColuna) { arr[c - colInicio] = vals[c]; celulas++; }
    });
    abaDFC.getRange(r, colInicio, 1, qtdColunas).setValues([arr]);
  });

  log("✅ DFC atualizada: " + celulas + " célula(s) com valor em " +
      Object.keys(linhasAlvo).length + " linha(s).");
}


// ══════════════════════════════════════════════════════════════
//  DIAGNÓSTICO (auxiliares de investigação)
// ══════════════════════════════════════════════════════════════

function diagnosticarCamposReceber() {
  const r = fetchBling(BLING_BASE_V3 + "/contas/receber?pagina=1&limite=1");
  if (!r || !r.data || r.data.length === 0) { log("Nenhum lançamento encontrado."); return; }
  const lanc = r.data[0];
  log("=== LISTAGEM BÁSICA ===\n" + JSON.stringify(lanc, null, 2));
  const det = buscarDetalhe("contas/receber", lanc.id);
  log("=== DETALHE COMPLETO ===\n" + JSON.stringify(det, null, 2));
  if (det && det.origem && det.origem.tipoOrigem === "venda" && det.origem.id) {
    log("=== PEDIDO DE VENDA ===\n" + JSON.stringify(buscarDetalhe("pedidos/vendas", det.origem.id), null, 2));
  }
}

function diagnosticarLojas() {
  log("canais-de-venda: " + JSON.stringify(fetchBling(BLING_BASE_V3 + "/canais-de-venda?pagina=1&limite=100")).substring(0, 300));
  log("lojas: " + JSON.stringify(fetchBling(BLING_BASE_V3 + "/lojas?pagina=1&limite=100")).substring(0, 300));
}
