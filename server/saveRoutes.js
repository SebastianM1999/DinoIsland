// HTTP control of the owner's expeditions (server/saveCoordinator.js) for the game page that
// this host serves. Only the local machine may use it, and changes need a POST with a JSON
// body from this host's own origin, so neither LAN players nor other web pages can list,
// open, rename or delete expeditions.
//
//   GET  /saves              -> [summary]
//   GET  /saves/status       -> { available, reason, open }
//   POST /saves/new          { name, level, lobby }  -> { token, expedition }
//   POST /saves/open         { id, lobby }           -> { token, expedition, recovered }
//   POST /saves/lobby        { lobby }
//   POST /saves/save                                 -> { ok, savedAt } | { ok:false, error }
//   POST /saves/close        { force }               -> { ok } | { ok:false, error }
//   POST /saves/rename       { id, name }            -> summary
//   POST /saves/delete       { id }

const LOCAL = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);
const MAX_BODY = 4096;

function reply(res, status, value) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(value ?? null));
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size <= MAX_BODY) chunks.push(chunk);   // (the rest is drained, so the reply still arrives)
    });
    req.on('end', () => {
      if (size > MAX_BODY) { reject(new Error('Request too large.')); return; }
      try {
        const text = Buffer.concat(chunks).toString('utf8');
        const value = text ? JSON.parse(text) : {};
        resolve(value && typeof value === 'object' && !Array.isArray(value) ? value : {});
      } catch { reject(new Error('Invalid request.')); }
    });
    req.on('error', reject);
  });
}

/** Handle `/saves...` requests. Returns false for any other URL. */
export function handleSaveRoutes(req, res, coordinator, port) {
  const url = req.url.split('?')[0];
  if (url !== '/saves' && !url.startsWith('/saves/')) return false;
  if (!coordinator) { reply(res, 404, { error: 'This host keeps no expeditions.' }); return true; }
  const origin = req.headers.origin;
  const sameOrigin = [`http://localhost:${port}`, `http://127.0.0.1:${port}`, `http://[::1]:${port}`].includes(origin);
  const reading = req.method === 'GET' && (url === '/saves' || url === '/saves/status');
  if (!LOCAL.has(req.socket.remoteAddress) || (!reading && (req.method !== 'POST' || !sameOrigin || !String(req.headers['content-type']).startsWith('application/json')))) {
    reply(res, 403, { error: 'Only the game on this computer can manage its expeditions.' });
    return true;
  }
  const routes = {
    '/saves': () => coordinator.list(),
    '/saves/status': () => coordinator.status(),
    '/saves/new': (b) => coordinator.create({ name: b.name, level: b.level }, { lobby: b.lobby }),
    '/saves/open': (b) => coordinator.open(b.id, { lobby: b.lobby }),
    '/saves/lobby': async (b) => { coordinator.setLobby(b.lobby); await coordinator.lobbyChange; return coordinator.status(); },
    '/saves/save': () => coordinator.save('manual'),
    '/saves/close': (b) => coordinator.close({ force: b.force === true }),
    '/saves/rename': (b) => coordinator.rename(b.id, b.name),
    '/saves/delete': async (b) => { await coordinator.remove(b.id); return { ok: true }; },
  };
  const route = routes[url];
  if (!route) { reply(res, 404, { error: 'Unknown request.' }); return true; }
  (reading ? Promise.resolve({}) : readJson(req))
    .then((body) => route(body))
    .then((value) => reply(res, 200, value), (error) => reply(res, 409, { error: error.message }));
  return true;
}
