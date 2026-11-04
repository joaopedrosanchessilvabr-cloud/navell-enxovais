// Confirmação do pagamento feita pelo SERVIDOR (não depende do cliente ficar na página):
//   - gera o código de rastreio,
//   - avisa o Utmify ("paid"),
//   - envia a compra ao Meta pela API de Conversões (evento Purchase, mesmo event_id do navegador, então não conta em dobro).
// Pode ser chamada várias vezes (pelo navegador e pelo webhook): cada envio acontece uma única vez por pedido.
// Variáveis da Vercel: UTMIFY_API_TOKEN, META_CAPI_TOKEN (token da API de Conversões), opcional META_TEST_CODE e META_API_VERSION.
import { createHash } from 'node:crypto';
import { enviarUtmify } from './_utmify.js';
import { garantirCodigo, cmd } from './_rastreio.js';

const PIXEL_ID = '2034810030536101';
const SITE = 'https://navell-enxovais.vercel.app';
export const PAGO = ['paid', 'approved', 'completed', 'confirmed'];

const kCtx = (o) => `navell:ctx:${o}`;

// Contexto do pedido (cliente, produtos, UTMs, dados para o Meta). Fica 14 dias no Redis e depois some.
export async function guardarCtx(order, ctx) {
  try { await cmd('SET', kCtx(order), JSON.stringify(ctx), 'EX', 14 * 86400); return true; }
  catch (e) { console.error('[pagamento] guardarCtx:', e && e.message); return false; }
}
export async function lerCtx(order) {
  try { const v = await cmd('GET', kCtx(order)); return v ? JSON.parse(v) : null; }
  catch (e) { console.error('[pagamento] lerCtx:', e && e.message); return null; }
}

// Pergunta direto à SimplifyBR se o depósito foi pago (usado no webhook, que qualquer um poderia forjar).
export async function statusSimplify(internalId) {
  try {
    const r = await fetch(`https://simplifybr.com/api/v1/pix/deposit/${encodeURIComponent(internalId)}`, {
      headers: { 'Client-id': process.env.SIMPLIFY_CLIENT_ID || '', 'Client-secret': process.env.SIMPLIFY_CLIENT_SECRET || '' },
      signal: AbortSignal.timeout(6000),
    });
    const j = await r.json().catch(() => ({}));
    return r.ok ? String(j.status || '').toLowerCase() : '';
  } catch (e) { console.error('[pagamento] statusSimplify:', e && e.message); return ''; }
}

// Marca "já enviei" de forma atômica. Sem Redis, deixa passar (Utmify e Meta também deduplicam por orderId / event_id).
async function marcar(order, destino) {
  try { return (await cmd('SET', `navell:env:${destino}:${order}`, '1', 'NX')) === 'OK'; } catch { return true; }
}
async function desmarcar(order, destino) { try { await cmd('DEL', `navell:env:${destino}:${order}`); } catch {} }

const limpa = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '');
const sha = (v) => (v ? createHash('sha256').update(String(v)).digest('hex') : undefined);

export function montarEventoMeta(ctx, order, quando = Date.now()) {
  const cu = ctx.cu || {}, ad = ctx.ad || {}, fb = ctx.fb || {};
  const nome = String(cu.n || '').trim().split(/\s+/);
  let tel = String(cu.p || '').replace(/\D/g, '');
  if (tel && !tel.startsWith('55') && tel.length <= 11) tel = '55' + tel;
  const ud = {
    em: sha(String(cu.e || '').trim().toLowerCase()),
    ph: sha(tel),
    fn: sha(limpa(nome[0])),
    ln: sha(limpa(nome.slice(1).join(''))),
    ct: sha(limpa(ad.ct)),
    st: sha(limpa(ad.st)),
    zp: sha(String(ad.zp || '').replace(/\D/g, '')),
    country: sha('br'),
    client_ip_address: cu.ip || undefined,
    client_user_agent: fb.ua || undefined,
    fbp: fb.p || undefined,
    fbc: fb.c || undefined,
  };
  Object.keys(ud).forEach((k) => ud[k] === undefined && delete ud[k]);
  return {
    event_name: 'Purchase',
    event_time: Math.floor(quando / 1000),
    event_id: `purchase_${order}`,           // o mesmo do pixel do navegador: o Meta junta os dois e conta uma compra só
    action_source: 'website',
    event_source_url: fb.url || `${SITE}/obrigado.html`,
    user_data: ud,
    custom_data: { value: Math.round(ctx.tot) / 100, currency: 'BRL', content_type: 'product', num_items: ctx.n || 1, order_id: String(order) },
  };
}

export async function enviarMeta(ctx, order, quando) {
  const token = process.env.META_CAPI_TOKEN;
  if (!token) { console.log('[meta-capi] SEM TOKEN: META_CAPI_TOKEN vazio ou ausente neste deploy'); return false; }
  try {
    const body = { data: [montarEventoMeta(ctx, order, quando)], access_token: token };
    if (process.env.META_TEST_CODE) body.test_event_code = process.env.META_TEST_CODE;
    const v = process.env.META_API_VERSION || 'v23.0';
    const r = await fetch(`https://graph.facebook.com/${v}/${PIXEL_ID}/events`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(6000),
    });
    const txt = (await r.text().catch(() => '')).slice(0, 300);
    console.log('[meta-capi] Purchase', order, 'HTTP', r.status, txt);
    return r.ok;
  } catch (e) { console.error('[meta-capi] Falha ao enviar:', e && e.message); return false; }
}

// Chamar quando o pagamento estiver CONFIRMADO. Devolve o código de rastreio (ou null).
export async function confirmarPagamento(order, { ctxFallback } = {}) {
  order = String(order || '');
  if (!order) return null;
  const codigo = await garantirCodigo(order);
  const ctx = (await lerCtx(order)) || ctxFallback || null;
  if (!ctx) { console.log('[pagamento] sem contexto do pedido', order, '(nada enviado ao Utmify/Meta)'); return codigo; }
  if (await marcar(order, 'utmify')) { if (!(await enviarUtmify(ctx, 'paid'))) await desmarcar(order, 'utmify'); }
  if (await marcar(order, 'meta')) { if (!(await enviarMeta(ctx, order))) await desmarcar(order, 'meta'); }
  return codigo;
}
