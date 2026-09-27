# Changelog

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
