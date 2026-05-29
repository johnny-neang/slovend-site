"use client";

import { usePathname } from "next/navigation";
import { useRef } from "react";
import { setSelectedMachine } from "@/app/dashboard/actions";

export default function MachineSelector({
  machines,
  selectedId,
}: {
  machines: { id: string; name: string }[];
  selectedId: string;
}) {
  const pathname = usePathname();
  const formRef = useRef<HTMLFormElement>(null);
  if (!machines.length) return null;

  return (
    <form ref={formRef} action={setSelectedMachine} className="machine-select">
      <input type="hidden" name="from" value={pathname} />
      <label htmlFor="machineId" className="ms-label">
        Machine
      </label>
      <select
        id="machineId"
        name="machineId"
        defaultValue={selectedId}
        onChange={() => formRef.current?.requestSubmit()}
      >
        {machines.map((m) => (
          <option key={m.id} value={m.id}>
            {m.name}
          </option>
        ))}
      </select>
    </form>
  );
}
