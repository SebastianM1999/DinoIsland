// A narrow preload bridge keeps the Steam SDK outside the sandboxed renderer.
export async function connectSteam(bridge, open, hello, createNet, timeoutMs = 35000) {
  let session;
  let settled = false;
  let resolveWelcome, rejectWelcome;
  const welcome = new Promise((resolve, reject) => { resolveWelcome = resolve; rejectWelcome = reject; });
  // Register before opening or sending HELLO so a fast local host cannot race us.
  const transport = {
    onMessage: null, onClose: null,
    send: message => { if (session) bridge.send(session.sessionId, message); },
    close: () => {
      unsubscribe();
      clearTimeout(timer);
      if (session) void bridge.leave(session.sessionId).catch(() => {});
      if (!settled) { settled = true; rejectWelcome(new Error('Connection cancelled.')); }
    },
  };
  const net = createNet(transport);
  const unsubscribe = bridge.onEvent(event => {
    if (!session || event.sessionId !== session.sessionId) return;
    if (event.type === 'closed') {
      if (!settled) { settled = true; rejectWelcome(new Error(event.reason)); }
      else transport.onClose?.(event.reason);
      unsubscribe();
      clearTimeout(timer);
    } else if (event.type === 'message') {
      const message = event.message;
      if (!message || typeof message !== 'object') return;
      if (!settled && message.t === 'reject') {
        settled = true;
        rejectWelcome(new Error(message.reason));
      } else if (!settled && message.t === 'welcome') {
        settled = true;
        net.welcome = message;
        clearTimeout(timer);
        resolveWelcome(net);
      }
      transport.onMessage?.(message);
    }
  });
  const timer = setTimeout(() => {
    if (!settled) { settled = true; rejectWelcome(new Error('The host did not answer. Try joining again.')); }
  }, timeoutMs);
  // Attach immediately, even if open rejects before we begin awaiting welcome.
  welcome.catch(() => {});
  try {
    session = await open();
    if (settled) throw new Error('Connection timed out.');
    net.steamSession = session;
    transport.send(hello);
    return await welcome;
  } catch (error) {
    transport.close();
    if (!session) await bridge.leave().catch(() => {});
    throw error;
  }
}
