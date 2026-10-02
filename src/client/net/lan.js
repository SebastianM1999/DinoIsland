import { CONFIG } from '../../shared/config.js';

export function websocketAddress(input) {
  let address = input.trim();
  if (!address) throw new Error('Enter your friend’s IP address or WebSocket address.');
  if (/\s/.test(address)) throw new Error('Enter a valid IP address, such as 192.168.1.10:8080.');
  if (/^https?:\/\//i.test(address)) address = address.replace(/^http/i, 'ws');
  if (!/^[a-z]+:\/\//i.test(address)) {
    const explicitPort = address.startsWith('[') ? /\]:\d+$/.test(address) : (address.match(/:/g) ?? []).length <= 1 && /:\d+$/.test(address);
    if (!address.startsWith('[') && (address.match(/:/g) ?? []).length > 1) address = `[${address}]`;
    address = `ws://${address}`;
    let parsed;
    try { parsed = new URL(address); } catch { throw new Error('Enter a valid IP address, such as 192.168.1.10:8080.'); }
    if (!parsed.port && !explicitPort) parsed.port = String(CONFIG.net.port);
    address = parsed.href;
  }
  let url;
  try { url = new URL(address); } catch { throw new Error('Enter a valid IP address or WebSocket address.'); }
  if (!['ws:', 'wss:'].includes(url.protocol) || !url.hostname || url.username || url.password || url.hash) {
    throw new Error('Use an IP address or a ws:// or wss:// address.');
  }
  return url.href;
}

export async function initLanAddress() {
  const $ = id => document.getElementById(id);
  const input = $('host-address');
  const copy = $('btn-copy-address');
  const network = $('host-network');
  const status = $('lan-status');
  try {
    const response = await fetch('/connection', { cache: 'no-store' });
    if (!response.ok) throw new Error('Host address unavailable.');
    const { addresses } = await response.json();
    for (const entry of addresses) {
      const option = document.createElement('option');
      option.value = entry.address;
      option.textContent = `${entry.name} (${new URL(entry.address).hostname})`;
      network.append(option);
    }
    // A remote browser should share the server it visited, not one of that
    // server's private adapters. Desktop windows always load from loopback.
    const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
    input.value = loopback ? (addresses[0]?.address ?? '') : `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}`;
    network.hidden = $('host-network-label').hidden = !loopback || addresses.length < 2;
    copy.disabled = !input.value;
    if (!input.value) status.textContent = 'No LAN connection found. Connect to Wi-Fi or Ethernet and reload.';
  } catch {
    status.textContent = 'Host address unavailable. Enter an address below to join a game.';
  }
  network.addEventListener('change', () => { input.value = network.value; status.textContent = ''; });
  copy.addEventListener('click', async () => {
    if (!input.value) return;
    try {
      if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(input.value);
      else {
        input.focus(); input.select();
        if (!document.execCommand('copy')) throw new Error('Clipboard unavailable');
      }
      status.textContent = 'Address copied. Send it to your friend, then host a LAN game.';
    } catch {
      input.focus(); input.select();
      status.textContent = 'Press Ctrl+C to copy the selected address.';
    }
  });
}
