import QtQuick
import QtQuick.Controls
import QtQuick.Layouts
import Quickshell
import qs.Commons
import qs.Ui
import "vpn/model/Shared.js" as Shared
import "NetVpn.js" as NetVpn

// The VPN block of the combined popup. Adapted from omarchy-vpn's Panel.qml:
// the same controller, the same backend contract, the same rows — laid out as
// one section among the network ones instead of a popup of its own.
//
// It owns its own cursor (header · tool chips · tool settings · targets) and
// talks to the panel through a small surface: `enter()` and `move()` for the
// keyboard walk, `cursorClaimed` when the mouse takes the cursor, and
// `runInTerminal` for the fixes that need a person at a keyboard.
Column {
  id: section

  // VpnController, owned by the panel so the bar badge works with the popup
  // closed.
  required property var vpn
  property var bar: null
  property var settings: ({})
  // True while the panel's cursor is on and sits in this section.
  property bool cursorActive: false
  // Upper bound for the target list before it scrolls, so a provider with a
  // hundred countries cannot push the network sections off the popup.
  property real maxListHeight: Style.space(176)

  signal cursorClaimed()
  signal saveSetting(string key, var value)
  signal runInTerminal(string command)
  // Asks the panel to take keyboard focus back from the filter field.
  signal focusReturned()

  spacing: Style.space(10)

  readonly property color foreground: bar ? bar.foreground : Color.foreground
  readonly property color urgent: bar ? bar.urgent : Color.urgent
  readonly property color dim: Qt.darker(foreground, 1.55)
  readonly property string fontFamily: bar ? bar.fontFamily : Style.font.family

  // "header" | "switcher" | "toggles" | "rows"
  property string stop: "header"
  property int headerIndex: 0
  property int rowIndex: 0
  property int toggleIndex: 0
  // The widget's own settings (which tools it uses) replace the target list
  // while open, as in omarchy-vpn. Reset on every open.
  property bool providersOpen: false
  // The tool's own settings, folded away by default; kept for the session.
  property bool settingsExpanded: false
  property bool ipCopied: false

  readonly property bool filterFocused: filterField.activeFocus
  readonly property var backend: vpn.active
  readonly property var providerRows: vpn.detectedBackends.map(function(entry) {
    var hidden = vpn.isHidden(entry.backendId)
    return {
      key: "provider:" + entry.backendId,
      backendId: entry.backendId,
      label: entry.label,
      detail: hidden ? "Hidden" : (entry.connected ? "Connected" : "Shown"),
      glyph: entry.glyph,
      hidden: hidden
    }
  })
  readonly property var rows: providersOpen ? providerRows : (backend ? backend.targets : [])
  readonly property var toggles: backend && backend.toggles ? backend.toggles : []
  readonly property bool settingsAvailable: !providersOpen && toggles.length > 0
  readonly property bool settingsVisible: settingsAvailable && settingsExpanded
  readonly property bool switcherVisible: !providersOpen && vpn.availableBackends.length > 1
  readonly property bool filterVisible: !providersOpen && backend !== null && backend.supportsFilter
  readonly property bool masterSwitchVisible: !providersOpen && backend !== null
  readonly property bool statusIsError: vpn.notice !== ""
    || (backend !== null && backend.lastError !== "" && backend.actionStatus === "")
  readonly property string installHint: {
    var names = []
    for (var i = 0; i < vpn.backends.length; i++) {
      var offered = vpn.backends[i].installNames || []
      for (var j = 0; j < offered.length; j++) names.push(offered[j])
    }
    var list = Shared.sentenceList(names)
    return list === "" ? "" : "Install " + list + " to use a VPN here."
  }
  readonly property bool setupActionable: !providersOpen && !backend
    && vpn.detectedBackends.length === 0 && vpn.setupHint !== "" && vpn.setupCommand !== ""
  readonly property string statusLine: {
    if (providersOpen) return ""
    if (vpn.notice !== "") return vpn.notice
    if (!backend) {
      if (vpn.detectedBackends.length > 0) return "Every VPN tool is hidden. Turn one back on with the gear."
      return vpn.setupHint !== "" ? vpn.setupHint : section.installHint
    }
    return backend.actionStatus !== "" ? backend.actionStatus : backend.lastError
  }

  readonly property var headerItems: NetVpn.vpnHeaderItems(settingsAvailable, masterSwitchVisible)
  readonly property var stops: NetVpn.vpnStops({
    switcher: switcherVisible,
    toggles: settingsVisible && toggles.length > 0,
    rows: rows.length > 0
  })
  readonly property var counts: ({ toggles: toggles.length, rows: rows.length })

  // Label/value pairs under the header: the exit address always, then whatever
  // the tool reports while connected.
  readonly property var detailRows: {
    var list = [{ label: "Public IP", value: vpn.ipFetching ? "Checking…" : (vpn.publicIp !== "" ? vpn.publicIp : (vpn.ipFailed ? "unavailable" : "--")), copyable: vpn.publicIp !== "" && !vpn.ipFetching }]
    if (!providersOpen && backend && backend.details) {
      for (var i = 0; i < backend.details.length; i++) list.push({ label: backend.details[i].label, value: backend.details[i].value, copyable: false })
    }
    return list
  }

  function headerHas(item) {
    return cursorActive && stop === "header" && headerItems[headerIndex] === item
  }

  // ------------------------------------------------------------ cursor

  function state() {
    return { stop: stop, rowIndex: rowIndex, toggleIndex: toggleIndex }
  }

  function apply(next) {
    stop = next.stop
    rowIndex = next.rowIndex
    toggleIndex = next.toggleIndex
    if (stop === "header") headerIndex = Math.max(0, Math.min(headerItems.length - 1, headerIndex))
    scrollListToCursor()
  }

  function normalize() {
    apply(NetVpn.vpnNormalize(state(), stops, counts))
  }

  // The panel's cursor walked in from the section above (dy > 0) or below.
  function enter(dy) {
    apply(NetVpn.vpnEnter(dy, stops, counts))
    if (stop === "header") headerIndex = NetVpn.defaultHeaderIndex(headerItems)
  }

  // Answers false when the step leaves the section, so the panel moves on.
  function move(dx, dy) {
    normalize()
    if (dx !== 0) {
      if (stop === "header") headerIndex = Math.max(0, Math.min(headerItems.length - 1, headerIndex + dx))
      else if (stop === "switcher") stepBackend(dx)
      return true
    }
    var result = NetVpn.vpnMove(state(), dy, stops, counts)
    if (result.leave !== 0) return false
    apply(result.state)
    return true
  }

  function activate() {
    normalize()
    if (stop === "header") {
      var item = headerItems[headerIndex]
      if (item === "settings") toggleSettings()
      else if (item === "gear") toggleProviders()
      else if (item === "switch") vpn.toggleActive()
    } else if (stop === "toggles") {
      flipToggle(toggleIndex)
    } else if (stop === "rows") {
      activateRow(rows[rowIndex])
    }
  }

  // Letters the section answers wherever the cursor is. "r" is the panel's,
  // since it refreshes both halves.
  function textKey(t) {
    if (t === "/" && filterVisible) { filterField.forceActiveFocus(); return true }
    if (t === "v" || t === "V") { vpn.toggleActive(); return true }
    // Through the controller: it knows about a connect still queued behind a
    // teardown, which is what pressing this is asking to call off.
    if (t === "d" || t === "D") { vpn.disconnectActive(); return true }
    if (t === "s" || t === "S") { if (switcherVisible) stepBackend(1); return true }
    return false
  }

  // Every open starts on the connect list, not on the tool list, as upstream.
  function reset() {
    providersOpen = false
    stop = "header"
    headerIndex = NetVpn.defaultHeaderIndex(headerItems)
    rowIndex = 0
    toggleIndex = 0
    if (backend) backend.filter = ""
    filterField.text = ""
    rowFlick.contentY = 0
  }

  function claim() {
    cursorClaimed()
  }

  function setHeaderCursor(item) {
    claim()
    stop = "header"
    var index = headerItems.indexOf(item)
    if (index >= 0) headerIndex = index
  }

  function setSwitcherCursor() {
    claim()
    stop = switcherVisible ? "switcher" : "header"
  }

  function setToggleCursor(index) {
    claim()
    stop = "toggles"
    toggleIndex = index
  }

  function setRowCursor(index) {
    claim()
    stop = "rows"
    rowIndex = index
    scrollListToCursor()
  }

  // The item the cursor is on, for the panel's scroll-to-cursor.
  function cursorItem() {
    if (stop === "switcher") return switcher
    if (stop === "toggles") return toggleColumn
    if (stop === "rows") return rowFlick
    return header
  }

  function scrollListToCursor() {
    if (stop !== "rows" || rowIndex < 0 || rowIndex >= rowColumn.children.length) return
    var item = rowColumn.children[rowIndex]
    Qt.callLater(function() {
      if (!item) return
      var top = item.y
      var bottom = top + item.height
      var maxY = Math.max(0, rowFlick.contentHeight - rowFlick.height)
      if (top < rowFlick.contentY) rowFlick.contentY = Math.max(0, top)
      else if (bottom > rowFlick.contentY + rowFlick.height) rowFlick.contentY = Math.min(maxY, bottom - rowFlick.height)
    })
  }

  // ----------------------------------------------------------- actions

  function stepBackend(direction) {
    var options = vpn.availableBackends
    if (options.length < 2) return
    var current = 0
    for (var i = 0; i < options.length; i++) {
      if (backend && options[i].backendId === backend.backendId) current = i
    }
    var next = Math.max(0, Math.min(options.length - 1, current + direction))
    selectBackend(options[next].backendId)
  }

  // The filter belongs to the panel, not to the tool, so both ends are cleared
  // on the way across.
  function selectBackend(backendId) {
    if (backend) backend.filter = ""
    filterField.text = ""
    vpn.selectBackend(backendId)
    rowIndex = 0
    toggleIndex = 0
    rowFlick.contentY = 0
  }

  function toggleSettings() {
    if (!settingsAvailable) return
    settingsExpanded = !settingsExpanded
    if (!settingsExpanded && stop === "toggles") setHeaderCursor("settings")
  }

  function toggleProviders() {
    providersOpen = !providersOpen
    rowIndex = 0
    toggleIndex = 0
    if (backend) backend.filter = ""
    filterField.text = ""
    rowFlick.contentY = 0
    setHeaderCursor("gear")
  }

  function toggleProvider(row) {
    if (!row || row.backendId === undefined) return
    var next = Shared.toggleBackendId(vpn.hiddenBackendIds, row.backendId)
    saveSetting("hiddenBackends", Shared.joinBackendIds(next))
  }

  function flipToggle(index) {
    var entry = toggles[index]
    if (!backend || !entry) return
    backend.setToggle(entry.key, !entry.value)
  }

  function activateRow(row) {
    if (!row) return
    if (providersOpen) {
      toggleProvider(row)
      return
    }
    if (!backend) return
    // Through the controller, never straight to the backend: picking a tunnel
    // means the others come down first.
    vpn.connectVia(backend, row)
  }

  function copyPublicIp() {
    if (vpn.publicIp === "") return
    Quickshell.execDetached(["bash", "-c", "printf %s " + Util.shellQuote(vpn.publicIp) + " | wl-copy"])
    ipCopied = true
    ipCopiedTimer.restart()
  }

  Timer {
    id: ipCopiedTimer
    interval: 1600
    repeat: false
    onTriggered: section.ipCopied = false
  }

  // A backend can hand back a command that only works with a human at a
  // keyboard — NetworkManager asking for VPN credentials it does not store.
  Connections {
    target: section.backend
    ignoreUnknownSignals: true
    function onAuthRequired(command) { section.runInTerminal(command) }
  }

  onStopsChanged: if (cursorActive) normalize()

  // ---------- Header: tool glyph · tool + state · settings, gear, switch ----------
  Item {
    id: header
    width: parent.width
    implicitHeight: Math.max(headerIcon.implicitHeight, headerLabels.implicitHeight, headerActions.implicitHeight)

    Text {
      id: headerIcon
      textFormat: Text.PlainText
      text: section.backend ? section.backend.glyph : Shared.GLYPH_VPN
      color: section.foreground
      opacity: section.vpn.anyConnected ? 1.0 : 0.5
      font.family: section.fontFamily
      font.pixelSize: Style.font.display
      anchors.left: parent.left
      anchors.verticalCenter: parent.verticalCenter
    }

    RowLayout {
      id: headerActions
      spacing: Style.space(8)
      anchors.right: parent.right
      anchors.verticalCenter: parent.verticalCenter

      PanelActionButton {
        id: settingsButton
        visible: section.settingsAvailable
        iconText: section.settingsExpanded ? Shared.GLYPH_CHEVRON_UP : Shared.GLYPH_CHEVRON_DOWN
        tooltipText: section.settingsExpanded ? "Hide " + (section.backend ? section.backend.label : "VPN") + " settings"
          : "Show " + (section.backend ? section.backend.label : "VPN") + " settings"
        hasCursor: section.headerHas("settings")
        foreground: section.foreground
        fontFamily: section.fontFamily
        Layout.alignment: Qt.AlignVCenter
        onHovered: function(on) { if (on) section.setHeaderCursor("settings") }
        onClicked: section.toggleSettings()
      }

      PanelActionButton {
        id: gearButton
        iconText: Shared.GLYPH_COG
        tooltipText: section.providersOpen ? "Back" : "Choose VPN tools"
        hasCursor: section.headerHas("gear")
        foreground: section.foreground
        fontFamily: section.fontFamily
        Layout.alignment: Qt.AlignVCenter
        onHovered: function(on) { if (on) section.setHeaderCursor("gear") }
        onClicked: section.toggleProviders()
      }

      ToggleSwitch {
        id: masterSwitch
        visible: section.masterSwitchVisible
        // The tool being looked at, not "anything at all": toggleActive() acts
        // on the selected backend.
        checked: section.backend ? section.backend.connected : false
        busy: section.backend ? section.backend.busy : false
        hasCursor: section.headerHas("switch")
        foreground: section.foreground
        Layout.alignment: Qt.AlignVCenter
        onHovered: function(on) { if (on) section.setHeaderCursor("switch") }
        onToggled: section.vpn.toggleActive()

        PanelToolTip {
          visible: masterSwitch.containsMouse
          text: masterSwitch.checked ? "Disconnect" : "Connect"
          fontFamily: section.fontFamily
        }
      }
    }

    Column {
      id: headerLabels
      anchors.left: headerIcon.right
      anchors.leftMargin: Style.space(14)
      anchors.right: parent.right
      anchors.rightMargin: headerActions.width + Style.space(12)
      anchors.verticalCenter: parent.verticalCenter
      spacing: Style.space(2)

      Text {
        textFormat: Text.PlainText
        width: parent.width
        text: section.providersOpen ? "VPN tools"
          : (section.backend ? section.backend.label : "No VPN tool")
        color: section.foreground
        font.family: section.fontFamily
        font.pixelSize: Style.font.title
        font.bold: true
        elide: Text.ElideRight
      }

      Text {
        textFormat: Text.PlainText
        width: parent.width
        text: section.providersOpen ? "Pick which tools this widget uses"
          : (section.backend ? section.backend.summary : "Nothing detected")
        visible: text !== ""
        color: Qt.darker(section.foreground, 1.4)
        font.family: section.fontFamily
        font.pixelSize: Style.font.caption
        font.bold: true
        elide: Text.ElideRight
      }
    }
  }

  ButtonGroup {
    id: switcher
    visible: section.switcherVisible
    options: section.vpn.switcherOptions
    value: section.backend ? section.backend.backendId : ""
    foreground: section.foreground
    fontFamily: section.fontFamily
    focusable: false
    cursorIndex: section.cursorActive && section.stop === "switcher" ? 0 : -1
    onChanged: function(v) {
      section.setSwitcherCursor()
      section.selectBackend(v)
    }
    onHovered: function(index, isHovered) {
      if (isHovered) section.setSwitcherCursor()
    }
  }

  Text {
    visible: section.statusLine !== ""
    width: parent.width
    text: section.statusLine
    // Brighter when clicking it does something.
    color: section.statusIsError ? section.urgent : (section.setupActionable ? section.foreground : section.dim)
    font.family: section.fontFamily
    font.pixelSize: Style.font.bodySmall
    font.underline: section.setupActionable && setupMouse.containsMouse
    wrapMode: Text.WordWrap

    MouseArea {
      id: setupMouse
      anchors.fill: parent
      enabled: section.setupActionable
      hoverEnabled: true
      cursorShape: Qt.PointingHandCursor
      onClicked: section.runInTerminal(section.vpn.setupCommand)
    }

    PanelToolTip {
      visible: setupMouse.containsMouse && section.setupActionable
      text: "Open a terminal and run: " + section.vpn.setupCommand
      fontFamily: section.fontFamily
    }
  }

  // Label left, value right, one pair per row. The pair count moves with the
  // tool and the connection, which a fixed four-column grid would leave ragged.
  GridLayout {
    visible: !section.providersOpen
    width: parent.width
    columns: 2
    columnSpacing: Style.space(20)
    rowSpacing: Style.spacing.labelGap

    Repeater {
      model: section.detailRows.length * 2

      Text {
        required property int index
        readonly property var entry: section.detailRows[Math.floor(index / 2)]
        readonly property bool isValue: index % 2 === 1
        readonly property bool copyable: isValue && entry && entry.copyable === true

        textFormat: Text.PlainText
        text: entry ? (isValue ? String(entry.value) : String(entry.label)) : ""
        color: section.foreground
        opacity: isValue ? 1 : 0.6
        font.family: section.fontFamily
        font.pixelSize: Style.font.bodySmall
        elide: Text.ElideRight
        horizontalAlignment: isValue ? Text.AlignRight : Text.AlignLeft
        Layout.fillWidth: isValue

        MouseArea {
          id: valueMouse
          anchors.fill: parent
          enabled: parent.copyable
          hoverEnabled: enabled
          cursorShape: enabled ? Qt.PointingHandCursor : Qt.ArrowCursor
          onClicked: section.copyPublicIp()
        }

        PanelToolTip {
          visible: valueMouse.enabled && valueMouse.containsMouse
          text: section.ipCopied ? "Copied" : "Copy public IP"
          fontFamily: section.fontFamily
        }
      }
    }
  }

  // Settings the tool itself owns. The switches show what it reports.
  Column {
    id: toggleColumn
    visible: section.settingsVisible
    width: parent.width
    spacing: Style.space(6)

    Repeater {
      model: section.settingsVisible ? section.toggles : []
      ToggleRow {
        required property var modelData
        required property int index
        width: toggleColumn.width
        entry: modelData
        cursorIndex: index
      }
    }
  }

  TextField {
    id: filterField
    visible: section.filterVisible
    width: parent.width
    foreground: section.foreground
    placeholderText: section.backend ? section.backend.filterPlaceholder : ""
    onTextChanged: {
      if (section.backend) section.backend.filter = text
      section.rowIndex = 0
      rowFlick.contentY = 0
    }
    Keys.onEscapePressed: {
      text = ""
      section.claim()
      section.focusReturned()
    }
    Keys.onReturnPressed: {
      section.setRowCursor(0)
      section.focusReturned()
    }
  }

  Text {
    visible: section.rows.length === 0 && (section.providersOpen || section.backend !== null)
    width: parent.width
    text: section.providersOpen ? "No VPN tool detected on this machine."
      : (section.backend ? section.backend.emptyText : "")
    color: section.dim
    font.family: section.fontFamily
    font.pixelSize: Style.font.bodySmall
    horizontalAlignment: Text.AlignHCenter
    wrapMode: Text.WordWrap
  }

  Flickable {
    id: rowFlick
    visible: section.rows.length > 0
    width: parent.width
    height: Math.min(rowColumn.implicitHeight, section.maxListHeight)
    contentWidth: width
    contentHeight: rowColumn.implicitHeight
    clip: true
    boundsBehavior: Flickable.StopAtBounds
    flickableDirection: Flickable.VerticalFlick
    interactive: contentHeight > height
    ScrollBar.vertical: ScrollBar { policy: ScrollBar.AsNeeded }

    Column {
      id: rowColumn
      width: rowFlick.width
      spacing: Style.space(4)

      Repeater {
        model: section.rows
        TargetRow {
          required property var modelData
          required property int index
          width: rowColumn.width
          row: modelData
          cursorIndex: index
        }
      }
    }
  }

  component TargetRow: CursorSurface {
    id: targetRow
    property var row: null
    property int cursorIndex: 0
    // A provider row carries a switch where the check mark goes: it says
    // whether the widget uses that tool, not whether it is connected.
    readonly property bool isProvider: row !== null && row.hidden !== undefined
    readonly property bool rowMuted: (isProvider && row.hidden === true)
      || (row !== null && row.blocked === true)
    readonly property bool isCurrent: !isProvider
      && section.backend !== null
      && row
      && row.key === section.backend.currentKey

    hasCursor: section.cursorActive && section.stop === "rows" && section.rowIndex === cursorIndex
    current: isCurrent
    foreground: section.foreground

    implicitHeight: rowContent.implicitHeight + Style.spacing.rowPaddingX

    MouseArea {
      anchors.fill: parent
      hoverEnabled: true
      cursorShape: Qt.PointingHandCursor
      onEntered: section.setRowCursor(targetRow.cursorIndex)
      onClicked: section.activateRow(targetRow.row)
    }

    RowLayout {
      anchors.left: parent.left
      anchors.right: parent.right
      anchors.verticalCenter: parent.verticalCenter
      anchors.leftMargin: Style.space(10)
      anchors.rightMargin: Style.space(10)
      spacing: Style.space(10)

      Text {
        text: targetRow.row ? targetRow.row.glyph : ""
        color: targetRow.rowMuted ? section.dim : section.foreground
        font.family: section.fontFamily
        font.pixelSize: Style.font.title
        Layout.alignment: Qt.AlignVCenter
      }

      ColumnLayout {
        id: rowContent
        Layout.fillWidth: true
        spacing: Style.space(1)

        Text {
          Layout.fillWidth: true
          text: targetRow.row ? targetRow.row.label : ""
          color: targetRow.rowMuted ? section.dim : section.foreground
          font.family: section.fontFamily
          font.pixelSize: Style.font.body
          elide: Text.ElideRight
        }

        Text {
          Layout.fillWidth: true
          visible: targetRow.row && targetRow.row.detail !== ""
          text: targetRow.row ? targetRow.row.detail : ""
          color: section.dim
          font.family: section.fontFamily
          font.pixelSize: Style.font.caption
          elide: Text.ElideRight
        }
      }

      Text {
        visible: targetRow.isCurrent
        text: Shared.GLYPH_CHECK
        color: section.foreground
        font.family: section.fontFamily
        font.pixelSize: Style.font.icon
        Layout.alignment: Qt.AlignVCenter
      }

      ToggleSwitch {
        visible: targetRow.isProvider
        checked: targetRow.isProvider && !targetRow.row.hidden
        foreground: section.foreground
        // The row owns the click and the cursor ring.
        interactive: false
        Layout.alignment: Qt.AlignVCenter
      }
    }
  }

  component ToggleRow: CursorSurface {
    id: toggleRow
    property var entry: null
    property int cursorIndex: 0

    hasCursor: section.cursorActive && section.stop === "toggles" && section.toggleIndex === cursorIndex
    foreground: section.foreground

    implicitHeight: toggleContent.implicitHeight + Style.spacing.rowPaddingX

    MouseArea {
      anchors.fill: parent
      hoverEnabled: true
      cursorShape: Qt.PointingHandCursor
      onEntered: section.setToggleCursor(toggleRow.cursorIndex)
      onClicked: section.flipToggle(toggleRow.cursorIndex)
    }

    RowLayout {
      anchors.left: parent.left
      anchors.right: parent.right
      anchors.verticalCenter: parent.verticalCenter
      anchors.leftMargin: Style.space(10)
      anchors.rightMargin: Style.space(10)
      spacing: Style.space(8)

      ColumnLayout {
        id: toggleContent
        Layout.fillWidth: true
        spacing: Style.space(1)

        Text {
          Layout.fillWidth: true
          text: toggleRow.entry ? toggleRow.entry.label : ""
          color: section.foreground
          font.family: section.fontFamily
          font.pixelSize: Style.font.body
          elide: Text.ElideRight
        }

        Text {
          Layout.fillWidth: true
          visible: toggleRow.entry && toggleRow.entry.detail !== ""
          text: toggleRow.entry ? toggleRow.entry.detail : ""
          color: section.dim
          font.family: section.fontFamily
          font.pixelSize: Style.font.caption
          elide: Text.ElideRight
        }
      }

      ToggleSwitch {
        checked: toggleRow.entry ? toggleRow.entry.value : false
        busy: toggleRow.entry ? toggleRow.entry.busy === true : false
        foreground: section.foreground
        interactive: false
        Layout.alignment: Qt.AlignVCenter
      }
    }
  }
}
