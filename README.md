# Network + VPN for Omarchy

One bar icon and one popup for both your connection and your VPN. This
[Omarchy](https://omarchy.org) shell plugin combines Omarchy's own Wi-Fi/Ethernet
widget with [omarchy-vpn](https://github.com/jkoestinger/omarchy-vpn)'s VPN
switcher.

- **Bar icon:** Omarchy's usual Wi-Fi or Ethernet glyph. A small shield appears
  in its corner while a VPN tunnel is up, and shows faintly while one is
  connecting. The tooltip names both, for example `Wi-Fi: Home · VPN: NetworkManager · work`.
- **Popup:** everything the stock network popup has (connection stats, Wi-Fi
  band, DNS provider, the Wi-Fi list, the QR code and speed test buttons). A
  VPN section sits between the stats and the band/DNS rows: a connect switch,
  your public IP, the tool's details while connected, and the list of
  profiles or countries to connect to.

## VPN tools

VPN support comes from omarchy-vpn v1.5.0, with the same backends:

- Proton VPN, Mullvad, Windscribe, Cloudflare WARP and AmneziaWG, through
  their own CLIs.
- NetworkManager VPN profiles: OpenVPN, WireGuard, OpenConnect and VPNC.

When more than one tool is installed, chips at the top of the VPN section switch
between them. Connecting through one tool first disconnects the others.

**One difference from upstream:** NetworkManager WireGuard profiles show up
without `wireguard-tools` installed. omarchy-vpn requires the `wg` command
before it lists them, but NetworkManager never uses `wg`. On a stock Omarchy
install that check hid every WireGuard profile, with no error. This plugin
checks for the kernel module instead.

## Install

```sh
omarchy plugin add https://github.com/zoltanf/omarchy-netvpn.git --enable
```

The plugin declares itself a replacement for `omarchy.network`
(`"clonedFrom": "omarchy.network"` in `manifest.json`). Enabling it swaps the
Network icon for this one in the same bar position. Everything aimed at the
stock widget reaches this one instead: the `SUPER + CTRL + W` keybind, the
`omarchy.network` IPC target, and the QR code and speed test cards.

If you use omarchy-vpn's own icon, remove it from the bar. Both widgets
would otherwise poll the same tools.

To go back to the stock widget, disable this one. Omarchy puts `omarchy.network`
back in the same slot:

```sh
omarchy plugin disable zoltanf.netvpn
```

## Using it

**Mouse:** left click opens the popup, right click connects or disconnects the
VPN, and middle click refreshes both halves.

**Keyboard** (in the popup): `j`/`k` or the arrow keys move between rows and
sections, `h`/`l` move within a row, and Enter activates. Also:

| Key | Action |
|-----|--------|
| `r` | Refresh network and VPN |
| `w` | Wi-Fi radio on/off |
| `v` | VPN connect/disconnect (the tool's default connection) |
| `d` | VPN disconnect |
| `s` | Next VPN tool |
| `/` | Filter the VPN list (tools that support it) |
| Tab | Next bar panel |
| Esc | Close |

**IPC:** the target is `omarchy.network`. The stock methods are unchanged, and
the VPN methods from omarchy-vpn have a `vpn` prefix:

```sh
omarchy-shell omarchy.network toggle
omarchy-shell omarchy.network toggleNetwork      # Wi-Fi radio
omarchy-shell omarchy.network vpnStatus
omarchy-shell omarchy.network vpnIp
omarchy-shell omarchy.network vpnConnect <profile-or-country>
omarchy-shell omarchy.network vpnDisconnect
omarchy-shell omarchy.network vpnToggle
omarchy-shell omarchy.network vpnQuickconnect
omarchy-shell omarchy.network vpnBackends
omarchy-shell omarchy.network vpnUse <backend-id>
omarchy-shell omarchy.network vpnRefresh
omarchy-shell omarchy.network vpnSetup
```

## Settings

These are omarchy-vpn's settings, editable in Omarchy's widget settings dialog
or in this widget's entry in `~/.config/omarchy/shell.json`:

| Key | Default | Meaning |
|-----|---------|---------|
| `refreshIntervalSec` | `15` | How often VPN tools are polled |
| `preferredBackend` | `Auto` | Tool shown first. `Auto` picks the connected one |
| `favoriteCountries` | `CH,NL,US` | Pinned at the top for Proton VPN, Mullvad, Windscribe |
| `hiddenBackends` | `""` | Tools the widget ignores. The gear in the VPN section edits this |
| `profilesDir` | `~/.config/omarchy/vpn/awg-profiles` | Where AmneziaWG profiles are read from |

## How it is put together

| Path | From | Notes |
|------|------|-------|
| `Panel.qml` | Omarchy 4.0.4 `shell/plugins/panels/network/Panel.qml` | Adds the VPN controller, the VPN section, the badge, the `vpn` keyboard stop, the VPN IPC methods, and a scrollable popup body |
| `NetworkModel.js` | Omarchy 4.0.4 `.../network/Model.js` | Unchanged |
| `VpnSection.qml` | omarchy-vpn 1.5.0 `Panel.qml` | The popup body rebuilt as a section, with its own cursor |
| `NetVpn.js` | new | Badge, tooltip and the VPN section's keyboard walk. Pure JS |
| `vpn/` | omarchy-vpn 1.5.0 (`e0f2d97`) | Unchanged except for the WireGuard probe in `NetworkManagerBackend.qml` |

The first commit in this repository is both upstreams verbatim, so
`git diff <first-commit> -- Panel.qml` shows everything changed in the network
widget. To pick up a newer upstream, diff the new release against that commit
and carry the changes across.

## Development

```sh
node tests/run.js && node vpn/tests/run.js   # stdlib-only, no install
omarchy plugin validate .
```

For live work, symlink the checkout into place and restart the shell after
changes:

```sh
ln -s "$PWD" ~/.config/omarchy/plugins/zoltanf.netvpn
omarchy plugin enable zoltanf.netvpn
omarchy restart shell
```

QML files are hot-reloaded on save, but `.pragma library` scripts (`NetVpn.js`,
`vpn/model/*.js`) stay cached until a restart. The shell logs QML errors to
the user journal:

```sh
journalctl --user -f | grep -v IpcHandler
```

The `Handler was registered but will not be used` warnings are expected. There
is one per extra bar instance, and every stock widget logs them too.

## License

MIT, see [LICENSE](LICENSE). The code taken from upstream keeps its own MIT
notices: Omarchy (© David Heinemeier Hansson, [LICENSE.omarchy](LICENSE.omarchy))
and omarchy-vpn (© Justin Köstinger,
[vpn/LICENSE.omarchy-vpn](vpn/LICENSE.omarchy-vpn)).
