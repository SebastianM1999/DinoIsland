# Steam player-hosted co-op

The host's game host process (an Electron utility process, `desktop/host-process.js`) runs `ServerWorld` and the host's saved expedition; the main process owns the Steam API and bridges Steam connections into it (`desktop/hostBridge.js`). Steam provides lobby discovery, invites, authenticated peer identities, and Steam Networking Sockets packet delivery, including Valve relay routing. No developer-operated game backend or port forwarding is needed for Steam sessions. The local HTTP server serves each player's own bundled client; remote players never download the game from the host.

Snapshots (`snap`) and own-movement updates (`state`) are sent unreliably: a lost one is replaced 50 ms later, while a reliable resend would stall every packet behind it. Movement updates carry a sequence number and correction epoch, so the host drops reordered and pre-correction updates; clients drop snapshots older than the last welcome, so a late packet from the previous island cannot corrupt the new one. Everything else (events, actions, welcome, corrections) stays reliable and ordered. The Steam pump runs every 4 ms and flushes each connection, so Steam's send coalescing adds no extra delay. Steam, LAN and internet friends all join the same hosted expedition.

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

The Steam API starts before the game creates its window (Valve's requirement for the overlay, `desktop/steamStart.cjs`). A packaged Steam build started directly from its `.exe` quits and lets Steam relaunch it (`restartAppIfNecessary`); `npm run desktop` from a source checkout never does.

480 is Valve's shared Spacewar development app. Lobby metadata filters out other games using that ID, but it cannot establish ownership of this game. Use your real App ID and two authorized test accounts for release validation. Build configuration uses `desktop/steam-config.json`; environment overrides are for running a local build and do not get baked into the release.

## Player flow

- **Create game:** choose Friends only, Invite only, or Anyone, then **Host game**. Hosting opens the expedition's **lobby** and reserves one of four slots for the host. Everyone who joins stands on the lobby's stage in their outfit, with their level and a read-only view of their skill tree (**Skills**). The island waits until the host presses **Start expedition**; friends who join later go straight into the running game. Solo has none.
- **Join game > Join a friend:** lists friends playing this App ID with a Steam lobby. Refresh updates the list. A lobby ID can also be entered manually.
- **Join game > Browse public games:** searches compatible public lobbies with space available. Steam enforces access to private/friends-only lobbies.
- **Party list:** the pause menu's Players list shows every explorer with health and marks the host. The host can **Kick** another explorer (a second click confirms): they are told "The host removed you from this expedition.", their character stays in the expedition, and they cannot rejoin until the host reopens it. This works the same for every guest.
- **Invite friends:** available in the pause menu (under the Players list) during a Steam session. Select an online friend to send a Steam lobby invitation. The lobby ID is also displayed there.
- Accepted invites launch a closed game through `+connect_lobby`, or generate a join request when the game is already running. An invite received during play shows a HUD toast and **Leave and join friend** in the pause menu; it does not end the current session automatically.
- Quitting, reloading, leaving, or losing the host closes the session and releases its lobby/network resources. Steam may appoint another lobby owner, but the game deliberately ends instead of pretending the new owner has the world state.
- Co-op is Steam only: there is no LAN or internet play. The desktop host listens on loopback only, opens no port on the network and causes no firewall prompt.
- **Versions:** every join carries the network version (`PROTOCOL_VERSION` in `src/shared/protocol.js`). Steam lobbies of another version are not listed, and a host refuses another version with a message saying who has to update. Bump the number with every change that makes two builds incompatible.

## Progress and authority

The host plays one of their saved expeditions; Steam guests keep their characters in it, keyed by their authenticated Steam ID (see `server/package-info.md`). There is no Steam Cloud and no host migration: when the host leaves, the session ends and the expedition stays on the host's PC. Only an authenticated Steam identity currently admitted to the lobby can establish a gameplay connection. Gameplay validation remains in `ServerWorld`; a host can modify their local game, so this is not a trusted competitive economy.

## Validation before release

Automated tests in `test/steam-coop.test.js` use a fake Steam service with the real game world and renderer transport. They cover shared world joins, four-player capacity, unauthorized connections, incompatible lobbies, stale session messages, host loss, discovery, invites, timeouts, and teardown. They cannot prove native SDK/Steam connectivity.

Test the packaged build on two PCs and Steam accounts on different internet connections:

1. Host a friends-only game and join from **Join friend**. Confirm positions, combat, loot, and shared discovery in both clients; sail to the next island and confirm both receive it.
2. Send an in-game friend invite. Accept while the guest is at the menu, while already playing, and while their game is closed. Check that the current expedition is not ended until they choose to leave it.
3. Test public discovery, private invites, a full four-player lobby, failed joins, and mismatched builds. Ensure a player can leave and rejoin without occupying a stale slot.
4. Close the host normally, force-close it, and interrupt its network. Guests must return to the menu with a reason; a new host session must work afterward.
5. Repeat behind home routers without forwarded ports, including a restrictive/CGNAT connection. Check relay connectivity and bandwidth/latency during gameplay.
6. Confirm a signed-in Steam client and game entitlement, missing DLL/Steam failure messages, and offline solo. Verify the packaged native dependencies load from ASAR-unpacked files.
7. Start the packaged build from its `.exe` (it must come back through Steam), open the overlay with Shift+Tab in the menu and in play, and check `%APPDATA%/<product>/logs/game.log` names the build and records the Steam start.

Each launch writes `userData/logs/game.log` (main process, host process, the game page's warnings and errors; the previous four launches are kept). Ask testers for it with every bug report.

References: [Valve networking](https://partner.steamgames.com/doc/features/multiplayer/networking), [Steam lobbies](https://partner.steamgames.com/doc/features/multiplayer/matchmaking), and [binding SDK setup](https://github.com/ArtyProf/steamworks-ffi-node/blob/main/docs/STEAMWORKS_SDK_SETUP.md).
