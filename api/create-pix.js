// Função serverless (Vercel) — cria um depósito Pix real na SimplifyBR.
// Credenciais ficam só nas variáveis de ambiente da Vercel:
//   SIMPLIFY_CLIENT_ID, SIMPLIFY_CLIENT_SECRET, (opcional) SIMPLIFY_WEBHOOK_URL
//
// O valor NÃO vem do navegador: o servidor recalcula o total a partir dos
// itens do carrinho, para ninguém conseguir pagar menos alterando a página.

const KEYS = ['flara', 'stella', 'melina', 'dalia'];
const NAMES = { flara: 'Flara', stella: 'Stella', melina: 'Melina', dalia: 'Dália' };
const COLORS = {
  flara: ['Azul', 'Preto', 'Rosa', 'Bege'],
  stella: ['Preto', 'Bege', 'Cinza', 'Vermelho', 'Verde'],
  melina: ['Preto', 'Marrom', 'Azul', 'Cinza'],
  dalia: ['Preto', 'Marrom', 'Bege', 'Azul', 'Verde'],
};
const SIZES = [
  { n: '2 lugares', price: 69.9 },
  { n: '3 lugares', price: 84.9 },
  { n: '4 lugares', price: 99.9 },
];
const PIX_DISCOUNT = 0.05;
const SHIPPING = {
  sedex: { n: 'SEDEX', price: 29.9 },
  jadlog: { n: 'Jadlog', price: 23.9 },
  loggi: { n: 'Loggi', price: 14.9 },
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Método não permitido.' });
  }

  const { items, payer, address, shipping } = req.body || {};

  if (!payer || !payer.name || !payer.email || !payer.document || !payer.phone ||
      !address || !address.cep || !address.street || !address.number || !address.city || !address.state ||
      !Array.isArray(items) || !items.length || items.length > 20 || !SHIPPING[shipping]) {
    return res.status(422).json({ error: 'Dados incompletos para gerar o Pix.' });
  }

  let subtotal = 0;
  const resumo = [];
  for (const it of items) {
    const sz = SIZES[it && it.s];
    const qty = Number(it && it.qty);
    if (!it || !KEYS.includes(it.k) || !COLORS[it.k].includes(it.color) || !sz ||
        !Number.isInteger(qty) || qty < 1 || qty > 10) {
      return res.status(422).json({ error: 'Carrinho inválido. Volte e confira os itens.' });
    }
    subtotal += sz.price * qty;
    resumo.push(`${qty}x ${NAMES[it.k]} ${it.color} ${sz.n}`);
  }
  const amount = Math.round((subtotal * (1 - PIX_DISCOUNT) + SHIPPING[shipping].price) * 100) / 100;

  const clientId = process.env.SIMPLIFY_CLIENT_ID;
  const clientSecret = process.env.SIMPLIFY_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    console.error('[create-pix] Faltam SIMPLIFY_CLIENT_ID / SIMPLIFY_CLIENT_SECRET nas variáveis de ambiente da Vercel.');
    return res.status(500).json({ error: 'Pagamento por Pix está temporariamente indisponível. Tente novamente em instantes.' });
  }

  const external_id = 'NAVELL-' + Date.now();

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

    return res.status(201).json({
      internal_id: data.internal_id,
      external_id: data.external_id || external_id,
      status: data.status,
      qrcode: data.qrcode,
      amount: data.amount ?? amount,
    });
  } catch (err) {
    console.error('[create-pix] Erro ao chamar a SimplifyBR:', err);
    return res.status(500).json({ error: 'Erro ao conectar com o gateway de pagamento.' });
  }
}
