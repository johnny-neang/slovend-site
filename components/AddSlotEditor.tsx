"use client";

import { useRef, useState, useTransition } from "react";
import { saveProductMedia } from "@/app/dashboard/inventory/actions";
import { toSquareWebp } from "@/lib/square-image";
import { slotToMdb } from "@/lib/slot-code";

/**
 * Declare a slot Nayax isn't returning yet. The operator types the slot they see
 * on the machine (e.g. "503"); we derive + show the MDB code, then store it as a
 * manual entry. When Nayax later returns that MDB code the row links automatically.
 */
export default function AddSlotEditor() {
  const [open, setOpen] = useState(false);
  const [slot, setSlot] = useState("");
  const [preview, setPreview] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);

  const mdb = slotToMdb(slot);
  const valid = mdb != null;
  const showSlot = slot.trim().length > 0;

  function reset() {
    setOpen(false);
    setSlot("");
    setPreview(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (f) setPreview(URL.createObjectURL(f));
  }

  function onSave(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (mdb == null) return;
    const form = e.currentTarget;
    const name = (form.elements.namedItem("name") as HTMLInputElement).value;
    const description = (form.elements.namedItem("description") as HTMLTextAreaElement).value;
    const file = fileRef.current?.files?.[0];

    startTransition(async () => {
      const fd = new FormData();
      fd.set("manualSlot", "1");
      fd.set("slot", slot.trim());
      fd.set("mdbCode", String(mdb));
      fd.set("name", name);
      fd.set("description", description);
      if (file) {
        const blob = await toSquareWebp(file);
        const ext = blob.type.split("/")[1] || "webp";
        fd.set("image", blob, `slot-${mdb}.${ext}`);
      }
      await saveProductMedia(fd);
      reset();
    });
  }

  return (
    <>
      <button type="button" className="inv-add-btn" onClick={() => setOpen(true)}>
        + Add slot
      </button>

      {open && (
        <div className="pm-overlay" role="dialog" aria-modal="true" aria-labelledby="add-slot-title" onClick={reset}>
          <form className="pm-panel" onClick={(e) => e.stopPropagation()} onSubmit={onSave}>
            <div className="pm-head">
              <span className="kicker" id="add-slot-title">Add a slot manually</span>
              <button type="button" className="pm-x" onClick={reset} aria-label="Close">
                ×
              </button>
            </div>

            <label className="pm-field">
              <span>Slot number</span>
              <input
                value={slot}
                onChange={(e) => setSlot(e.target.value.replace(/\D/g, ""))}
                inputMode="numeric"
                placeholder="e.g. 503"
                autoFocus
              />
            </label>
            <p className="pm-note">
              {showSlot && valid ? (
                <>
                  → <strong>MDB {mdb}</strong> · Row {mdb >> 8}, Col {mdb & 0xff}
                </>
              ) : showSlot ? (
                <span style={{ color: "var(--cherry)" }}>
                  Not a valid slot. Use row + 2-digit column, e.g. 503 (row 5, col 3).
                </span>
              ) : (
                <>Row + column, e.g. 503 = row 5, column 3.</>
              )}
            </p>

            <div className="pm-thumb">
              {preview ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={preview} alt="" />
              ) : (
                <span className="inv-thumb-ph">{valid ? slot : "—"}</span>
              )}
            </div>

            <label className="pm-field">
              <span>Photo</span>
              <input ref={fileRef} type="file" accept="image/*" onChange={onPick} />
            </label>

            <label className="pm-field">
              <span>Name</span>
              <input name="name" placeholder="e.g. Coca-Cola 12oz" />
            </label>

            <label className="pm-field">
              <span>Description</span>
              <textarea name="description" rows={2} placeholder="Optional notes shown on the card" />
            </label>

            <p className="pm-note">
              Saved as a <strong>Manual</strong> slot, flagged <strong>Not in Nayax</strong> until
              Nayax starts reporting it.
            </p>

            <div className="pm-actions">
              <span className="pm-spacer" />
              <button type="button" className="pm-cancel" onClick={reset} disabled={pending}>
                Cancel
              </button>
              <button type="submit" className="pm-save" disabled={pending || !valid}>
                {pending ? "Saving…" : "Add slot"}
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
