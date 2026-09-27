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

test("header always has the gear, the rest only when they apply", () => {
  eq(N.vpnHeaderItems(false, false), ["gear"])
  eq(N.vpnHeaderItems(false, true), ["gear", "switch"])
  eq(N.vpnHeaderItems(true, true), ["settings", "gear", "switch"])
})

test("header cursor defaults to the switch, else the rightmost item", () => {
  eq(N.defaultHeaderIndex(["settings", "gear", "switch"]), 2)
  eq(N.defaultHeaderIndex(["gear"]), 0)
  eq(N.defaultHeaderIndex([]), 0)
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

test("folds parse to known sections, in panel order", () => {
  eq(N.parseFolds("wifi, DNS ,bogus,,wifi"), ["dns", "wifi"])
  eq(N.parseFolds(""), [])
  eq(N.parseFolds(undefined), [])
})

test("toggling adds and removes one section", () => {
  eq(N.toggleFold([], "vpn"), ["vpn"])
  eq(N.toggleFold(["vpn", "dns"], "vpn"), ["dns"])
  eq(N.toggleFold(["wifi"], "details"), ["details", "wifi"])
  eq(N.toggleFold([], "band"), [])
  eq(N.joinFolds(["wifi", "vpn"]), "vpn,wifi")
})

const FULL = { headerActions: true, details: true, band: true, wifi: true, wifiRows: true, folds: [] }

test("unfolded order matches the panel, details has no stop", () => {
  eq(N.stopOrder(FULL), ["header", "vpn", "band", "dns", "wifi"])
})

test("folded sections become header stops", () => {
  eq(N.stopOrder(Object.assign({}, FULL, { folds: ["details", "vpn", "dns", "wifi"] })),
    ["header", "fold:details", "fold:vpn", "band", "fold:dns", "fold:wifi"])
})

test("sections off screen are left out", () => {
  eq(N.stopOrder({ headerActions: false, details: false, band: false, wifi: false, folds: ["details", "wifi"] }),
    ["vpn", "dns"])
  eq(N.stopOrder(Object.assign({}, FULL, { wifiRows: false })), ["header", "vpn", "band", "dns"])
  eq(N.stopOrder(Object.assign({}, FULL, { wifiRows: false, folds: ["wifi"] })), ["header", "vpn", "band", "dns", "fold:wifi"])
})

test("neighbours step through the order and stop at the ends", () => {
  const order = N.stopOrder(FULL)
  eq(N.neighbourStop(order, "vpn", 1), "band")
  eq(N.neighbourStop(order, "vpn", -1), "header")
  eq(N.neighbourStop(order, "header", -1), "")
  eq(N.neighbourStop(order, "wifi", 1), "")
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
  eq(N.foldOf("header"), "")
})

console.log(passed + " passed, " + failed + " failed")
process.exit(failed === 0 ? 0 : 1)
