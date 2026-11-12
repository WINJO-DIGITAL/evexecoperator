# Cost policy (hard constraint — read before doing anything)

**We do not pay for any additional cost, under any circumstance, without explicit prior approval from the user.**

This applies to all three repos in this project (`evexec`, `evexecoperator`, `evexecdriverapp`) and to the shared Supabase project (`yoltkmhtxwluqxxpewbl`) they all depend on.

- **No new billed resources, ever, without asking first.** This includes (not an exhaustive list): Supabase database branches, additional Supabase projects, upgraded Supabase/Vercel plan tiers or add-ons, new paid third-party APIs or SaaS tools, additional cloud compute, paid monitoring/observability tiers, domain purchases, etc.
- **Twilio SMS is dormant (user decision, 2026-10-03).** All Twilio sending (SMS, WhatsApp, voice) across the three repos is gated behind an `SMS_ENABLED=true` env var / Supabase secret, which is unset, so nothing is sent or billed. Customer updates are now sent manually from the driver's or operator's own phone via pre-filled `sms:` links. Do not set `SMS_ENABLED`, remove the gate, or add new Twilio-sending flows without explicit approval.
- **Before taking any action that would create a new billed resource or increase spend on an existing one, stop and ask.** This applies even to trivially small amounts (pennies, hourly micro-charges) — the rule is "always ask first," not "ask only above some threshold."
- **Prefer free tiers and already-provisioned infrastructure.** When a task could be done either by spinning up a paid resource (e.g. a Supabase branch to test a migration) or by a slower/more careful free alternative (e.g. read-only validation queries plus additive, reversible migrations applied directly, with review), default to the free alternative unless the user has explicitly approved the paid one.
- Abandon or redesign any plan that turns out to require a new cost, rather than proceeding and asking forgiveness after the fact.

<!-- BEGIN:nextjs-agent-rules -->

# Legal wording (hard rule, user decision 12/11/2026)

**No solicitor or lawyer is used, and none can be afforded.** Terms, privacy policies and any other legal or compliance wording are drafted from, and checked against, official UK sources (legislation.gov.uk, the CMA, the ICO, gov.uk), with the sources, the changes made and the residual risks recorded in `evexec/docs/legal/audit-2026-11-12.md`. Never suggest "have a solicitor review this". Say what was checked, what could not be verified, and what the owner must do. Not legal advice and not a guarantee: be honest about that.

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Update — 2026-10-14: payment links by email + two-tap text (live)

`/api/payment-link` no longer queues a Twilio SMS (it never sent: Twilio is dormant). It creates the Stripe checkout, emails it via Resend in the shared design (`paymentLink` from `src/lib/email/content.js`) when the booking has an email, and returns `smsHref` (an `sms:` link with the message pre-written, house date style) when it has a phone. The booking drawer's "Send payment link" button then shows "Text link to customer" (opens Messages, operator presses Send) and "Copy link". Payment is still recorded by the website's Stripe webhook (`metadata[booking_ref]`).

## Update — 2026-10-14: Settings saved to the database, dead controls removed (SaaS quick wins)

- **Settings → Business** saves to the operator's own `tenants` row (name, contact email/phone, and the invoice letterhead in `brand.invoice`) through the `update_tenant_profile` RPC (operator_admin or super_admin only; migration `20261014120000_tenant_profile_settings.sql` in `evexec`). Hook: `src/hooks/operator/useTenantProfile.js`. Nothing in Settings uses localStorage any more (the old `evexec_settings` key is ignored).
- **Invoices** read the letterhead from the same row (`companyFrom()` in `invoices/page.jsx`), with the old fixed values only as a fallback.
- **Prices** (superseded 15/10/2026, see below): `src/lib/prices.ts` was a copy of the website's price list. Settings → Prices showed it read-only; the New Booking form suggests the price from it (superseded 17/10/2026: now `fixedTripPrice`, the whole return fare on the outbound booking; see the 17/10/2026 entry). The suggestion follows the route and the return tick until the operator types a price. Invoices use the business name (Settings saves it as `brand.invoice.business_name` too; there is no separate invoice-name field).
- **Security**: "Change password" now really changes it (checks the current password first). The two-factor and session-timeout switches were removed (they did nothing).
- **Removed** because they did nothing: notification "Alert preferences" toggles, "Auto-assign" and "Show prices" switches, waiting/child-seat rates, the WhatsApp channel, the SMS on/off and "SMS only when necessary" switches (Twilio is dormant), the Google Maps "coming soon" item. "Demo mode" status label renamed "Not connected".
- **Redirect-only pages** (`/`, `/operator`, `/operator/dashboard`, `/operator/bookings`) are now `redirects()` in `next.config.mjs`, same destinations.

