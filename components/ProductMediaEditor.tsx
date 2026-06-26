"use client";

import { useRef, useState, useTransition } from "react";
import { saveProductMedia, removeProductMedia } from "@/app/dashboard/inventory/actions";
import { toSquareWebp } from "@/lib/square-image";

type Props = {
  mdbCode: number;
  slot: string;
  hasManual: boolean;
  initialName: string | null;
  initialDescription: string | null;
  initialImageUrl: string | null;
};

export default function ProductMediaEditor({
  mdbCode,
  slot,
  hasManual,
  initialName,
  initialDescription,
  initialImageUrl,
}: Props) {
  const [open, setOpen] = useState(false);
  const [preview, setPreview] = useState<string | null>(initialImageUrl);
  const [pending, startTransition] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);

  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (f) setPreview(URL.createObjectURL(f));
  }

  function onSave(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const name = (form.elements.namedItem("name") as HTMLInputElement).value;
    const description = (form.elements.namedItem("description") as HTMLTextAreaElement).value;
    const file = fileRef.current?.files?.[0];

    startTransition(async () => {
      const fd = new FormData();
      fd.set("mdbCode", String(mdbCode));
      fd.set("name", name);
      fd.set("description", description);
      if (file) {
        const blob = await toSquareWebp(file);
        const ext = blob.type.split("/")[1] || "webp";
        fd.set("image", blob, `slot-${mdbCode}.${ext}`);
      }
      await saveProductMedia(fd);
      setOpen(false);
    });
  }

  function onRemove() {
    startTransition(async () => {
      const fd = new FormData();
      fd.set("mdbCode", String(mdbCode));
      await removeProductMedia(fd);
      setPreview(null);
      setOpen(false);
    });
  }

  return (
    <>
      <button type="button" className="inv-edit-btn" onClick={() => setOpen(true)}>
        {hasManual ? "Edit" : "Add photo"}
      </button>

      {open && (
        <div className="pm-overlay" role="dialog" aria-modal="true" onClick={() => setOpen(false)}>
          <form className="pm-panel" onClick={(e) => e.stopPropagation()} onSubmit={onSave}>
            <div className="pm-head">
              <span className="kicker">Slot {slot} · MDB {mdbCode}</span>
              <button type="button" className="pm-x" onClick={() => setOpen(false)} aria-label="Close">
                ×
              </button>
            </div>

            <div className="pm-thumb">
              {preview ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={preview} alt="" />
              ) : (
                <span className="inv-thumb-ph">{slot}</span>
              )}
            </div>

            <label className="pm-field">
              <span>Photo</span>
              <input ref={fileRef} type="file" accept="image/*" onChange={onPick} />
            </label>

            <label className="pm-field">
              <span>Name</span>
              <input name="name" defaultValue={initialName ?? ""} placeholder="e.g. Coca-Cola 12oz" />
            </label>

            <label className="pm-field">
              <span>Description</span>
              <textarea
                name="description"
                rows={2}
                defaultValue={initialDescription ?? ""}
                placeholder="Optional notes shown on the card"
              />
            </label>

            <p className="pm-note">Saved entries are flagged <strong>Manual</strong>.</p>

            <div className="pm-actions">
              {hasManual && (
                <button type="button" className="pm-remove" onClick={onRemove} disabled={pending}>
                  Remove
                </button>
              )}
              <span className="pm-spacer" />
              <button type="button" className="pm-cancel" onClick={() => setOpen(false)} disabled={pending}>
                Cancel
              </button>
              <button type="submit" className="pm-save" disabled={pending}>
                {pending ? "Saving…" : "Save"}
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
