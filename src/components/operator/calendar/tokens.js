// Design tokens for the operator calendar. Registered in tailwind.config.ts
// (`cal-*` colours, `text-cal-*` sizes, `rounded-cal*`, `shadow-cal-pop`); this
// file is the same set for anything outside Tailwind and the reference for
// what each one is for. Components use only these values.

export const calendarTokens = {
  color: {
    paper: "#F6F2EA",      // page surface
    sheet: "#FFFDF8",      // raised surface: side panel, popovers, inputs
    well: "#EEE7D9",       // selection fill (selected row, active control)
    line: "#E5DDCC",       // hairline separators
    rule: "#D2C7B1",       // control borders, stronger rules
    ink: "#141821",        // primary text; selected date
    ink2: "#3A3F4A",       // secondary text: routes
    muted: "#6D6656",      // metadata, labels
    faint: "#8A8170",      // decorative only (out-of-month days, arrows, disabled): 3.4:1, never for meaning
    brass: "#9C7B34",      // accent: today, focus ring, active filter
    brassInk: "#76591F",   // accent text on paper; awaiting reply
    brassSoft: "#F2E8CF",
    ok: "#2F6B50",         // driver assigned
    alert: "#A3402C",      // needs driver, clash, unavailable driver
    alertSoft: "#F7E4DC",
    road: "#2E5C88",       // en route / on board
  },
  font: {
    display: "Manrope, system-ui, sans-serif", // headings only
    ui: "Manrope, system-ui, sans-serif",
  },
  // name: [size, line height] — text-cal-<name>
  type: {
    label: ["10.5px", "14px", "uppercase, semibold, 0.09em"],
    xs: ["12px", "16px", "metadata, exceptions"],
    sm: ["13px", "18px", "routes, controls"],
    base: ["14px", "19px", "passenger names"],
    time: ["15px", "19px", "pickup times, semibold, tabular"],
    lg: ["18px", "23px", "section headings (display)"],
    xl: ["24px", "28px", "page heading on phones (display)"],
    "2xl": ["30px", "34px", "page heading from lg (display)"],
  },
  space: { gutter: 16, row: "10px vertical", section: 16, tight: 4 }, // Tailwind's 4px scale
  radius: { mark: 2, control: 6, panel: 10 },
  icon: { inline: 14, control: 16 },
  control: { phone: 40, desktop: 36 }, // heights: h-10 / sm:h-9
  focus: "2px brass ring (focus-visible only)",
  selection: { date: "ink square behind the numeral", row: "well fill + 3px ink bar" },
};

// Per-job status mark. Shape carries meaning as well as colour: hollow =
// waiting on the office; filled = in hand.
export const STATE_STYLE = {
  reply:     { mark: "border-[1.5px] border-cal-brass bg-transparent", text: "text-cal-brass-ink", label: "Awaiting reply" },
  driver:    { mark: "border-[1.5px] border-cal-alert bg-transparent", text: "text-cal-alert", label: "Needs driver" },
  assigned:  { mark: "bg-cal-ok", text: "text-cal-ok", label: "Driver assigned" },
  road:      { mark: "bg-cal-road", text: "text-cal-road", label: "On the road" },
  done:      { mark: "bg-cal-faint", text: "text-cal-muted", label: "Completed" },
  cancelled: { mark: "border border-cal-faint bg-transparent", text: "text-cal-faint", label: "Cancelled" },
};
