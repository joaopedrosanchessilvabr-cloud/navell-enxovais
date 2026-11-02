// Navell Enxovais — recebe os passos dos clientes e organiza em 3 abas da planilha:
//   adicionar carrinho : quem adicionou algo ao carrinho
//   preencher dados    : quem preencheu nome/contato/endereço no checkout
//   gerou pix          : quem gerou o Pix (Pendente → Pago)
// (as abas são criadas sozinhas se não existirem; se já existirem vazias, o cabeçalho é colocado nelas)

var SEGREDO = 'TROQUE-POR-UMA-SENHA-SUA'; // a mesma senha que está em SHEETS_SECRET na Vercel

var ABAS = {
  carrinho: { nome: 'adicionar carrinho', chave: 'Visitante',
    cab: ['Visitante', 'Primeiro acesso', 'Atualizado', 'Status', 'Itens no carrinho', 'Subtotal (R$)'] },
  dados: { nome: 'preencher dados', chave: 'Visitante',
    cab: ['Visitante', 'Primeiro acesso', 'Atualizado', 'Status', 'Nome', 'E-mail', 'CPF', 'Telefone',
          'CEP', 'Endereço', 'Número', 'Complemento', 'Bairro', 'Cidade', 'UF', 'Itens no carrinho', 'Subtotal (R$)'] },
  pedido: { nome: 'gerou pix', chave: 'Pedido',
    cab: ['Pedido', 'Criado em', 'Atualizado', 'Status', 'Nome', 'E-mail', 'CPF', 'Telefone',
          'CEP', 'Endereço', 'Número', 'Complemento', 'Bairro', 'Cidade', 'UF',
          'Itens', 'Frete', 'Valor (R$)', 'ID Pix', 'Visitante'] }
};
var TEXTO = ['Visitante', 'Pedido', 'CPF', 'Telefone', 'CEP', 'Número', 'ID Pix'];

// Abrir o link do app no navegador mostra "ok" quando está tudo publicado.
function doGet() { return resposta({ ok: true, app: 'Navell pedidos' }); }

function doPost(e) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(20000);
    var d = JSON.parse(e.postData.contents);
    if (d.secret !== SEGREDO) return resposta({ ok: false, erro: 'senha' });
    var c = d.cliente || {}, a = d.entrega || {};
    var itens = (d.itens || []).join(' | ');

    if (d.acao === 'carrinho') {
      gravar('carrinho', d.vid, { 'Status': d.status, 'Itens no carrinho': itens, 'Subtotal (R$)': d.valor });

    } else if (d.acao === 'dados') {
      var dados = { 'Status': d.status, 'Nome': c.name, 'E-mail': c.email, 'CPF': c.document, 'Telefone': c.phone,
        'Itens no carrinho': itens, 'Subtotal (R$)': d.valor };
      if (d.entrega) {
        dados['CEP'] = a.cep; dados['Endereço'] = a.street; dados['Número'] = a.number;
        dados['Complemento'] = a.complement; dados['Bairro'] = a.neighborhood; dados['Cidade'] = a.city; dados['UF'] = a.state;
      }
      gravar('dados', d.vid, dados);
      gravar('carrinho', d.vid, { 'Status': 'Foi para o checkout' });

    } else if (d.acao === 'pedido') {
      gravar('pedido', d.pedido, { 'Status': d.status || 'Pendente', 'Nome': c.name, 'E-mail': c.email,
        'CPF': c.document, 'Telefone': c.phone, 'CEP': a.cep, 'Endereço': a.street, 'Número': a.number,
        'Complemento': a.complement, 'Bairro': a.neighborhood, 'Cidade': a.city, 'UF': a.state,
        'Itens': itens, 'Frete': d.frete, 'Valor (R$)': d.valor, 'ID Pix': d.idPix, 'Visitante': d.vid });
      if (d.vid) {
        gravar('carrinho', d.vid, { 'Status': 'Gerou Pix #' + d.pedido });
        gravar('dados', d.vid, { 'Status': 'Gerou Pix #' + d.pedido });
      }

    } else if (d.acao === 'status') {
      var vid = gravar('pedido', d.pedido, { 'Status': d.status }, true);
      if (vid) {
        gravar('carrinho', vid, { 'Status': d.status + ' #' + d.pedido }, true);
        gravar('dados', vid, { 'Status': d.status + ' #' + d.pedido }, true);
      }
    }
    return resposta({ ok: true });
  } catch (err) {
    return resposta({ ok: false, erro: String(err) });
  } finally {
    try { lock.releaseLock(); } catch (x) {}
  }
}

// Cria ou atualiza a linha identificada pela chave. Só altera os campos enviados.
// Com soAtualizar = true, não cria linha nova. Devolve o "Visitante" da linha (se houver).
function gravar(tipo, chave, campos, soAtualizar) {
  chave = String(chave || '');
  if (!chave) return '';
  var cfg = ABAS[tipo], cab = cfg.cab;
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(cfg.nome);
  if (!sh) sh = ss.insertSheet(cfg.nome);
  if (sh.getLastRow() === 0) {
    sh.appendRow(cab);
    sh.getRange(1, 1, 1, cab.length).setFontWeight('bold').setBackground('#f3e6df');
    sh.setFrozenRows(1);
    cab.forEach(function (h, i) { if (TEXTO.indexOf(h) > -1) sh.getRange(2, i + 1, sh.getMaxRows() - 1, 1).setNumberFormat('@'); });
    sh.getRange(2, 2, sh.getMaxRows() - 1, 2).setNumberFormat('dd/mm/yyyy hh:mm');
    sh.setColumnWidth(cab.indexOf('Status') + 1, 170);
  }
  var linha = 0, n = sh.getLastRow();
  if (n >= 2) {
    var col = sh.getRange(2, 1, n - 1, 1).getDisplayValues();
    for (var i = col.length - 1; i >= 0; i--) if (col[i][0] === chave) { linha = i + 2; break; }
  }
  if (!linha && soAtualizar) return '';
  var agora = new Date(), atual;
  if (linha) {
    atual = sh.getRange(linha, 1, 1, cab.length).getValues()[0];
  } else {
    linha = n + 1;
    atual = cab.map(function () { return ''; });
    atual[0] = chave; atual[1] = agora;
  }
  atual[2] = agora;
  cab.forEach(function (h, i) {
    var v = campos[h];
    if (v !== undefined && v !== null && v !== '') atual[i] = v;
  });
  sh.getRange(linha, 1, 1, cab.length).setValues([atual]);
  var iv = cab.indexOf('Visitante');
  return iv > -1 && tipo === 'pedido' ? String(atual[iv] || '') : '';
}

function resposta(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}