## Update — 2026-10-14: navigation & screen consolidation (SaaS phase 1)

- **One shell context** (`src/components/operator/OperatorContext.jsx`, provided by `Layout.jsx`): `openNewBooking(initialValues, { eyebrow, heading, onCreated })` opens the one New Booking form (`BookingModal`); `inbox` holds quote requests, missed calls and website messages (single subscription each) and the unread count; `profile` is the signed-in user (name, email, role) and the business (`tenants` row). Use these instead of loading the same data again in a screen.
- **Navigation** (`Sidebar.jsx`): labelled sidebar with the business name from lg, icon rail with small labels on tablets, phone bar = Calendar, Dispatch, Inbox, Drivers + "More" sheet (Invoices, Analytics, Settings, Driver app, Booking page, Sign out). Inbox shows a red count badge everywhere.
- **New screens/sections**: `/operator/inbox` (quotes → "Create Booking" opens the main form pre-filled via `quoteToBookingForm()`, quote marked converted on create; missed calls; messages). Settings → Activity log (`booking_audit_log`). Settings sections deep-link with `?section=` (e.g. `security`).
- **Header**: account menu (name, role, business, Settings, Change password, Sign out) replaces the fixed "Operator / Control Room" chip and separate sign-out button. The bell is new bookings only, with a link to the Inbox for everything else.
- **Calendar** (`CalendarApp.tsx`) is now only the month view + selected day (side by side on desktop). Its old Transfers / Inbox / Fleet / Activity tabs, its second booking form (`AddBookingModal`), its own header and its duplicate new-booking chime were removed.
- **Removed fake data**: driver "Rating" (always 5.0, nothing collects ratings). Analytics month labels are MM/YYYY (house date style). Invoice "Thank you for choosing …" uses the business name.
- **Airport detection** is one helper, `looksLikeAirport()` in `src/lib/bookingUtils.ts`, case-insensitive. The five old copies only matched lower-case "airport", so typed names like "Manchester Airport" were saved as Point to Point with no airport and got no price suggestion.

## Update — 2026-10-14: Today + one Bookings screen (SaaS phase 2)

- **Navigation is now** Today, Bookings, Inbox, Drivers, Invoices, Analytics, Settings (phone: Today, Bookings, Inbox, Drivers + More). `/`, `/operator` and `/operator/dashboard` go to Today; `/operator/dispatch` → `/operator/bookings` and `/operator/calendar` → `/operator/bookings?view=calendar` (redirects in `next.config.mjs`; `?q=` passes through, so website/push links still find the job).
- **Today** (`/operator/today`): summary tiles, "Needs you" (website requests to accept, jobs in the next 48 h with no driver, completed jobs unpaid), today's jobs in time order, drivers' day. Definitions live in `src/lib/operator/bookingBuckets.js` (shared with the Board, tested).
- **Bookings** (`/operator/bookings?view=list|calendar|board`): List = the old Dispatch board (`components/operator/BookingsList.jsx`, its "Today's Schedule" sub-view removed; Today covers it; desktop rows now show the date), Calendar = `CalendarApp`, Board = `components/operator/BookingsBoard.jsx` (next 7 days by Needs reply / Needs driver / Driver assigned / On the road / Done today).
- **One booking drawer**: `useBookingDrawer(api, drivers)` (`components/operator/useBookingDrawer.jsx`) holds the drawer and all its actions; every list uses it. Return journeys open the shell's New Booking form.
- **Bookings loading window (bug fix)**: `useBookings()` used to load the 100 OLDEST bookings, so upcoming jobs would have dropped off once there were more than 100 (71 on 14/10/2026). Now `scope: "operational"` (default) loads from 14 days ago (UK date) onwards plus undated, with "Show earlier bookings" (`loadEarlier`); `scope: "all"` for Analytics and the customer look-up. The 60-second refresh keeps pages already loaded.
- **Status pills** (`lib/operator/statusColor.js`) use dark text on pale fills; the old dark-theme colours were near-unreadable on white.

