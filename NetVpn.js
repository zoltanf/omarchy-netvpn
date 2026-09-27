.pragma library

// The glue between the two halves: what the bar icon says, and how the keyboard
// cursor walks through the VPN block of the popup. Pure functions, no QML, so
// tests/run.js can check them under node. Network logic lives in
// NetworkModel.js (Omarchy's) and VPN logic in vpn/model/ (omarchy-vpn's);
// neither is edited to make the combination work.

// Shield with a lock: the badge on the network icon while a tunnel is up.
// Built from its codepoint so editors cannot mangle the multi-byte sequence.
var GLYPH_BADGE = String.fromCodePoint(0xF099D)

// "on" while a tunnel carries traffic, "pending" while the tool being looked
// at is mid-connect or mid-disconnect, "off" otherwise. Connected wins over
// busy: a server switch is still a protected connection.
function badgeState(anyConnected, busy) {
  if (anyConnected) return "on"
  if (busy) return "pending"
  return "off"
}

function networkLabel(kind, ssid) {
  if (kind === "ethernet") return "Ethernet"
  if (kind === "wifi") return ssid ? "Wi-Fi: " + ssid : "Wi-Fi"
  return "Disconnected"
}

// One line: the link, then the tunnel. The VPN half is left out only when the
// controller has nothing at all to say.
function barTooltip(kind, ssid, vpnSummary) {
  var net = networkLabel(kind, ssid)
  var summary = String(vpnSummary || "").trim()
  return summary === "" ? net : net + " · VPN: " + summary
}

// The VPN block's header row, left to right. The settings chevron only exists
// for a tool with settings of its own, and the master switch only while a tool
// is there to switch; the gear is always there, because it is the way back
// from a widget with every tool hidden.
function vpnHeaderItems(settingsAvailable, switchVisible) {
  var items = []
  if (settingsAvailable) items.push("settings")
  items.push("gear")
  if (switchVisible) items.push("switch")
  return items
}

// Where the cursor lands on the header by default: the master switch, which is
// what the row is for, else whatever is rightmost.
function defaultHeaderIndex(items) {
  var index = items.indexOf("switch")
  return index >= 0 ? index : Math.max(0, items.length - 1)
}

// The VPN block's cursor stops, top to bottom. "toggles" and "rows" are lists;
// the others are single rows.
function vpnStops(visible) {
  var stops = ["header"]
  if (visible && visible.switcher) stops.push("switcher")
  if (visible && visible.toggles) stops.push("toggles")
  if (visible && visible.rows) stops.push("rows")
  return stops
}

function countFor(stop, counts) {
  if (stop === "toggles") return Math.max(0, counts && counts.toggles || 0)
  if (stop === "rows") return Math.max(0, counts && counts.rows || 0)
  return 1
}

function indexKey(stop) {
  return stop === "toggles" ? "toggleIndex" : (stop === "rows" ? "rowIndex" : "")
}

function copyState(state) {
  return {
    stop: String(state && state.stop || "header"),
    rowIndex: Math.max(0, state && state.rowIndex || 0),
    toggleIndex: Math.max(0, state && state.toggleIndex || 0)
  }
}

// Coming into the block from the network sections: from above lands on the
// first stop, from below on the last row of the last stop.
function vpnEnter(dy, stops, counts) {
  var list = stops && stops.length > 0 ? stops : ["header"]
  var next = copyState(null)
  next.stop = dy < 0 ? list[list.length - 1] : list[0]
  var key = indexKey(next.stop)
  if (key !== "") next[key] = dy < 0 ? Math.max(0, countFor(next.stop, counts) - 1) : 0
  return next
}

// A stop that vanished under the cursor (the tool lost its settings, the list
// emptied) sends the cursor to the header rather than leaving it on nothing,
// and indexes are pulled back inside lists that shrank.
function vpnNormalize(state, stops, counts) {
  var next = copyState(state)
  if (!stops || stops.indexOf(next.stop) === -1) next.stop = "header"
  var rows = countFor("rows", counts)
  var toggles = countFor("toggles", counts)
  if (next.rowIndex > rows - 1) next.rowIndex = Math.max(0, rows - 1)
  if (next.toggleIndex > toggles - 1) next.toggleIndex = Math.max(0, toggles - 1)
  return next
}

