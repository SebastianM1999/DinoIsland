export function initInternetTest() {
  const $ = id => document.getElementById(id);
  let hosting = false;
  async function call(action = '') {
    const response = await fetch(`/internet${action ? `/${action}` : ''}`, action ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' } : {});
    const result = await response.json();
    if (!response.ok || result.error) throw new Error(result.error || 'The internet test could not start.');
    return result;
  }
  function show(state) {
    const address = state.address || '';
    $('internet-address').value = $('pause-internet-address').value = address;
    $('btn-copy-internet').disabled = !address;
    $('btn-stop-internet').hidden = !address;
    $('pause-internet').hidden = !address;
    if (state.error) $('internet-status').textContent = state.error;
    else if (address) $('internet-status').textContent = 'Ready. Copy this address and send it to your friends. Keep the host game open.';
  }
  async function copy(input, status) {
    try {
      if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(input.value);
      else { input.focus(); input.select(); if (!document.execCommand('copy')) throw new Error(); }
      status.textContent = 'Address copied. Send it to your friends.';
    } catch { input.focus(); input.select(); status.textContent = 'Press Ctrl+C to copy the selected address.'; }
  }
  $('btn-copy-internet').addEventListener('click', () => copy($('internet-address'), $('internet-status')));
  $('btn-copy-pause-internet').addEventListener('click', () => copy($('pause-internet-address'), $('pause-internet-status')));
  $('btn-stop-internet').addEventListener('click', async () => {
    try { show(await call('stop')); $('internet-status').textContent = 'Internet test stopped.'; }
    catch (error) { $('internet-status').textContent = error.message; }
  });
  if (['localhost', '127.0.0.1', '[::1]'].includes(location.hostname)) {
    void call().then(show).catch(() => {});
  } else $('btn-host-internet').hidden = true;
  return {
    async start() {
      $('btn-stop-internet').hidden = false;
      $('internet-status').textContent = 'Starting internet test… The first start downloads the tunnel helper (about 55 MB).';
      const state = await call('start');
      hosting = true; show(state);
      return state.localHostAddress;
    },
    stop() {
      if (hosting) {
        hosting = false;
        void fetch('/internet/stop', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}', keepalive: true }).catch(() => {});
      }
    },
  };
}
