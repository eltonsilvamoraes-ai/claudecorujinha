/**
 * INTEGRAÇÃO BLING → DFC 2026 — A Marca da Corujinha (v4.0)
 * PARTE 4/5 — Sincronizar Contas a Pagar, rotina e formatação
 * Cada arquivo .gs é uma PARTE do MESMO projeto Apps Script.
 * Crie um arquivo de Script por parte e cole o conteúdo inteiro.
 */

// ══════════════════════════════════════════════════════════════
//  SINCRONIZAÇÃO — CONTAS A PAGAR
// ══════════════════════════════════════════════════════════════

function sincronizarPagar() {
  log("=== CONTAS A PAGAR — sincronizando ===");
  const aba = sheet(NOME_ABA_PAGAR);
  if (!aba) { log("ERRO: execute criarAbas primeiro."); return; }

  const idx = indexarPorId(aba, CP_COLS);
  const dados = idx.dados;
  const mapa  = idx.mapa;
  const cont = { novos: 0, atualizados: 0 };

  // Histórico, categoria e nome completo do fornecedor só existem no DETALHE.
  function camposDetalhe(lanc) {
    const det = buscarDetalhe("contas/pagar", lanc.id);
    const catId = (det && det.categoria && det.categoria.id) ||
                  (lanc.categoria && lanc.categoria.id);
    return {
      categoria:  MAPA_CAT[catId] || "",
      historico:  (det && det.historico) || "",
      fornecedor: (det && det.contato && det.contato.nome) ||
                  (lanc.contato && lanc.contato.nome) || ""
    };
  }

  function upsert(lanc, liquidado) {
    const vencISO = paraISO(lanc.vencimento);
    if (!vencISO || vencISO < DATA_CORTE_ISO) return;
    const id = String(lanc.id);
    const existeIdx = mapa[id];

    if (liquidado) {
      // O Bling não expõe a data de baixa de forma confiável no /pagar;
      // usamos o vencimento como data de pagamento (comportamento anterior).
      const dtPgtoISO = vencISO;
      if (existeIdx !== undefined) {
        const linha = dados[existeIdx];
        if (String(linha[CP_STATUS - 1]) !== ST_PAGO || !linha[CP_DT_PGTO - 1]) {
          linha[CP_DT_PGTO - 1] = dataDeISO(dtPgtoISO);
          linha[CP_STATUS - 1]  = ST_PAGO;
          cont.atualizados++;
        }
      } else {
        const c = camposDetalhe(lanc);
        dados.push([id, c.fornecedor, c.categoria, c.historico, lanc.valor || 0,
                    dataDeISO(vencISO), dataDeISO(dtPgtoISO), ST_PAGO]);
        mapa[id] = dados.length - 1;
        cont.novos++;
      }
    } else {
      const status = statusPorVencimento(vencISO);
      if (existeIdx !== undefined) {
        const linha = dados[existeIdx];
        const atual = String(linha[CP_STATUS - 1]);
        if (atual !== ST_PAGO && atual !== status) {
          linha[CP_STATUS - 1] = status;
          cont.atualizados++;
        }
      } else {
        const c = camposDetalhe(lanc);
        dados.push([id, c.fornecedor, c.categoria, c.historico, lanc.valor || 0,
                    dataDeISO(vencISO), "", status]);
        mapa[id] = dados.length - 1;
        cont.novos++;
      }
    }
  }

  const abertos = listarTodos("contas/pagar", [SIT_ABERTO]);
  const pagos = listarTodos("contas/pagar", [SIT_LIQUIDADO]);
  log("Bling: " + abertos.length + " em aberto, " + pagos.length + " pagos");

  abertos.forEach(function(l) { upsert(l, false); });
  pagos.forEach(function(l) { upsert(l, true); });

  cont.atualizados += recalcularAtrasos(dados, CP_STATUS, CP_VENCIMENTO, ST_PAGO);

  if (dados.length > 0) aba.getRange(2, 1, dados.length, CP_COLS).setValues(dados);
  log("Pagar → novos: " + cont.novos + ", atualizados: " + cont.atualizados);
}

