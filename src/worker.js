// Soldier Wars — Cloudflare Worker entry point
// Routes:
//   GET /create              -> returns a fresh, unused 4-digit room code
//   GET /connect?code=XXXX&role=host|guest  (WebSocket upgrade)
//                             -> pairs this connection into that room
//   GET /quickmatch (WebSocket upgrade)
//                             -> pairs this connection with a random
//                                stranger who's also looking for a match
//   GET /create4              -> returns a fresh, unused 4-digit room code
//                                for a 4-player room
//   GET /connect4?code=XXXX&role=host|guest  (WebSocket upgrade)
//                             -> joins a 4-player room (seat N = host)
//   POST /log                -> records a play/result event (private)
//   GET /admin/logs?key=XXXX -> view the private play log (owner only)

export { Room } from './room.js';
export { Room4 } from './room4.js';
export { Lobby } from './lobby.js';
export { Stats } from './stats.js';

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

function randomCode() {
  return String(Math.floor(1000 + Math.random() * 9000));
}

function escapeHtml(str) {
  return String(str == null ? '' : str).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
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

    if (url.pathname === '/quickmatch') {
      const id = env.LOBBY.idFromName('public-lobby');
      const stub = env.LOBBY.get(id);
      return stub.fetch('https://lobby/quickmatch', request);
    }

    if (url.pathname === '/create4') {
      for (let attempt = 0; attempt < 8; attempt++) {
        const code = randomCode();
        const id = env.ROOM4.idFromName(code);
        const stub = env.ROOM4.get(id);
        const statusRes = await stub.fetch('https://room4/status');
        const status = await statusRes.json();
        if (status.count === 0) {
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

    if (url.pathname === '/connect4') {
      const code = (url.searchParams.get('code') || '').trim();
      const role = url.searchParams.get('role') || 'guest';
      if (!/^\d{4}$/.test(code)) {
        return new Response('Invalid room code', { status: 400 });
      }
      const id = env.ROOM4.idFromName(code);
      const stub = env.ROOM4.get(id);
      const forwardUrl = new URL('https://room4/connect');
      forwardUrl.searchParams.set('role', role);
      return stub.fetch(forwardUrl.toString(), request);
    }

    if (url.pathname === '/log' && request.method === 'POST') {
      const id = env.STATS.idFromName('global-stats');
      const stub = env.STATS.get(id);
      const res = await stub.fetch('https://stats/log', request);
      const headers = new Headers(res.headers);
      Object.entries(corsHeaders()).forEach(([k, v]) => headers.set(k, v));
      return new Response(await res.text(), { status: res.status, headers });
    }

    if (url.pathname === '/admin/logs') {
      const key = url.searchParams.get('key') || '';
      if (!env.ADMIN_KEY || key !== env.ADMIN_KEY) {
        return new Response('Unauthorized', { status: 401 });
      }
      const id = env.STATS.idFromName('global-stats');
      const stub = env.STATS.get(id);
      const res = await stub.fetch('https://stats/logs');
      const entries = await res.json();
      const rows = entries.map(e => `
        <tr>
          <td>${escapeHtml(e.time)}</td>
          <td>${escapeHtml(e.game)}</td>
          <td>${escapeHtml(e.event)}</td>
          <td>${escapeHtml(e.telegramId)}</td>
          <td>${escapeHtml(e.nickname)}</td>
          <td>${escapeHtml(e.opponentNickname)}</td>
          <td>${escapeHtml(e.result)}</td>
          <td>${escapeHtml(e.mode)}</td>
        </tr>`).join('');
      const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
        <title>Soldier Wars — Play Log</title>
        <style>
          body{font-family:sans-serif;background:#1a1108;color:#f0e6d2;padding:20px;}
          table{border-collapse:collapse;width:100%;font-size:13px;}
          th,td{border:1px solid #5a4a30;padding:6px 10px;text-align:left;}
          th{background:#3a2c18;}
          tr:nth-child(even){background:#241a10;}
        </style></head><body>
        <h2>⚔️ Tactical Arcade — Private Play Log</h2>
        <p>${entries.length} entries</p>
        <table><tr><th>Time (UTC)</th><th>Game</th><th>Event</th><th>Telegram ID</th><th>Nickname</th><th>Opponent</th><th>Result</th><th>Mode</th></tr>${rows}</table>
        </body></html>`;
      return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
    }

    if (url.pathname === '/' || url.pathname === '') {
      return new Response('Soldier Wars relay server is running.\n', {
        headers: corsHeaders(),
      });
    }

    return new Response('Not found', { status: 404 });
  },
};