## Update — 2026-10-14: Customers, Team & roles, password emails, setup checklist (SaaS phase 3)

- **Customers** (`/operator/customers`): built from all bookings (no customer table); bookings are one customer when they share a phone (UK formats normalised, `+44…` = `0…`) or email, transitively (`src/lib/operator/customers.js`, tested). Shows trips, last/next trip, paid and unpaid (completed, not paid, not cash). Opening a customer lists their bookings (shared booking drawer) and "New booking for …" pre-fills the main form.
- **Team & roles** (Settings → Team, `src/components/operator/TeamSettings.jsx` → `/api/team`): list staff (`tenant_users` roles `operator_admin` = Admin, `dispatcher` = Dispatcher), invite, change role, resend invite, remove. All checked server-side with the service role (`src/lib/server/staff.ts`): only an admin (or super_admin) changes anything; you can't change/remove yourself; the business always keeps an admin; one staff role per person (changing replaces); removing takes office access only (a driver role stays). Drivers are still added on the Drivers screen. Tests: `src/app/api/team/team.test.ts`.
- **Password emails without Supabase's redirect allow-list**: invites and resets use `auth.admin.generateLink` and email our own link `<app>/set-password?token_hash=…&type=invite|recovery` via Resend (`src/lib/email/staff.js`, house template; kept out of content.js/template.js so those stay identical to the website). `/set-password` verifies with `verifyOtp`, then sets the password (and name for new people). Optional env `NEXT_PUBLIC_OPERATOR_URL` fixes the link host (otherwise the request's own origin).
- **Forgot password?** on the sign-in screen now works (it was a button with no action): `/api/auth/forgot` emails a reset link only to staff; every reply is the same, so it can't reveal who has an account.
- **Setup checklist** on Today (`SetupChecklist.jsx`), admins only: contact details, invoice letterhead, first driver, invite team (optional), new-booking alerts on this device (only where the browser supports push), first booking. Disappears when done or hidden (per browser).

## Update — 2026-10-14: Bookings → List redesign

- **Tapping a job opens it** (phone/tablet cards had a full-card button hidden under the card content, so taps did nothing). Cards and desktop rows are now the click target themselves; driver, call, status and Accept/Decline controls stop the click so they don't also open the drawer.
- **Views instead of 8 status chips**: Upcoming (default) / Needs action ("To do" on phones) / Past / All, with counts. Rules in `src/lib/operator/bookingBuckets.js` (`isPast`, `needsAction`, `LIST_VIEWS`, tested). A `?q=` link opens on All so search links still find old jobs.
- **Grouped by day** with sticky headings ("Today · Wed 14/10/2026"); Past is newest first. Desktop uses the same groups as rows (time, customer + ref, two-line route, driver, price, status) instead of the old table.
- **Removed**: the desktop "Dispatch" button (`DispatchButton.jsx`) and the no-op module behind it (`src/lib/operator/driverApp.js`: `dispatchJobToDriverApp`/`updateJobStatus` did nothing, so the button showed "Sent" while nothing happened). Drivers get jobs through the database when assigned. Also removed the ETA column, "Assign driver" on finished jobs, and "NOT CONFIRMED" on completed jobs.
- **Pickup times are UK time everywhere, whatever the device's timezone.** `src/lib/dates.ts` has `ukToIso(date, time)` (UK wall clock → real moment, handles BST/GMT and clock-change days), `ukDateOf()` and `ukHourOf()` (tested, also under `TZ=America/New_York`). `useBookings` builds `pickupTime` with it when `pickup_time` is empty (was parsed in the device's own zone), new bookings and date/time edits now store `pickup_time` (edits used to clear it), `BookingCard.tsx` saves with it, and the Drivers "today" list, Analytics "today" and hour bars, the drivers' completed-today count (now by `travel_date`) and the list's day groups use UK dates. The drawer shows the booking's own date and time. Live data checked: no stored `pickup_time` disagreed with `travel_time`.

