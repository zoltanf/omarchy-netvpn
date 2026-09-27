# Changelog

## 0.3.0 — 2026-09-27

- DNS moved above VPN and always opens folded. Unfolding it lasts until the
  popup closes; `collapsedSections` now only keeps `vpn`.
- "IP Address" in the details grid is now "Local IP".
- Details grid: **Via** beside the public IP (`Direct`, or the VPN tunnel's
  name), and on Wi-Fi a **Signal** / **Link Rate** row at the top. Both come from
  `omarchy-network-status`, which already reported them but the stock panel
  never showed them.
- New popup order: details, Wi-Fi networks, Wi-Fi band, VPN, DNS.
- The public IP moved from the VPN section into the details grid.
- The details grid is no longer foldable.
- The Wi-Fi list opens folded while Wi-Fi is connected and unfolded while it
  is not. It unfolds by itself if Wi-Fi drops while the popup is open. This
  fold is decided per open and no longer saved; `collapsedSections` keeps
  `vpn` and `dns` only.
- Every VPN row has its own on/off switch. The single master switch is gone:
  with several profiles it did nothing but ask you to pick one. Right click on
  the bar icon and the `v` key still do the tool's default connect.
- VPN rows keep a stable order. nmcli lists the active profile first, so a
  connect used to swap rows under the cursor, and the next Enter flipped a
  different profile. The keyboard cursor now also follows its row by key.
- Opening onto the VPN section puts the cursor on the first row.

## 0.2.0 — 2026-09-27

- Foldable popup sections: Details, VPN, DNS provider and Wi-Fi networks each
  get a header with a chevron. Folded, the header shows a one-line summary.
  Click a header or press `c` to fold or unfold. A folded section is a single
  keyboard stop, and Enter unfolds it.
- Folds persist in the new `collapsedSections` setting.
- The vertical keyboard walk is now one ordered list of stops
  (`NetVpn.stopOrder`) instead of per-section rules. It skips sections that
  are off screen or folded.
- The VPN block's title is now the tool's name; the section header says "VPN".

## 0.1.0 — 2026-09-27

First release.

- Omarchy's network widget (Omarchy 4.0.4) and omarchy-vpn (1.5.0) combined
  into one bar icon and popup.
- The bar icon gets a shield badge while a VPN tunnel is up, faint while one is
  connecting, and a tooltip naming both the link and the tunnel.
- The popup gets a VPN section below the connection stats (switch, public IP,
  tool details, tool chips, tool settings, connect list, gear to hide tools).
  The keyboard cursor walks through it like any other section.
- Right click on the icon connects or disconnects the VPN, and middle click
  refreshes both halves. New keys in the popup: `v`, `d`, `s`, `/`.
- VPN IPC methods on the `omarchy.network` target, with a `vpn` prefix.
- The popup body scrolls when it is taller than the screen.
- Replaces `omarchy.network` through `clonedFrom`, so the keybind, IPC, the QR
  code card and the speed test card reach it.
- NetworkManager WireGuard profiles no longer need `wireguard-tools`
  installed to be listed.
