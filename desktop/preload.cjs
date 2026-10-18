const { contextBridge, ipcRenderer } = require('electron');
async function call(name, arg) {
  const result = await ipcRenderer.invoke(`dino:steam:${name}`, arg);
  if (result.error) throw new Error(result.error);
  return result.value;
}
contextBridge.exposeInMainWorld('dinoSteam', {
  status: () => call('status'),
  friends: () => call('friends'),
  lobbies: () => call('lobbies'),
  host: (visibility, ownerToken = null) => call('host', { visibility, ownerToken }),
  join: lobbyId => call('join', lobbyId),
  leave: sessionId => call('leave', sessionId),
  invite: friendId => call('invite', friendId),
  dismissInvite: () => call('dismissInvite'),
  send: (sessionId, message) => ipcRenderer.send('dino:steam:send', sessionId, message),
  onEvent: handler => {
    const listener = (_event, data) => handler(data);
    ipcRenderer.on('dino:steam:event', listener);
    return () => ipcRenderer.removeListener('dino:steam:event', listener);
  },
});

// Preferences (name, outfit, settings...) live in files under userData (desktop/personal-store.cjs),
// not in localStorage, whose origin changes with the local port. The page reads them synchronously
// at start-up, like localStorage; writes go to the main process.
let values = {};
try { values = ipcRenderer.sendSync('dino:store:snapshot') || {}; } catch { values = {}; }
contextBridge.exposeInMainWorld('dinoStore', {
  getItem: key => (Object.prototype.hasOwnProperty.call(values, key) ? values[key] : null),
  setItem: (key, value) => {
    values[key] = String(value);
    ipcRenderer.send('dino:store:set', { key, value: values[key] });
  },
  removeItem: key => {
    delete values[key];
    ipcRenderer.send('dino:store:set', { key, value: null });
  },
  keys: () => Object.keys(values),
});
