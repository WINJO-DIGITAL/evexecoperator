import { DEPLOYMENT_BRAND } from "@/lib/deploymentBrand";
// Central registry of all external portal / website URLs.
// Each entry reads from an env var first, then falls back to the known default.
// Override any of these by setting the corresponding NEXT_PUBLIC_* variable.

export const PORTALS = {
  driverApp: {
    label: "Driver Portal",
    description: "Live dispatch app used by drivers — view jobs, update status, navigate",
    url: process.env.NEXT_PUBLIC_DRIVER_APP_URL ?? "https://evexecdriverapp.vercel.app",
    envKey: "NEXT_PUBLIC_DRIVER_APP_URL",
  },
  bookingForm: {
    label: "Customer Booking Form",
    description: "Public-facing booking page customers use to request a transfer",
    url: process.env.NEXT_PUBLIC_BOOKING_FORM_URL ?? `${DEPLOYMENT_BRAND.site}/#quote`,
    envKey: "NEXT_PUBLIC_BOOKING_FORM_URL",
  },
  customerAccount: {
    label: "My Account (Customer Portal)",
    description: "Customers log in to view bookings, invoices and saved preferences",
    url: process.env.NEXT_PUBLIC_CUSTOMER_PORTAL_URL ?? `${DEPLOYMENT_BRAND.site}/account`,
    envKey: "NEXT_PUBLIC_CUSTOMER_PORTAL_URL",
  },
  website: {
    label: "Main Website",
    description: "Public homepage — marketing, pricing and service information",
    url: process.env.NEXT_PUBLIC_WEBSITE_URL ?? DEPLOYMENT_BRAND.site,
    envKey: "NEXT_PUBLIC_WEBSITE_URL",
  },
};

export function openPortal(key) {
  const portal = PORTALS[key];
  if (portal?.url) window.open(portal.url, "_blank", "noopener,noreferrer");
}

export function driverJobUrl(bookingRef) {
  const base = PORTALS.driverApp.url.replace(/\/$/, "");
  return `${base}/jobs/${encodeURIComponent(bookingRef)}`;
}

/**
 * The public booking page link for the signed-in business: its own website address, or null when it
 * has not got one yet (so another business's staff are never sent to EV Exec's website). Before the
 * business has loaded, null as well. A bare https domain only.
 */
export function bookingPageLink(tenant) {
  const site = String(tenant?.brand?.site_url ?? "").trim().replace(/\/+$/, "");
  return /^https:\/\/[^\s/]+$/i.test(site) ? site : null;
}
