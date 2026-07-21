import React, { useState } from "react";
import { useEditor, createShapeId, toRichText as _toRichText } from "tldraw";

// ---------------------------------------------------------------------
// TEMPORARY dev tool — NOT for production use.
//
// This is a one-time seeder for the demo whiteboard template
// (classrooms/DemoStudy/Project/Onboarding/teams/template). It builds the
// welcome/tutorial content by calling the real tldraw editor's
// `editor.createShapes()` API — the same call your app already makes for
// normal user interactions — so whatever sync layer you have wired up
// (the one that writes shape docs to
// classrooms/{class}/Project/{project}/teams/{team}/shapes/{shapeId})
// persists these exactly the way it persists any other user-made shape.
// No guessing about Firestore field names required.
//
// HOW TO USE:
//   1. Temporarily render <SeedDemoBoardButton /> inside whatever page
//      mounts your <Tldraw> canvas (e.g. next to ContextToolbarComponent),
//      or drop it into a scratch route.
//   2. Log in and open the template board:
//        /whiteboard/DemoStudy/Onboarding/template
//      (If your Firestore rules gate writes by team membership, you may
//      need to temporarily add yourself to that team doc, or relax the
//      rule for this one path, while you seed it.)
//   3. Click "Seed demo content" once. Confirm the shapes appear and
//      sync to Firestore as expected.
//   4. Delete this file and remove it from wherever you mounted it.
//
// If you re-run it, it clears any shapes it previously created (tracked
// via a "seededBy: demo-seed-v1" meta tag) before recreating them, so
// it's safe to click more than once — it won't pile up duplicates.
// ---------------------------------------------------------------------

const SEED_TAG = "demo-seed-v1";

// tldraw v3+ stores rich text (ProseMirror JSON) instead of a plain
// string. Feature-detect the export so this works whether your
// installed tldraw is on the old plain-text API or the newer rich-text
// one, instead of hardcoding a format that might not match your version.
const supportsRichText = typeof _toRichText === "function";
const textField = (text) =>
  supportsRichText ? { richText: _toRichText(text) } : { text };

// Simple left-to-right, two-row layout. Tweak x/y to taste.
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

const SeedDemoBoardButton = () => {
  const editor = useEditor();
  const [status, setStatus] = useState("idle");

  const seed = () => {
    setStatus("seeding");
    try {
      // Clear anything this seeder created before, so re-running is safe.
      const existing = editor
        .getCurrentPageShapes()
        .filter((s) => s.meta?.seededBy === SEED_TAG)
        .map((s) => s.id);
      if (existing.length) {
        editor.deleteShapes(existing);
      }

      const shapesToCreate = [];

      NOTES.forEach((n) => {
        shapesToCreate.push({
          id: createShapeId(),
          type: "note",
          x: n.x,
          y: n.y,
          meta: { seededBy: SEED_TAG },
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
        meta: { seededBy: SEED_TAG },
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
        meta: { seededBy: SEED_TAG },
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

      setStatus("done");
    } catch (err) {
      console.error("Demo board seeding failed:", err);
      setStatus("error");
    }
  };

  return (
    <div style={{ position: "fixed", bottom: 16, right: 16, zIndex: 9999 }}>
      <button
        onClick={seed}
        disabled={status === "seeding"}
        style={{
          padding: "10px 16px",
          borderRadius: 8,
          border: "1px solid #333",
          background: "#111",
          color: "#fff",
          fontWeight: 600,
          cursor: "pointer",
        }}
      >
        {status === "seeding"
          ? "Seeding…"
          : status === "done"
          ? "Seeded ✓ (click to re-seed)"
          : status === "error"
          ? "Failed — check console, click to retry"
          : "Seed demo content"}
      </button>
    </div>
  );
};

export default SeedDemoBoardButton;
