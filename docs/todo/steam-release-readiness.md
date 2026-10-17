# Steam release readiness and next-agent handoff

Audit date: 2026-10-17 (Europe/Berlin). Source revision: `0e9140f654cdcd9626fbc45b996333042c08f98b`.

## Verdict and scope

**Do not sign off this revision for a public Steam launch yet.** There is a substantial Steam implementation, but release configuration is incomplete in this checkout, desktop persistence has a strong source-level defect, a progression playtest override is enabled, and packaged/native Steam acceptance evidence is missing. This is an engineering recommendation, not a Valve rejection.

This audit reads source, existing tests and historical reports, checks official documentation, and runs the focused checks recorded below. It does not change game code, upload a depot, modify Steamworks settings, or certify performance. Steamworks partner account configuration, current store page, commercial asset entitlements and Valve approvals were not accessible. An absent ignored SDK DLL in this worktree does not prove an existing private release artifact lacks it.

Priorities: **P0** resolve before release-candidate sign-off; **P1** resolve or explicitly accept with evidence before public launch; **P2** useful hardening or optional product work. Distinguish Valve requirements from engineering recommendations throughout.

## What already exists

- Windows Electron packaging, local assets, native dependency ASAR unpack rules, SDK DLL resource mapping and a release preflight (`package.json`, `scripts/verify-steam.cjs`).
- Steam lobbies, friends, invitations, P2P/relay setup, membership/capacity/protocol checks, callback pumping and cleanup (`desktop/steam-session.js`, `desktop/steam.cjs`).
- Sandboxed, context-isolated renderer and restricted IPC/navigation (`desktop/main.cjs`, `desktop/steam.cjs`).
- Fake-Steam tests using the real authoritative game host and client transport; documented manual testing in [steam-coop.md](../steam-coop.md).
- Profile validation, corrupt/blocked storage tests, input focus handling, audio attribution and asset provenance. These must be preserved.

## Findings and implementation tasks

### F1 — P0: desktop storage changes origin across launches

