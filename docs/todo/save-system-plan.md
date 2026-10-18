# Solo and co-op save system — implementation handoff

Prepared 2026-10-17 against `0e9140f654cdcd9626fbc45b996333042c08f98b`. This is a proposed implementation plan, not an implemented save feature. See [Steam readiness audit](steam-release-readiness.md), especially F1.

## Recommended player experience

Use **one expedition format for solo and co-op, with multiple independent save slots**. The player must be able to keep a solo expedition, start a new run with friends, and keep additional runs for other groups at the same time. Every new expedition gets a new world UUID, separate world state and separate roster/inventory records. Creating or joining a run must never overwrite another run.

A player creates a named expedition, continues it alone, or hosts it for up to four players. Changing between solo and hosting resumes the selected world without resetting it. Joining someone else's expedition does not overwrite the guest's own expeditions. A slot's name is only a label; persistent identity is its world UUID.

### Save selection and new-run flow

- **Continue / Load Expedition** opens the save list, with a quick Continue shortcut for the last successfully played local expedition.
- **New Solo Expedition** creates a fresh independent slot and starts it privately. Existing solo and co-op saves remain available.
- **New Co-op Expedition** creates a fresh independent slot, then opens hosting/invite setup. Friends start a new world together rather than entering the player's existing solo run.
- **Host Saved Expedition** lets the owner choose an existing slot and lobby visibility. Show its name, island and last saved time before inviting friends.
- **Join Friends** joins a remote host's selected expedition. Show recently joined expeditions separately as host-dependent history; those entries are not locally resumable host saves.

Each local save card shows expedition name, current island, playtime, last successful save, and known party members. Allow rename and explicit deletion with confirmation; never reuse a display name as a filename or silently recycle a slot. Support at least 10 independent expeditions in the first release, with no destructive automatic replacement when storage/quota is reached. The count can be increased later; backups are separate from playable slots.

World selection and deletion must be unavailable to guests. Make it clear which run is being loaded and whether starting will be solo or hosted. Prefer a new empty slot as the default for New Game; overwriting an existing expedition must require an explicit separate action.

The host owns the world save. Friends can return later and reclaim their expedition character/inventory when the same host resumes that expedition. The host can continue without everybody present. Host departure ends the live session; automatic host migration and always-online dedicated worlds are outside the first version.

Keep the current account-wide XP/skills and earned starting-island behavior initially. Separate those from expedition inventory and shared world progression. This preserves the existing profile design instead of silently making character advancement world-specific. Settings/cosmetics are personal; graphics calibration belongs to the device. A new run resets that expedition's missions, shared store/base and inventories; under this proposed default it does not reset account XP/skills. Show that distinction in the new-run flow. Fully fresh characters per run would be a separate product decision, not an assumption implied by multiple save slots.

These are recommended defaults. Before implementation, record any product decision to use world-specific XP/skills, permadeath, or camp-only checkpoints instead; those choices change the schema and tests.

## Ownership and authority

| Data | Durable owner | Rules |
|---|---|---|
| XP, bought skills, earned starting islands, name/outfit | Each player's profile | Carry across solo/co-op as today; validated by the authoritative sim; demo/creative must not overwrite earned state |
| Resolution/render/audio/input preferences | Local player/device | Persist independently of the local HTTP port; avoid cloud-syncing hardware calibration |
| Expedition identity, island/variant, mission, relics, shared store/upgrades/base | Expedition host | All guests see the same committed world state; no guest can replace it with a local save |
| Inventory, durability/ammo, position, health/death state in that expedition | Host's roster, keyed by persistent player identity | Inventory stays in that world; never import backpack contents from another expedition |
| Network connections, current lobby, packet sequence numbers | Current session only | Recreated on load; never restored from disk |

Steam player keys must come from the native authenticated connection identity (`desktop/steam-session.js`), not a name or client-supplied Steam ID. Introduce a persistent local player UUID for offline solo. Define an explicit association flow when that player later signs into Steam; do not automatically attach an unknown offline profile to whichever account appears next.

For LAN/browser clients, use a host-issued random reconnect credential associated with a roster entry, persisted by that client; store only its verifier on the host. Names are not identity. Losing that credential requires an explicit host-approved recovery/new-character path. These are casual co-op identities, not a substitute for an authenticated competitive backend.

Only the owner can list/load/delete expedition slots or commit a save. The LAN server process owns LAN saves when it is the host. Guest clients may receive a save-status notification; they cannot upload an arbitrary world document to the host.

## Where data lives

