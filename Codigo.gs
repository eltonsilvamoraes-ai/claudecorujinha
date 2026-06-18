/**
 * ============================================================
 *  INTEGRAÇÃO BLING → DFC 2026 — A Marca da Corujinha
 *  Versão 4.0 (reestruturada e otimizada)
 * ============================================================
 *
 *  O QUE ESTE SCRIPT FAZ
 *  ---------------------
 *  1. Popula/atualiza as abas "Contas a Receber" e "Contas a Pagar"
 *     com os lançamentos do Bling a partir de 01/06/2026.
 *  2. Mantém o STATUS de cada lançamento correto (A vencer / Em atraso /
 *     Recebido / Pago), reavaliando atrasos a cada execução.
 *  3. Lança os valores consolidados na aba "DFC 2026", nas linhas
 *     (categoria/loja) e colunas (data) corretas.
 *
 * ============================================================
 *  CONFIGURAÇÃO INICIAL
 * ============================================================
 *
 *  PASSO 1 — Propriedades do script (engrenagem → Configurações do projeto
 *            → Propriedades do script). Cadastre, SEM expor no código:
 *    BLING_CLIENT_ID      = (seu client id do Bling)
 *    BLING_CLIENT_SECRET  = (seu client secret do Bling)
 *
 *  PASSO 2 — Execute iniciarAutorizacao, copie o link dos logs,
 *            abra no navegador, faça login no Bling e autorize.
 *
 *  PASSO 3 — Execute criarAbas para criar a estrutura.
 *
 *  PASSO 4 — Execute cargaInicial para popular as abas.
 *
 *  PASSO 5 — Configure um Acionador (gatilho) diário para
 *            rotinaDiaria às 03:00.
 *
 *  OBS. DE SEGURANÇA: nunca cole client_id/secret/tokens no código que
 *  vai para um repositório. Eles devem viver apenas nas Propriedades do
 *  script. (A versão anterior trazia essas credenciais no cabeçalho.)
 */

// ──────────────────────────────────────────────────────────
//  CONFIGURAÇÕES GERAIS
// ──────────────────────────────────────────────────────────

const NOME_ABA_RECEBER = "Contas a Receber";
const NOME_ABA_PAGAR   = "Contas a Pagar";
const NOME_ABA_DFC     = "DFC 2026";

const TZ              = "America/Sao_Paulo";
const DATA_CORTE_ISO  = "2026-06-01";           // início do período controlado
const DATA_CORTE      = new Date(2026, 5, 1);
// Fim do período controlado por ESTA DFC. Lançamentos com vencimento depois
// desta data (ex.: contas fixas que se repetem em 2027+) NÃO entram nas abas
// nem na DFC 2026 — só entrarão quando existir uma "DFC 2027".
const DATA_FIM_ISO    = "2026-12-31";

// Se true, lançamentos "Em atraso" (ainda não liquidados) entram na DFC
// projetados na data de vencimento. Se false, só entram quando liquidados.
const INCLUIR_EM_ATRASO_NA_DFC = false;

const REDIRECT_URI_V3   = "https://script.google.com/macros/s/AKfycbzjxmFoR-WjUbeGUaulA-dkv67F7cc5u29RoYV8YBLQkKfQhMArfBTcDsxe5WwUiyyv/exec";
const BLING_AUTH_URL_V3 = "https://www.bling.com.br/Api/v3/oauth/authorize";
const BLING_TOKEN_URL_V3 = "https://www.bling.com.br/Api/v3/oauth/token";
const BLING_BASE_V3     = "https://www.bling.com.br/Api/v3";

// Situação do Bling para contas a pagar/receber:
//   1 = Em aberto | 2 = Recebido/Pago (liquidado)
const SIT_ABERTO    = 1;
const SIT_LIQUIDADO = 2;

// Colunas — Contas a Receber (1-based)
const CR_ID         = 1;  // A — ID Bling
const CR_CLIENTE    = 2;  // B — Cliente
const CR_LOJA       = 3;  // C — Loja
const CR_VALOR      = 4;  // D — Valor bruto
const CR_VENCIMENTO = 5;  // E — Vencimento
const CR_DT_LIQUID  = 6;  // F — Data Liquidação
const CR_STATUS     = 7;  // G — Status
const CR_COLS       = 7;

// Colunas — Contas a Pagar (1-based)
const CP_ID         = 1;  // A — ID Bling
const CP_FORNECEDOR = 2;  // B — Fornecedor
const CP_CATEGORIA  = 3;  // C — Categoria (nome linha DFC)
const CP_HISTORICO  = 4;  // D — Histórico
const CP_VALOR      = 5;  // E — Valor
const CP_VENCIMENTO = 6;  // F — Vencimento
const CP_DT_PGTO    = 7;  // G — Data Pagamento
const CP_STATUS     = 8;  // H — Status
const CP_COLS       = 8;

