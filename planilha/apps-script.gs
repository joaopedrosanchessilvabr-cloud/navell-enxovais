// Navell Enxovais — recebe os pedidos do site e grava na planilha.
// Cole este código em Extensões → Apps Script da sua planilha do Google.

var SEGREDO = 'TROQUE-POR-UMA-SENHA-SUA'; // a mesma senha vai em SHEETS_SECRET na Vercel
var ABA = 'Pedidos';
var CABECALHO = ['Pedido', 'Data/hora', 'Status', 'Nome', 'E-mail', 'CPF', 'Telefone',
  'CEP', 'Endereço', 'Número', 'Complemento', 'Bairro', 'Cidade', 'UF',
  'Itens', 'Frete', 'Valor (R$)', 'ID Pix'];

function doPost(e) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(20000);
    var d = JSON.parse(e.postData.contents);
    if (d.secret !== SEGREDO) return resposta({ ok: false, erro: 'senha' });

    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sh = ss.getSheetByName(ABA) || ss.insertSheet(ABA);
    if (sh.getLastRow() === 0) {
      sh.appendRow(CABECALHO);
      sh.getRange(1, 1, 1, CABECALHO.length).setFontWeight('bold').setBackground('#f3e6df');
      sh.setFrozenRows(1);
    }

    // CPF, telefone, CEP e pedido como texto (para não perder zeros à esquerda)
    var pedido = String(d.pedido || '');
    var linha = procurar(sh, pedido);

    if (d.acao === 'status') {              // só atualiza o status (ex.: Pago)
      if (linha) sh.getRange(linha, 3).setValue(d.status || '');
      return resposta({ ok: true, atualizado: !!linha });
    }

    var c = d.cliente || {}, a = d.entrega || {};
    var valores = [pedido, new Date(), d.status || 'Pix gerado', c.name, c.email, c.document, c.phone,
      a.cep, a.street, a.number, a.complement, a.neighborhood, a.city, a.state,
      (d.itens || []).join(' | '), d.frete, d.valor, d.idPix];

    if (!linha) {
      linha = sh.getLastRow() + 1;
      sh.getRange(linha, 1, 1, 1).setNumberFormat('@');
      sh.getRange(linha, 6, 1, 3).setNumberFormat('@');   // CPF, telefone, CEP
      sh.getRange(linha, 8, 1, 1).setNumberFormat('@');
      sh.getRange(linha, 2).setNumberFormat('dd/mm/yyyy hh:mm');
      sh.getRange(linha, 17).setNumberFormat('R$ #,##0.00');
    }
    sh.getRange(linha, 1, 1, valores.length).setValues([valores]);
    return resposta({ ok: true });
  } catch (err) {
    return resposta({ ok: false, erro: String(err) });
  } finally {
    try { lock.releaseLock(); } catch (x) {}
  }
}

function procurar(sh, pedido) {
  if (!pedido || sh.getLastRow() < 2) return 0;
  var col = sh.getRange(2, 1, sh.getLastRow() - 1, 1).getDisplayValues();
  for (var i = col.length - 1; i >= 0; i--) if (col[i][0] === pedido) return i + 2;
  return 0;
}

function resposta(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}
