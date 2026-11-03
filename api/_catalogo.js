// Catálogo e preços — usado pelo servidor para validar carrinhos e recalcular valores.
export const KEYS = ['flara', 'stella', 'melina', 'dalia', 'ayla', 'alina', 'celina', 'aurora', 'lumira', 'magna', 'renovare', 'lana', 'luma', 'mila', 'cloe'];
export const NAMES = { flara: 'Flara', stella: 'Stella', melina: 'Melina', dalia: 'Dália', ayla: 'Ayla', alina: 'Alina', celina: 'Celina', aurora: 'Aurora', lumira: 'Lumira', magna: 'Magna', renovare: 'Renovare', lana: 'Lana', luma: 'Luma', mila: 'Mila', cloe: 'Cloe' };
export const COLORS = {
  flara: ['Azul', 'Preto', 'Rosa', 'Lilás', 'Bege'],
  stella: ['Preto', 'Bege', 'Cinza', 'Vermelho', 'Verde'],
  melina: ['Preto', 'Marrom', 'Azul', 'Cinza'],
  dalia: ['Preto', 'Marrom', 'Bege', 'Azul', 'Verde'],
  ayla: ['Preto', 'Bege', 'Cinza', 'Laranja', 'Grafite'],
  alina: ['Marrom', 'Preto', 'Cinza', 'Bege', 'Grafite'],
  celina: ['Cinza', 'Marrom', 'Bege', 'Branco', 'Preto'],
  aurora: ['Branco', 'Marrom', 'Cinza', 'Grafite', 'Preto'],
  lumira: ['Cinza', 'Verde', 'Marrom', 'Preto', 'Branco'],
  magna: ['Bege', 'Marrom', 'Preto', 'Branco', 'Verde'],
  renovare: ['Verde', 'Marrom', 'Preto e Branco', 'Misto'],
  lana: ['Bege', 'Preto', 'Cinza', 'Marrom', 'Verde'],
  luma: ['Marrom', 'Preto', 'Bege', 'Café', 'Verde'],
  mila: ['Branco', 'Marrom', 'Preto', 'Laranja', 'Bege'],
  cloe: ['Marrom', 'Preto', 'Bege', 'Verde'],
};
export const SIZES = [
  { n: '2 lugares', price: 69.9 },
  { n: '3 lugares', price: 84.9 },
  { n: '4 lugares', price: 99.9 },
];

// Almofadas (vendidas em kit com 2). Chave do item no carrinho: 'alm-<modelo>'.
export const ALMOFADAS = {
  'alm-bege': { nome: 'Almofada Bege (KIT COM 2)', price: 39.9, cores: ['Bege'] },
  'alm-creme': { nome: 'Almofada Creme (KIT COM 2)', price: 39.9, cores: ['Creme'] },
  'alm-marrom': { nome: 'Almofada Marrom (KIT COM 2)', price: 39.9, cores: ['Marrom'] },
  'alm-cinza': { nome: 'Almofada Cinza (KIT COM 2)', price: 39.9, cores: ['Cinza'] },
  'alm-rosa': { nome: 'Almofada Rosa (KIT COM 2)', price: 39.9, cores: ['Rosa'] },
};

// Valida os itens e devolve { resumo: ['2x Flara Azul 3 lugares', ...], subtotal } ou null.
export function resumirItens(items, max = 20) {
  if (!Array.isArray(items) || items.length > max) return null;
  let subtotal = 0;
  const resumo = [];
  for (const it of items) {
    const qty = Number(it && it.qty);
    const alm = it && ALMOFADAS[it.k];
    if (alm) {
      if (!alm.cores.includes(it.color) || !Number.isInteger(qty) || qty < 1 || qty > 10) return null;
      subtotal += alm.price * qty;
      resumo.push(`${qty}x ${alm.nome} ${it.color}`);
      continue;
    }
    const sz = SIZES[it && it.s];
    if (!it || !KEYS.includes(it.k) || !COLORS[it.k].includes(it.color) || !sz ||
        !Number.isInteger(qty) || qty < 1 || qty > 10) return null;
    subtotal += sz.price * qty;
    resumo.push(`${qty}x ${NAMES[it.k]} ${it.color} ${sz.n}`);
  }
  return { resumo, subtotal: Math.round(subtotal * 100) / 100 };
}