// One vertical step. Inside a list it walks the list; off either end it moves
// to the neighbouring stop, and off the ends of the block it reports `leave`
// (-1 up, 1 down) so the panel can hand the cursor to the network sections.
function vpnMove(state, dy, stops, counts) {
  var list = stops && stops.length > 0 ? stops : ["header"]
  var next = vpnNormalize(state, list, counts)
  if (dy === 0) return { state: next, leave: 0 }

  var step = dy > 0 ? 1 : -1
  var key = indexKey(next.stop)
  if (key !== "") {
    var target = next[key] + step
    if (target >= 0 && target < countFor(next.stop, counts)) {
      next[key] = target
      return { state: next, leave: 0 }
    }
  }

  var at = list.indexOf(next.stop)
  var neighbour = at + step
  if (neighbour < 0 || neighbour >= list.length) return { state: next, leave: step }

  next.stop = list[neighbour]
  var enteredKey = indexKey(next.stop)
  if (enteredKey !== "") next[enteredKey] = step > 0 ? 0 : Math.max(0, countFor(next.stop, counts) - 1)
  return { state: next, leave: 0 }
}

// ------------------------------------------------------------- folding

// Sections the popup can fold, top to bottom. The band row is not one of
// them: it already hides itself whenever there is nothing to pick.
var FOLDABLE = ["details", "vpn", "dns", "wifi"]

// The `collapsedSections` setting is a comma list, like `hiddenBackends`, so
// Omarchy's settings dialog can edit it as a plain string. Unknown names and
// repeats are dropped, and the result is in panel order whatever order it was
// written in.
function parseFolds(raw) {
  var wanted = String(raw || "").split(",").map(function(part) { return part.trim().toLowerCase() })
  return FOLDABLE.filter(function(id) { return wanted.indexOf(id) !== -1 })
}

function joinFolds(list) {
  return parseFolds((list || []).join(",")).join(",")
}

function toggleFold(list, id) {
  var current = parseFolds((list || []).join(","))
  var at = current.indexOf(id)
  if (at !== -1) current.splice(at, 1)
  else if (FOLDABLE.indexOf(id) !== -1) current.push(id)
  return parseFolds(current.join(","))
}

// The panel's keyboard stops, top to bottom. A folded section is one stop,
// its header ("fold:<id>"), whose Enter unfolds it; an unfolded section is
// its own content. The details grid has nothing to select, so it is a stop
// only while folded. Sections not on screen are left out.
//
//   s = { headerActions, details, band, wifi, wifiRows, folds }
function stopOrder(s) {
  var folds = s && s.folds ? s.folds : []
  var folded = function(id) { return folds.indexOf(id) !== -1 }
  var order = []
  if (s.headerActions) order.push("header")
  if (s.details && folded("details")) order.push("fold:details")
  order.push(folded("vpn") ? "fold:vpn" : "vpn")
  if (s.band) order.push("band")
  order.push(folded("dns") ? "fold:dns" : "dns")
  if (s.wifi) {
    if (folded("wifi")) order.push("fold:wifi")
    else if (s.wifiRows) order.push("wifi")
  }
  return order
}

// The stop a step off the edge of `current` lands on, or "" at either end.
function neighbourStop(order, current, dy) {
  var at = order.indexOf(current)
  if (at === -1 || dy === 0) return ""
  var next = at + (dy > 0 ? 1 : -1)
  return next >= 0 && next < order.length ? order[next] : ""
}

// Where the cursor starts: the first preference that is on screen, else the
// last stop. Also where a cursor stranded by a section vanishing goes.
function defaultStop(order, preferred) {
  var list = preferred || []
  for (var i = 0; i < list.length; i++) {
    if (order.indexOf(list[i]) !== -1) return list[i]
  }
  return order.length > 0 ? order[order.length - 1] : ""
}

// The foldable section a stop belongs to, or "" for one that does not fold.
function foldOf(stop) {
  var id = String(stop || "")
  if (id.indexOf("fold:") === 0) id = id.substring(5)
  return FOLDABLE.indexOf(id) !== -1 ? id : ""
}

// Chevron right while folded, down while open, the usual disclosure pair.
var GLYPH_FOLDED = String.fromCodePoint(0xF0142)
var GLYPH_UNFOLDED = String.fromCodePoint(0xF0140)
