// A short, soft two-tone chime for new-booking alerts. Uses the Web Audio API
// so there's no asset to load. Best-effort: silently no-ops if audio is blocked
// (e.g. before any user interaction) or unavailable.

let ctx = null;

export function playNewBookingChime() {
  try {
    if (typeof window === "undefined") return;
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    ctx = ctx || new AudioCtx();
    if (ctx.state === "suspended") ctx.resume().catch(() => {});

    const now = ctx.currentTime;
    // Two rising notes — a friendly "ding-dong".
    [
      { f: 660, t: 0 },
      { f: 880, t: 0.12 },
    ].forEach(({ f, t }) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = f;
      gain.gain.setValueAtTime(0.0001, now + t);
      gain.gain.exponentialRampToValueAtTime(0.15, now + t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + t + 0.22);
      osc.connect(gain).connect(ctx.destination);
      osc.start(now + t);
      osc.stop(now + t + 0.24);
    });
  } catch {
    /* audio unavailable — ignore */
  }
}
