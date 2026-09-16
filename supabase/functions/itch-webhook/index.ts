// Keys are now delivered on the itch.io purchase page, not through email lookup.
// Never generate a paid license from an unsigned webhook or return one for a bare email.
Deno.serve((req) => {
  const headers = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'content-type, authorization, apikey' };
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers });
  return new Response(JSON.stringify({
    error: 'Ta clé Forge se récupère directement sur ta page d’achat itch.io : clique sur « Request key ». Si tu as déjà un compte Forge, connecte-toi.',
    purchaseHelpUrl: 'https://itch.io/docs/buying/already-bought',
  }), { status: 410, headers });
});
