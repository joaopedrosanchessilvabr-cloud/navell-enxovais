# Navell Enxovais

Loja de capas de sofá (HTML/CSS/JS + funções serverless na Vercel).

- `index.html` — loja (home → modelos → coleção → carrinho)
- `checkout.html` — checkout em 3 etapas (dados → entrega → Pix)
- `obrigado.html` — confirmação após pagamento aprovado
- `api/create-pix.js` — recalcula o total no servidor e gera o Pix na SimplifyBR
- `api/check-pix-status.js` — consulta o status do Pix
- `api/simplify-webhook.js` — recebe os avisos de pagamento da SimplifyBR

## Variáveis de ambiente (Vercel → Settings → Environment Variables)

- `SIMPLIFY_CLIENT_ID` e `SIMPLIFY_CLIENT_SECRET` (simplifybr.com → Integrações → API)
- `SIMPLIFY_WEBHOOK_URL` (opcional): `https://SEU-DOMINIO/api/simplify-webhook`

Nunca coloque essas chaves no código nem no repositório.

Cada pedido gerado aparece nos Logs da Vercel com a marca `[PEDIDO]` (itens, cliente e endereço).
