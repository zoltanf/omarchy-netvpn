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
- Tests: `node tests/run.js` (NetVpn.js, 15) and `node vpn/tests/run.js`
  (vendored, 147).

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

## Open items

- No preview image in the README. A screenshot would need sanitizing (SSIDs,
  IPs, profile names).
- Not tested on a multi-monitor setup. Each bar instance runs its own
  `VpnController`, as upstream does.
- Upstream omarchy-vpn is actively released (1.5.0 at import). Watch for
  fixes worth merging, especially in `vpn/model/`.
