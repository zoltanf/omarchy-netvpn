// Tests for NetVpn.js, the glue this plugin adds. Stdlib only, like the
// vendored VPN suite, so it runs with nothing installed:
//
//   node tests/run.js && node vpn/tests/run.js
//
// NetVpn.js is a QML `.pragma library` script, which is not JavaScript; the
// directive is stripped and the rest evaluated in this realm, the same trick
// vpn/tests/harness.js uses.

const fs = require("fs")
const path = require("path")
const vm = require("vm")
const assert = require("assert")

function load(file) {
  const source = fs.readFileSync(path.join(__dirname, "..", file), "utf8")
    .replace(/^\s*\.pragma\s+library\s*$/m, "")
  const before = new Set(Object.getOwnPropertyNames(globalThis))
  vm.runInThisContext(source, { filename: file })
  const namespace = {}
  for (const name of Object.getOwnPropertyNames(globalThis)) {
    if (!before.has(name)) namespace[name] = globalThis[name]
  }
  return namespace
}

let passed = 0
let failed = 0

function test(name, fn) {
  try {
    fn()
    passed += 1
  } catch (error) {
    failed += 1
    console.error("FAIL " + name + "\n  " + String(error.message).replace(/\n/g, "\n  "))
  }
}

const eq = (actual, expected) => assert.deepStrictEqual(actual, expected)

const N = load("NetVpn.js")

// --------------------------------------------------------------- bar icon

test("badge is on whenever a tunnel is up, even mid-switch", () => {
  eq(N.badgeState(true, false), "on")
  eq(N.badgeState(true, true), "on")
})

test("badge is pending while connecting, off otherwise", () => {
  eq(N.badgeState(false, true), "pending")
  eq(N.badgeState(false, false), "off")
})

test("tooltip names the link and the tunnel", () => {
  eq(N.barTooltip("wifi", "Home", "NetworkManager · Connected to work"), "Wi-Fi: Home · VPN: NetworkManager · Connected to work")
  eq(N.barTooltip("ethernet", "", "Not connected"), "Ethernet · VPN: Not connected")
  eq(N.barTooltip("disconnected", "", "Not connected"), "Disconnected · VPN: Not connected")
})

test("tooltip drops the VPN half when there is nothing to say", () => {
  eq(N.barTooltip("wifi", "", ""), "Wi-Fi")
  eq(N.barTooltip("wifi", "Cafe", "   "), "Wi-Fi: Cafe")
})

// ------------------------------------------------------------ header row

test("header always has the gear, settings only for a tool with some", () => {
  eq(N.vpnHeaderItems(false), ["gear"])
  eq(N.vpnHeaderItems(true), ["settings", "gear"])
})

test("header cursor defaults to the rightmost item", () => {
  eq(N.defaultHeaderIndex(["settings", "gear"]), 1)
  eq(N.defaultHeaderIndex(["gear"]), 0)
  eq(N.defaultHeaderIndex([]), 0)
})

test("a row switch follows the tunnel that is up", () => {
  eq(N.rowSwitchOn("p1", "p1", true, null), true)
  eq(N.rowSwitchOn("p2", "p1", true, null), false)
  eq(N.rowSwitchOn("p1", "p1", false, null), false)
  eq(N.rowSwitchOn("", "", true, null), false)
})

test("a row switch shows the click in flight", () => {
  eq(N.rowSwitchOn("p2", "p1", true, { key: "p2", on: true }), true)
  eq(N.rowSwitchOn("p1", "p1", true, { key: "p1", on: false }), false)
  eq(N.rowSwitchOn("p1", "p1", true, { key: "p2", on: true }), true)
})

// --------------------------------------------------------------- cursor

const ALL = N.vpnStops({ switcher: true, toggles: true, rows: true })
const COUNTS = { toggles: 2, rows: 3 }

test("stops follow what is visible, header first", () => {
  eq(ALL, ["header", "switcher", "toggles", "rows"])
  eq(N.vpnStops({ rows: true }), ["header", "rows"])
  eq(N.vpnStops({}), ["header"])
  eq(N.vpnStops(null), ["header"])
})

test("entering from above lands on the header", () => {
  eq(N.vpnEnter(1, ALL, COUNTS), { stop: "header", rowIndex: 0, toggleIndex: 0 })
})

