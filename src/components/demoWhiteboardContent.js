// Demo whiteboard tutorial content + auto-seed helper.
//
// IMPORTANT: this does NOT touch Firestore. The actual whiteboard content
// (shapes) lives in the tldraw sync-server room identified by `roomId`
// (see `useSync()` in CollaborativeWhiteboard.js) — the Firestore
// "shapes" subcollection is only used for per-shape comments/reactions
// metadata, not the drawing itself. So there's nothing to pre-clone: a
// brand-new team (e.g. "demo-P014") is simply a room that doesn't exist
// on the sync server yet, and starts out empty.
//
// seedDemoBoardIfEmpty() is called from CollaborativeWhiteboard's
// onMount whenever the room is a demo room. If the room already has
// shapes (either because it was already seeded, or the participant has
// been practicing on it), it does nothing — so it only ever runs once
// per participant, the first time they open their demo board.

import { createShapeId, toRichText as _toRichText } from "tldraw";

export const DEMO_CLASS_ID = "DemoStudy";
export const DEMO_PROJECT_ID = "Onboarding";

// tldraw v3+ stores rich text (ProseMirror JSON) instead of a plain
// string. Feature-detect the export so this works whether your
// installed tldraw is on the old plain-text API or the newer rich-text
// one, instead of hardcoding a format that might not match your version.
const supportsRichText = typeof _toRichText === "function";
const textField = (text) =>
  supportsRichText ? { richText: _toRichText(text) } : { text };

// Simple left-to-right, two-row layout. Tweak x/y/text to taste — this
// is the one place you'll ever need to edit to change what participants
// see, since it's plain code instead of something built by hand on a
// template canvas.
const COL = 320;
const ROW = 240;

const NOTES = [
  {
    x: 0,
    y: -320,
    size: "xl",
    color: "grey",
    text: "Welcome to PolyFlux — work through these notes in order, then try the practice zone below. Nothing here affects your real task.",
  },
  {
    x: 0,
    y: 0,
    color: "grey",
    text: "Start here.\nFollow the notes in order.",
  },
  {
    x: COL,
    y: 0,
    color: "yellow",
    text: "Add a sticky note.\nDouble-click anywhere on the canvas to drop a note like this one.",
  },
  {
    x: COL * 2,
    y: 0,
    color: "blue",
    text: "Draw and write.\nUse the left toolbar to sketch, add text, or drop shapes.",
  },
  {
    x: COL * 3,
    y: 0,
    color: "green",
    text: "Add an image.\nDrag a file in, or paste one from your clipboard.",
  },
  {
    x: 0,
    y: ROW,
    color: "orange",
    text: "React and comment.\nSelect a shape, then use its toolbar to comment or react.",
  },
  {
    x: COL,
    y: ROW,
    color: "violet",
    text: "Connect ideas.\nDrag from a shape's edge to link it to another with an arrow.",
  },
  {
    x: COL * 3,
    y: ROW,
    color: "grey",
    text: "You're ready.\nHead back and open your assigned whiteboard to start the task.",
  },
];

// A dashed placeholder where a real image can be dropped in manually —
// avoids needing to pre-upload a tldraw image asset, which is a separate
// (storage-dependent) step.
const IMAGE_PLACEHOLDER = { x: COL * 2, y: ROW };

// A big dashed rectangle participants can freely draw/experiment in.
const PRACTICE_ZONE = { x: 0, y: ROW * 2 + 60, w: COL * 4 - 40, h: 320 };

export function isDemoRoom(className, projectName) {
  return className === DEMO_CLASS_ID && projectName === DEMO_PROJECT_ID;
}

export function seedDemoBoardIfEmpty(editor) {
  try {
    const existingCount = editor.getCurrentPageShapeIds().size;
    if (existingCount > 0) {
      // Already seeded (or the participant has already drawn on it) —
      // never overwrite their board.
      return;
    }

    const shapesToCreate = [];

    NOTES.forEach((n) => {
      shapesToCreate.push({
        id: createShapeId(),
        type: "note",
        x: n.x,
        y: n.y,
        props: {
          color: n.color,
          size: n.size || "m",
          ...textField(n.text),
        },
      });
    });

    shapesToCreate.push({
      id: createShapeId(),
      type: "geo",
      x: IMAGE_PLACEHOLDER.x,
      y: IMAGE_PLACEHOLDER.y,
      props: {
        geo: "rectangle",
        color: "grey",
        dash: "dashed",
        fill: "none",
        w: 260,
        h: 160,
        ...textField("Example image\n(drag one in here)"),
      },
    });

    shapesToCreate.push({
      id: createShapeId(),
      type: "geo",
      x: PRACTICE_ZONE.x,
      y: PRACTICE_ZONE.y,
      props: {
        geo: "rectangle",
        color: "light-blue",
        dash: "dashed",
        fill: "none",
        w: PRACTICE_ZONE.w,
        h: PRACTICE_ZONE.h,
        ...textField("Practice zone — try the tools here"),
      },
    });

    editor.createShapes(shapesToCreate);
    editor.zoomToFit();
  } catch (err) {
    console.error("Auto-seeding demo board failed:", err);
  }
}