On desktop, store versioned files under a dedicated `saves/` subdirectory of Electron `app.getPath('userData')`, outside the install/depot directory and Chromium's origin storage. Namespace by game/demo and player identity. Keep host worlds under the owning identity. Offline data gets a separate local namespace. [Electron application paths and lifecycle](https://www.electronjs.org/docs/latest/api/app).

Suggested layout (relative to the chosen save root):

```text
profiles/<identity>/profile.json
profiles/<identity>/worlds/<world-uuid>/current.json
profiles/<identity>/worlds/<world-uuid>/backups/<generation>.json
device/settings.json
```

Do not allow renderer-supplied absolute paths. Expose narrow, validated operations through preload/main IPC. Reuse trusted-main-frame checks, constrain slot identifiers, cap payload/file sizes, and serialize writes per slot. Node hosts use the same file-store logic with an explicit configured data directory.

Browser solo uses IndexedDB with equivalent logical records/transactions, plus export/import and a clear storage-error message. Keep it on a stable web origin; IndexedDB is also origin-scoped and does not fix the desktop random-port problem. Browsers can clear/evict data: offer a downloadable backup. [IndexedDB](https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API).

## What an expedition save contains

Create an explicit persistence schema, **not** `JSON.stringify(world)`, `snapshot()`, or `fullState()`. Network state is rounded, filtered and presentation-oriented; it omits private sim state needed for restoration.

The envelope should contain `schemaVersion`, `contentVersion`/map-generator revision, game build, world UUID, owner identity, mode restrictions, generation number, timestamps, current island/variant and a checksum for accidental corruption. Checksums are not anti-cheat. Use allowlisted plain data; no executable callbacks or prototype restoration.

Inventory the complete authoritative state before coding the serializer:

| Area | Persist | Rebuild/reset deliberately |
|---|---|---|
| Layout | Island/variant plus content compatibility identifier | Terrain, meshes, cave bake, layout and collision structures from the matching content version |
| Team progress | Mission phase/counters/contracts/reward claims, relics, store, upgrades, base/towers/HP/construction, completion state | UI/derived stats/collider caches |
| World mutations | Resources/fruit and regrowth, collected caches/treasure, lit wall torches, persistent traps/drops/carcasses and relevant loot/expiry state | Visual footprints/tracks, effects and expired transient entities |
| Dinosaurs | Living/dead identity, species/rank, health, position and any state necessary to preserve boss death/loot and ongoing raids | Paths, steering caches, lag-comp history; safely cancel/recover in-progress attack animation |
| Players | Stable roster key, inventory/durability/ammo, safe position/orientation, HP/death/downed status, relevant buffs/cooldowns | Socket ID/slot assignment, held inputs, reload/interaction handles, prediction history |
| Scheduling | Sim time, raid state, eruption state, remaining build/regrowth/expiry/buff/downed timers | Wall-clock catch-up: offline worlds do not simulate or kill players while closed |

For every transient state define a safe normalization rule: cancel a reload without consuming/granting extra ammo; cancel butcher/revive interactions without awarding loot; discard flying projectiles without refunding spent ammunition; preserve dead/downed consequences rather than granting a free full heal. Persist dropped gear that could otherwise be lost by normalization. Restore a player out of solid geometry using validated nearby placement; do not use unsafe saved coordinates blindly.

Maps are deterministic for the same content, but simulation spawns/AI currently use randomness. Saving only the island seed is insufficient. Persist actual mutable entities; introduce serializable RNG state where continuation matters or document intentional re-seeding for future random decisions. Exact animation/path replay is unnecessary; duplication, resurrected bosses and repeated rewards are unacceptable.

`world.nextLevel()` currently resets island state. Save before departure and after the new island is fully initialized, but expose only complete committed generations. Restoring must not call constructors/start hooks that award rewards or duplicate starting items before applying saved state. Validate/rebuild derived state before admitting players or ticking.

## Save lifecycle and crash recovery

1. Capture an immutable document at a sim tick boundary so loot transfers, inventory, mission rewards and roster changes belong to one coherent checkpoint. Disk I/O runs outside the tick; measure capture cost and bound it.
2. Autosave dirty worlds about every 60 seconds and after meaningful checkpoints (travel complete, boss/relic/mission completion, major base upgrades, player departure). Coalesce bursts. Save & Quit requests a final checkpoint and waits for a durable result before normal teardown.
3. Use one in-flight write per slot, monotonically increasing generations, and reject stale completion. Never let an older autosave overwrite a newer manual/quit save. Add a single-writer lock for multiple processes/instances.
4. Validate/encode, write a temporary file on the same volume, flush/close, then replace the committed generation with platform-tested semantics. Retain 3–5 known-good generations. Fault-test each stage on Windows; do not assume rename alone guarantees survival of every power failure.
5. On load, validate schema, limits, checksums and cross-references before publishing the world. Recover the newest valid generation, preserve corrupt originals for diagnosis, and tell the player what was recovered. An unsupported future schema must never be overwritten by an older game.
6. Show last successful save time and actionable errors (disk full, permissions, quota). Never display Saved before persistence acknowledges success. Failed writes leave the old save usable and retry with bounded backoff.

