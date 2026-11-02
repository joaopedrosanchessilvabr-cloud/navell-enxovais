// Função serverless (Vercel) — consulta o status de um depósito Pix já criado
// na SimplifyBR, usada pelo checkout.html para detectar automaticamente
// quando o pagamento foi aprovado (sem precisar do webhook chegar antes).
//
// GET /api/check-pix-status?id=TXN_XXXXXXXX

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Método não permitido.' });
  }

  const { id } = req.query || {};
  if (!id) {
    return res.status(422).json({ error: 'Parâmetro "id" é obrigatório.' });
  }

  const clientId = process.env.SIMPLIFY_CLIENT_ID;
  const clientSecret = process.env.SIMPLIFY_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    console.error('[check-pix-status] Faltam SIMPLIFY_CLIENT_ID / SIMPLIFY_CLIENT_SECRET.');
    return res.status(500).json({ error: 'Verificação de status temporariamente indisponível.' });
  }

  try {
    const simplifyRes = await fetch(`https://simplifybr.com/api/v1/pix/deposit/${encodeURIComponent(id)}`, {
      method: 'GET',
      headers: {
        'Client-id': clientId,
        'Client-secret': clientSecret,
      },
    });

    const data = await simplifyRes.json().catch(() => ({}));

    if (!simplifyRes.ok) {
      console.error('[check-pix-status] SimplifyBR respondeu com erro:', simplifyRes.status, data);
      return res.status(simplifyRes.status).json({ error: data?.message || 'Não foi possível consultar o status agora.' });
    }

    return res.status(200).json({
      internal_id: data.internal_id,
      external_id: data.external_id,
      status: data.status,
      amount: data.amount,
    });
  } catch (err) {
    console.error('[check-pix-status] Erro ao chamar a SimplifyBR:', err);
    return res.status(500).json({ error: 'Erro ao conectar com o gateway de pagamento.' });
  }
}
