# Integração Bling → DFC 2026 — A Marca da Corujinha

Google Apps Script que sincroniza os lançamentos do **Bling** (contas a
receber e a pagar) para as abas de controle da planilha e consolida tudo na
aba **DFC 2026**.

## Como usar

1. **Propriedades do script** (engrenagem → *Configurações do projeto* →
   *Propriedades do script*):
   - `BLING_CLIENT_ID`
   - `BLING_CLIENT_SECRET`
   > ⚠️ Nunca cole essas credenciais no código. Elas devem ficar **apenas**
   > nas Propriedades do script. (A versão anterior trazia client_id e
   > client_secret reais no cabeçalho — recomendo **revogar e gerar novas**
   > credenciais no Bling, pois ficaram expostas.)
2. Execute `iniciarAutorizacao`, abra o link do log e autorize no Bling.
3. Execute `criarAbas`.
4. Execute `cargaInicial`.
5. Crie um **acionador diário** para `rotinaDiaria` (ex.: 03:00).

## Funções principais

| Função | O que faz |
|---|---|
| `iniciarAutorizacao` | Gera o link de autorização OAuth2 |
| `criarAbas` | Cria as abas *Contas a Receber* e *Contas a Pagar* |
| `cargaInicial` | Sincroniza as abas a partir de 01/06/2026 |
| `rotinaDiaria` | Sincroniza, formata e lança na DFC (use no gatilho) |
| `sincronizarReceber` / `sincronizarPagar` | Upsert (insere/atualiza) das abas |
| `lancarNaDFC` | Consolida os valores na aba DFC 2026 |
| `diagnosticarCamposReceber` / `diagnosticarLojas` | Investigação |

## Correções e melhorias da versão 4.0

### Bugs corrigidos

1. **Status em "Contas a Receber" não atualizava (problema relatado).**
   - A rotina antiga só conseguia marcar um lançamento como `Recebido`.
     Um lançamento `A vencer` que passava da data **nunca** virava
     `Em atraso` — ficava preso até ser recebido. Agora `recalcularAtrasos`
     reavalia `A vencer ↔ Em atraso` a cada execução.
   - A leitura usava `getRange(..., 9)` numa aba de **7 colunas** e a
     atualização dependia de uma varredura linha-a-linha frágil. Agora há
     um índice `id → linha` lido **uma única vez** e a escrita é feita em
     lote (`setValues`), o que torna a atualização confiável e rápida.

2. **Loja sempre caía em "NENHUM".**
   - A **listagem** do Bling não traz o campo `origem`, então
     `buscarLojaDoLancamento` nunca achava o pedido de venda. Agora, quando
     `origem` está ausente, buscamos o **detalhe** do lançamento.

3. **Datas corrompendo o lançamento na DFC.**
   - Quando a célula de data era lida como objeto `Date`, o código antigo
     fazia `String(data)` e gerava `"Mon Jun 15 2026..."`, quebrando o
     `split("/")`. Centralizamos todo o tratamento em `paraISO`, que aceita
     `Date`, `yyyy-MM-dd` e `dd/MM/yyyy`. As datas agora são gravadas como
     `Date` reais (o formato `dd/MM/yy` passa a funcionar de fato).

4. **Chamadas de API duplicadas/desperdiçadas.**
   - `cargaReceberParte1` chamava `buscarDetalhe` **duas vezes** para um
     `catId` que nem era usado em Contas a Receber. Removido.
   - Adicionado **cache de detalhe por execução** para não buscar o mesmo
     recurso (lançamento, pedido, borderô) repetidamente.

### Otimizações de estrutura

- Funções consolidadas: `cargaReceberParte1/2` e `cargaPagarParte1/2`
  viraram `sincronizarReceber` / `sincronizarPagar` (upsert único que cobre
  inserção e atualização).
- Constantes de status (`A vencer`, `Em atraso`, `Recebido`, `Pago`)
  centralizadas para evitar divergência de grafia.
- DFC: datas e linhas mapeadas **uma vez** (antes era `O(n)` por
  lançamento); limpeza e gravação feitas em **uma** chamada por linha.
- Removido código morto (`MAPA_LOJA` por forma de pagamento,
  `determinarLoja`, `derivarCategoriaDaLoja`, `idJaExiste`,
  `encontrarLinhaId`, diagnósticos não usados).
- Helpers de OAuth unificados (`trocarToken` / `salvarTokens`).

### Comportamento configurável

- `INCLUIR_EM_ATRASO_NA_DFC` (padrão `false`): se `true`, lançamentos
  `Em atraso` ainda não liquidados entram na DFC projetados na data de
  vencimento. Mantido `false` para preservar o comportamento atual.

## Premissas que vale confirmar

- IDs de loja (`MAPA_ID_LOJA`) e de categoria (`MAPA_CAT`) conforme o Bling
  da Corujinha.
- Situação `2` do Bling = liquidado (recebido/pago). Lançamentos
  *parcialmente recebidos* não são tratados como liquidados.
- Data de pagamento de **Contas a Pagar** usa o vencimento (o `/pagar` do
  Bling não expõe a data de baixa de forma confiável).
