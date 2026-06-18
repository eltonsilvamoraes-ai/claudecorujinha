/**
 * INTEGRAÇÃO BLING → DFC 2026 — A Marca da Corujinha (v4.0)
 * PARTE 1/5 — Configurações, colunas e mapas
 * Cada arquivo .gs é uma PARTE do MESMO projeto Apps Script.
 * Crie um arquivo de Script por parte e cole o conteúdo inteiro.
 */

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
