import { networkInterfaces } from 'node:os';

export function lanAddresses(port, interfaces = networkInterfaces()) {
  const addresses = [];
  for (const [name, entries] of Object.entries(interfaces)) {
    for (const entry of entries ?? []) {
      if (!entry.internal && (entry.family === 'IPv4' || entry.family === 4)) {
        addresses.push({ name, address: `ws://${entry.address}:${port}` });
      }
    }
  }
  // Physical connections are usually more useful than VM/VPN adapters.
  addresses.sort((a, b) => Number(/virtual|vethernet|vpn|vmware|tailscale|zerotier/i.test(a.name)) - Number(/virtual|vethernet|vpn|vmware|tailscale|zerotier/i.test(b.name)));
  return [...new Map(addresses.map(entry => [entry.address, entry])).values()];
}
