"use client";

/** A machine timezone selector that auto-saves on change via a server action. */
export default function TimezoneSelect({
  value,
  options,
  action,
}: {
  value: string;
  options: readonly string[];
  action: (formData: FormData) => void | Promise<void>;
}) {
  return (
    <form action={action} className="tz-form">
      <select
        name="timezone"
        defaultValue={value}
        aria-label="Machine timezone"
        onChange={(e) => e.currentTarget.form?.requestSubmit()}
      >
        {options.map((tz) => (
          <option key={tz} value={tz}>
            {tz.replace(/_/g, " ")}
          </option>
        ))}
      </select>
    </form>
  );
}
