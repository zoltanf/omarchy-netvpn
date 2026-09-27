.pragma library
.import "Shared.js" as Shared

// Cloudflare WARP, via `warp-cli` talking to `warp-svc`. Parsing and
// row-building only — the process plumbing lives in WarpBackend.qml.
//
// WARP is not a pick-a-country VPN: Cloudflare always routes through the data
// centre nearest the user and keeps the user's own country as the exit
// location. So the connectable list is the tunnel modes, not places.

// nf-md-cloud. WARP has no country list for the shared VPN glyph to label, and
// the cloud is what people recognise from the Cloudflare app.
var GLYPH_WARP = String.fromCodePoint(0xF015F)

// `warp-cli --json status` prints one object: `status` is always a string,
// `reason` is sometimes a string and sometimes a one-key object carrying data.
// Real answers from warp-cli 2026.7:
//
//   {"status":"Connected","reason":"NetworkHealthy"}
//   {"status":"Disconnected","reason":"Manual"}
//   {"status":"Connecting","reason":{"EstablishingConnection":"162.159.198.2:443"}}
//   {"status":"Disconnected","reason":{"SettingsChanged":{"current":{…},"previous":{…}}}}
//
// Anything unparseable is "no idea", not disconnected.
function parseWarpStatus(raw) {
  var result = { state: "", connected: false, reason: "", reasonText: "", statusText: "" }

  var payload = warpJson(raw)
  if (!payload || typeof payload.status !== "string") return result

  var status = payload.status.trim().toLowerCase()
  if (status === "connected") result.state = "connected"
  else if (status === "connecting") result.state = "connecting"
  else if (status === "disconnected") result.state = "disconnected"
  else if (status === "unable") result.state = "unable"
  else result.state = "unknown"

  result.connected = result.state === "connected"
  result.reason = warpReasonKey(payload.reason)
  result.reasonText = warpWords(result.reason)
  result.statusText = payload.status.trim()
  return result
}

function warpJson(raw) {
  var text = String(raw || "").trim()
  if (text === "" || text.charAt(0) !== "{") return null
  try {
    var parsed = JSON.parse(text)
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null
  } catch (error) {
    return null
  }
}

// A string reason is its own name; an object reason is named by its one key.
function warpReasonKey(reason) {
  if (typeof reason === "string") return reason
  if (reason && typeof reason === "object" && !Array.isArray(reason)) {
    var keys = Object.keys(reason)
    if (keys.length > 0) return keys[0]
  }
  return ""
}

// "PerformingHappyEyeballs" -> "Performing happy eyeballs".
function warpWords(tag) {
  var text = String(tag || "").replace(/([a-z0-9])([A-Z])/g, "$1 $2").trim()
  if (text === "") return ""
  return text.charAt(0).toUpperCase() + text.substring(1).toLowerCase()
}

// Without a TTY and without `--accept-tos`, every warp-cli command exits at
// once with this line and does nothing. The widget never passes the flag:
// agreeing to Cloudflare's terms is for the user to do, once, in a terminal.
function warpNeedsTos(output) {
  return /accept the warp terms of service/i.test(String(output || ""))
}

// Whether a warp-cli call failed. The terms refusal exits 1 today; the line is
// checked as well, so a release that printed it with exit 0 would still not be
// read as an answer.
function warpCommandFailed(exitCode, output) {
  return exitCode !== 0 || warpNeedsTos(output)
}

// warp-cli could not reach warp-svc: the service is stopped or not installed.
// These are warp-cli's own messages (2026.7), taken from the binary rather than
// guessed, so an unrelated failure that mentions a socket is not mistaken for a
// stopped service:
//
//   Unable to connect to the CloudflareWARP daemon: …
//   Failed to communicate with WARP service over IPC: …
//   Error communicating with daemon: …
//   IPC client reached EOF, daemon connection lost
function warpDaemonUnreachable(output) {
  return /unable to connect to the cloudflarewarp daemon|failed to communicate with warp service|error communicating with daemon|daemon connection lost/i
    .test(String(output || ""))
}

// `warp-cli --json registration show` answers with the account when this
// device is registered.
function parseWarpRegistration(raw) {
  var result = { registered: false, accountType: "" }
  var payload = warpJson(raw)
  if (!payload) return result
  if (!payload.id && !payload.device_id && !payload.account) return result

  result.registered = true
  var account = payload.account
  if (account && typeof account === "object") result.accountType = String(account.type || "")
  return result
}

