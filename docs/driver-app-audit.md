# EV Exec Driver App — Market Audit & Gap Analysis

> Scope note: `evexecdriverapp` source is in a separate repository. This audit is
> reconstructed from the **shared Supabase data model** and the **operator↔driver
> integration contract** visible in this repo (`/api/jobs` dispatch bridge,
> `drivers`/`bookings` tables, notification + availability tables), then
> benchmarked against best-in-market driver apps. Capability gaps are inferred
> from the absence of supporting data structures, not from reading driver-app code.

## Benchmark set
Premium airport-transfer / chauffeur context → **Blacklane, Wheely, Addison Lee**
(executive), plus **Uber / Bolt / Lyft Driver** (UX standards) and **Onfleet**
(dispatch / proof-of-delivery).

## What the driver app does today (reconstructed)
- Receives jobs from the operator via `POST /api/jobs`; status pushed via `PATCH /api/jobs/:ref`.
- Shares one Supabase backend: `bookings`, `drivers`, `driver_unavailable_dates`, notifications.
- Driver model: `name, phone, email, vehicle, plate, status, rating`.
- Job lifecycle the driver drives: `Dispatched → En Route → Passenger On Board → Completed` (or `Cancelled`).
- Day-off scheduling exists; operator-side licence/insurance/MOT expiry tracking exists.

## ⚠️ Correction after inspecting the live database
The initial gap list was inferred from the repo's typed model. Cross-checking the
**live EV Exec Supabase schema** revealed infrastructure the repo types omit,
which **invalidates three earlier findings**:

- **`push_subscriptions`** (driver_id + Web Push keys `endpoint`/`p256dh`/`auth_key`,
  plus customer fields) → **driver push infra already exists** (Web Push). The gap
  is narrower than stated: confirm new-job pushes are actually *triggered* to drivers.
- **`booking_expenses`** (`booking_id, type, amount, notes`) → **per-booking
  waiting-time / tolls / extras capture already exists**. Gap is only whether the
  driver app *surfaces* it.
- **`reviews`** (`reviewer_name, rating, source, is_featured` — **no booking_id /
  driver_id**) → this is a **marketing/testimonial** store, *not* per-trip two-way
  ratings. So the ratings gap stands, but refined.

Other live tables confirming a richer back end than the types show: `notification_log`,
`notification_queue`, `profiles`, `saved_addresses`, `booking_audit_log`, `reviews`.

## Gaps by severity

### P0 — table stakes
| Gap | Evidence | Impact |
|---|---|---|
| Live GPS location / tracking | No lat/lng/heading columns (now added: `driver_locations`) | No live ETA, no map, no "driver 6 min away" |
| Turn-by-turn navigation hand-off | No nav deeplink/route data | Drivers expect one-tap Navigate |
| Proof of pickup / completion | No photo/signature/POB-timestamp fields | No dispute/billing evidence |
| ~~Push notifications to drivers~~ → **partially built** | `push_subscriptions` table exists (Web Push) | Gap is *triggering* job pushes, not infra |

### P1 — premium differentiators
- Live flight status on the driver side (operator has `check-flight`; driver side blind to delays).
- Job **Offered → Accepted/Declined** loop with timeout + auto-reassign (today jumps straight to Dispatched).
- In-app masked driver↔passenger contact (only free-text `driver_notes` + `contact_method`).
- Driver earnings / payout visibility.
- **Per-trip** two-way ratings (`reviews` exists but is marketing testimonials with no booking/driver link; `drivers.rating` isn't populated from completed trips).
- Airport meet-&-greet / arrivals / name-board workflow.

### P2 — operational maturity
- Driver self-service compliance uploads + expiry reminders.
- Safety: SOS / incident report / share-trip.
- ~~Waiting-time / tolls / extras capture~~ → **already exists** (`booking_expenses`); confirm the driver app exposes it.
- Offline write-queue for status updates (airport dead zones).
- Clock-in/out / online-offline utilisation.

## Meta-finding
The platform is **operator-push dispatch with a thin driver client**: the driver
app receives jobs and reports status but is not the system of record for
location, acceptance, proof, or economics. Best-in-market inverts this — the
driver client is the sensor (GPS, acceptance, proof, earnings) and the back
office subscribes to it. Closing P0 flips the architecture onto that model.

## Recommended changes (mapped to this stack)

**P0**
1. **Live location** — `driver_locations` table + Supabase Realtime; driver app upserts every ~10s on active jobs; operator dashboard + customer page subscribe → real ETAs + live map. *(Backend + operator side started in `003_driver_live_tracking.sql` + `useDriverLocations`.)*
2. **Acceptance state machine** — `Offered → Accepted/Declined` before `Dispatched`; `POST /api/jobs/:ref/accept|decline` with timeout auto-reassign.
3. **Driver push** — infra exists (`push_subscriptions`/Web Push). Wire the *trigger*: send a push on offer/assignment/cancellation. (Not build-from-scratch.)
4. **Proof of job** — `pob_at`, `completed_at`, `job_proofs` storage bucket (photo/signature).

**P1**
5. Live flight status in-app reusing the `check-flight` function with delay-shifted suggested pickup.
6. Masked contact / quick messages via the existing SMS function.
7. Earnings view — derive from `booking_expenses` + base fare (base, waiting, extras, total) + weekly summary.
8. Per-trip two-way ratings linked to `booking_id`/`driver_id`, post-completion prompt feeding `drivers.rating` (distinct from the marketing `reviews` table).

**P2**
9. Compliance self-service uploads + expiry reminders (close the loop on operator tracking).
10. Safety — SOS + share-trip link.
11. Surface the existing `booking_expenses` (waiting-time / extras) in the driver app at job close.
12. Offline status write-queue.

## Status of this work
- [x] Audit written (this doc)
- [x] Corrected against the live Supabase schema (push/expenses/reviews findings revised)
- [x] P0 #1 schema: `driver_locations` (`supabase/migrations/003_driver_live_tracking.sql`) — **applied to the live EV Exec project**
- [x] P0 #1 operator side: `useDriverLocations` hook + live presence badge in Fleet view
- [x] P0 #1 live location is actionable (tap-to-locate in Maps) + shown on each job card
- [ ] P0 #1 live map + GPS-derived ETA (next increment)
- [x] P0 #2 offer/acceptance — additive offer columns (`005_job_offer_acceptance.sql`, not applied) + operator offer badge (Awaiting/Accepted/Declined/Expired with countdown). Driver app still needs `/api/jobs/:ref/accept|decline`.
- [ ] P0 #3 wire job-push triggers onto existing `push_subscriptions`
- [x] P0 #4 proof-of-job schema (`004_proof_of_job.sql`: `bookings.pob_at/completed_at` + `job_proofs`) + operator-side display (migration not yet applied to live DB)
- [ ] P0 #4 driver-app capture UI (photo/signature) — needs `evexecdriverapp`
