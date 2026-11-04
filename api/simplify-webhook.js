// Função serverless (Vercel) — recebe as notificações de status da SimplifyBR
// (deposit.pending / deposit.paid / deposit.cancelled).
//
// Configure esta URL em SimplifyBR → Integrações → Webhooks:
//   https://navell-enxovais.vercel.app/api/simplify-webhook
//
// Por enquanto só confirma o recebimento e grava um log (Vercel → projeto →
// Logs). Quando houver banco de dados ou e-mail configurado, é aqui que entra
// a lógica de marcar o pedido como pago e avisar a loja.

import { salvarNaPlanilha } from './_planilha.js';
import { garantirCodigo } from './_rastreio.js';

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
    await salvarNaPlanilha({ acao: 'status', pedido, status: 'Pago' });
    await garantirCodigo(pedido);
  }
  return res.status(200).json({ received: true });
}
