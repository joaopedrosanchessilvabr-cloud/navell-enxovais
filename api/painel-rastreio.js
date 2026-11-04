// Painel interno para atualizar a etapa dos pedidos. Protegido por senha (ADMIN_SECRET, ou SHEETS_SECRET se não existir).
//   GET  /api/painel-rastreio            → lista os últimos pedidos pagos
//   POST /api/painel-rastreio {pedido, etapa, nota, transp, link}
import { timingSafeEqual } from 'node:crypto';
import { listar, atualizar, ETAPAS } from './_rastreio.js';

function senhaOk(h) {
  const esperado = process.env.ADMIN_SECRET || process.env.SHEETS_SECRET || '';
  if (!esperado || !h) return false;
  const a = Buffer.from(String(h)), b = Buffer.from(esperado);
  return a.length === b.length && timingSafeEqual(a, b);
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (!senhaOk(req.headers['x-painel'])) return res.status(401).json({ error: 'Senha incorreta.' });
  try {
    if (req.method === 'GET') return res.status(200).json({ etapas: ETAPAS, pedidos: await listar(80) });
    if (req.method === 'POST') {
      const { pedido, etapa, nota, transp, link } = req.body || {};
      const p = await atualizar(pedido, { etapa, nota, transp, link });
      if (!p) return res.status(404).json({ error: 'Pedido não encontrado.' });
      return res.status(200).json({ ok: true });
    }
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).end();
  } catch (e) {
    console.error('[painel-rastreio]', e && e.message);
    return res.status(500).json({ error: 'Falha ao acessar o banco.' });
  }
}
