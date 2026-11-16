"use client";

import { supabase } from "@/lib/supabase";

export function isPushSupported() {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

// Is this device already subscribed and permitted?
export async function getPushEnabled() {
  if (!isPushSupported()) return false;
  try {
    if (Notification.permission !== "granted") return false;
    const reg = await navigator.serviceWorker.getRegistration();
    if (!reg) return false;
    const sub = await reg.pushManager.getSubscription();
    return !!sub;
  } catch {
    return false;
  }
}

// Register the SW, ask permission, subscribe, and store the subscription.
export async function enableOperatorPush() {
  if (!isPushSupported()) throw new Error("Push isn't supported on this device or browser.");
  const perm = await Notification.requestPermission();
  if (perm !== "granted") throw new Error("Notifications were not allowed. Enable them in your browser/app settings.");

  const reg = await navigator.serviceWorker.register("/sw.js");
  await navigator.serviceWorker.ready;

  // The VAPID public key isn't secret; read it straight from the DB (no server
  // env var needed) via a SECURITY DEFINER function.
  const { data: publicKey, error: keyErr } = await supabase.rpc("get_push_public_key");
  if (keyErr || !publicKey) throw new Error("Push isn't set up on the server yet.");

  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey),
    });
  }
  const j = sub.toJSON();
  const { error: regErr } = await supabase.rpc("register_operator_push", {
    p_endpoint: j.endpoint,
    p_p256dh: j.keys?.p256dh,
    p_auth: j.keys?.auth,
    p_label: navigator.userAgent.slice(0, 120),
  });
  if (regErr) throw new Error(regErr.message || "Couldn't register this device for push.");
  return true;
}

// Unsubscribe this device and forget it server-side.
export async function disableOperatorPush() {
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    const sub = reg ? await reg.pushManager.getSubscription() : null;
    if (sub) {
      const endpoint = sub.endpoint;
      await sub.unsubscribe();
      await supabase.rpc("unregister_operator_push", { p_endpoint: endpoint });
    }
  } catch {
    /* ignore */
  }
  return false;
}