// Status textuais (centralizados para evitar divergência de grafia)
const ST_A_VENCER  = "A vencer";
const ST_EM_ATRASO = "Em atraso";
const ST_RECEBIDO  = "Recebido";
const ST_PAGO      = "Pago";

// Mapa: ID da loja no Bling → canal (confirmado via DevTools no Bling)
const MAPA_ID_LOJA = {
  "0":         "SEM IDENTIFICAÇÃO LOJA", // Nenhuma
  "205348282": "VENDA WHATS",            // Comercial – Whatsapp
  "206108597": "FABRICA",                // Fabrica
  "204259565": "NUVEMSHOP",              // NUVEM SHOP
  "203794635": "PDV",                    // PDV Corujinha
  "205466660": "NUVEMSHOP",              // TikTok Shop – Corujinha
};

// Mapa: ID categoria Bling → nome da linha na DFC (contas a pagar)
const MAPA_CAT = {
  14734889404: "Vendas PDV",
  14734889405: "Vendas E-commerce",
  14734889406: "Vendas Fábrica",
  14734889504: "Vendas Eventos Corujinha",
  14734889505: "Reserva",
  14605705752: "Demais Entradas",
  13060280955: "Vendas PDV",
  13060280954: "Vendas Fábrica",
  14500604956: "Tecno Malhas Ltda",
  14500611546: "Armarinhos 25",
  14500628959: "Liramax — Etiquetas",
  14734889603: "DTF Estampa",
  14499458047: "Oficina Costura — Dona Edna",
  13060280983: "Energia",
  13060280979: "Água",
  13060280992: "Internet",
  13060280991: "Celular",
  13060280980: "Aluguel",
  14500520039: "Alarme",
  13060280995: "Convênio",
  13060280994: "INSS",
  14734890191: "Imposto DAS / GARE",
  14734890289: "ISS",
  14734890290: "IPTU / Taxas",
  13060280988: "Contabilidade",
  13060280990: "Software / Apps",
  14500820050: "Tarifa Manutenção Conta",
  14734890293: "Taxas Maquininha",
  14734890292: "Taxas Site",
  14500832312: "Tarifa Pix",
  14499289891: "Freelance",
  14734890294: "Tráfego Pago",
  13060280974: "Correios",
  13060280963: "Devolução de Vendas",
  14500907111: "Financiamento Carro",
  14604763493: "Depósito Fundo de Reserva",
  14500552170: "Diversos",
};

// Mapa: Loja (Contas a Receber) → linha na DFC
const MAPA_LOJA_DFC = {
  "PDV":                    "Vendas PDV",
  "NUVEMSHOP":              "Vendas E-commerce",
  "VENDA WHATS":            "Vendas Tráfego Pago",
  "FABRICA":                "Vendas Fábrica",
  "SEM IDENTIFICAÇÃO LOJA": "Demais Entradas",
  "NENHUM":                 "Demais Entradas",
};

// Mapa: Categoria (Contas a Pagar) → linha na DFC (identidade — a categoria
// já é o próprio nome da linha, mas mantemos explícito para validar nomes).
const MAPA_CAT_DFC = {
  "Tecno Malhas Ltda":           "Tecno Malhas Ltda",
  "Armarinhos 25":               "Armarinhos 25",
  "Liramax — Etiquetas":         "Liramax — Etiquetas",
  "DTF Estampa":                 "DTF Estampa",
  "Oficina Costura — Dona Edna": "Oficina Costura — Dona Edna",
  "Energia":                     "Energia",
  "Água":                        "Água",
  "Internet":                    "Internet",
  "Celular":                     "Celular",
  "Aluguel":                     "Aluguel",
  "Alarme":                      "Alarme",
  "Convênio":                    "Convênio",
  "INSS":                        "INSS",
  "Imposto DAS / GARE":          "Imposto DAS / GARE",
  "ISS":                         "ISS",
  "IPTU / Taxas":                "IPTU / Taxas",
  "Contabilidade":               "Contabilidade",
  "Software / Apps":             "Software / Apps",
  "Tarifa Manutenção Conta":     "Tarifa Manutenção Conta",
  "Taxas Maquininha":            "Taxas Maquininha",
  "Taxas Site":                  "Taxas Site",
  "Tarifa Pix":                  "Tarifa Pix",
  "Freelance":                   "Freelance",
  "Tráfego Pago":                "Tráfego Pago",
  "Correios":                    "Correios",
  "Devolução de Vendas":         "Devolução de Vendas",
  "Financiamento Carro":         "Financiamento Carro",
  "Depósito Fundo de Reserva":   "Depósito Fundo de Reserva",
  "Diversos":                    "Diversos",
};


