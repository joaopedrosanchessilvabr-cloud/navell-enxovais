// Código de rastreio e acompanhamento do pedido (guardado no Redis/Upstash da Vercel).
//
// Código: NV + 9 dígitos + BR. O 1º pedido pago é NV120101001BR, o 2º NV120101002BR ...
// NV120101099BR e depois NV120101100BR (é só 120101000 + o número do pedido pago).
// O número só é gasto quando o pagamento é confirmado, então não há buracos na sequência.
// Pedidos marcados como teste (campo "teste") usam uma sequência separada (NV9900...), para não gastar os números reais.
//
// Nada aqui pode derrubar uma venda: toda falha vira log e retorna null.

export const ETAPAS = ['recebido', 'pago', 'separacao', 'postado', 'transito', 'entregue'];

function cfg() {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  return url && token ? { url, token } : null;
}

async function cmd(...args) {
  const c = cfg();
  if (!c) throw new Error('Redis não configurado');
  const r = await fetch(c.url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${c.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(args.map(String)),
    signal: AbortSignal.timeout(5000),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.error) throw new Error(j.error || `Redis HTTP ${r.status}`);
  return j.result;
}

const kPed = (o) => `navell:ped:${o}`;
const kCod = (c) => `navell:cod:${c}`;

async function lerPed(order) {
  const v = await cmd('GET', kPed(order));
  return v ? JSON.parse(v) : null;
}
async function gravarPed(p) { await cmd('SET', kPed(p.o), JSON.stringify(p)); }

export function codigoDe(n, teste) {
  return 'NV' + String((teste ? 990000000 : 120101000) + n) + 'BR';
}

// Chamado quando o Pix é gerado: guarda o que a página "Rastrear pedido" precisa (sem dados pessoais sensíveis).
export async function registrarPedido({ order, itens, cidade, uf, frete, fretePreco, sub, total, teste }) {
  try {
    const t = new Date().toISOString();
    await gravarPed({ o: String(order), t, itens: itens || [], cidade: cidade || '', uf: uf || '', frete: frete || '', fretePreco, sub, total, teste: !!teste, eventos: [{ e: 'recebido', t }] });
    return true;
  } catch (e) { console.error('[rastreio] registrarPedido:', e && e.message); return false; }
}

// Chamado quando o pagamento é confirmado (pelo navegador ou pelo webhook). Pode ser chamado várias vezes:
// só gera o código na primeira. Devolve o código ou null.
export async function garantirCodigo(order) {
  try {
    if (!cfg() || !order) return null;
    order = String(order);
    let p = await lerPed(order);
    if (!p) return null;
    if (p.codigo) return p.codigo;
    const got = await cmd('SET', `navell:lock:${order}`, '1', 'NX', 'EX', '20');
    if (got !== 'OK') { // outra chamada está gerando agora: espera ela terminar
      for (let i = 0; i < 8; i++) {
        await new Promise((r) => setTimeout(r, 300));
        p = await lerPed(order);
        if (p && p.codigo) return p.codigo;
      }
      return null;
    }
    p = (await lerPed(order)) || p;
    if (p.codigo) return p.codigo;
    // pula códigos que já têm dono (ex.: cadastrados à mão pelo painel), para nunca repetir um código
    let codigo = null;
    for (let i = 0; i < 50 && !codigo; i++) {
      const n = Number(await cmd('INCR', p.teste ? 'navell:rastreio:teste' : 'navell:rastreio'));
      const c = codigoDe(n, p.teste);
      if ((await cmd('SET', kCod(c), order, 'NX')) === 'OK') codigo = c;
    }
    if (!codigo) return null;
    const t = new Date().toISOString();
    p.codigo = codigo;
    if (!p.eventos.some((x) => x.e === 'pago')) p.eventos.push({ e: 'pago', t });
    await gravarPed(p);
    await cmd('LPUSH', 'navell:lista', order);
    await cmd('LTRIM', 'navell:lista', 0, 499);
    return codigo;
  } catch (e) { console.error('[rastreio] garantirCodigo:', e && e.message); return null; }
}

export function normalizar(q) {
  return String(q || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

// Busca por código (NV...BR) ou pelo número do pedido (9 dígitos).
export async function buscar(q) {
  try {
    q = normalizar(q);
    let order = null;
    if (/^NV\d{9}BR$/.test(q)) order = await cmd('GET', kCod(q));
    else if (/^\d{9}$/.test(q)) order = q;
    if (!order) return null;
    const p = await lerPed(order);
    return p || null;
  } catch (e) { console.error('[rastreio] buscar:', e && e.message); return null; }
}

// Resposta pública: sem nome, CPF, e-mail, telefone ou endereço completo.
const DIAS_ENVIO = 5; // o envio sai 5 dias depois do pagamento, qualquer que seja o frete

export function publico(p, agora = Date.now()) {
  const ult = {}; p.eventos.forEach((x) => { ult[x.e] = x.t; });
  let idx = 0; ETAPAS.forEach((e, i) => { if (ult[e]) idx = i; });
  // Etapas automáticas: pagou -> "Em separação"; 5 dias depois -> "Postado" e "Em trânsito".
  // "Entregue" (e qualquer etapa marcada à mão no painel que esteja à frente) continua valendo.
  const pagoEm = ult.pago || p.t;
  if (ult.pago) {
    if (!ult.separacao) ult.separacao = pagoEm;
    let auto = ETAPAS.indexOf('separacao');
    const saida = new Date(new Date(pagoEm).getTime() + DIAS_ENVIO * 86400000);
    if (agora >= saida.getTime()) {
      auto = ETAPAS.indexOf('transito');
      if (!ult.postado) ult.postado = saida.toISOString();
      if (!ult.transito) ult.transito = saida.toISOString();
    }
    if (auto > idx) idx = auto;
  }
  return {
    codigo: p.codigo || null, pedido: p.o, criado: p.t, itens: p.itens, valor: p.total || 0, sub: p.sub ?? null, fretePreco: p.fretePreco ?? null, destino: p.cidade ? `${p.cidade}/${p.uf}` : '',
    frete: p.frete, etapa: ETAPAS[idx], datas: ult, nota: p.nota || '', transp: p.transp || '', link: p.link || '',
  };
}

// Painel (atualização manual da etapa).
export async function atualizar(order, { etapa, nota, transp, link }) {
  const p = await lerPed(String(order));
  if (!p) return null;
  const t = new Date().toISOString();
  if (etapa && ETAPAS.includes(etapa)) {
    const i = ETAPAS.indexOf(etapa);
    // etapa nova vale a partir de agora; as seguintes que já tinham data são apagadas (permite corrigir um engano)
    p.eventos = p.eventos.filter((x) => ETAPAS.indexOf(x.e) < i);
    p.eventos.push({ e: etapa, t });
  }
  if (typeof nota === 'string') p.nota = nota.slice(0, 300);
  if (typeof transp === 'string') p.transp = transp.slice(0, 80);
  if (typeof link === 'string') p.link = /^https?:\/\//i.test(link) ? link.slice(0, 300) : '';
  await gravarPed(p);
  return p;
}

export async function listar(n = 60) {
  const orders = (await cmd('LRANGE', 'navell:lista', 0, n - 1)) || [];
  const out = [];
  for (const o of orders) { const p = await lerPed(o); if (p) out.push({ ...publico(p), teste: !!p.teste }); }
  return out;
}

// Painel: cadastra um pedido antigo (feito antes do rastreio existir) já com um código escolhido.
export async function importar({ pedido, codigo, itens, cidade, uf, frete, valor, teste }) {
  pedido = String(pedido || '').replace(/\D/g, '');
  codigo = normalizar(codigo);
  if (!pedido) return { erro: 'Informe o número do pedido.' };
  if (!/^NV\d{9}BR$/.test(codigo)) return { erro: 'Código inválido. Use o formato NV990000001BR.' };
  const dono = await cmd('GET', kCod(codigo));
  if (dono && dono !== pedido) return { erro: 'Esse código já pertence ao pedido ' + dono + '.' };
  let p = await lerPed(pedido);
  const t = new Date().toISOString();
  if (!p) p = { o: pedido, t, itens: [], cidade: '', uf: '', frete: '', total: 0, teste: !!teste, eventos: [{ e: 'recebido', t }] };
  if (itens) p.itens = String(itens).split('|').map((x) => x.trim()).filter(Boolean).slice(0, 20);
  if (cidade) p.cidade = String(cidade).slice(0, 60);
  if (uf) p.uf = String(uf).toUpperCase().slice(0, 2);
  if (frete) p.frete = String(frete).slice(0, 30);
  if (Number(valor) > 0) p.total = Number(valor);
  p.teste = !!teste;
  p.codigo = codigo;
  if (!p.eventos.some((x) => x.e === 'pago')) p.eventos.push({ e: 'pago', t });
  await gravarPed(p);
  await cmd('SET', kCod(codigo), pedido);
  const lista = (await cmd('LRANGE', 'navell:lista', 0, 499)) || [];
  if (!lista.includes(pedido)) await cmd('LPUSH', 'navell:lista', pedido);
  return { ok: true };
}