test("entering from below lands on the last row", () => {
  eq(N.vpnEnter(-1, ALL, COUNTS), { stop: "rows", rowIndex: 2, toggleIndex: 0 })
  eq(N.vpnEnter(-1, ["header"], {}), { stop: "header", rowIndex: 0, toggleIndex: 0 })
})

test("down walks every stop and every row, then leaves", () => {
  let state = N.vpnEnter(1, ALL, COUNTS)
  const seen = []
  for (let i = 0; i < 10; i++) {
    const result = N.vpnMove(state, 1, ALL, COUNTS)
    if (result.leave !== 0) { seen.push("leave:" + result.leave); break }
    state = result.state
    seen.push(state.stop + (state.stop === "rows" ? state.rowIndex : state.stop === "toggles" ? state.toggleIndex : ""))
  }
  eq(seen, ["switcher", "toggles0", "toggles1", "rows0", "rows1", "rows2", "leave:1"])
})

test("up walks back and leaves off the header", () => {
  let state = N.vpnEnter(-1, ALL, COUNTS)
  const seen = []
  for (let i = 0; i < 10; i++) {
    const result = N.vpnMove(state, -1, ALL, COUNTS)
    if (result.leave !== 0) { seen.push("leave:" + result.leave); break }
    state = result.state
    seen.push(state.stop + (state.stop === "rows" ? state.rowIndex : state.stop === "toggles" ? state.toggleIndex : ""))
  }
  eq(seen, ["rows1", "rows0", "toggles1", "toggles0", "switcher", "header", "leave:-1"])
})

test("leaving keeps the state where it was", () => {
  const state = { stop: "rows", rowIndex: 2, toggleIndex: 0 }
  eq(N.vpnMove(state, 1, ALL, COUNTS), { state, leave: 1 })
})

test("a vanished stop sends the cursor to the header", () => {
  const stops = N.vpnStops({ rows: true })
  eq(N.vpnNormalize({ stop: "toggles", rowIndex: 0, toggleIndex: 1 }, stops, { rows: 3 }),
    { stop: "header", rowIndex: 0, toggleIndex: 0 })
})

test("indexes are pulled back inside a list that shrank", () => {
  eq(N.vpnNormalize({ stop: "rows", rowIndex: 7, toggleIndex: 0 }, ALL, COUNTS),
    { stop: "rows", rowIndex: 2, toggleIndex: 0 })
  eq(N.vpnNormalize({ stop: "rows", rowIndex: 3, toggleIndex: 0 }, ALL, { rows: 0, toggles: 0 }).rowIndex, 0)
})

test("no vertical step is a no-op", () => {
  const state = { stop: "switcher", rowIndex: 0, toggleIndex: 0 }
  eq(N.vpnMove(state, 0, ALL, COUNTS), { state, leave: 0 })
})


// -------------------------------------------------------------- folding

test("folds parse to the remembered sections, in panel order", () => {
  eq(N.parseFolds("dns, VPN ,bogus,,dns"), ["vpn", "dns"])
  eq(N.parseFolds("wifi,details"), [])
  eq(N.parseFolds(""), [])
  eq(N.parseFolds(undefined), [])
})

test("toggling adds and removes one remembered section", () => {
  eq(N.toggleFold([], "vpn"), ["vpn"])
  eq(N.toggleFold(["vpn", "dns"], "vpn"), ["dns"])
  eq(N.toggleFold(["dns"], "vpn"), ["vpn", "dns"])
  eq(N.toggleFold([], "wifi"), [])
  eq(N.toggleFold([], "band"), [])
  eq(N.joinFolds(["dns", "vpn"]), "vpn,dns")
})

test("the Wi-Fi list opens folded only while Wi-Fi is connected", () => {
  eq(N.wifiFoldedOnOpen(true), true)
  eq(N.wifiFoldedOnOpen(false), false)
})

const FULL = { headerActions: true, band: true, wifi: true, wifiRows: true, folds: [] }

test("unfolded order matches the popup: Wi-Fi under the header", () => {
  eq(N.stopOrder(FULL), ["header", "wifi", "band", "vpn", "dns"])
})

