/**
 * INTEGRAÇÃO BLING → DFC 2026 — A Marca da Corujinha (v4.1)
 * PARTE 3/5 — Criar abas, índice e sincronizar Contas a Receber
 * Cada arquivo .gs é uma PARTE do MESMO projeto Apps Script.
 * Crie um arquivo de Script por parte e cole o conteúdo inteiro.
 */

// ══════════════════════════════════════════════════════════════
//  CRIAR ABAS
// ══════════════════════════════════════════════════════════════

function criarAbas() {
  const planilha = ss();

  let abaRec = planilha.getSheetByName(NOME_ABA_RECEBER);
  if (!abaRec) {
    abaRec = planilha.insertSheet(NOME_ABA_RECEBER);
    const cab = ["ID Bling", "Cliente", "Loja", "Valor", "Vencimento", "Data Liquidação", "Status"];
    abaRec.getRange(1, 1, 1, cab.length).setValues([cab])
      .setFontWeight("bold").setBackground("#1A5276").setFontColor("#FFFFFF");
    abaRec.setFrozenRows(1);
    [140, 200, 150, 90, 110, 110, 100].forEach(function(w, i) { abaRec.setColumnWidth(i + 1, w); });
    log('Aba "' + NOME_ABA_RECEBER + '" criada.');
  } else {
    log('Aba "' + NOME_ABA_RECEBER + '" já existe.');
  }

  let abaPag = planilha.getSheetByName(NOME_ABA_PAGAR);
  if (!abaPag) {
    abaPag = planilha.insertSheet(NOME_ABA_PAGAR);
    const cab = ["ID Bling", "Fornecedor", "Categoria", "Histórico",
                 "Valor", "Vencimento", "Data Pagamento", "Status"];
    abaPag.getRange(1, 1, 1, cab.length).setValues([cab])
      .setFontWeight("bold").setBackground("#6E2F22").setFontColor("#FFFFFF");
    abaPag.setFrozenRows(1);
    [140, 200, 180, 280, 90, 110, 110, 100].forEach(function(w, i) { abaPag.setColumnWidth(i + 1, w); });
    log('Aba "' + NOME_ABA_PAGAR + '" criada.');
  } else {
    log('Aba "' + NOME_ABA_PAGAR + '" já existe.');
  }

  log("Abas prontas.");
}


// ══════════════════════════════════════════════════════════════
//  ÍNDICE DE LINHAS POR ID (1 leitura, sem busca O(n²))
// ══════════════════════════════════════════════════════════════

/**
 * Lê a aba inteira uma única vez e devolve:
 *  - dados: matriz de linhas (mutável)
 *  - mapa:  String(id) → índice na matriz
 * Substitui idJaExiste()/encontrarLinhaId(), que reliam a coluna A
 * inteira para cada lançamento (lento e a origem de status não sincronizar).
 */
function indexarPorId(aba, numCols) {
  const ultima = aba.getLastRow();
  const dados = (ultima >= 2) ? aba.getRange(2, 1, ultima - 1, numCols).getValues() : [];
  const mapa = {};
  dados.forEach(function(linha, i) {
    const id = linha[0];
    if (id !== "" && id !== null && id !== undefined) mapa[String(id)] = i;
  });
  return { dados: dados, mapa: mapa };
}


// ══════════════════════════════════════════════════════════════
//  SINCRONIZAÇÃO — CONTAS A RECEBER
// ══════════════════════════════════════════════════════════════

function sincronizarReceber() {
  log("=== CONTAS A RECEBER — sincronizando ===");
  const aba = sheet(NOME_ABA_RECEBER);
  if (!aba) { log("ERRO: execute criarAbas primeiro."); return; }

  const idx = indexarPorId(aba, CR_COLS);
  const dados = idx.dados;
  const mapa  = idx.mapa;
  const cont = { novos: 0, atualizados: 0 };

  function upsert(lanc, liquidado) {
    const vencISO = paraISO(lanc.vencimento);
    if (!vencISO || vencISO < DATA_CORTE_ISO || vencISO > DATA_FIM_ISO) return;
    const id = String(lanc.id);
    const existeIdx = mapa[id];
    const contato = (lanc.contato && lanc.contato.nome) || "";

    if (liquidado) {
      const dtLiqISO = dataLiquidacaoReceber(lanc, vencISO);
      if (existeIdx !== undefined) {
        const linha = dados[existeIdx];
        if (String(linha[CR_STATUS - 1]) !== ST_RECEBIDO || !linha[CR_DT_LIQUID - 1]) {
          linha[CR_DT_LIQUID - 1] = dataDeISO(dtLiqISO);
          linha[CR_STATUS - 1]    = ST_RECEBIDO;
          cont.atualizados++;
        }
      } else {
        dados.push([id, contato, buscarLojaDoLancamento(lanc), lanc.valor || 0,
                    dataDeISO(vencISO), dataDeISO(dtLiqISO), ST_RECEBIDO]);
        mapa[id] = dados.length - 1;
        cont.novos++;
      }
    } else {
      const status = statusPorVencimento(vencISO);
      if (existeIdx !== undefined) {
        const linha = dados[existeIdx];
        const atual = String(linha[CR_STATUS - 1]);
        // Nunca rebaixa um lançamento já marcado como Recebido.
        if (atual !== ST_RECEBIDO && atual !== status) {
          linha[CR_STATUS - 1] = status;
          cont.atualizados++;
        }
      } else {
        dados.push([id, contato, buscarLojaDoLancamento(lanc), lanc.valor || 0,
                    dataDeISO(vencISO), "", status]);
        mapa[id] = dados.length - 1;
        cont.novos++;
      }
    }
  }

  const abertos = listarTodos("contas/receber", [SIT_ABERTO]);
  const recebidos = listarTodos("contas/receber", [SIT_LIQUIDADO]);
  log("Bling: " + abertos.length + " em aberto, " + recebidos.length + " recebidos");

  abertos.forEach(function(l) { upsert(l, false); });
  recebidos.forEach(function(l) { upsert(l, true); });

  cont.atualizados += recalcularAtrasos(dados, CR_STATUS, CR_VENCIMENTO, ST_RECEBIDO);

  if (dados.length > 0) aba.getRange(2, 1, dados.length, CR_COLS).setValues(dados);
  log("Receber → novos: " + cont.novos + ", atualizados: " + cont.atualizados);
}
