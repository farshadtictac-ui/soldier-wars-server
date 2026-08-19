// Soldier Wars — Durable Object "Room"
// Holds exactly two WebSocket connections (host + guest) for one game,
// and relays whatever JSON messages they send to each other.
// It does not understand or validate game rules.

export class Room {
  constructor(state, env) {
    this.state = state;
    this.host = null;
    this.guest = null;
  }

  async fetch(request) {
    const url = new URL(request.url);

    if (url.pathname === '/status') {
      const occupied = !!(this.host || this.guest);
      return new Response(JSON.stringify({ occupied }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (url.pathname === '/connect') {
      const role = url.searchParams.get('role') === 'host' ? 'host' : 'guest';

      if (role === 'host' && this.host) {
        return new Response('Room already has a host', { status: 409 });
      }
      if (role === 'guest' && this.guest) {
        return new Response('Room already has a guest', { status: 409 });
      }

      if (request.headers.get('Upgrade') !== 'websocket') {
        return new Response('Expected WebSocket upgrade', { status: 426 });
      }

      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);
      server.accept();

      if (role === 'host') {
        this.host = server;
      } else {
        this.guest = server;
        this.send(this.host, { type: 'opponent_joined' });
      }

      server.addEventListener('message', (event) => {
        let msg;
        try { msg = JSON.parse(event.data); } catch (e) { return; }
        const other = role === 'host' ? this.guest : this.host;
        this.send(other, msg);
      });

      const cleanup = () => {
        if (this.host === server) this.host = null;
        if (this.guest === server) this.guest = null;
        const other = role === 'host' ? this.guest : this.host;
        this.send(other, { type: 'opponent_left' });
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
