// Soldier Wars — Cloudflare Worker entry point
// Routes:
//   GET /create              -> returns a fresh, unused 4-digit room code
//   GET /connect?code=XXXX&role=host|guest  (WebSocket upgrade)
//                             -> pairs this connection into that room

export { Room } from './room.js';

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

function randomCode() {
  return String(Math.floor(1000 + Math.random() * 9000));
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders() });
    }

    if (url.pathname === '/create') {
      // Try a handful of random codes until we find one that isn't in use yet
      for (let attempt = 0; attempt < 8; attempt++) {
        const code = randomCode();
        const id = env.ROOM.idFromName(code);
        const stub = env.ROOM.get(id);
        const statusRes = await stub.fetch('https://room/status');
        const status = await statusRes.json();
        if (!status.occupied) {
          return new Response(JSON.stringify({ code }), {
            headers: { 'Content-Type': 'application/json', ...corsHeaders() },
          });
        }
      }
      return new Response(JSON.stringify({ error: 'Could not allocate room, try again' }), {
        status: 503,
        headers: { 'Content-Type': 'application/json', ...corsHeaders() },
      });
    }

    if (url.pathname === '/connect') {
      const code = (url.searchParams.get('code') || '').trim();
      const role = url.searchParams.get('role') || 'guest';
      if (!/^\d{4}$/.test(code)) {
        return new Response('Invalid room code', { status: 400 });
      }
      const id = env.ROOM.idFromName(code);
      const stub = env.ROOM.get(id);
      // Forward the upgrade request straight into the Durable Object
      const forwardUrl = new URL('https://room/connect');
      forwardUrl.searchParams.set('role', role);
      return stub.fetch(forwardUrl.toString(), request);
    }

    if (url.pathname === '/' || url.pathname === '') {
      return new Response('Soldier Wars relay server is running.\n', {
        headers: corsHeaders(),
      });
    }

    return new Response('Not found', { status: 404 });
  },
};
