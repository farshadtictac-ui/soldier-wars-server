// Soldier Wars — Durable Object "Lobby"
// A single shared "waiting room" for quick match. The first player to
// arrive waits here; the next player who arrives gets paired with them
// automatically, and this object relays messages between the pair
// exactly like a Room does — but nobody had to share a code.

export class Lobby {
  constructor(state, env) {
    this.state = state;
    this.waiting = null;        // a WebSocket, or null
    this.partnerOf = new Map(); // WebSocket -> WebSocket (paired players)
  }

  async fetch(request) {
    const url = new URL(request.url);

    if (url.pathname === '/quickmatch') {
      if (request.headers.get('Upgrade') !== 'websocket') {
        return new Response('Expected WebSocket upgrade', { status: 426 });
      }

      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);
      server.accept();

      if (this.waiting && this.waiting.readyState === 1 /* OPEN */) {
        // Pair with whoever has been waiting
        const partner = this.waiting;
        this.waiting = null;
        this.partnerOf.set(server, partner);
        this.partnerOf.set(partner, server);
        this.send(partner, { type: 'matched', team: 'red' });
        this.send(server, { type: 'matched', team: 'blue' });
      } else {
        this.waiting = server;
        this.send(server, { type: 'waiting' });
      }

      server.addEventListener('message', (event) => {
        let msg;
        try { msg = JSON.parse(event.data); } catch (e) { return; }
        const partner = this.partnerOf.get(server);
        this.send(partner, msg);
      });

      const cleanup = () => {
        if (this.waiting === server) this.waiting = null;
        const partner = this.partnerOf.get(server);
        if (partner) {
          this.send(partner, { type: 'opponent_left' });
          this.partnerOf.delete(server);
          this.partnerOf.delete(partner);
        }
      };
      server.addEventListener('close', cleanup);
      server.addEventListener('error', cleanup);

      return new Response(null, { status: 101, webSocket: client });
    }

    return new Response('Not found', { status: 404 });
  }

  send(ws, obj) {
    if (ws) {
      try { ws.send(JSON.stringify(obj)); } catch (e) { /* socket gone */ }
    }
  }
}