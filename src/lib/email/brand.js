// Adapted from evexec/lib/brand.js (the website). Same business details and same
// rules; the difference is how the rows arrive: a route reads the business with
// the signed-in user's session (src/lib/server/brands.ts) and passes it to
// mergeBrands().

// Whose emails these are: the business name, phone, licence, website and
// colours shown in an email's header, help line and footer.
//
// The details come from the business's own row in public.tenants:
//   name, contact_email, contact_phone, and in its brand column
//   { licence, site_url, tagline, colors: { primary, accent } }.
// EV Exec (this website's own business) also has built-in defaults for anything
// its row does not hold, so its emails never change. Any OTHER business starts
// from nothing: it never inherits EV Exec's name, number or licence, and a
// detail it has not set is simply left out.
//
// A route reads the booking's business and calls mergeBrands() before building
// an email; the builders in content.js then pick the right business from the
// booking's tenant_id. A business not read yet gets blank details, never EV Exec's.

const DEFAULT_TENANT_ID = () => process.env.TENANT_ID || '00000000-0000-0000-0000-000000000001';

const EV_EXEC = Object.freeze({
  name: 'EV Exec',
  wordmark: 'EV EXEC',
  phone: '07721 070370',
  email: 'book@evexec.co.uk',
  licence: 'PHO0079',
  site: 'https://www.evexec.co.uk',
  tagline: 'Premium airport transfers from Blackpool & the Fylde Coast',
  primary: null,
  accent: null,
});

const NONE = Object.freeze({ name: '', wordmark: '', phone: '', email: '', licence: '', site: '', tagline: '', primary: null, accent: null, policy: null });

const HEX = /^#[0-9a-f]{6}$/i;
const clean = (v) => (typeof v === 'string' ? v.trim() : '');

// "07721070370" and "+44 7721 070370" both read "07721 070370"; anything else
// (a landline, an overseas number) is shown as it was typed.
function displayPhone(raw) {
  const s = clean(raw);
  if (!s) return '';
  const digits = s.replace(/[\s()-]/g, '');
  const national = digits.startsWith('+44') ? `0${digits.slice(3)}` : digits.startsWith('0044') ? `0${digits.slice(4)}` : digits;
  if (/^07\d{9}$/.test(national)) return `${national.slice(0, 5)} ${national.slice(5)}`;
  return s;
}

// The number for a tel: link ("+447721070370"), or '' if it is not a UK number.
function telNumber(raw) {
  const digits = clean(raw).replace(/[\s()-]/g, '');
  if (digits.startsWith('+')) return digits;
  if (digits.startsWith('0044')) return `+${digits.slice(2)}`;
  if (/^0\d{9,10}$/.test(digits)) return `+44${digits.slice(1)}`;
  return '';
}

// An operator's own standard cancellation bands (brand.legal.policy.standard):
// three bands, stricter each time, first 0 percent. Anything else is ignored.
// Same rule as the website (evexec lib/brand.js); the database checks it on save.
function standardPolicy(policy) {
  const s = policy && Array.isArray(policy.standard) ? policy.standard : null;
  if (!s || s.length !== 3) return null;
  const ok = s.every((b) => b && Number.isFinite(b.hours) && Number.isFinite(b.pct) && b.hours >= 1 && b.hours <= 336 && b.pct >= 0 && b.pct <= 100);
  if (!ok || s[0].pct !== 0) return null;
  const stricter = s[1].hours < s[0].hours && s[2].hours < s[1].hours && s[1].pct > s[0].pct && s[2].pct > s[1].pct;
  return stricter ? s.map((b) => ({ hours: b.hours, pct: b.pct })) : null;
}

function fromRow(row) {
  const isDefault = row && row.id === DEFAULT_TENANT_ID();
  const base = isDefault ? EV_EXEC : NONE;
  const b = (row && row.brand && typeof row.brand === 'object') ? row.brand : {};
  const colors = (b.colors && typeof b.colors === 'object') ? b.colors : {};
  const name = clean(row && row.name) || base.name;
  const site = clean(b.site_url).replace(/\/$/, '');
  return Object.freeze({
    name,
    wordmark: name.toUpperCase(),
    phone: displayPhone(row && row.contact_phone) || base.phone,
    email: clean(row && row.contact_email) || base.email,
    licence: clean(b.licence) || base.licence,
    site: /^https?:\/\//i.test(site) ? site : base.site,
    tagline: clean(b.tagline) || base.tagline,
    primary: HEX.test(clean(colors.primary)) ? clean(colors.primary) : null,
    accent: HEX.test(clean(colors.accent)) ? clean(colors.accent) : null,
    policy: standardPolicy(b.legal && typeof b.legal === 'object' ? b.legal.policy : null),
  });
}

let cache = new Map();   // tenant id -> brand

// Remember businesses read from the database (rows from public.tenants).
function mergeBrands(rows) {
  for (const r of rows || []) if (r && r.id) cache.set(r.id, fromRow(r));
}

// The brand for a tenant id. No id means this website's own business. A
// business not loaded (yet) gets NONE rather than EV Exec's details.
function brandFor(tenantId) {
  const id = tenantId || DEFAULT_TENANT_ID();
  if (cache.has(id)) return cache.get(id);
  return id === DEFAULT_TENANT_ID() ? EV_EXEC : NONE;
}

// Builders are synchronous, so the business of the email being built can be
// held for the duration of the call: lib/emailContent.js wraps each builder in
// this, using the tenant_id of its first argument (the booking or quote).
let current = null;
function withBrandOf(fn) {
  return function branded(...args) {
    const first = args[0];
    const previous = current;
    current = brandFor(first && typeof first === 'object' ? first.tenant_id : undefined);
    try { return fn.apply(this, args); } finally { current = previous; }
  };
}
const currentBrand = () => current || brandFor(undefined);

function _setBrands(map) { cache = new Map(Object.entries(map || {}).map(([id, row]) => [id, fromRow({ id, ...row })])); }

export { mergeBrands, brandFor, currentBrand, withBrandOf, fromRow, displayPhone, telNumber, EV_EXEC, NONE, _setBrands };
