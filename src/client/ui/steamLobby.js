export function initSteamLobby({ join, isPlaying, leaveToJoin, notifyInvite = () => {}, releasePointer = () => {} }) {
  const $ = id => document.getElementById(id);
  const bridge = window.dinoSteam;
  const panel = $('steam-friends');
  const list = $('friends-list');
  const status = $('friends-status');
  let available = false;
  let mode = 'join';
  let request = 0;
  let previousFocus;
  let invitedLobby = null;

  function close() {
    ++request;
    panel.hidden = true;
    previousFocus?.focus();
  }

  async function refresh() {
    const ticket = ++request;
    status.textContent = mode === 'public' ? 'Loading public games…' : 'Loading friends…';
    list.replaceChildren();
    $('btn-refresh-friends').disabled = true;
    try {
      const friends = await (mode === 'public' ? bridge.lobbies() : bridge.friends());
      if (ticket !== request) return;
      const shown = mode === 'public' ? friends : mode === 'join' ? friends.filter(friend => friend.lobbyId) : friends.filter(friend => friend.online);
      status.textContent = shown.length ? (mode !== 'invite' ? 'Choose an expedition to join.' : 'Choose a friend to invite.') :
        mode === 'public' ? 'No public games are open. Host a game to start an expedition.' :
        (mode === 'join' ? 'No friends are hosting. Ask a friend to host, then refresh or accept their Steam invite.' : 'No friends are online.');
      for (const friend of shown) {
        const li = document.createElement('li');
        const label = document.createElement('span');
        label.textContent = mode === 'public' ? `${friend.name} — ${friend.players}/4 explorers` : friend.name;
        const button = document.createElement('button');
        button.type = 'button'; button.className = 'btn';
        button.textContent = mode !== 'invite' ? 'Join' : 'Invite';
        button.addEventListener('click', async () => {
          if (mode !== 'invite') { close(); await join(friend.lobbyId); }
          else {
            button.disabled = true;
            try { await bridge.invite(friend.id); button.textContent = 'Invited'; status.textContent = `Invitation sent to ${friend.name}.`; }
            catch (error) { button.disabled = false; status.textContent = error.message; }
          }
        });
        li.append(label, button); list.append(li);
      }
    } catch (error) { if (ticket === request) status.textContent = error.message; }
    finally { if (ticket === request) $('btn-refresh-friends').disabled = false; }
  }

  function open(nextMode) {
    if (!available) return;
    releasePointer();
    mode = nextMode;
    previousFocus = document.activeElement;
    $('friends-title').textContent = mode === 'join' ? 'Join a friend' : 'Invite friends';
    $('lobby-id-form').hidden = mode !== 'join';
    $('btn-browse-lobbies').hidden = mode === 'invite';
    $('btn-browse-lobbies').textContent = 'Browse public games';
    panel.hidden = false;
    $('btn-close-friends').focus();
    void refresh();
  }

  async function requestedJoin(lobbyId) {
    if (isPlaying()) {
      invitedLobby = lobbyId;
      $('btn-accept-invite').hidden = false;
      $('btn-accept-invite').textContent = 'Leave and join friend';
      notifyInvite();
    } else {
      close();
      await bridge.dismissInvite();
      await join(lobbyId);
    }
  }

  $('btn-friends').addEventListener('click', () => open('join'));
  $('btn-invite').addEventListener('click', () => open('invite'));
  $('btn-close-friends').addEventListener('click', close);
  $('btn-refresh-friends').addEventListener('click', refresh);
  $('btn-browse-lobbies').addEventListener('click', () => {
    mode = mode === 'public' ? 'join' : 'public';
    $('friends-title').textContent = mode === 'public' ? 'Public expeditions' : 'Join a friend';
    $('btn-browse-lobbies').textContent = mode === 'public' ? 'Show friends' : 'Browse public games';
    void refresh();
  });
  $('btn-accept-invite').addEventListener('click', () => { if (invitedLobby) leaveToJoin(); });
  $('lobby-id-form').addEventListener('submit', event => {
    event.preventDefault();
    const lobbyId = $('lobby-id').value.trim();
    if (!/^[1-9]\d{15,19}$/.test(lobbyId)) { status.textContent = 'Enter a valid Steam lobby ID.'; return; }
    close(); void join(lobbyId);
  });
  panel.addEventListener('keydown', event => {
    event.stopPropagation();
    if (event.key === 'Escape') { event.stopPropagation(); close(); }
    if (event.key === 'Tab') {
      const focusable = [...panel.querySelectorAll('button:not(:disabled), input')].filter(el => el.getClientRects().length);
      const first = focusable[0], last = focusable.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
  });
  panel.addEventListener('keyup', event => event.stopPropagation());

  const ready = (async () => {
    let state;
    try { state = bridge ? await bridge.status() : { available: false, reason: 'Steam friends need the Steam desktop build. Use an internet test or play solo.' }; }
    catch { state = { available: false, reason: 'Steam could not start. Restart Steam and the game. Solo and LAN are available.' }; }
    available = state.available;
    $('btn-host').textContent = available ? 'Host game' : 'Host LAN game';
    $('btn-host').hidden = !available;
    $('btn-friends').disabled = !available;
    $('home-steam-note').textContent = available ? 'Join a friend or browse public Steam expeditions.' : 'Steam friends and public games are available in the Steam desktop build. Use an invitation address below to join from a browser.';
    $('lobby-visibility').hidden = $('visibility-label').hidden = !available;
    $('steam-status').textContent = available ? `Connected to Steam as ${state.name}. Up to 4 explorers.` : state.reason;
    if (available) {
      if (!$('player-name').value) $('player-name').value = state.name.slice(0, 14);
      bridge.onEvent(event => { if (event.type === 'invite') void requestedJoin(event.lobbyId); });
      if (state.pendingLobbyId) setTimeout(() => void requestedJoin(state.pendingLobbyId), 0);
    }
    return state;
  })();

  return {
    ready,
    get available() { return available; },
    updateSession(session) {
      $('btn-invite').hidden = !session;
      $('btn-accept-invite').hidden = !invitedLobby;
      $('steam-session-info').hidden = !session;
      if (session) $('steam-session-info').textContent = `${session.hosting ? 'Hosting' : 'Steam co-op'} · Lobby ${session.lobbyId}. The expedition ends when the host leaves.`;
    },
  };
}