**Evidence:** `desktop/main.cjs:21-29` requests port `0` by default and opens `http://127.0.0.1:<assigned-port>/`. Profile, settings and earned island progress use localStorage (`src/client/core/profile.js:14-31`, `settings.js:32,54`, `islandProgress.js:12`). Storage belongs to an origin, including its port. A subsequent launch on another port reads another storage namespace: saved progression/preferences are expected to appear missing. Existing fake-storage round trips cannot detect this desktop boundary. This is a strong static inference; packaged reproduction is still required. [Browser storage semantics](https://developer.mozilla.org/en-US/docs/Web/API/Window/localStorage).

**Task:** reproduce first, then introduce stable desktop persistence, preferably versioned, atomic userData-backed saves exposed through narrow trusted IPC, or a deliberately stable application origin. Plan migration/recovery for existing localStorage profiles. Simply fixing a port creates port-conflict/instance issues and needs its own handling. Decide whether saves belong to the Steam identity or Windows user; do not silently share different players' profiles.

**Acceptance:** earn XP, buy skills, earn an island unlock, change audio/FOV/name/outfit; fully quit and relaunch repeatedly with different HTTP ports and after an update. Retain intended data. Test corrupt files, interrupted writes, forced termination, two Steam accounts on one Windows login and two Windows users. Distinguish persistent profile from intentionally session-only expedition/world state.

### F2 — P0: release configuration/preflight is blocked

**Confirmed:** `desktop/steam-config.json:2` contains `null`; the SDK runtime is absent from this fresh worktree. `node scripts/verify-steam.cjs` exits **1**, requesting the App ID and DLL. `npm run build:steam` includes that gate; `build:win` bypasses it (`package.json:18-20`).

**Task:** obtain actual app/depot IDs from the owner, configure the real ID, and supply the licensed SDK redistributable through the ignored SDK path. Use `build:steam` for release artifacts. Add a post-package check for the DLL, native binding/Koffi files, local Three.js addons, model/audio/font/cave assets and required notices. The existing verifier only checks source configuration and DLL existence, not DLL architecture/version, packaged completeness or working Steam initialization.

**Acceptance:** build reproducibly from the lockfile, upload the complete `dist/win-unpacked/` tree, install through Steam on a clean Windows machine without Node, npm, SDK or a source checkout, and successfully launch/play/exit with native co-op. Never ship App ID 480 or `steam_appid.txt`. Keep SDK/download/upload credentials outside source and logs. [Steamworks API setup](https://partner.steamgames.com/doc/sdk/api), [uploading builds](https://partner.steamgames.com/doc/sdk/uploading).

### F3 — P1: all-islands playtest bypass is enabled

`src/client/core/islandProgress.js:7-9` explicitly says to disable temporary access for release, yet `TEST_ALL_ISLANDS_UNLOCKED = true`. Lines 46-51 bypass earned starting-island restrictions. Current tests deliberately cover that override; a green test is not proof of the intended release policy.

**Task:** disable it for production or obtain an explicit product decision that all islands should remain selectable. Add a release-configuration guard if separate developer access is retained. **Acceptance:** a clean normal profile starts on the intended island; earned travel persists unlocks; browsing previews/creative/debug entry cannot accidentally grant earned progression; demo restrictions still hold.

### F4 — P1: real Steam/overlay/launch behavior is unproved

`desktop/main.cjs:30-61` creates the BrowserWindow before `desktop/steam.cjs:22-25` initializes the SDK. Valve recommends initialization before the graphics device for overlay hooking and documents special limitations for browser rendering. This ordering raises a validation risk; it does **not** establish that overlay is broken in a Steam-launched Electron build. [Overlay requirements and browser FAQ](https://partner.steamgames.com/doc/features/overlay).

No Steam restart-if-needed or single-instance/second-instance handling was found in desktop code. Init failure intentionally permits solo/LAN fallback. Decide the desired Steam-distribution launch behavior before changing it; DRM and a hard ownership gate are not assumed mandatory.

**Task/acceptance:** test packaged Steam launch, Shift+Tab, notification rendering and return to pointer lock; accepting invitations with the game running and closed; direct executable launch; Steam stopped/offline/restarted; second launch while a session exists. No stuck movement/firing, duplicated hosts or swallowed invitations. Investigate initialization ordering and binding-supported restart handling if these fail. Avoid a renderer rewrite until a measured incompatibility warrants it. [API lifecycle/restart guidance](https://partner.steamgames.com/doc/sdk/api).

`test/steam-coop.test.js` uses a fake service. It does not prove DLL loading, native FFI compatibility, relay/NAT traversal, firewall behavior or real callback delivery. Execute the real-account matrix below before claiming working 1–4-player online co-op. [Steam networking](https://partner.steamgames.com/doc/features/multiplayer/networking).

### F5 — P1: fourth island and release hardware are outside current performance evidence

`scripts/performance/browser.mjs:77` and `simulation.mjs:22` hard-code `level < 3`, omitting Hollow Mountain. The October 9 historical report in `docs/performance-testing.md:131-152` records Swamp p95 15.0 ms and Volcano p95 17.2 ms, both failing the project's 120 FPS target; it also records long simulation maxima. Subsequent changes may alter those results. These are historical diagnostics, not current release measurements or a universal Steam FPS requirement.

**Task:** include every released island and representative cave/torch/diving, boss, raid and four-player combat scenarios. Measure the packaged Electron runtime on proposed minimum/recommended hardware; publish defensible requirements. Record cold startup/shader hitches separately from steady state, p50/p95/p99, stalls, CPU/GPU, RAM/VRAM and network/tick latency. Run a 1–2-hour travel/lobby soak. Preserve [performance-testing.md](../performance-testing.md) workload validity rules; no software-GPU or headless result proves display-delivered FPS.

### F6 — P1: Windows packaged-build regression coverage is missing

`.github/workflows/ci.yml:24,32,60,63` runs Ubuntu Node checks with Electron download disabled. It cannot exercise a Windows native executable or Steam overlay. Add an appropriately scoped Windows package/start/asset/exit smoke check and artifact manifest. Real-account acceptance remains a separate manual gate. Cross-engine tests can skip unavailable engines; inspect skip reasons rather than treating all-green as every-runtime proof.

### F7 — P1: finish shipped-asset rights and disclosure verification

`assets/fonts/LICENSE-Baloo2.txt:1-2` contains attribution and a link, not the complete upstream copyright/license notice. Retrieve the exact notice accompanying the shipped font and include it as required by its distribution terms. [Official SIL OFL text, condition 2](https://openfontlicense.org/open-font-license-official-text/).

Existing audio credits, source manifests, Quaternius license and firearm MIT notice are present; this is not a general absence-of-credits finding. Verify their inclusion and visibility in the final package. Preserve Electron/Chromium and dependency notices. Maintain an asset inventory with source, modifications, license and permission evidence.

`assets/audio/CREDITS.md` identifies ElevenLabs-generated sounds under account terms. The owner must verify commercial entitlement applicable at generation time; source cannot establish subscription history. Audit all shipped generated artwork/audio/models/text, including retained unused assets actually included in the depot, and complete Steam's AI disclosure accurately. AI-assisted coding alone is not sufficient evidence that every game asset is AI-generated. [Content Survey, including AI content](https://partner.steamgames.com/doc/gettingstarted/contentsurvey).

### F8 — P2: explicitly scope optional features and compatibility

- Windows directory packaging is configured; native Linux/macOS packages are not. Start with a truthful Windows platform claim. Proton compatibility and native Linux support are separate questions.
- Input is keyboard/mouse with fixed bindings (`src/client/input/input.js:4-30`); no gamepad/Steam Input implementation was found in the inspected source. Rebinding and invert-Y are useful improvements. Controller support and Deck verification need end-to-end work if promised, not merely a mapped movement stick. [Deck/Steam Machine compatibility criteria](https://partner.steamgames.com/doc/steamhardware/compat).
- Steam Cloud, achievements and host migration are not implemented in the audited paths and are not universal requirements for Steam release. Session-only worlds and host-loss behavior are documented in `docs/steam-coop.md:37`; explain that product behavior clearly. If adding Cloud, first fix F1 and define portable per-user save files, migrations, sync conflicts/offline operation; do not blindly sync the entire Chromium profile. [Steam Cloud setup/testing](https://partner.steamgames.com/doc/features/cloud).
- `desktop/steam-session.js:9` uses a fixed protocol identifier. Define compatibility policy and bump it when incompatible network/world rules change; test old/new builds. A package version need not reject otherwise compatible peers.
- The desktop HTTP server listens on all interfaces for LAN (`main.cjs:24`). Test the intended LAN access policy and local-control endpoint restrictions. Decide whether developer-facing internet-tunnel/debug options belong in production. The temporary Cloudflare test service is not a substitute for validated Steam co-op.
- Add user-visible launch failure reporting and persistent diagnostic logs with release version/build ID; inspect renderer/GPU crash recovery. Source currently logs startup errors and quits (`main.cjs:65-68`). Collect only necessary data and document any future telemetry.

## Steamworks owner checklist — account state is unverified

These tasks often live outside Git. Record screenshots/checklist status without exposing banking, tax information or credentials.

| Gate | Work to complete | Official documentation |
|---|---|---|
| Partner onboarding | Agreements, identity, banking/tax verification, app fee, actual application ownership and release permissions. Confirm the application's eligible release date in the dashboard. The onboarding page retrieved on this audit date states a 21-day fee wait for initial titles; historical guidance commonly said 30 days. Recheck the live account/docs before scheduling. | [Onboarding](https://partner.steamgames.com/doc/gettingstarted/onboarding), [app fee](https://partner.steamgames.com/doc/gettingstarted/appfee) |
| Public store | Correct name, coherent current feature list, genre/tags, supported OS/languages, evidence-based requirements, price/regions, support contacts and genuine gameplay media. Prepare current required capsules, library art/icons, screenshots and trailer; use the current asset templates/dimensions. | [Assets](https://partner.steamgames.com/doc/store/assets), [asset rules](https://partner.steamgames.com/doc/store/assets/rules) |
| Content and rights | Complete truthful violence/mature-content/AI answers for the actual uploaded build; obtain any required regional ratings. Germany requires a valid rating for visibility; do not invent a USK rating. | [Content Survey](https://partner.steamgames.com/doc/gettingstarted/contentsurvey), [Germany rating process](https://partner.steamgames.com/doc/gettingstarted/contentsurvey/germany) |
| Distribution configuration | Windows depot, architecture/OS filters, correct executable/working directory, required runtime prerequisites, package ownership and beta branch. Test accounts must own the relevant app AND depot; Dev Comp privileges can hide customer-package mistakes. | [Uploading](https://partner.steamgames.com/doc/sdk/uploading), [testing/package access](https://partner.steamgames.com/doc/store/testing), [common redistributables](https://partner.steamgames.com/doc/features/common_redist) |
| Valve review | Store and build checklists both need approval. Submit store presence before build review; the reviewed build must launch on every advertised OS and contain advertised features. Typical reviews take 3–5 business days; allow at least 7 business days per review and time for corrections. | [Review process](https://partner.steamgames.com/doc/store/review_process) |
| Release timing | Public Coming Soon presence for at least two weeks, approvals and the account's wait period complete. Release is a deliberate dashboard action, not automatic on the date. Confirm responsible person and permissions. | [Release process](https://partner.steamgames.com/doc/store/releasing) |
| Demo, if launching one | Demo is a separate associated App ID with its own depot/build/checklist. Configure its launch arguments/build identity so `--demo` restrictions cannot be omitted accidentally. Test two-player cap, allowed content and full/demo lobby separation through Steam. | [Steam demos](https://partner.steamgames.com/doc/store/application/demos) |

## Required release test matrix

Run against the **exact Steam-installed release candidate**, with its Git SHA, Steam build/depot manifest IDs, executable hash/version, OS, GPU/driver, settings, accounts, steps, expected/actual results and logs/video recorded. Every row starts **UNVERIFIED** until evidence is attached. Where meaningful, automate deterministic regressions; reserve hardware/native/account checks for their real runtime.

| ID | Scenario | Pass condition / evidence |
|---|---|---|
| T01 | Clean standard-user Windows install; no development tools; paths with spaces/non-ASCII; online and offline solo | Steam launches correct executable; complete assets/audio/cave bake; no admin requirement, unhandled errors or external asset dependency |
| T02 | Steam update, file verification, uninstall/reinstall and previous-version upgrade | Correct files/manifests; intended saves preserved; no stale DLLs or unintended reset; record uninstall save policy |
| T03 | Persistence across quit, crash, restart, update and account changes | F1 acceptance passes, including corrupt/blocked storage; profile and world-persistence expectations documented |
| T04 | Complete solo expedition through all four islands and ending | Travel, relics/missions, inventory/crafting/upgrades, XP/skills, cave traversal/diving, bosses, death/revive/respawn and victory work without softlocks |
| T05 | 2, 3 and 4 physical Steam clients/accounts; private/friends/public lobbies | Correct discovery, admission, shared authoritative gameplay, late join and travel; fifth player rejected cleanly |
| T06 | Friends invitations with game open/closed; second launch; stale lobby; demo/full; incompatible builds | Correct session launch/join or useful rejection; no duplicate hosts or wrong-mode admission |
| T07 | Different residential networks, CGNAT/restrictive NAT, relay path, Wi-Fi loss/change, latency/jitter/loss | Successful documented connectivity paths; bounded timeouts; no endless loading, corrupted progression or permanent stuck lobby |
| T08 | Host quit/crash, guest quit/rejoin, Steam restart/offline, Windows sleep/resume | Clear disconnect/recovery UI; cleanup works; expected session loss explained; subsequent fresh host/join succeeds |
| T09 | Shift+Tab during movement/firing/dialogs; Alt-Tab, Windows lock, focus loss | Overlay and game remain usable; held actions release, pointer lock recovers, no accidental firing or stuck input |
| T10 | US/German keyboard; 720p/1080p/1440p/4K, ultrawide, multiple displays, Windows DPI 100/150/200% | Readable menus/HUD, usable dialogs/hotbar, no clipped controls; prompts match actual input |
| T11 | Audio mute/volume persistence; device unplug/switch; first-run audio | Correct levels/music/effects, no excessive clipping; recoverable device changes; credits readable |
| T12 | All islands on minimum/recommended hardware; combat/cave/raid; cold load vs warm play | Meets declared product budgets; record frame/tick/network percentiles and stalls; no unsupported 120 FPS claim |
| T13 | 1–2-hour play; repeated island travel, menu return and lobby enter/leave | No unbounded RAM/VRAM/handle/socket/resource growth, orphaned helpers, stuck Steam Running state or recurring crash |
| T14 | Controller-only and real Deck/Proton, only if promised | Every menu/text entry/gameplay action works, readable handheld UI, suspend/resume; satisfy applicable compatibility criteria |
| T15 | Final depot/store consistency and notices | Correct OS/languages/features/screenshots, rights/credits/AI survey, no development App ID/secrets/dev artifacts; install customer package, not only Dev Comp |

Add representative external testers through legitimate package access or a dedicated playtest; record usability/softlock reports. Four local WebSocket bots do not establish four real Steam clients.

## Next agent execution order

For the detailed proposed solo/co-op persistence architecture, ownership rules, implementation phases and acceptance tests, read [Save system implementation plan](save-system-plan.md). It extends F1 into resumable host-owned expeditions; that feature is not implemented by this audit.

1. Reread `AGENTS.md`, relevant directory `package-info.md` files, [Steam integration guide](../steam-coop.md), [performance guide](../performance-testing.md) and `.claude/skills/test-coverage/SKILL.md`. Use a dedicated feature worktree; this audit worktree has no implementation changes. Reconfirm findings against the latest main before editing.
2. Reproduce/fix F1; resolve F3 release progression policy. Protect the observable behavior with meaningful tests and a packaged restart test.
3. Resolve F2 with owner-supplied public IDs and privately supplied SDK. Add post-package verification/Windows smoke coverage; finish F7 notice/provenance work.
4. Upload a private test candidate using repeatable SteamPipe configuration, then run T01–T11 with real accounts and address F4 failures. Publishing/uploading credentials and actual release decisions stay with the authorized owner.
5. Extend performance scenarios to island four, measure T12/T13, and set truthful hardware/features/OS claims. Complete any optional features actually promised.
6. Finish Steamworks owner gates, run final regression/release-candidate tests, attach evidence and a rollback plan, then submit the appropriate near-final build for Valve review. Only release after owner authorization and actual sign-off.

Before any future code submission run `npm test` and `git diff --check`; before any authorized push also run `npm run test:coverage` and `npm run coverage:gaps`. Preserve `.c8rc.json` complete-source floors: 69% lines/statements, 83% functions, 88% branches. Passing those floors is not full coverage or Steam acceptance. The original audit request did not authorize a push; the owner subsequently authorized submitting both handoff documents in docs/todo as one PR.

Keep a known-good Steam build ID and save schema compatibility notes. Validate rollback on a private branch before launch; an executable rollback must not silently destroy saves written by the newer version. Arrange launch-day crash/support monitoring and a tested patch procedure.

## Audit validation record

- Read-only source/configuration review and official web documentation checked on the audit date; two read-only subagent reviews informed the findings.
- Runtime environment: Node `v22.20.0`, Windows. `npm ci --no-audit --no-fund`: **PASS, exit 0**, 353 packages installed; shared agent skills linked. Dependency deprecation warnings were emitted; they are not a measured vulnerability audit.
- `node scripts/verify-steam.cjs`: **FAIL, exit 1**, missing real App ID and SDK runtime as described in F2. This is an actionable release-preflight result, not a regression introduced by this document.
- Focused suite: `node --test test/steam-coop.test.js test/island-progress.test.js test/skills-ui.test.js` — **PASS, exit 0**, 29 tests passed, 0 failed, 0 skipped (about 17 seconds). These tests use fake Steam/storage and do not reproduce native packaging/persistence.
- Submission validation: `npm test` — **PASS, exit 0**, 669 passed, 3 skipped, 0 failed (672 total). Skips: unavailable Firefox/WebKit executables and an existing disabled legacy cave test. Current Hollow Mountain tests still ran; the legacy skip is not a skip of every cave test.
- `git diff --check`: **PASS**; the handoff's whitespace was also checked explicitly because a new untracked file is outside the ordinary diff.
- At the initial audit, full `npm test` and complete-source coverage were not run; submission checks are recorded in the PR. Packaged executable, real Steam clients, store/account settings and hardware FPS acceptance remain unvalidated. Historical reports are explicitly labeled above.
- Submission scope: this audit and the accompanying save-system plan in `docs/todo/`. The owner subsequently authorized committing/pushing these documents and opening one PR. No game fixes, Steam uploads, releases or account modifications are included.