test("folded sections become header stops", () => {
  eq(N.stopOrder(Object.assign({}, FULL, { folds: ["wifi", "vpn", "dns"] })),
    ["header", "fold:wifi", "band", "fold:vpn", "fold:dns"])
})

test("sections off screen are left out", () => {
  eq(N.stopOrder({ headerActions: false, band: false, wifi: false, folds: ["wifi"] }), ["vpn", "dns"])
  eq(N.stopOrder(Object.assign({}, FULL, { wifiRows: false })), ["header", "band", "vpn", "dns"])
  eq(N.stopOrder(Object.assign({}, FULL, { wifiRows: false, folds: ["wifi"] })), ["header", "fold:wifi", "band", "vpn", "dns"])
})

test("neighbours step through the order and stop at the ends", () => {
  const order = N.stopOrder(FULL)
  eq(N.neighbourStop(order, "wifi", 1), "band")
  eq(N.neighbourStop(order, "vpn", -1), "band")
  eq(N.neighbourStop(order, "header", -1), "")
  eq(N.neighbourStop(order, "dns", 1), "")
  eq(N.neighbourStop(order, "missing", 1), "")
})

test("default stop is the first preference on screen", () => {
  eq(N.defaultStop(["header", "vpn", "dns", "wifi"], ["wifi", "dns"]), "wifi")
  eq(N.defaultStop(["header", "vpn", "fold:dns", "fold:wifi"], ["wifi", "dns"]), "fold:wifi")
  eq(N.defaultStop([], ["wifi"]), "")
})

test("foldOf names the section of a stop", () => {
  eq(N.foldOf("fold:vpn"), "vpn")
  eq(N.foldOf("wifi"), "wifi")
  eq(N.foldOf("band"), "")
  eq(N.foldOf("details"), "")
  eq(N.foldOf("header"), "")
})

// ------------------------------------------------------------ row order

const keys = rows => rows.map(r => r.key)

test("rows keep the order they were first seen in", () => {
  let r = N.stableOrder([{ key: "a" }, { key: "b" }], {})
  eq(keys(r.rows), ["a", "b"])
  // nmcli moves the active profile to the top: the panel does not follow.
  r = N.stableOrder([{ key: "b" }, { key: "a" }], r.ranks)
  eq(keys(r.rows), ["a", "b"])
})

test("new rows go after the known ones, in the tool's order", () => {
  let r = N.stableOrder([{ key: "a" }, { key: "b" }], {})
  r = N.stableOrder([{ key: "d" }, { key: "b" }, { key: "c" }, { key: "a" }], r.ranks)
  eq(keys(r.rows), ["a", "b", "d", "c"])
})

test("stableOrder leaves its inputs alone", () => {
  const list = [{ key: "b" }, { key: "a" }]
  const ranks = { a: 0, b: 1 }
  N.stableOrder(list, ranks)
  eq(keys(list), ["b", "a"])
  eq(ranks, { a: 0, b: 1 })
})

test("the cursor follows its row by key", () => {
  const rows = [{ key: "a" }, { key: "b" }, { key: "c" }]
  eq(N.followRow(rows, "c", 0), 2)
  eq(N.followRow(rows, "gone", 5), 2)
  eq(N.followRow(rows, "", 1), 1)
  eq(N.followRow([], "a", 3), 0)
})

// ---------------------------------------------------------- details grid

test("via says direct without a tunnel, else names it", () => {
  eq(N.viaText("", false), "Direct")
  eq(N.viaText("work-lan", false), "Direct")
  eq(N.viaText("work-lan", true), "work-lan")
  eq(N.viaText("  ", true), "VPN")
})

test("signal is shown in whole dBm", () => {
  eq(N.formatSignal("-69"), "-69 dBm")
  eq(N.formatSignal(-52.6), "-53 dBm")
  eq(N.formatSignal(""), "--")
  eq(N.formatSignal(undefined), "--")
})

test("link rate is rounded, Gbit/s past a thousand", () => {
  eq(N.formatLinkRate("432.3 MBit/s"), "432 Mbit/s")
  eq(N.formatLinkRate("1201.0 MBit/s"), "1.2 Gbit/s")
  eq(N.formatLinkRate(""), "--")
  eq(N.formatLinkRate("0 MBit/s"), "--")
})

console.log(passed + " passed, " + failed + " failed")
process.exit(failed === 0 ? 0 : 1)
