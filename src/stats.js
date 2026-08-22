// Soldier Wars — Durable Object "Stats"
// Stores a private log of who played and how each match ended.
// Nobody but the owner (via the secret admin key) can read this.

export class Stats {
  constructor(state, env) {
    this.state = state;
    this.env = env;
  }

  async fetch(request) {
    const url = new URL(request.url);

    if (request.method === 'POST' && url.pathname === '/log') {
      const body = await request.json().catch(() => null);
      if (!body) return new Response('Bad request', { status: 400 });

      const id = Date.now() + '-' + Math.random().toString(36).slice(2, 8);
      const entry = {
        time: new Date().toISOString(),
        event: body.event || null,              // 'played' | 'result'
        telegramId: body.telegramId || null,
        nickname: body.nickname || null,
        opponentNickname: body.opponentNickname || null,
        result: body.result || null,             // 'win' | 'loss'
        mode: body.mode || null,                 // 'room' | 'quickmatch'
      };
      await this.state.storage.put('log:' + id, entry);
      return new Response('ok');
    }

    if (request.method === 'GET' && url.pathname === '/logs') {
      const all = await this.state.storage.list({ prefix: 'log:' });
      const entries = Array.from(all.values()).sort(
        (a, b) => new Date(b.time) - new Date(a.time)
      );
      return new Response(JSON.stringify(entries), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response('Not found', { status: 404 });
  }
}