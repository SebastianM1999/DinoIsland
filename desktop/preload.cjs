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
  host: visibility => call('host', visibility),
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