## Update — 2026-10-15: per-operator prices (live database, Operator app + website)

- Each business's fixed prices are in `tenants.pricing` (`{ airports: [{ name, code?, one_way, return_fare }], extra_stop }`), saved only through the `update_tenant_pricing` RPC (operator_admin of that tenant or super_admin; shape and amounts checked; migration `20261015090000_tenant_pricing.sql` in `evexec`, applied; EV Exec seeded with the previous list).
- **Settings → Prices** is editable for admins (add/remove destinations, optional 3–4 letter code, one-way and return, extra-stop charge); others see it read-only. Saves via `useTenantProfile().savePricing`, then reloads the shell profile.
- `src/lib/prices.ts`: `pricingFromTenant()` (stored → `{ airports, extraStop }`, falls back to `DEFAULT_PRICING` when missing), `pricingForSave()`, `pricingProblem()` (same rules as the database), and `fixedTripPrice(location, isReturn, airports)` (renamed 17/10/2026; a return is the whole fare). The shell context exposes `profile.pricing`; the New Booking form suggests a price when either end of the trip names a listed destination (not only airports).
- The website reads the same row (`evexec/lib/pricing.js`) for its booking form and booking API. Its generated marketing pages still have the prices built in (`evexec/scripts/site/data.js`) and need a rebuild after a change.

## Update — 2026-10-15: per-operator logo and colours

