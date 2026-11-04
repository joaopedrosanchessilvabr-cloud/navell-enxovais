// GET /api/rastrear?q=NV120101001BR  (ou o número do pedido de 9 dígitos)
import { buscar, publico, garantirCodigo, normalizar } from './_rastreio.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') { res.setHeader('Allow', 'GET'); return res.status(405).json({ error: 'Método não permitido.' }); }
  res.setHeader('Cache-Control', 'no-store');
  const q = normalizar(req.query && req.query.q);
  if (!/^(NV\d{9}BR|\d{9})$/.test(q)) return res.status(422).json({ error: 'Digite o código de rastreio (ex.: NV120101001BR) ou o número do pedido.' });
  let p = await buscar(q);
  if (!p) return res.status(404).json({ error: 'Não encontramos esse código. Confira se digitou certinho. O código aparece na tela de confirmação do pedido.' });
  // pedido já pago pelo webhook mas ainda sem código: gera agora
  if (!p.codigo && p.eventos.some((x) => x.e === 'pago')) { await garantirCodigo(p.o); p = (await buscar(q)) || p; }
  return res.status(200).json(publico(p));
}
