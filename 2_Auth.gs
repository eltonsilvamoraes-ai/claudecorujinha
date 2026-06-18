/**
 * INTEGRAÇÃO BLING → DFC 2026 — A Marca da Corujinha (v4.0)
 * PARTE 2/5 — Helpers gerais, autenticação OAuth2 e API
 * Cada arquivo .gs é uma PARTE do MESMO projeto Apps Script.
 * Crie um arquivo de Script por parte e cole o conteúdo inteiro.
 */

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
