// Deployment settings: the one place this app's own business name and website
// are written down. They are used where no signed-in business is known yet
// (sign-in screen, app name and icon text, the pages customers land on after
// paying) and as a fallback while a business's own details load.
//
// Once staff are signed in, the app shows THEIR business's name, logo, colours
// and contact details from public.tenants (see lib/brand.js). To run a
// separate branded copy of this app, set these in the deployment's
// environment; nothing else needs editing:
//   NEXT_PUBLIC_BRAND_NAME     business name   (default "EV Exec")
//   NEXT_PUBLIC_WEBSITE_URL    its website     (default https://www.evexec.co.uk)

const pick = (value: string | undefined, fallback: string) => (value && value.trim() ? value.trim() : fallback);

const site = pick(process.env.NEXT_PUBLIC_WEBSITE_URL, "https://www.evexec.co.uk").replace(/\/$/, "");

export const DEPLOYMENT_BRAND = {
  name: pick(process.env.NEXT_PUBLIC_BRAND_NAME, "EV Exec"),
  site,
  /** Sign-in placeholder, e.g. "you@evexec.co.uk". */
  loginPlaceholder: `you@${site.replace(/^https?:\/\//i, "").replace(/^www\./i, "")}`,
};
