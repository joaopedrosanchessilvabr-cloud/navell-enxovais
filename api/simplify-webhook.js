// Função serverless (Vercel) — recebe as notificações de status da SimplifyBR
// (deposit.pending / deposit.paid / deposit.cancelled).
//
// Configure esta URL em SimplifyBR → Integrações → Webhooks:
//   https://navell-enxovais.vercel.app/api/simplify-webhook
//
// Quando o Pix é pago, mesmo que o cliente já tenha fechado a página: marca "Pago" na planilha, gera o código de rastreio
// e avisa o Utmify e o Meta. Como qualquer um poderia mandar um aviso falso para esta URL, antes de agir o servidor
// pergunta direto à SimplifyBR se o pagamento realmente foi feito.

import { salvarNaPlanilha } from './_planilha.js';
import { lerCtx, statusSimplify, confirmarPagamento, PAGO } from './_pagamento.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).end();
  }
  console.log('[simplify-webhook] Evento recebido:', JSON.stringify(req.body || {}));
  const b = req.body || {};
  const d = b.data || b;
  const st = String(d.status || b.status || b.event || '').toLowerCase();
  const pedido = d.external_id || b.external_id;
  if (pedido && /paid|approved|completed|confirmed/.test(st)) {
    const ctx = await lerCtx(pedido);
    if (ctx && ctx.id) {
      const real = await statusSimplify(ctx.id);
      if (PAGO.includes(real)) {
        await salvarNaPlanilha({ acao: 'status', pedido, status: 'Pago' });
        await confirmarPagamento(pedido);
      } else {
        console.error('[simplify-webhook] aviso de pagamento NÃO confirmado na SimplifyBR, ignorado:', pedido, real);
      }
    } else {
      // pedido anterior a esta versão (sem contexto guardado): mantém o comportamento antigo
      await salvarNaPlanilha({ acao: 'status', pedido, status: 'Pago' });
    }
  }
  return res.status(200).json({ received: true });
}
