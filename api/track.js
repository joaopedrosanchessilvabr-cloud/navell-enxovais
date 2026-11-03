// Função serverless (Vercel) — registra na planilha os passos do cliente antes do Pix:
//   etapa "carrinho": o que ele tem no carrinho (aba 1)
//   etapa "dados":    dados pessoais / endereço preenchidos no checkout (aba 2)
// A identificação é um código aleatório do navegador (vid), sem login.
import { createHmac } from 'node:crypto';
import { salvarNaPlanilha } from './_planilha.js';
import { resumirItens } from './_catalogo.js';

const txt = (v, n = 120) => String(v == null ? '' : v).trim().slice(0, n);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).end();
  }
  const b = req.body || {};

  // Cliente copiou o código Pix: marca "Copiou Pix #número" na planilha (exige o token do pedido)
  if (b.etapa === 'copiou') {
    const order = String(b.order || '').replace(/\D/g, '').slice(0, 12);
    const ok = order && String(b.token || '') === createHmac('sha256', process.env.SHEETS_SECRET || 'navell').update(order).digest('hex').slice(0, 16);
    if (!ok) return res.status(422).json({ ok: false });
    await salvarNaPlanilha({ acao: 'status', pedido: order, status: 'Copiou Pix' });
    return res.status(200).json({ ok: true });
  }
  const vid = txt(b.vid, 40).replace(/[^\w-]/g, '');
  if (!vid || vid.length < 8) return res.status(422).json({ ok: false });

  const r = resumirItens(Array.isArray(b.items) ? b.items : [], 20);
  if (!r) return res.status(422).json({ ok: false });

  if (b.etapa === 'carrinho') {
    await salvarNaPlanilha({
      acao: 'carrinho', vid, itens: r.resumo, valor: r.subtotal,
      status: r.resumo.length ? 'Adicionou ao carrinho' : 'Esvaziou o carrinho',
    });
    return res.status(200).json({ ok: true });
  }

  if (b.etapa === 'dados') {
    const p = b.payer || {}, a = b.address || null;
    if (!txt(p.name) || !txt(p.email) || !txt(p.phone)) return res.status(422).json({ ok: false });
    await salvarNaPlanilha({
      acao: 'dados', vid, itens: r.resumo, valor: r.subtotal,
      status: b.marco === 'cartao' ? 'Tentou pagar com cartão'
        : b.marco === 'erro' ? ('Erro ao gerar Pix: ' + txt(b.msg, 100))
        : (a ? 'Endereço preenchido' : 'Dados preenchidos'),
      cliente: { name: txt(p.name), email: txt(p.email), document: txt(p.document, 14), phone: txt(p.phone, 15) },
      entrega: a ? {
        cep: txt(a.cep, 8), street: txt(a.street), number: txt(a.number, 20), complement: txt(a.complement),
        neighborhood: txt(a.neighborhood), city: txt(a.city), state: txt(a.state, 2),
      } : null,
    });
    return res.status(200).json({ ok: true });
  }
  return res.status(422).json({ ok: false });
}