Autosave bounds expected crash rollback to the last successful checkpoint; it cannot promise zero lost progress after sudden power loss. Do not rely on window unload/quit events for correctness. The worker-to-page bridge must stay alive until save acknowledgement during ordinary Save & Quit.

## Solo, guests and progression consistency

Both `src/sim/worker.js` and `server/gameHost.js` should call the same pure export/restore API. Solo Worker exports authoritative state to a coordinator that commits it through the desktop bridge or browser adapter. Node/Steam hosts commit directly through their host coordinator. Renderer views never become the authoritative source of a save.

Keep disconnected roster records without keeping a live sim player/socket. Before current `world.leave` discards player data, retain the authoritative record. Specify how leaving players' inventory is handled; recommended default is a dormant roster backpack with no simultaneous world drop. On reconnect, attach exactly once and consume no second starter loadout. Apply death/drop consequences before marking dormant. Re-test travel for absent players: reconcile old-island positions and explicit travel resupply rules once.

At join, sanitize the guest's current personal profile as today; the host's old roster must not overwrite a newer personal profile. Inventory comes solely from that world's roster. Profile revisions are per identity/writer and cannot be compared across independent hosts as a single global clock. Avoid blindly taking maximum XP plus the union of bought skills; that can violate point budgets and cannot resolve refunds.

Persist validated personal-profile updates promptly on the player's device, separately from world checkpoints. Host world state must remember completed rewards so normal reconnect/load does not award them again. Restoring an older world backup while retaining newer account XP can still permit reward replay. With local, host-controlled saves this is a casual-game rollback limitation; document it. If strict replay protection becomes a requirement, add stable reward IDs and a per-player durable receipt ledger, define branch/restore semantics and test cross-file/crash reconciliation before claiming exactly-once rewards. Do not promise competitive integrity without a trusted backend.

Guests cannot continue a host's expedition while the host is absent unless an explicit future export/ownership-transfer feature is built. If added, fork to a new world UUID and show that the expeditions diverge; do not silently merge inventories or shared progress.

## Migration and Steam Cloud

First fix desktop profile/settings storage and migrate existing data where accessible. Detect a usable legacy profile in its original origin and offer/import it once; record migration and keep a backup. Do not promise automatic recovery of every historical random-port origin without a tested discovery/export mechanism. Browser exports and explicit file imports need the same validation as ordinary load.

Use pure sequential migrations (`v1 -> v2`) with committed fixtures and pre-migration backups. Version map content independently: changed resource/layout IDs need mappings or an explicit incompatibility/recovery policy. Never silently regenerate a changed island while carrying impossible coordinates/object references.

