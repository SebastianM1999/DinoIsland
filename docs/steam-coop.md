# Steam player-hosted co-op

The host's Electron main process runs `ServerWorld`. Steam provides lobby discovery, invites, authenticated peer identities, and Steam Networking Sockets packet delivery, including Valve relay routing. No developer-operated game backend or port forwarding is needed for Steam sessions. The local HTTP server serves each player's own bundled client; remote players never download the game from the host.

Snapshots (`snap`) and own-movement updates (`state`) are sent unreliably: a lost one is replaced 50 ms later, while a reliable resend would stall every packet behind it. Movement updates carry a sequence number and correction epoch, so the host drops reordered and pre-correction updates; clients drop snapshots older than the last welcome, so a late packet from the previous island cannot corrupt the new one. Everything else (events, actions, welcome, corrections) stays reliable and ordered. The Steam pump runs every 4 ms and flushes each connection, so Steam's send coalescing adds no extra delay. The Steam host is a fresh world per session and is separate from the optional LAN world.

## Configure the Windows build

1. Set `appId` in `desktop/steam-config.json` to the game's Steam App ID. It is a public identifier, not an API key. There is no default development ID in release builds.
2. Download the Steamworks SDK from your Steamworks partner account. Copy `redistributable_bin/win64/steam_api64.dll` into `steamworks_sdk/redistributable_bin/win64/steam_api64.dll` in this project. The SDK folder is ignored by Git. Use SDK 1.64 or a compatible newer version with the pinned `steamworks-ffi-node` binding.
3. Run `npm ci`, then `npm run build:steam`. The release preflight rejects missing configuration, missing DLLs, and development App ID 480. Electron Builder copies the DLL to `resources/steamworks_sdk/redistributable_bin/win64/` and unpacks the native Koffi dependency outside ASAR.
4. Upload the complete `dist/win-unpacked/` folder as your Windows Steam depot and set the executable to `Dinosaur Island.exe`. Do not upload only the executable or include a development `steam_appid.txt`.

For local development only, start Steam and sign in, then run:

```powershell
$env:DINO_STEAM_APP_ID = '480'
# Optional: point to an SDK folder outside this project.
$env:DINO_STEAM_SDK_PATH = 'C:\path\to\steamworks_sdk'
npm run desktop
```

480 is Valve's shared Spacewar development app. Lobby metadata filters out other games using that ID, but it cannot establish ownership of this game. Use your real App ID and two authorized test accounts for release validation. Build configuration uses `desktop/steam-config.json`; environment overrides are for running a local build and do not get baked into the release.

## Player flow

- **Host game:** choose Friends only, Invite only, or Anyone. Hosting starts the expedition immediately and reserves one of four slots for the host.
- **Join friend:** lists friends playing this App ID with a Steam lobby. Refresh updates the list. A lobby ID can also be entered manually.
- **Browse public games:** searches compatible public lobbies with space available. Steam enforces access to private/friends-only lobbies.
- **Invite friends:** available in the pause menu during a Steam session. Select an online friend to send a Steam lobby invitation. The lobby ID is also displayed there.
- Accepted invites launch a closed game through `+connect_lobby`, or generate a join request when the game is already running. An invite received during play shows a HUD toast and **Leave and join friend** in the pause menu; it does not end the current session automatically.
- Quitting, reloading, leaving, or losing the host closes the session and releases its lobby/network resources. Steam may appoint another lobby owner, but the game deliberately ends instead of pretending the new owner has the world state.
- **Host LAN game** and **LAN / direct connection** remain available without Steam. Share the host's LAN address and displayed port; Steam invites do not apply to these sessions.

## Progress and authority

This implements the existing game's session-based progression. It does not add durable expedition saves, guest progression storage, Steam Cloud, or host migration. Each new Steam host session starts a fresh expedition. Only an authenticated Steam identity currently admitted to the lobby can establish a gameplay connection. Gameplay validation remains in `ServerWorld`; a host can modify their local game, so this is not a trusted competitive economy.

## Validation before release

Automated tests in `test/steam-coop.test.js` use a fake Steam service with the real game world and renderer transport. They cover shared world joins, four-player capacity, unauthorized connections, incompatible lobbies, stale session messages, host loss, discovery, invites, timeouts, and teardown. They cannot prove native SDK/Steam connectivity.

Test the packaged build on two PCs and Steam accounts on different internet connections:

1. Host a friends-only game and join from **Join friend**. Confirm positions, combat, loot, and shared discovery in both clients; sail to the next island and confirm both receive it.
2. Send an in-game friend invite. Accept while the guest is at the menu, while already playing, and while their game is closed. Check that the current expedition is not ended until they choose to leave it.
3. Test public discovery, private invites, a full four-player lobby, failed joins, and mismatched builds. Ensure a player can leave and rejoin without occupying a stale slot.
4. Close the host normally, force-close it, and interrupt its network. Guests must return to the menu with a reason; a new host session must work afterward.
5. Repeat behind home routers without forwarded ports, including a restrictive/CGNAT connection. Check relay connectivity and bandwidth/latency during gameplay.
6. Confirm a signed-in Steam client and game entitlement, missing DLL/Steam failure messages, offline solo, and LAN fallback. Verify the packaged native dependencies load from ASAR-unpacked files.

References: [Valve networking](https://partner.steamgames.com/doc/features/multiplayer/networking), [Steam lobbies](https://partner.steamgames.com/doc/features/multiplayer/matchmaking), and [binding SDK setup](https://github.com/ArtyProf/steamworks-ffi-node/blob/main/docs/STEAMWORKS_SDK_SETUP.md).

## Remote friend testing without Steam

Use **Host internet test** on the Windows host. On first use it downloads cloudflared 2026.9.3 from Cloudflare's official GitHub release into the OS temporary `dinosaur-island-tools` folder and verifies its pinned SHA-256 digest before executing it. It starts a hidden, temporary Quick Tunnel with Cloudflare's default transport (QUIC with HTTP/2 fallback). The game waits for a registered connection and DNS propagation before publishing the address.

The host clicks the clipboard icon beside **Address to send your friends**, or copies it from the pause menu. Friends run their own copy of the game, paste the complete `wss://.../?room=...` value into **Friend’s internet address**, and click **Join internet test**. Preserve the room token in the copied address. This is an internet relay, not a LAN address or a permanent dedicated server.

The tunnel exposes a separate loopback listener that accepts only gameplay WebSocket upgrades carrying the random room token. HTTP pages, assets, local configuration, and tunnel-control APIs are not exposed through it. Starting/stopping the tunnel is restricted to local requests with a matching origin. The host's own gameplay connection has a separate owner token; disconnecting it closes the tunnel and guests. **Stop internet test** can also cancel startup or an unused tunnel.

This is a temporary test service without an uptime guarantee, and depends on Cloudflare and outbound connectivity. If antivirus HTTPS inspection replaces Cloudflare's edge certificate, the game reports the certificate failure and leaves verification enabled. Prefer allowing this specific helper in the security software rather than disabling verification. If a guest's DNS resolver blocks the new hostname, they need a resolver that can resolve it; the host checks public DNS propagation without changing system DNS settings.

[Cloudflare Quick Tunnel documentation](https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/). Production Steam co-op uses Steam's networking APIs instead of this helper.