// ══════════════════════════════════════════════════════════════
//  HELPERS GERAIS
// ══════════════════════════════════════════════════════════════

function log(msg) { Logger.log(msg); }

function ss() { return SpreadsheetApp.getActiveSpreadsheet(); }

function sheet(nome) { return ss().getSheetByName(nome); }

/**
 * Converte qualquer valor de data (Date, "yyyy-MM-dd", "dd/MM/yyyy",
 * ISO com horário) para "yyyy-MM-dd". Retorna "" se não houver data.
 * Centraliza o tratamento de datas que antes quebrava no DFC
 * (String(Date) gerava "Mon Jun 15 2026..." e corrompia a coluna).
 */
function paraISO(valor) {
  if (valor === null || valor === undefined || valor === "") return "";
  if (valor instanceof Date) return Utilities.formatDate(valor, TZ, "yyyy-MM-dd");
  const s = String(valor).trim();
  if (!s) return "";
  if (s.indexOf("/") !== -1) {            // dd/MM/yyyy
    const p = s.split("/");
    if (p.length === 3) {
      const dd = ("0" + p[0]).slice(-2);
      const mm = ("0" + p[1]).slice(-2);
      return p[2] + "-" + mm + "-" + dd;
    }
  }
  return s.substring(0, 10);              // yyyy-MM-dd[...]
}

/** Cria um Date (meio-dia local) a partir de "yyyy-MM-dd". "" se inválido. */
function dataDeISO(iso) {
  if (!iso) return "";
  const p = iso.split("-");
  if (p.length !== 3) return "";
  return new Date(parseInt(p[0], 10), parseInt(p[1], 10) - 1, parseInt(p[2], 10), 12, 0, 0);
}

/** Data de hoje em "yyyy-MM-dd" (comparável lexicograficamente). */
function hojeISO() { return Utilities.formatDate(new Date(), TZ, "yyyy-MM-dd"); }

/** Status de um lançamento ainda em aberto, conforme o vencimento. */
function statusPorVencimento(vencISO) {
  if (!vencISO) return ST_A_VENCER;
  return vencISO < hojeISO() ? ST_EM_ATRASO : ST_A_VENCER;
}


// ══════════════════════════════════════════════════════════════
//  AUTENTICAÇÃO OAuth2
// ══════════════════════════════════════════════════════════════

function iniciarAutorizacao() {
  const props = PropertiesService.getScriptProperties();
  const clientId = props.getProperty("BLING_CLIENT_ID");
  if (!clientId) {
    log("ERRO: configure BLING_CLIENT_ID nas Propriedades do script.");
    return;
  }
  const state = Utilities.getUuid();
  props.setProperty("OAUTH_STATE", state);
  log("Abra este link no navegador e autorize:");
  log(BLING_AUTH_URL_V3 +
    "?response_type=code" +
    "&client_id=" + encodeURIComponent(clientId) +
    "&state=" + encodeURIComponent(state) +
    "&redirect_uri=" + encodeURIComponent(REDIRECT_URI_V3));
}

function doGet(e) {
  const props = PropertiesService.getScriptProperties();
  const code  = e.parameter.code;
  const state = e.parameter.state;
  if (!code) return HtmlService.createHtmlOutput("<h3>Erro: código não recebido.</h3>");
  if (state !== props.getProperty("OAUTH_STATE"))
    return HtmlService.createHtmlOutput("<h3>Erro: state inválido.</h3>");

  const r = trocarToken({ grant_type: "authorization_code", code: code, redirect_uri: REDIRECT_URI_V3 });
  if (r && r.access_token) {
    salvarTokens(r);
    return HtmlService.createHtmlOutput("<h3>✅ Autorização concluída! Pode fechar esta aba.</h3>");
  }
  return HtmlService.createHtmlOutput("<h3>Erro:</h3><pre>" + JSON.stringify(r, null, 2) + "</pre>");
}

function trocarToken(payload) {
  const props = PropertiesService.getScriptProperties();
  const clientId     = props.getProperty("BLING_CLIENT_ID");
  const clientSecret = props.getProperty("BLING_CLIENT_SECRET");
  const cred = Utilities.base64Encode(clientId + ":" + clientSecret);
  const res = UrlFetchApp.fetch(BLING_TOKEN_URL_V3, {
    method: "post",
    headers: { "Authorization": "Basic " + cred,
               "Content-Type": "application/x-www-form-urlencoded" },
    payload: payload,
    muteHttpExceptions: true
  });
  return JSON.parse(res.getContentText());
}