// What one `registration show` probe tells the backend: the two setup blockers
// it can run into, and the registration to keep. Only a clean answer may change
// the registration. A refused or failed probe after a good one keeps the device
// listed, and with it the chip that is the only way to see why WARP stopped
// answering.
function warpProbeResult(exitCode, stdout, stderr, previous) {
  var output = String(stdout || "") + "\n" + String(stderr || "")
  var needsTos = warpNeedsTos(output)
  var registration = previous || parseWarpRegistration("")
  if (!warpCommandFailed(exitCode, output)) registration = parseWarpRegistration(stdout)
  return {
    needsTos: needsTos,
    daemonDown: warpDaemonUnreachable(output),
    registration: registration
  }
}

function warpAccountLabel(type) {
  var value = String(type || "").toLowerCase()
  if (value === "free") return "Free"
  if (value === "limited" || value === "unlimited" || value === "plus") return "WARP+"
  if (value === "team") return "Zero Trust"
  return warpWords(type)
}

// `warp-cli --json settings list`. Only the fields the panel shows or acts on.
// `always_on` is what `connect` and `disconnect` flip, so it is not offered as a
// switch of its own.
function parseWarpSettings(raw) {
  var result = { loaded: false, mode: "", protocol: "", switchLocked: false }
  var payload = warpJson(raw)
  if (!payload) return result
  var settings = payload.settings
  if (!settings || typeof settings !== "object") return result

  result.loaded = true
  result.mode = String(settings.operation_mode || "").toLowerCase()
  result.protocol = String(settings.warp_tunnel_protocol || "").toLowerCase()
  result.switchLocked = settings.switch_locked === true
  return result
}

// `warp-cli --json tunnel stats` while connected; while down it answers
// {"code":"WarpNotConnected","error":"WARP is not connected."} instead.
function parseWarpStats(raw) {
  var result = { loaded: false, colo: "", protocol: "", latencyMs: -1, endpoint: "" }
  var payload = warpJson(raw)
  if (!payload || payload.code !== undefined || payload.error !== undefined) return result

  result.loaded = true
  var edge = payload.edge
  if (edge && typeof edge === "object") result.colo = String(edge.colo || "").toUpperCase()
  result.protocol = String(payload.protocol || "")
  if (typeof payload.estimated_latency_ms === "number") result.latencyMs = payload.estimated_latency_ms
  result.endpoint = String(payload.v4_endpoint || "")
  return result
}

// The modes that put traffic through the tunnel. DNS-only (`doh`, `dot`) and
// `proxy` leave the rest of the machine's traffic outside it, so offering them
// in a VPN switcher would show a connected tunnel that carries nothing.
//
// Plain `warp` already sends DNS through the encrypted tunnel, so the second
// row must not read as the one that encrypts DNS: `warp+doh` only changes how
// warp-svc's DNS proxy forwards lookups (DoH instead of UDP).
var WARP_MODES = [
  { mode: "warp", label: "WARP", detail: "All traffic through Cloudflare" },
  { mode: "warp+doh", label: "WARP with DNS over HTTPS", detail: "Same tunnel, plus DNS over HTTPS" }
]

function warpModeLabel(mode) {
  var value = String(mode || "").toLowerCase()
  for (var i = 0; i < WARP_MODES.length; i++) {
    if (WARP_MODES[i].mode === value) return WARP_MODES[i].label
  }
  if (value === "doh") return "DNS only (DoH)"
  if (value === "dot") return "DNS only (DoT)"
  if (value === "warp+dot") return "WARP with DNS over TLS"
  if (value === "proxy") return "Proxy"
  if (value === "tunnel_only") return "Tunnel only"
  return value
}

function warpIsTunnelMode(mode) {
  var value = String(mode || "").toLowerCase()
  return value === "warp" || value === "warp+doh" || value === "warp+dot" || value === "tunnel_only"
}

function warpTargets() {
  return WARP_MODES.map(function(entry) {
    return { key: "mode:" + entry.mode, label: entry.label, detail: entry.detail, glyph: GLYPH_WARP, args: [entry.mode] }
  })
}

function warpCurrentKey(status, settings) {
  if (status.state !== "connected" && status.state !== "connecting") return ""
  if (!settings || !settings.loaded) return ""
  for (var i = 0; i < WARP_MODES.length; i++) {
    if (WARP_MODES[i].mode === settings.mode) return "mode:" + settings.mode
  }
  return ""
}

// `connectTo` only needs to change the mode first when it differs; otherwise
// `connect` alone keeps what is already set.
function warpNeedsModeChange(settings, target) {
  var wanted = target && target.args && target.args.length > 0 ? String(target.args[0]) : ""
  if (wanted === "") return false
  if (!settings || !settings.loaded) return true
  return settings.mode !== wanted
}

