// House date style for every EV Exec screen and message (user decision,
// 2026-10-04): dates DD/MM/YYYY, times 24-hour HH:MM, UK time.

const UK = "Europe/London";

/** A plain YYYY-MM-DD date as DD/MM/YYYY (rearranged directly, so no
 *  timezone can shift the day). Anything else is treated as a timestamp. */
export function fmtDate(value: string | Date | null | undefined): string {
  if (!value) return "";
  if (typeof value === "string") {
    const m = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (m) return `${m[3]}/${m[2]}/${m[1]}`;
  }
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: UK });
}

/** A timestamp's time as 24-hour HH:MM, UK time. */
export function fmtTime(value: string | Date | null | undefined): string {
  if (!value) return "";
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: UK });
}

/** A timestamp as DD/MM/YYYY HH:MM, UK time. */
export function fmtDateTime(value: string | Date | null | undefined): string {
  if (!value) return "";
  return `${fmtDate(value instanceof Date ? value : new Date(value))} ${fmtTime(value)}`;
}

/** Short weekday + date, e.g. "Mon 05/10/2026" (dispatch/day headers). */
export function fmtDayDate(value: string | Date | null | undefined): string {
  if (!value) return "";
  const d = typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? new Date(`${value}T12:00:00Z`)
    : value instanceof Date ? value : new Date(value);
  const day = d.toLocaleDateString("en-GB", { weekday: "short", timeZone: UK });
  return `${day} ${fmtDate(typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : d)}`;
}

// ── UK clock ↔ moments in time ────────────────────────────────────────────────
// A booking's date and time are UK wall-clock values. These turn them into a
// real moment (and back) without using the device's own timezone, so a phone
// or laptop set to another zone still sees the right times.

function ukParts(t: number) {
  const p = new Intl.DateTimeFormat("en-GB", {
    timeZone: UK, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
  }).formatToParts(new Date(t));
  const get = (type: string) => Number(p.find((x) => x.type === type)?.value);
  return { y: get("year"), m: get("month"), d: get("day"), h: get("hour"), mi: get("minute"), s: get("second") };
}

/** UK date (YYYY-MM-DD) + time (HH:MM[:SS]) → ISO timestamp (UTC), or null. */
export function ukToIso(date: string | null | undefined, time: string | null | undefined): string | null {
  const dm = String(date || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const tm = String(time || "").match(/^(\d{1,2}):(\d{2})/);
  if (!dm || !tm) return null;
  const wall = Date.UTC(+dm[1], +dm[2] - 1, +dm[3], +tm[1], +tm[2]);
  // UK is UTC+0 or UTC+1: start from the wall time read as UTC and correct by
  // the UK offset at that moment (twice, to settle across a clock change).
  let t = wall;
  for (let i = 0; i < 2; i++) {
    const p = ukParts(t);
    const offset = Date.UTC(p.y, p.m - 1, p.d, p.h, p.mi, p.s) - t;
    t = wall - offset;
  }
  return new Date(t).toISOString();
}

/** The UK calendar date (YYYY-MM-DD) of a timestamp. */
export function ukDateOf(value: string | Date | null | undefined): string | null {
  if (!value) return null;
  const t = (value instanceof Date ? value : new Date(value)).getTime();
  if (Number.isNaN(t)) return null;
  const p = ukParts(t);
  return `${p.y}-${String(p.m).padStart(2, "0")}-${String(p.d).padStart(2, "0")}`;
}

/** The UK hour (0–23) of a timestamp. */
export function ukHourOf(value: string | Date | null | undefined): number | null {
  if (!value) return null;
  const t = (value instanceof Date ? value : new Date(value)).getTime();
  return Number.isNaN(t) ? null : ukParts(t).h;
}
