// Envia pedidos para o Utmify (rastreio de vendas por campanha/anúncio).
// Variável de ambiente na Vercel: UTMIFY_API_TOKEN. Sem ela, não faz nada.
// Nunca lança erro: falha no Utmify não pode atrapalhar uma venda.
import { createHmac, timingSafeEqual } from 'node:crypto';

const SEGREDO = () => process.env.SHEETS_SECRET || 'navell';
const utc = (d) => new Date(d).toISOString().slice(0, 19).replace('T', ' ');
const str = (v, n = 150) => { const t = String(v == null ? '' : v).trim().slice(0, n); return t || null; };

// "Contexto" do pedido: dados que o servidor guarda assinados no navegador para
// conseguir avisar o Utmify quando o Pix for pago, sem precisar de banco de dados.
export function montarCtx({ orderId, createdAt, payer, produtos, tracking, total, ip }) {
  const t = tracking || {};
  const k = (x) => str(x);
  return {
    o: orderId, c: createdAt, tot: Math.round(total * 100),
    cu: { n: str(payer.name), e: str(payer.email), p: str(payer.phone), d: str(payer.document), ip: str(ip, 60) },
    pr: produtos,
    tr: { src: k(t.src), sck: k(t.sck), utm_source: k(t.utm_source), utm_campaign: k(t.utm_campaign), utm_medium: k(t.utm_medium), utm_content: k(t.utm_content), utm_term: k(t.utm_term) },
  };
}
export const assinar = (b64) => createHmac('sha256', SEGREDO()).update(b64).digest('hex');
export const empacotar = (ctx) => { const b = Buffer.from(JSON.stringify(ctx)).toString('base64url'); return { uc: b, us: assinar(b) }; };
export function abrir(b64, sig) {
  try {
    const a = Buffer.from(assinar(String(b64 || ''))), b = Buffer.from(String(sig || ''));
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
    return JSON.parse(Buffer.from(b64, 'base64url').toString());
  } catch { return null; }
}

export async function enviarUtmify(ctx, status, quando) {
  const token = process.env.UTMIFY_API_TOKEN;
  if (!token || !ctx) return false;
  try {
    const paid = status === 'paid';
    const body = {
      orderId: ctx.o, platform: 'NavellSite', paymentMethod: 'pix', status,
      createdAt: ctx.c, approvedDate: paid ? utc(quando || Date.now()) : null, refundedAt: null,
      customer: { name: ctx.cu.n || 'Cliente', email: ctx.cu.e || 'sem-email@navell.com', phone: ctx.cu.p, document: ctx.cu.d, country: 'BR', ip: ctx.cu.ip || undefined },
      products: ctx.pr.map((p) => ({ id: p.id, name: p.name, planId: null, planName: null, quantity: p.quantity, priceInCents: p.priceInCents })),
      trackingParameters: ctx.tr,
      commission: { totalPriceInCents: ctx.tot, gatewayFeeInCents: 0, userCommissionInCents: ctx.tot },
      isTest: false,
    };
    const r = await fetch('https://api.utmify.com.br/api-credentials/orders', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'x-api-token': token },
      body: JSON.stringify(body), signal: AbortSignal.timeout(6000),
    });
    if (!r.ok) console.error('[utmify] Resposta inesperada:', r.status, (await r.text().catch(() => '')).slice(0, 300));
    return r.ok;
  } catch (e) { console.error('[utmify] Falha ao enviar:', e && e.message); return false; }
}
