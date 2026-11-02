// Envia/atualiza uma linha na planilha do Google (via Google Apps Script).
// Variáveis de ambiente na Vercel:
//   SHEETS_WEBHOOK_URL  → URL do app da web gerado no Apps Script
//   SHEETS_SECRET       → mesma senha definida em SEGREDO no script
// Se não estiverem configuradas, não faz nada (o site continua normal).
// Nunca lança erro: falha na planilha não pode atrapalhar uma venda.
export async function salvarNaPlanilha(dados) {
  const url = process.env.SHEETS_WEBHOOK_URL;
  if (!url) return false;
  try {
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ ...dados, secret: process.env.SHEETS_SECRET || '' }),
      signal: AbortSignal.timeout(6000),
    });
    const txt = await r.text().catch(() => '');
    if (!r.ok || !/"ok":\s*true/.test(txt)) console.error('[planilha] Resposta inesperada:', r.status, txt.slice(0, 200));
    return r.ok;
  } catch (e) {
    console.error('[planilha] Falha ao salvar:', e && e.message);
    return false;
  }
}