function warpSummary(status, stats, registration) {
  if (status.state === "connected") {
    if (stats && stats.colo !== "") return "Cloudflare · " + stats.colo
    return "Connected"
  }
  if (status.state === "connecting") return "Connecting…"
  if (status.state === "disconnected") return "Not connected"
  if (status.state === "unable") {
    if (/registration/i.test(status.reason)) return "Not registered"
    return status.reasonText !== "" ? status.reasonText : "Unable to connect"
  }
  if (status.state === "unknown") return status.statusText !== "" ? status.statusText : "Unknown"
  return "Checking…"
}

function warpDetails(status, settings, stats, registration) {
  if (status.state !== "connected") return []

  var rows = []
  if (stats && stats.colo !== "") rows.push(Shared.detail("Data centre", stats.colo))
  if (settings && settings.loaded) rows.push(Shared.detail("Mode", warpModeLabel(settings.mode)))
  if (stats && stats.protocol !== "") rows.push(Shared.detail("Protocol", stats.protocol))
  if (stats && stats.latencyMs >= 0) rows.push(Shared.detail("Latency", stats.latencyMs + " ms"))
  if (registration && registration.accountType !== "") rows.push(Shared.detail("Account", warpAccountLabel(registration.accountType)))
  if (status.reason !== "" && status.reason !== "NetworkHealthy") rows.push(Shared.detail("Network", status.reasonText))
  return rows.filter(function(row) { return row.value !== "" })
}

// The three things that stand between an installed warp-cli and a usable
// tunnel, each with the command that clears it and how to say so: as the setup
// hint while WARP is not listed, and as the error when a command runs into it.
//
// Every command needs a person at the keyboard: the terms prompt, and sudo's
// password for starting the service. Registering is the one that needs no
// answer, but it goes through the same terminal so its output — the new device
// and account — is seen rather than discarded.
var WARP_SETUP = {
  terms: {
    command: "warp-cli registration show",
    hint: "Cloudflare WARP: accept its terms once by running warp-cli registration show in a terminal",
    failure: "Accept the WARP terms once: run warp-cli registration show in a terminal"
  },
  service: {
    command: "sudo systemctl enable --now warp-svc",
    hint: "Cloudflare WARP: start its service with sudo systemctl enable --now warp-svc",
    failure: "The WARP service is not responding. Start it with: sudo systemctl enable --now warp-svc"
  },
  registration: {
    command: "warp-cli registration new",
    hint: "Cloudflare WARP: register this device with warp-cli registration new",
    failure: "This device is not registered. Run: warp-cli registration new"
  }
}

// Which of WARP_SETUP keeps the backend from being `detected`, or "" when
// nothing does. A registered device is detected, so it has nothing to set up
// even while warp-svc is down: that is an error on its chip, not a hint, and the
// contract's `setupCommand` must not offer `sudo systemctl` for a tool that is
// already listed.
function warpSetupState(probe) {
  if (!probe || !probe.present) return ""
  if (probe.registered) return ""
  if (probe.needsTos) return "terms"
  if (probe.daemonDown) return "service"
  return "registration"
}

// Why the backend is not `detected`, in the words of what fixes it.
function warpSetupHint(probe) {
  var state = warpSetupState(probe)
  return state === "" ? "" : WARP_SETUP[state].hint
}

// The command that clears `warpSetupHint`, for the panel to run in a terminal
// when the hint is clicked.
function warpSetupCommand(probe) {
  var state = warpSetupState(probe)
  return state === "" ? "" : WARP_SETUP[state].command
}

// The setup state a failed command's output names, or "".
function warpFailureState(output) {
  var text = String(output || "")
  if (warpNeedsTos(text)) return "terms"
  // warp-cli 2026.7.1377 says `Missing registration. Try running: "warp-cli
  // registration new"`; the other two spellings are kept from before that was
  // read out of its binary.
  if (/missing registration|registration missing|not registered/i.test(text)) return "registration"
  if (warpDaemonUnreachable(text)) return "service"
  return ""
}

function describeWarpFailure(output, fallback) {
  var text = String(output || "").trim()
  var state = warpFailureState(text)
  if (state !== "") return WARP_SETUP[state].failure
  // No case for a Zero Trust `switch_locked` refusal: warp-cli 2026.7.1377 has
  // no message of its own for it, and matching a guess such as "not allowed"
  // would relabel unrelated errors. Its own words are shown instead.
  return Shared.elide(text || fallback, 140)
}
