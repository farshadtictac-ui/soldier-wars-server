# Soldier Wars — Multiplayer Relay Server (Cloudflare Workers)

Small server that pairs two players by a 4-digit room code and relays
messages between them. It doesn't know the rules of the game.

## Files
- `src/worker.js` — handles room-code creation and connecting players
- `src/room.js` — the "room" itself, keeps two players paired and relays messages
- `wrangler.toml` — Cloudflare configuration

## Deploy (using the Cloudflare dashboard — no coding tools needed)

1. Create a free account at https://dash.cloudflare.com
2. Put these three files (keeping the `src` folder) into a new GitHub
   repository, e.g. `soldier-wars-server`, the same way you did for
   the game itself.
3. In the Cloudflare dashboard, go to **Workers & Pages** → **Create** → **Workers**
4. Choose **Connect to Git** and pick your `soldier-wars-server` repository
5. Cloudflare will detect `wrangler.toml` automatically. Leave the build
   settings as default and click **Deploy**
6. After deployment, Cloudflare gives you a URL like:
   `https://soldier-wars-server.<your-subdomain>.workers.dev`

Your game will connect to this using:
`wss://soldier-wars-server.<your-subdomain>.workers.dev/connect`

Send me that URL once it's deployed and I'll verify it's reachable,
then we'll wire the game itself up to it.