Add Steam Cloud only after local save/recovery works. Sync personal progression and owner-world records under appropriate per-account paths, exclude temporary files/locks/logs and device calibration, and size quotas against measured saves. Test two PCs, offline divergence, conflict selection, interrupted sync and deleted slots; deletion needs an intentional propagation policy. Cloud is replication, not a concurrent-world database: refuse concurrent writes to one world and preserve conflicting copies instead of merging them automatically. Auto-Cloud versus remote-storage API is an implementation choice. [Steam Cloud configuration and testing](https://partner.steamgames.com/doc/features/cloud).

## Desktop and Steam runtime gaps (review 2026-10-18)

Reviewed against `747680d`. The data rules above are sound; these points cover how the current desktop runtime is laid out and must be decided before phase 1.

1. **Choose where the desktop sim runs.** Today desktop solo runs in a renderer Web Worker (`src/sim/worker.js`), while a Steam host runs `startGameHost()` in the Electron main process (`desktop/steam-session.js`). "Continue A alone, then host A" therefore means stopping one runtime and restoring the save in a different one, with save documents moving renderer -> IPC -> main. Recommended: on desktop, always run the authoritative sim in one host process owned by main, so solo is a hosted world with a closed lobby. Then hosting is only lobby visibility, saves never pass through the renderer, and one coordinator owns every desktop write. Run that host in an Electron `utilityProcess` (or `worker_threads`), not on the main thread: capturing and stringifying a large world on the main thread stalls the 4 ms Steam pump, IPC and window events. The browser build keeps the Worker + IndexedDB path.
2. **Always-on LAN host.** `desktop/main.cjs` creates a game host listening on `0.0.0.0` at startup, and that world belongs to no slot. Define which expedition the LAN host serves: create it only when the owner hosts a selected slot, and never save an unowned world. Otherwise a LAN guest can create durable state in a world the owner never chose.
3. **Final save on quit.** `before-quit` currently stops Steam, the host and the server synchronously. Save & Quit must flush first: `event.preventDefault()`, request the final checkpoint, wait for the durable acknowledgement with a bounded timeout (for example 5 s), then tear down Steam and the host. Handle closing the window with X the same way. Steam's library "Stop" button, Windows shutdown and crashes still skip this, which is why autosave stays the real guarantee.
4. **Single instance.** `main.cjs` does not call `app.requestSingleInstanceLock()`. Add it (focus the existing window on a second launch, and forward `+connect_lobby` invite arguments to it) in addition to the per-slot file lock. A second instance with the same userData and Steam account is the most likely way to get two writers on one world.
5. **Steam identity is the namespace in Steam builds.** The owner of the host's own roster entry and the `profiles/<identity>/` folder must be the local Steam ID from `getStatus().steamId`, for solo too, so a run started solo and later hosted keeps the same owner key. The offline UUID is only for browser/dev/no-Steam runs. Do not mix the two: if a Steam build starts without Steam, either call `SteamAPI_RestartAppIfNecessary` (currently not called in `desktop/steam.cjs`) in packaged builds or show the saves as unavailable, instead of opening an empty offline namespace that looks like lost progress. Keep the explicit association flow from "Ownership and authority".
6. **Remote players are keyed by Steam ID, shown by persona name.** Store `identityRemote` as the key with a cached display name. Refresh names from Steam when available, because persona names change and are not unique.
7. **Demo vs full game.** The demo is the same executable with `--demo`, so it shares Electron userData with the full game. Decide whether demo progress carries over on purchase (a common player expectation). If it does, define a one-way import from the demo namespace with the same validation as a normal load. A separate demo App ID has separate Steam Cloud storage, so carry-over can only use local files. Demo limits (island 1, two players, no firearms or skills) must be revalidated on import.
8. **Steam Cloud specifics.** With Auto-Cloud, the root is `WinAppDataRoaming` with a subdirectory such as `Dinosaur Island/saves/profiles/{64BitSteamID}`. Use the `{64BitSteamID}` path token so each account syncs only its own folder, and never match the Chromium files in the same userData. Exclude `backups/`, temp files and locks with patterns. Backups multiply the file count and quota, and syncing them can resurrect deleted slots. Auto-Cloud syncs only at launch and exit, so a mid-session crash on PC 1 followed by play on PC 2 is the normal conflict case. Steam's own conflict dialog chooses whole file sets, so slots must stay self-contained and readable whichever side wins. If Steam Deck/Proton is promised, add a Linux root override that maps to the Proton prefix.
9. **Steam branches and updates.** Switching to a beta branch and back is the realistic way a newer schema reaches an older build. Show future-schema slots as "needs a newer version" instead of hiding them, and never rewrite their list metadata. Keep the existing `STEAM_PROTOCOL` bump policy linked to save/content versions, so a host never admits guests whose build cannot represent the restored world.
10. **Invites while a slot is not loaded.** A friend accepting an invite, or launching through `+connect_lobby`, must not create, overwrite or autoload one of the guest's own slots. The host side of an invite always reflects the slot that is currently hosted. Lobby metadata can carry the world UUID and expedition name, so guests see "recently joined" history without any host data being stored as a local slot.
11. **Future Steam achievements and stats are account-level.** They are naturally idempotent, but restoring a backup can make players eligible again for world rewards (see the replay note above). Award achievements from personal profile milestones, not from world events that a rollback can replay.
12. **Simulation randomness.** The sim uses `Math.random()` in about 30 places (`dinos.js`, `raids.js`, `volcano.js`, every AI brain). The "documented re-seeding" option is the realistic default for version 1. List explicitly which decisions must not be rerolled across a load (boss loot, raid composition already announced, cache contents) and persist their results.

## Implementation phases and code ownership

1. **Stable personal storage:** first record the decisions from "Desktop and Steam runtime gaps" (where the sim runs, Steam identity namespace, single instance, demo carry-over); then add desktop save store/IPC and client persistence adapter; migrate profile/settings/unlocks; establish player identity. Pass packaged restart/account-isolation tests before world saves. Suggested modules: `desktop/save-store.cjs`, `desktop/save-ipc.cjs`, `src/client/core/persistence.js`.
2. **Pure schema/export/restore:** suggested `src/shared/saveSchema.js`, `src/sim/worldSave.js`; inventory every field with the owning subsystem, validate documents, restore without reward/spawn side effects. Keep Node/browser I/O out of `src/sim`.
3. **Solo checkpoints and multiple slots:** integrate Worker/coordinator, IndexedDB/desktop adapters, save-list metadata, independent UUID-based slots, New Solo/New Co-op/Load/Host Saved flows, rename/delete, Save & Quit, dirty tracking and errors. Resume through every island before co-op integration. Rebuild list metadata from valid slot documents if a cached index is corrupt; cache failure must not erase saves.
4. **Host persistence and reconnect:** suggested `server/saveCoordinator.js`; integrate `server/gameHost.js`, `desktop/steam-session.js` identity binding and dormant roster lifecycle. Resume the same world solo or with friends, with fresh networking epochs/connections.
5. **Recovery/compatibility:** atomic-generation fault tests, backups, migrations, old-content handling, import/export, UI and performance/soak validation.
6. **Cloud and release acceptance:** configure only after file schema stabilizes; test real Steam accounts/machines and the exact depot-installed build. Update the release readiness evidence.

Before changes, read each affected `package-info.md`; update it when adding files/rules. Coordinate single-writer edits to `world.js`, `game.js` and `hud.js`; prefer small integration hooks plus owned modules. Follow the mandatory test-coverage skill and existing feature-worktree/push rules. This plan does not authorize game implementation. The owner subsequently authorized pushing these planning documents and opening a PR.

## Required acceptance tests

- Create a solo run A, a friends run B and a second group run C; progress each differently, restart, then load each. Island, missions, base, party roster and inventories remain independent. New Game and joining a remote host never overwrite A/B/C.
- Create at least 10 expeditions; duplicate names, renames and deletion affect only the selected UUID. Deleting one run preserves every other run and account profile. Backups never appear as duplicate playable slots. Storage-limit errors never trigger automatic replacement.
- Host B, then continue A alone, then host B again with returning friends: each run resumes its own saved state. Recently joined remote worlds identify their owner and cannot be mistaken for locally resumable worlds.
- Round-trip authoritative fixtures covering all four islands, completed/partial missions, killed bosses, lit torches/caches, loot, base/towers, raids, timers and every roster state. Assert next actions behave correctly after restore, not just JSON equality.
- Save during deposit/give/butcher/reward/travel/disconnect: no duplicated or vanished owned items, extra rewards or partial island transitions. Generate post-load network state through normal join paths.
- Fresh session IDs/epochs, empty input/history and valid entity-ID allocation after restore; reject old packets and duplicate identity/reconnect attempts.
- Continue alone -> host same world -> guest leaves -> close host -> restart -> guest rejoins: team world and correct per-player backpacks survive without a second starter kit.
- Player joins another host and returns: personal progression follows the stated profile policy; expedition inventory stays with each world. Duplicate names cannot reclaim another player's roster.
- Crash at every write/replace stage, out-of-order save completion, two simultaneous instances, disk full, read-only path, oversized/malformed saves and corrupted latest generation: retain or recover a valid checkpoint with an honest message.
- Old schema migrations and future-schema refusal, changed map revision, demo/full separation, creative isolation and legacy profile import without deleting the source.
- Packaged Windows restart on different local ports; clean install/update; browser quota/export/import; one-hour repeated autosave/travel/reconnect soak with measured save latency/size and no growing memory.
- Steam desktop: Save & Quit through the menu and through the window X both persist the latest checkpoint before Steam/host teardown; a second launch focuses the first instance; a Steam build started without Steam never shows an empty profile as if progress were lost; an invite accepted from a closed game opens the host's world without touching the guest's slots; while hosting, capturing a save causes no visible hitch on host or guests (record the time spent per save).
- Two Steam accounts on one Windows login and two Windows users: each sees only their own expeditions and profile; demo and full game follow the recorded carry-over decision.
- If Cloud enabled: two PCs/offline conflict, stale backup restore, account switch and deletion. Attach build IDs, actual outcomes and logs; fake Steam tests alone are insufficient.

Definition of done: a player can keep multiple independent solo/friend-group expeditions, create a new run without replacing existing saves, and resume a selected expedition alone or with returning friends, with correct shared progress and personal inventory, durable personal settings/progression, tested recovery, and explicit limits on host absence and crash rollback.
