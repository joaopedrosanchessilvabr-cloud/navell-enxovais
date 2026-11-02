// Função serverless (Vercel) — recebe as notificações de status da SimplifyBR
// (deposit.pending / deposit.paid / deposit.cancelled).
//
// Configure esta URL em SimplifyBR → Integrações → Webhooks:
//   https://navell-enxovais.vercel.app/api/simplify-webhook
//
// Por enquanto só confirma o recebimento e grava um log (Vercel → projeto →
// Logs). Quando houver banco de dados ou e-mail configurado, é aqui que entra
// a lógica de marcar o pedido como pago e avisar a loja.

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).end();
  }
  console.log('[simplify-webhook] Evento recebido:', JSON.stringify(req.body || {}));
  return res.status(200).json({ received: true });
}