/**
 * Reavalia, na matriz já carregada, as linhas ainda em aberto:
 * "A vencer" ↔ "Em atraso" conforme a data de hoje.
 * (Bug corrigido: antes, um lançamento "A vencer" que vencia nunca
 * passava a "Em atraso" até ser liquidado.)
 */
function recalcularAtrasos(dados, colStatus, colVenc, statusLiquidado) {
  let n = 0;
  dados.forEach(function(linha) {
    const st = String(linha[colStatus - 1]);
    if (st !== ST_A_VENCER && st !== ST_EM_ATRASO) return; // ignora liquidados
    const novo = statusPorVencimento(paraISO(linha[colVenc - 1]));
    if (novo !== st) { linha[colStatus - 1] = novo; n++; }
  });
  return n;
}


// ══════════════════════════════════════════════════════════════
//  CARGA INICIAL E ROTINA DIÁRIA
// ══════════════════════════════════════════════════════════════

function cargaInicial() {
  log("=== CARGA INICIAL — " + hojeISO() + " ===");
  sincronizarReceber();
  sincronizarPagar();
  formatarAbaReceber();
  formatarAbaPagar();
  log("=== CARGA INICIAL CONCLUÍDA ===");
}

function rotinaDiaria() {
  log("=== ROTINA DIÁRIA — " + hojeISO() + " ===");
  sincronizarReceber();
  sincronizarPagar();
  formatarAbaReceber();
  formatarAbaPagar();
  lancarNaDFC();
  log("=== ROTINA DIÁRIA CONCLUÍDA ===");
}


// ══════════════════════════════════════════════════════════════
//  FORMATAÇÃO DAS ABAS
// ══════════════════════════════════════════════════════════════

function corPorStatus(range, status) {
  const s = String(status).trim().toLowerCase();
  if (s === "recebido" || s === "pago") {
    range.setBackground("#D4EFDF").setFontColor("#1E8449");
  } else if (s === "a vencer") {
    range.setBackground("#FEF9E7").setFontColor("#B7950B");
  } else if (s === "em atraso") {
    range.setBackground("#FADBD8").setFontColor("#C0392B");
  } else {
    range.setBackground("#FFFFFF").setFontColor("#000000");
  }
}

function formatarAbaReceber() {
  const aba = sheet(NOME_ABA_RECEBER);
  if (!aba) { log("Aba Receber não encontrada."); return; }
  const ultima = aba.getLastRow();
  if (ultima < 2) { log("Receber sem dados para formatar."); return; }

  const n = ultima - 1;
  aba.getRange(2, CR_VENCIMENTO, n, 1).setNumberFormat("dd/MM/yy");
  aba.getRange(2, CR_DT_LIQUID, n, 1).setNumberFormat("dd/MM/yy");
  aba.getRange(2, CR_VALOR, n, 1).setNumberFormat("R$ #,##0.00");
  aba.getRange(2, 1, n, CR_COLS).sort({ column: CR_VENCIMENTO, ascending: false });

  const dados = aba.getRange(2, 1, n, CR_COLS).getValues();
  dados.forEach(function(linha, i) {
    corPorStatus(aba.getRange(i + 2, 1, 1, CR_COLS), linha[CR_STATUS - 1]);
  });
  log("Receber formatada: " + n + " linhas.");
}

function formatarAbaPagar() {
  const aba = sheet(NOME_ABA_PAGAR);
  if (!aba) { log("Aba Pagar não encontrada."); return; }
  const ultima = aba.getLastRow();
  if (ultima < 2) { log("Pagar sem dados para formatar."); return; }

  const n = ultima - 1;
  aba.getRange(2, CP_VENCIMENTO, n, 1).setNumberFormat("dd/MM/yy");
  aba.getRange(2, CP_DT_PGTO, n, 1).setNumberFormat("dd/MM/yy");
  aba.getRange(2, CP_VALOR, n, 1).setNumberFormat("R$ #,##0.00");
  aba.getRange(2, 1, n, CP_COLS).sort({ column: CP_VENCIMENTO, ascending: false });

  const dados = aba.getRange(2, 1, n, CP_COLS).getValues();
  dados.forEach(function(linha, i) {
    corPorStatus(aba.getRange(i + 2, 1, 1, CP_COLS), linha[CP_STATUS - 1]);
  });
  log("Pagar formatada: " + n + " linhas.");
}
