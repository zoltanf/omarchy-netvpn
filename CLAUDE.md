# omarchy-netvpn — agent notes

Omarchy shell plugin `zoltanf.netvpn` ("Network + VPN"). It combines Omarchy's
`omarchy.network` bar widget with jkoestinger/omarchy-vpn. The public GitHub
repo is `zoltanf/omarchy-netvpn`, created 2026-09-27. README.md covers
features, install, keys and IPC; this file covers what a future agent needs on
top of that.

**Public repo:** keep home-network details, SSIDs, IPs, VPN profile names and
screenshots of the author's machine out of it.

## State (2026-09-27)

- v0.1.0 works on the author's Omarchy 4.0.4 laptop. It is installed there as
  a **symlink** `~/.config/omarchy/plugins/zoltanf.netvpn` → this checkout,
  and enabled in place of `omarchy.network`.
- Verified live: popup renders, the keyboard walk crosses network ⇄ VPN in
  both directions, the gear view opens and closes, connect/disconnect through
  IPC, the badge shows while connected, the tooltip works, and the
  `shell toggle omarchy.network` keybind route alternates open/closed.
  Disabling the plugin restores `omarchy.network` in the same slot.
- Tests: `node tests/run.js` (NetVpn.js, 35) and `node vpn/tests/run.js`
  (vendored, 147).
- v0.3.0 (same day): new order (details, Wi-Fi, band, VPN, DNS), public IP
  in details, details not foldable, Wi-Fi fold decided per open (folded while
  Wi-Fi is connected), a switch per VPN row instead of the master switch,
  stable VPN row order. Verified live: layout, keyboard on/off of a VPN row
  (cursor stays on the row), and unfolding the Wi-Fi list by keyboard. The
  "Wi-Fi disconnected → list unfolded" path was not exercised live: it would
  drop the machine's connection.
- v0.2.0 (same day) added foldable sections. Verified live: folding and
  unfolding by keyboard, summaries, the cursor parking on a folded header,
  persistence across a shell restart, and a settings write not closing the
  popup. Mouse clicks on headers were not exercised (no pointer injection
  tool; `wtype` is keyboard-only).

## How it hangs together

- `manifest.json` has `"omarchy": {"clonedFrom": "omarchy.network"}`. That one
  field makes the shell resolve `omarchy.network` (keybind, `shell toggle`,
  `summon`) to this plugin. It also lets it summon `omarchy.wifiqr` and
  `omarchy.speedtest` (`pluginCloneMaySummon` in Omarchy's shell.qml); without
  it the QR code and speed test buttons would be refused. `plugin enable`
  swaps it into the `omarchy.network` bar slot, and `plugin disable` puts the
  stock widget back.
- The bar overwrites `moduleName` with the entry id at load, so
  `saveSetting` → `updateEntryInline(moduleName)` writes this plugin's own
  `shell.json` entry even though the QML says `"omarchy.network"`.
- Vertical keyboard movement: `moveVertical` tries `moveWithin` (VPN rows,
  band auto/pills, Wi-Fi rows), then steps to the neighbour in `stopOrder`
  (`NetVpn.stopOrder`). To add a section, add it there and to `enterStop` /
  `moveWithin`; do not reintroduce per-section if-chains.
  `onStopOrderChanged` → `normalizeFocus()` moves a stranded cursor.
- The `VpnController` lives on the Panel (not in the popup) so the badge
  updates with the popup closed.
- Upstream sources are in the first commit verbatim. Keep changes to
  `Panel.qml` and `vpn/` minimal and commented, so upstream releases can be
  merged by diffing against that commit.

## Dead ends / gotchas

- **qmllint is useless here.** It cannot resolve Quickshell's `qs.*` modules
  (every Omarchy type is "not found"). Run from inside the plugin directory,
  it hangs: `Panel.qml` extends `qs.Ui`'s `Panel` and resolves to itself. It
  once ran 20+ minutes. Verify by restarting the shell and reading
  `journalctl --user _PID=<shell pid>` instead.
- `pkill -f qmllint…` from a Bash tool call matches its own shell and kills
  the call (exit 144).
- `.pragma library` JS (`NetVpn.js`, `vpn/model/*.js`) is cached until
  `omarchy restart shell`; QML hot-reloads.
- Popup scrolling follows the cursor on **keyboard** moves only. Following
  hover would scroll a new row under the mouse, which would then claim the
  cursor in turn.
- Pixel-sampling screenshots to tell whether the popup is open misled once
  (a light terminal window sits behind it). Look at a cropped screenshot
  instead.
- Testing a real connect on the author's machine: at home, use the all-traffic
  profile, not the LAN-only one, which would route the home LAN through the
  VPS. Arm a `systemd-run --user --on-active=45 … nmcli connection down …`
  safety timer first.

- **VPN rows reorder at the source.** `nmcli connection show` lists active
  connections first, so NetworkManager targets swap places on connect. In
  0.3.0 testing this moved the LAN-only profile under the cursor, and the next Enter
  connected it (on the home LAN, for about 10 s). `VpnSection.syncRows` now
  pins the order (`NetVpn.stableOrder`) and the cursor follows by key. Do not
  bind `rows` straight to `backend.targets` again. When testing connects, keep
  the script checking which profile is up after each step.
- **`wtype` types into whatever has focus.** Twice the popup was not open
  when keys were sent: a `close` then `open` over IPC in separate commands
  left it closed, and a pixel check cannot tell the popup from the light
  terminal behind it. The keys `j k Enter` went into the user's Claude Code
  prompt and submitted "jk". Only inject keys after confirming the popup is
  open from a cropped screenshot in the same command, or ask the user to
  press the keys.
- Clearing `pending` from a binding on `pending` is a QML binding loop
  (logged as a warning). `settlePending()` runs from the backend's
  `connected`/`currentKey` change signals instead.

## Open items

- No preview image in the README. A screenshot would need sanitizing (SSIDs,
  IPs, profile names).
- Not tested on a multi-monitor setup. Each bar instance runs its own
  `VpnController`, as upstream does.
- Upstream omarchy-vpn is actively released (1.5.0 at import). Watch for
  fixes worth merging, especially in `vpn/model/`.
