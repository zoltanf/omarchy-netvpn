import QtQuick
import qs.Commons
import qs.Ui
import "NetVpn.js" as NetVpn

// Header of a foldable popup section: the section title on the left, a
// chevron on the right. Folded, it also carries a one-line summary of what the
// section holds, so a mostly folded popup still says where things stand.
//
// Clicking anywhere on the row folds or unfolds. The panel owns the cursor:
// `hasCursor` is set from outside, and `hovered` reports the mouse so the panel
// can move the cursor here (it only does while folded, when this row is a
// keyboard stop).
CursorSurface {
  id: root

  property string title: ""
  property string summary: ""
  property bool folded: false
  property string fontFamily: Style.font.family
  readonly property real pad: Style.space(6)

  signal toggled()
  signal hovered(bool isHovered)

  // Bleeds into the card padding so the title lines up with the unfolded
  // section headers while the cursor fill still has room around it.
  x: -pad
  width: parent ? parent.width + pad * 2 : implicitWidth
  implicitHeight: Math.max(label.implicitHeight, chevron.implicitHeight) + Style.space(4)

  PanelSectionHeader {
    id: label
    text: root.title
    foreground: root.foreground
    fontFamily: root.fontFamily
    anchors.left: parent.left
    anchors.leftMargin: root.pad
    anchors.verticalCenter: parent.verticalCenter
  }

  Text {
    textFormat: Text.PlainText
    visible: root.folded && root.summary !== ""
    text: root.summary
    color: Qt.darker(root.foreground, 1.4)
    font.family: root.fontFamily
    font.pixelSize: Style.font.caption
    elide: Text.ElideRight
    horizontalAlignment: Text.AlignRight
    anchors.left: label.right
    anchors.leftMargin: Style.space(12)
    anchors.right: chevron.left
    anchors.rightMargin: Style.space(8)
    anchors.verticalCenter: label.verticalCenter
    anchors.verticalCenterOffset: Math.round(label.topPadding / 2)
  }

  Text {
    id: chevron
    textFormat: Text.PlainText
    text: root.folded ? NetVpn.GLYPH_FOLDED : NetVpn.GLYPH_UNFOLDED
    color: Qt.darker(root.foreground, 1.4)
    font.family: root.fontFamily
    font.pixelSize: Style.font.body
    anchors.right: parent.right
    anchors.rightMargin: root.pad
    anchors.verticalCenter: parent.verticalCenter
  }

  MouseArea {
    anchors.fill: parent
    hoverEnabled: true
    cursorShape: Qt.PointingHandCursor
    onContainsMouseChanged: root.hovered(containsMouse)
    onClicked: root.toggled()
  }
}
