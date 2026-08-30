// Soldier Wars server — Durable Object "Room4"
// Holds up to four WebSocket connections (seats N, E, S, W) for one
// 4-player game, and relays whatever JSON messages a seat sends to
// every other connected seat. It does not understand game rules —
// the client that creates the room (seat N) acts as the authoritative
// host and simulates the game; the other three are thin clients.

const SEATS = ['N', 'E', 'S', 'W'];

export class Room4 {
  constructor(state, env) {
    this.state = state;
    this.seats = { N: null, E: null, S: null, W: null };
  }

  async fetch(request) {
    const url = new URL(request.url);

    if (url.pathname === '/status') {
      const filled = SEATS.filter((s) => !!this.seats[s]);
      return new Response(JSON.stringify({ filled, count: filled.length }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (url.pathname === '/connect') {
      if (request.headers.get('Upgrade') !== 'websocket') {
        return new Response('Expected WebSocket upgrade', { status: 426 });
      }

      // Seat N is always reserved for whoever created the room (the host/
      // authoritative simulator). Everyone else gets the next open seat.
      const wantsHost = url.searchParams.get('role') === 'host';
      let seat = null;
      if (wantsHost) {
        if (this.seats.N) return new Response('Room already has a host', { status: 409 });
        seat = 'N';
      } else {
        seat = SEATS.find((s) => s !== 'N' && !this.seats[s]);
        if (!seat) return new Response('Room is full', { status: 409 });
      }

      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);
      server.accept();
      this.seats[seat] = server;

      this.send(server, { type: 'seat_assigned', seat });
      this.broadcastRoster();

      server.addEventListener('message', (event) => {
        let msg;
        try { msg = JSON.parse(event.data); } catch (e) { return; }
        SEATS.forEach((s) => {
          if (s !== seat && this.seats[s]) this.send(this.seats[s], msg);
        });
      });

      const cleanup = () => {
        if (this.seats[seat] === server) this.seats[seat] = null;
        SEATS.forEach((s) => {
          if (this.seats[s]) this.send(this.seats[s], { type: 'seat_left', seat });
        });
        this.broadcastRoster();
      };
      server.addEventListener('close', cleanup);
      server.addEventListener('error', cleanup);

      return new Response(null, { status: 101, webSocket: client });
    }

    return new Response('Not found', { status: 404 });
  }

  broadcastRoster() {
    const roster = {};
    SEATS.forEach((s) => { roster[s] = !!this.seats[s]; });
    SEATS.forEach((s) => {
      if (this.seats[s]) this.send(this.seats[s], { type: 'roster', roster });
    });
  }

  send(ws, obj) {
    if (ws) {
      try { ws.send(JSON.stringify(obj)); } catch (e) { /* socket gone */ }
    }
  }
}