- **Settings → Branding** (admins edit, others view): upload a logo (PNG/JPEG/WebP ≤ 1 MB, to the public `brand-assets` bucket, folder `<tenant_id>/`), main and accent colour (hex), live invoice preview, a warning when the accent is hard to read on the main colour, and "Use the standard navy and gold". Saved by `update_tenant_branding` (admins only; the logo URL must be in the tenant's own folder); the replaced logo file is removed afterwards. Hook: `useTenantProfile().uploadLogo/saveBranding`. Migration `20261015120000_tenant_branding.sql` in `evexec` (applied).
- `src/lib/brand.js` `brandFrom(tenant)` → `{ name, logoUrl, useBuiltInLogo, primary, accent }` (defaults navy `#0B132B`, gold `#D7A23F`; the built-in EV Exec badge only for the EV Exec tenant, any other business without a logo shows its name). Also `contrastRatio`, `brandWarning`, `logoFileProblem`. The shell context exposes `profile.brand`.
- Used by: the sidebar badge (logo when uploaded), Invoices (colours, logo and watermark; uploaded logos load with CORS so they appear in the PDF), and the website's customer invoice PDF. The built-in badge is also a static file, `public/ev-exec-badge.png`.
- **Not yet branded per operator:** emails (`src/lib/email/template.js`, same as the website's) and the Driver app.


## Update — 2026-10-15: Driver App invites and trusted partners

- **`drivers.kind`**: `driver` (uses the Driver App) or `partner` (trusted third-party operator: no app login, never invited). James Addy (Crestways Travel) and Marks Taxi are partners (user, 15/10/2026). Migration `20261015150000_driver_kind_partner.sql` in `evexec` (applied); it also lets staff mark `driver_sms_reminders` as sent.
- **Invites** (Operator app, Drivers): `/api/drivers` (staff only, service role). POST `{ driverId }` creates the login **with the driver row's own id** (the Driver App identifies drivers by `drivers.id = auth.uid()`), adds a `tenant_users` `driver` role, fills `full_name`, and emails a one-time link (Resend, `driverInvite` in `src/lib/email/staff.js`) to the Driver App's `/reset-password?token_hash=…&type=recovery&invite=1`, which verifies it with `verifyOtp`. GET returns each driver's app status (partner / none / invited / active). An email already used by another login is refused (409), not merged. New drivers are invited on Add by default.
- **Partner jobs**: still get the job emails (`enqueue_driver_notifications`). Their customers' two-tap reminder texts stay in `driver_sms_reminders` but go to the office: the Driver App sweep (`send-customer-sms-reminder-push`, deployed v4) skips partners and pushes every office device via the Operator app's `/api/push/dispatch`; the confirm-pickup engine (`attestation-engine`, deployed v11) skips partner jobs (it had sent two false "driver hasn't confirmed" alerts).
- **Texts to send** (Operator app, Today, `TextsToSend.jsx`, `useTextTasks`, `lib/operator/textTasks.js`): pending `operator_sms_tasks` plus partner jobs' `driver_sms_reminders`, hiding past or finished jobs. "Open Messages" (pre-written `sms:` link) then "Mark as sent". This replaces the sms-tasks screen removed on 06/10/2026; the website's `handOffSmsToOperator` now pushes through `/api/push/dispatch` (its old `/api/push/notify-operators` target no longer existed).

## Update — 2026-10-15: softer gold (colours only)

User found the original orange-gold harsh and rejected a navy-and-white theme (branch `claude/navy-theme`, not merged; don't use it). Kept the original design and only softened it: `tailwind.config.ts` redefines Tailwind's `amber` scale as the logo's soft gold (500 `#C9A550` buttons, 600 `#8A6A1F` accent text, 5:1 on white; the old `#d97706` was 3.2:1), so every existing amber class (brand accents and pending/warning badges) picks it up with no component changes. The page background lost its gold radial tint (`Layout.jsx`, and the matching sticky day headings in `BookingsList.jsx`). No layout, size or class changes otherwise.

## Update — 2026-10-15: Bookings → Calendar redesign (branch `claude/operator-calendar-redesign`)

- **New calendar** in `src/components/operator/calendar/`: `OperatorCalendar.jsx` (live data: `hooks/operator/useBookings`, `useDrivers`, `useDriverAvailability`, the shared `useBookingDrawer`, the shell's `openNewBooking`) renders `CalendarScreen.jsx` (all UI state, no fetching — also used by the demo preview). Views Month / Week / Day / List, in the URL as `?view=calendar&cv=month|week|day|list&d=YYYY-MM-DD`.
- **Rules** in `src/lib/operator/calendarModel.js` (tested): UK date keys, periods, booking state (reply / driver / assigned / road / done / cancelled, built on `bookingBuckets`), flags (awaiting reply, no driver, no driver within 24 h, same-driver clash within `CLASH_BUFFER_MINUTES`, driver marked unavailable, no pickup time, completed unpaid), filters, metrics and data coverage (the strip shows "—" and offers "Load earlier/more" when the loaded window doesn't cover the period, rather than a wrong number).
- **Desktop** side panel: selected day, or a booking (read-only details, quick driver assignment via the drawer's `assign`, "Open booking" for everything else). **Phones**: tapping a booking opens the drawer directly.
- **Tokens**: `cal-*` colours, `text-cal-*` type scale (label/xs/sm/base/time/lg/xl/2xl), `rounded-cal`/`rounded-cal-lg`, `shadow-cal-pop` and `font-display` (Manrope, like everything else; one font app-wide) in `tailwind.config.ts`, documented in `calendar/tokens.js`. Calendar components use only these.
- **Date style exception (user request, 15/10/2026)**: the calendar's navigation headings write the month out ("October 2026", "Thursday, 15 October 2026", "12–18 October 2026"). Everything else in the calendar (booking dates, side panel, notices) stays DD/MM/YYYY. Helpers: `monthTitle`, `dayTitle`, `periodFor` in `calendarModel.js`.
- **Indicator system (V2)**: month cells show the transfer count plus at most one exception mark (red "!" = needs a driver / clash / driver unavailable; hollow brass square = awaiting reply or other follow-up). Status marks: hollow = waiting on the office (reply, needs driver), filled = in hand.
- **Exceptions** (`ExceptionNote` in `BookingRow.jsx`): one style for every warning, each with one real action (Assign driver / Reply / Add time / Open payment open the booking; a clash offers "View <ref>" for the other job).
- **Clashes are "possible"**: bookings have no journey length or drop-off time, so the calendar flags same-driver pickups under `CLASH_BUFFER_MINUTES` and shows the gap; the side panel's conflict section says it can't confirm an overlap. If a planned duration field is ever added, use it in `findClashes`.
- `shapedBooking` gained `priceValue` (raw fare, for totals in pence); `ukDateDaysAgo` / `OPERATIONAL_DAYS_BACK` moved to `src/lib/operator/ukDate.js` (still re-exported by `useBookings`).
- The old `CalendarApp.tsx`, `CalendarView.tsx`, `DailyView.tsx`, `StatsBar.tsx` are no longer used by any screen; delete once the new calendar is signed off.

## Update — 2026-10-16: free-cancellation deadline in booking confirmations

The Booking Confirmed email (`bookingConfirmed` in `src/lib/email/content.js`, sent from `/api/booking-response` on Accept) has a Cancellation section with the booking's own deadlines in UK time (free until, 25%, 50%, full fare, or the charge that already applies), and the no-email confirmation text adds "Free cancellation until HH:MM on DD/MM/YYYY." Rules live in `src/lib/email/cancellation.js`, a copy of the website's `evexec/lib/cancellation.js` (terms version 3, https://www.evexec.co.uk/terms sections 4–5); keep the two in step. Quoted bookings (over £300, not on the price list, `onPriceList` in `format.js`) point to their quote. Tests: `src/lib/email/cancellation.test.js`.

## Update — 2026-10-17: operator-made jobs: accepted on creation, a return is one payment

User report: an operator-made return job (Manchester, £160) produced two £80 payments, and the customer's booking page showed "Awaiting Confirmation" / My Account "Awaiting Approval". Checked on the live rows (EVX-C7C4SZQ3NV8U + EVX-C7C5124GZDU5, 17/10/2026) before changing anything: no Stripe charge had been taken; the "two payments" were two separate £80 bookings, each with its own "is booked" email and payment page.

- **Root causes**: (1) the Operator app booked a return as two bookings at half the return fare each (`fixedLegPrice`), while the website stores a return as one outbound booking with the whole fare plus a £0 return leg; (2) Operator app bookings were inserted with no `operator_response`, and the website only treated `accepted` or `Dispatched` as confirmed, so any operator job without a driver (always the return leg) was "awaiting" and could not be paid; (3) the DB trigger sent a "received" confirmation for every operator-made row, so one per leg.
- **Now**: the New Booking form suggests the whole fare (`fixedTripPrice`, label "Fixed Price (return, both ways)"). `createBooking()` stores the outbound with `quoted_price` = total, `return_journey` and the `return_*` fields, and a £0 return leg whose notes start "Return leg created automatically from return booking." (the marker every system already uses). Both rows get `operator_response = accepted` and `operator_responded_at`. Website requests are unchanged: they still wait for Accept/Decline.
- **Website rule**: a booking is confirmed when `operator_response = accepted`, `source = operator` (covers operator jobs made before this fix) or the status is Dispatched/on the road; never when rejected. Same rule in `api/payment/index.js` `isConfirmed`, `lib/cancellation.js` `isAccepted`, `booking.html` and My Account `customerStatus()`. Return legs can never be paid on their own (`readyForPayment`), and the booking page says they are paid with the outbound (`/api/booking/get` returns `return_leg`, `outbound_ref`, `source`).
- **One payable checkout per booking**: the Operator app payment link refuses Paid bookings and return legs, reuses its own open checkout for the same amount, and expires any other open one (including one the customer opened on the booking page); the website checkout expires an open operator link before making its own and refuses a booking whose link is already paid.
- **DB**: migration `20261017100000_operator_return_leg_single_confirmation.sql` (applied 17/10/2026) skips the "received" confirmation for return legs. Tested on the live trigger in a rolled-back transaction: outbound queued one confirmation, return leg none.
- **Operator app display**: return legs show "With outbound" (list) / "Paid with the outbound booking" (drawer), no "Send payment link", and are not counted as unpaid on Today/Needs action.
- **Not changed**: the earlier test rows (two £80 legs) were left as they are. The drawer's manual "Create Return" (a separate booking from an existing one) still copies the price the operator sees.
- Tests: website `npm run test:unit`; Operator app `npm test` (`useBookings.test.js`, `staffOnly.test.ts`, `bookingBuckets.test.js`, `prices.test.ts`).

## Update — 2026-10-17: one approval rule for every booking method

Booking creation paths (checked across all three repos and the database; no DB function or edge function creates bookings): **website booking form** (`evexec/api/booking` create, with an automatic £0 return leg for returns) and the **Operator app New Booking form** (`createBooking` in `src/hooks/operator/useBookings.js`, used by every screen: New Booking, Inbox quote, customer page, Create Return). The old `createBooking` in `evexecoperator/src/hooks/useBookings.ts` is unused but now also sets `accepted`.

- **Website requests** wait for Accept/Decline (`operator_response` null). **Operator-made bookings** are `accepted` on creation. The 16 operator bookings made before 17/10/2026 were back-filled to `accepted` (migration `20261017140000_backfill_operator_bookings_accepted.sql`, applied; `operator_responded_at` = `created_at` marks them). After it every booking in the database had a decision.
- **A return request is one decision**: accepting or declining a website return booking (Operator app `respondToBooking`, or the emailed link `api/operator` `applyToReturnLeg`) applies the same decision to its £0 return leg (notes "… Outbound ref: <ref>"), with one customer email. Before, the leg waited in "Needs reply" and accepting it sent a second Booking Confirmed email. On decline the leg is cancelled too; on accept it stays Unassigned until a driver is given.
- **Create Return Journey** (booking drawer) is hidden on a booking that already includes its return and on a return leg (it pre-filled a second paid return).
- **Known difference, left as is**: the emailed Accept link sets the outbound to Dispatched (no driver); the Operator app Accept keeps it Unassigned. Both count as confirmed everywhere.
- Tests: website `tests/unit/operator-accept.test.cjs`; Operator app `useBookings.test.js` (respondToBooking).

## Update — 2026-10-17: one font, Manrope

User decision: the whole app uses Manrope, like the website. Self-hosted (`public/fonts/manrope-latin*.woff2`, same files as `evexec`, SIL OFL in `OFL-Manrope.txt`), `@font-face` at the top of the global CSS, body font Manrope, and Tailwind `sans`, `serif` and `mono` all map to Manrope, so booking references and other monospace text match. Weights 200–800 (CSS 900 renders as 800); no italic face (browser slants it). Emails keep their email-safe fonts. Checked in a browser: every visible text element renders in Manrope and the font file loads.
- Operator app: the Google Fonts Inter import in `src/app/globals.css` was removed (no third-party font request any more).

## Update — 2026-10-17: deleting a job no longer closes the drawer

The delete password box is drawn outside the booking drawer, so the drawer's "tap outside closes" handler treated any tap in it (the password field, the buttons) as an outside tap: the drawer closed and the box vanished with it. While the box is open, outside taps are now ignored and Escape closes only the box (`BookingDetailDrawer.jsx`). `deleteBooking` (`useBookings.js`) now asks the database which rows it removed and reports an error (job put back) if none were, instead of the job disappearing and coming back on the next refresh. Tests: `BookingDetailDrawer.test.jsx`, `useBookings.test.js` (deleteBooking).

## Update — 2026-10-17: app icon (dispatch headset)

User chose option A from five (headset, route, job board, signal tower, schedule): a gold dispatch headset (`#D7A23F`) on navy (`#0B132B`), same style as the Driver App's steering wheel. Before, `/favicon.ico` did not exist (404) and the home-screen icons were the EV Exec car logo with text.
- Files in `public/`: `favicon.ico` (16/32/48), `favicon.svg` (tab; the 64×64 source of the headset), `apple-icon.png` (180), `icon-192.png`, `icon-512.png`, `icon-512-maskable.png` (headset inside the safe zone), `badge-96.png` (white on transparent, Android status bar). Regenerate the PNGs from `favicon.svg` if it changes.
- Wired in `src/app/layout.tsx` `metadata.icons`, `src/app/manifest.ts` (unchanged paths) and `public/sw.js` (push icon `icon-192.png`, badge `badge-96.png`). The in-app logo (`ev-exec-badge.png`, `brandLogo.js`) is unchanged.

## Update — 2026-10-19: licence number in emails

Private hire operator licence **PHO0079** (user, 19/10/2026) is in every email footer, HTML and plain text: `LICENCE` in `src/lib/email/template.js`, kept identical to the website's `lib/emailTemplate.js`.

- **Password rule (19/10/2026):** Supabase Auth requires 8+ characters with a letter and a number (set by the user). Every password form checks the same rule first and says so.

## Update — 2026-11-12: setting up a new business (platform owner)

- **Route** `src/app/api/platform/tenants/route.ts` (server only, service role; the caller must be a `super_admin`, checked on the server by `getSuperAdmin()` in `src/lib/server/staff.ts`). `GET` lists businesses with their admin count; `POST { action: "create" }` calls the database function `public.provision_tenant` (checked short name and name, an empty price list, its own notification settings with **SMS, WhatsApp and push off**; migration `20261112120000_provision_tenant.sql` in `evexec`, applied); `POST { action: "invite" }` makes someone the business's first `operator_admin` and emails the same branded set-password link the team invites use (run again to resend); `POST { action: "members" }` lists a business's staff.
- **Replaces** the `manage-tenants` Supabase edge function (it was in no repository, created a bare row and invited through Supabase's built-in mailer). The platform screen (`PlatformSettings.jsx`, Settings → Platform, super admin only) now calls the route. The old function can be deleted in the Supabase dashboard.
- `linkFor`, `setRole`, `isUuid` and `getSuperAdmin` moved into `src/lib/server/staff.ts` and are shared with `/api/team` (its tests are unchanged and pass).
- A new business has no prices, no logo and no driver yet: it sets them in Settings (Prices, Branding) and Drivers. Its customers see no EV Exec details (the website's built-in price list is EV Exec's only).
- Invite emails are sent from the platform sender (`INVOICE_FROM`, EV Exec's address today); per-business sending domains are a separate, parked decision (may cost money).
- Tests: `src/app/api/platform/tenants/tenants.test.ts` (14).

## Update — 2026-11-12: the platform is software only; the operator confirms its responsibilities

Settings → Legal has a "Who is responsible" section: the platform is software only (not a private hire operator, not a party to bookings, checks nothing the operator enters), and the operator alone is responsible for licences, insurance, vehicles, driver checks, records, its terms and prices, data protection, payments and tax, and the truth of what it publishes. The operator ticks one confirmation, saved as `brand.legal.responsibilities_confirmed` (with `_at` and `_version`) through `update_tenant_legal` (migration `20261112270000` in `evexec`, applied) and listed as a gap until given. The wording is `RESPONSIBILITIES` in `src/lib/operator/legal.js`, mirroring `evexec/docs/legal/operator-responsibilities.md` (version 1): keep the two in step, and never add a requirement that makes the platform responsible for, or implies it checks, any of these.


## Update — 2026-11-12: public terms and privacy pages for each business

Settings → Legal shows the business's public pages, `https://www.evexec.co.uk/t/<short name>/terms` and `/privacy`, built on the website from the business's own details (`evexec/lib/legalPage.js`) and shown only once its legal details are complete and it has confirmed the responsibilities statement. The supplier of the software is Winjo Digital, not EV Exec; the contract is `evexec/docs/legal/operator-contract.md` (£999 set-up, £49 a month). Keep the claim that the platform is software only and the operator is responsible in every document.
