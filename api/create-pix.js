// Função serverless (Vercel) — cria um depósito Pix real na SimplifyBR.
// Credenciais ficam só nas variáveis de ambiente da Vercel:
//   SIMPLIFY_CLIENT_ID, SIMPLIFY_CLIENT_SECRET, (opcional) SIMPLIFY_WEBHOOK_URL
//
// O valor NÃO vem do navegador: o servidor recalcula o total a partir dos
// itens do carrinho, para ninguém conseguir pagar menos alterando a página.

import { createHmac } from 'node:crypto';
import { salvarNaPlanilha } from './_planilha.js';
import { resumirItens } from './_catalogo.js';
import { montarCtx, empacotar, enviarUtmify } from './_utmify.js';
import { registrarPedido } from './_rastreio.js';

const PIX_DISCOUNT = 0.05;
const FREE_SHIPPING_MIN = 70;
const SHIPPING = {
  sedex: { n: 'SEDEX', price: 19.9 },
  jadlog: { n: 'Jadlog', price: 14.9 },
  loggi: { n: 'Loggi', price: 9.9 },
};

// Número do pedido: 9 dígitos no formato 47345 + contador de 4 dígitos (473450021, 473450022...).
// O contador (Redis) já estava em 20, então o próximo pedido é 473450021.
// Fica guardado num Redis (Upstash) ligado ao projeto na Vercel, com INCR, que é
// atômico: dois pedidos ao mesmo tempo nunca recebem o mesmo número.
async function nextOrderNumber() {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  if (url && token) {
    const r = await fetch(`${url}/incr/navell:pedido`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
    const j = await r.json().catch(() => ({}));
    if (r.ok && Number.isInteger(j.result) && j.result > 0) return '47345' + String(j.result % 10000).padStart(4, '0');
    console.error('[pedido] Falha ao incrementar o contador:', r.status, j);
  } else {
    console.error('[pedido] Banco do contador não configurado (KV_REST_API_URL / KV_REST_API_TOKEN). Usando número provisório.');
  }
  // Plano B para não perder venda: número provisório de 9 dígitos baseado no horário.
  return '47345' + String(Math.floor(Date.now() / 1000) % 10000).padStart(4, '0');
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Método não permitido.' });
  }

  const { items, payer, address, shipping, vid, utm } = req.body || {};

  if (!payer || !payer.name || !payer.email || !payer.document || !payer.phone ||
      !address || !address.cep || !address.street || !address.number || !address.city || !address.state ||
      !Array.isArray(items) || !items.length || items.length > 20 || !SHIPPING[shipping]) {
    return res.status(422).json({ error: 'Dados incompletos para gerar o Pix.' });
  }

  const r0 = resumirItens(items);
  if (!r0 || !r0.resumo.length) return res.status(422).json({ error: 'Carrinho inválido. Volte e confira os itens.' });
  const subtotal = r0.subtotal;
  const resumo = r0.resumo;
  // Frete grátis no Jadlog em compras a partir de R$ 70 (valor dos itens, antes do desconto Pix).
  // Pedido de teste (só o item alm-teste): sem frete e sem desconto Pix, total exato de R$ 1,50.
  const soTeste = items.length > 0 && items.every((i) => i && i.k === 'alm-teste');
  const shipPrice = soTeste ? 0 : (shipping === 'jadlog' && subtotal >= FREE_SHIPPING_MIN) ? 0 : SHIPPING[shipping].price;
  const amount = soTeste ? subtotal : Math.round((subtotal * (1 - PIX_DISCOUNT) + shipPrice) * 100) / 100;

  const clientId = process.env.SIMPLIFY_CLIENT_ID;
  const clientSecret = process.env.SIMPLIFY_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    console.error('[create-pix] Faltam SIMPLIFY_CLIENT_ID / SIMPLIFY_CLIENT_SECRET nas variáveis de ambiente da Vercel.');
    return res.status(500).json({ error: 'Pagamento por Pix está temporariamente indisponível. Tente novamente em instantes.' });
  }

  const external_id = await nextOrderNumber();

  try {
    const payload = {
      amount,
      payer: { name: payer.name, email: payer.email, document: payer.document, phone: payer.phone },
      external_id,
    };
    if (process.env.SIMPLIFY_WEBHOOK_URL) payload.webhookURL = process.env.SIMPLIFY_WEBHOOK_URL;

    const simplifyRes = await fetch('https://simplifybr.com/api/v1/pix/deposit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Client-id': clientId, 'Client-secret': clientSecret },
      body: JSON.stringify(payload),
    });
    const data = await simplifyRes.json().catch(() => ({}));

    if (!simplifyRes.ok) {
      console.error('[create-pix] SimplifyBR respondeu com erro:', simplifyRes.status, data);
      return res.status(simplifyRes.status).json({ error: data?.message || 'Não foi possível gerar o Pix agora. Tente novamente.' });
    }

    // Registro do pedido (visível em Vercel → Logs) para a loja saber o que enviar e para onde.
    console.log('[PEDIDO]', JSON.stringify({
      pedido: data.external_id || external_id, id: data.internal_id, valor: amount,
      frete: SHIPPING[shipping].n,
      itens: resumo, cliente: payer, entrega: address,
    }));

    await salvarNaPlanilha({
      acao: 'pedido', vid: String(vid || '').replace(/[^\w-]/g, '').slice(0, 40),
      pedido: data.external_id || external_id, status: 'Pendente', idPix: data.internal_id,
      valor: amount, frete: SHIPPING[shipping].n, itens: resumo, cliente: payer, entrega: address,
    });

    // Guarda o pedido para a página "Rastrear pedido" (o código NV...BR só nasce quando o pagamento for confirmado)
    await registrarPedido({ order: data.external_id || external_id, itens: resumo, cidade: address.city, uf: String(address.state || '').toUpperCase().slice(0, 2),
      frete: SHIPPING[shipping].n, fretePreco: shipPrice, sub: subtotal, total: amount, teste: soTeste });

    // Utmify: pedido "aguardando pagamento" (e guarda o contexto assinado para avisar quando pagar)
    const fator = amount / (subtotal || 1);
    const produtos = r0.produtos.map((p) => ({ id: p.id, name: p.name, quantity: p.quantity, priceInCents: Math.round(p.price * fator * 100) }));
    const ctx = montarCtx({
      orderId: String(data.external_id || external_id), createdAt: new Date().toISOString().slice(0, 19).replace('T', ' '),
      payer, produtos, tracking: utm, total: amount,
      ip: String(req.headers['x-forwarded-for'] || '').split(',')[0].trim(),
    });
    await enviarUtmify(ctx, 'waiting_payment');
    const pack = empacotar(ctx);

    return res.status(201).json({
      ...pack,
      internal_id: data.internal_id,
      order: external_id,
      external_id: data.external_id || external_id,
      status: data.status,
      qrcode: data.qrcode,
      amount: data.amount ?? amount,
      // permite ao navegador avisar "copiou o Pix" só para este pedido (ninguém consegue forjar para outro)
      copy_token: createHmac('sha256', process.env.SHEETS_SECRET || 'navell').update(external_id).digest('hex').slice(0, 16),
    });
  } catch (err) {
    console.error('[create-pix] Erro ao chamar a SimplifyBR:', err);
    return res.status(500).json({ error: 'Erro ao conectar com o gateway de pagamento.' });
  }
}
