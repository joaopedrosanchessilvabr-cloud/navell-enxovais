// Catálogo e preços — usado pelo servidor para validar carrinhos e recalcular valores.
export const KEYS = ['flara', 'stella', 'melina', 'dalia'];
export const NAMES = { flara: 'Flara', stella: 'Stella', melina: 'Melina', dalia: 'Dália' };
export const COLORS = {
  flara: ['Azul', 'Preto', 'Rosa', 'Bege'],
  stella: ['Preto', 'Bege', 'Cinza', 'Vermelho', 'Verde'],
  melina: ['Preto', 'Marrom', 'Azul', 'Cinza'],
  dalia: ['Preto', 'Marrom', 'Bege', 'Azul', 'Verde'],
};
export const SIZES = [
  { n: '2 lugares', price: 69.9 },
  { n: '3 lugares', price: 84.9 },
  { n: '4 lugares', price: 99.9 },
];

// Valida os itens e devolve { resumo: ['2x Flara Azul 3 lugares', ...], subtotal } ou null.
export function resumirItens(items, max = 20) {
  if (!Array.isArray(items) || items.length > max) return null;
  let subtotal = 0;
  const resumo = [];
  for (const it of items) {
    const sz = SIZES[it && it.s];
    const qty = Number(it && it.qty);
    if (!it || !KEYS.includes(it.k) || !COLORS[it.k].includes(it.color) || !sz ||
        !Number.isInteger(qty) || qty < 1 || qty > 10) return null;
    subtotal += sz.price * qty;
    resumo.push(`${qty}x ${NAMES[it.k]} ${it.color} ${sz.n}`);
  }
  return { resumo, subtotal: Math.round(subtotal * 100) / 100 };
}