function salvarTokens(r) {
  const props = PropertiesService.getScriptProperties();
  props.setProperty("BLING_ACCESS_TOKEN", r.access_token);
  props.setProperty("BLING_REFRESH_TOKEN", r.refresh_token);
  props.setProperty("BLING_TOKEN_EXPIRA_EM",
    String(new Date().getTime() + r.expires_in * 1000));
}

function obterToken() {
  const props    = PropertiesService.getScriptProperties();
  const token    = props.getProperty("BLING_ACCESS_TOKEN");
  const expiraEm = Number(props.getProperty("BLING_TOKEN_EXPIRA_EM") || "0");
  if (token && new Date().getTime() < expiraEm - 60000) return token;

  const refresh = props.getProperty("BLING_REFRESH_TOKEN");
  if (!refresh) throw new Error("Sem refresh_token. Execute iniciarAutorizacao.");
  const r = trocarToken({ grant_type: "refresh_token", refresh_token: refresh });
  if (!r.access_token) throw new Error("Falha ao renovar token: " + JSON.stringify(r));
  salvarTokens(r);
  return r.access_token;
}


// ══════════════════════════════════════════════════════════════
//  UTILITÁRIOS DE API (com cache de detalhe por execução)
// ══════════════════════════════════════════════════════════════

const _cacheDetalhe = {};

function fetchBling(url, tentativas) {
  tentativas = tentativas || 4;
  const token = obterToken();
  for (let i = 0; i < tentativas; i++) {
    const res = UrlFetchApp.fetch(url, {
      method: "get",
      headers: { "Authorization": "Bearer " + token, "Accept": "application/json" },
      muteHttpExceptions: true
    });
    let r;
    try { r = JSON.parse(res.getContentText()); }
    catch (err) { r = null; }
    const limite = res.getResponseCode() === 429 ||
                   (r && r.error && r.error.type === "TOO_MANY_REQUESTS");
    if (!limite) return r;
    Utilities.sleep(1000 * (i + 1));
  }
  return null;
}

/** Lista todas as páginas de um endpoint, filtrando por situações (opcional). */
function listarTodos(endpoint, situacoes) {
  const todos = [];
  let pagina = 1;
  while (pagina <= 50) {
    const r = fetchBling(BLING_BASE_V3 + "/" + endpoint + "?pagina=" + pagina + "&limite=100");
    if (!r || r.error) break;
    const dados = r.data || [];
    dados.forEach(function(l) {
      if (!situacoes || situacoes.indexOf(l.situacao) !== -1) todos.push(l);
    });
    if (dados.length < 100) break;
    pagina++;
    Utilities.sleep(350);
  }
  return todos;
}

/** Busca (com cache) o detalhe de um recurso. */
function buscarDetalhe(endpoint, id) {
  const chave = endpoint + "/" + id;
  if (Object.prototype.hasOwnProperty.call(_cacheDetalhe, chave)) return _cacheDetalhe[chave];
  const r = fetchBling(BLING_BASE_V3 + "/" + endpoint + "/" + id);
  Utilities.sleep(300);
  const d = (r && !r.error && r.data) ? r.data : null;
  _cacheDetalhe[chave] = d;
  return d;
}

/**
 * Descobre a loja/canal de um lançamento de contas a receber.
 * A LISTAGEM do Bling normalmente NÃO traz o campo "origem", então,
 * quando ausente, buscamos o detalhe (era por isso que antes a loja
 * caía sempre em "NENHUM"). Só é chamada para linhas novas.
 */
function buscarLojaDoLancamento(lanc) {
  let origem = lanc.origem;
  if (origem === undefined) {
    const det = buscarDetalhe("contas/receber", lanc.id);
    origem = det && det.origem;
  }
  if (!origem || origem.tipoOrigem !== "venda" || !origem.id) return "NENHUM";

  const pedido = buscarDetalhe("pedidos/vendas", origem.id);
  if (!pedido) return "FABRICA";
  const lojaId = String((pedido.loja && pedido.loja.id) || "0");
  return MAPA_ID_LOJA[lojaId] || "FABRICA";
}

/** Data real de liquidação de um recebimento (via borderô), com fallback no vencimento. */
function dataLiquidacaoReceber(lanc, vencISO) {
  const bords = lanc.borderos || [];
  if (bords.length > 0) {
    const b = buscarDetalhe("borderos", bords[0]);
    if (b && b.data) return paraISO(b.data);
  }
  return vencISO;
}


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
    if (!vencISO || vencISO < DATA_CORTE_ISO || vencISO > DATA_FIM_ISO) return;
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
    if (!nomeLinha || !dataISO || dataISO < DATA_CORTE_ISO || dataISO > DATA_FIM_ISO) return;
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
