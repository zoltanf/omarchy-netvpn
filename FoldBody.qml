import QtQuick

// The foldable part of a popup section. Height animates to zero and back, the
// way Omarchy's band pills collapse, so the sections below slide instead of
// jumping. `visible` only drops at a real zero, which keeps the content drawn
// through the animation and takes it out of the parent Column's spacing once
// it has gone.
Item {
  id: root

  property bool folded: false
  // For a section that is off screen for reasons of its own (no interface,
  // no Wi-Fi radio), separate from the user folding it.
  property bool shown: true
  property alias spacing: inner.spacing
  default property alias content: inner.data

  width: parent ? parent.width : 0
  clip: true
  visible: height > 0
  height: root.folded || !root.shown ? 0 : inner.implicitHeight
  opacity: root.folded ? 0 : 1

  Behavior on height {
    NumberAnimation { duration: 140; easing.type: Easing.OutCubic }
  }
  Behavior on opacity {
    NumberAnimation { duration: 140; easing.type: Easing.OutCubic }
  }

  Column {
    id: inner
    width: root.width
  }
}
