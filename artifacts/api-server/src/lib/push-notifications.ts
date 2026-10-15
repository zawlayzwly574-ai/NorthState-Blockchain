import { and, eq, isNull } from "drizzle-orm";
import { db, webPushSubscriptionsTable } from "@workspace/db";
import { sendWebPush } from "./web-push";

export type PushPayload = { title: string; body: string; url?: string; tag?: string };
export type SubscriptionInput = {
  endpoint?: unknown;
  keys?: { p256dh?: unknown; auth?: unknown };
};

export async function savePushSubscription(
  ownerType: "admin" | "user",
  clerkUserId: string | null,
  input: SubscriptionInput,
  userAgent: string | undefined,
) {
  const endpoint = typeof input.endpoint === "string" ? input.endpoint : "";
  const p256dh = typeof input.keys?.p256dh === "string" ? input.keys.p256dh : "";
  const auth = typeof input.keys?.auth === "string" ? input.keys.auth : "";
  let parsed: URL;
  try { parsed = new URL(endpoint); } catch { throw new Error("Invalid push endpoint."); }
  const host = parsed.hostname.toLowerCase();
  const trustedPushHost =
    host === "fcm.googleapis.com" ||
    host === "push.services.mozilla.com" ||
    host.endsWith(".push.services.mozilla.com") ||
    host === "web.push.apple.com" ||
    host.endsWith(".notify.windows.com");
  if (parsed.protocol !== "https:" || !trustedPushHost || !p256dh || !auth) {
    throw new Error("A valid subscription from a supported HTTPS push service is required.");
  }
  if ((ownerType === "user" && !clerkUserId) || (ownerType === "admin" && clerkUserId)) {
    throw new Error("Invalid push subscription owner.");
  }
  const now = new Date();
  await db.insert(webPushSubscriptionsTable).values({
    ownerType, clerkUserId, endpoint, p256dh, auth,
    userAgent: userAgent?.slice(0, 500) ?? null,
    updatedAt: now, disabledAt: null,
  }).onConflictDoUpdate({
    target: webPushSubscriptionsTable.endpoint,
    set: {
      ownerType, clerkUserId, p256dh, auth,
      userAgent: userAgent?.slice(0, 500) ?? null,
      updatedAt: now, disabledAt: null, failureCount: 0,
    },
  });
}

export async function removeUserPushSubscription(clerkUserId: string, endpoint: string) {
  await db.delete(webPushSubscriptionsTable).where(and(
    eq(webPushSubscriptionsTable.ownerType, "user"),
    eq(webPushSubscriptionsTable.clerkUserId, clerkUserId),
    eq(webPushSubscriptionsTable.endpoint, endpoint),
  ));
}
export async function removeAdminPushSubscription(endpoint: string) {
  await db.delete(webPushSubscriptionsTable).where(and(
    eq(webPushSubscriptionsTable.ownerType, "admin"),
    eq(webPushSubscriptionsTable.endpoint, endpoint),
  ));
}

async function deliver(ownerType: "admin" | "user", clerkUserId: string | null, payload: PushPayload) {
  try {
    const conditions = clerkUserId
      ? and(eq(webPushSubscriptionsTable.ownerType, ownerType), eq(webPushSubscriptionsTable.clerkUserId, clerkUserId), isNull(webPushSubscriptionsTable.disabledAt))
      : and(eq(webPushSubscriptionsTable.ownerType, ownerType), isNull(webPushSubscriptionsTable.disabledAt));
    const subscriptions = await db.select().from(webPushSubscriptionsTable).where(conditions);
    await Promise.allSettled(subscriptions.map(async subscription => {
      try {
        const sent = await sendWebPush(subscription, payload);
        if (sent) {
          await db.update(webPushSubscriptionsTable).set({ lastSuccessAt: new Date(), failureCount: 0 })
            .where(eq(webPushSubscriptionsTable.id, subscription.id));
        } else {
          await db.update(webPushSubscriptionsTable).set({ disabledAt: new Date() })
            .where(eq(webPushSubscriptionsTable.id, subscription.id));
        }
      } catch (error) {
        await db.update(webPushSubscriptionsTable).set({ failureCount: subscription.failureCount + 1 })
          .where(eq(webPushSubscriptionsTable.id, subscription.id));
        throw error;
      }
    }));
  } catch (error) {
    // Push delivery must never fail the transaction or support message being saved.
    console.warn("Web Push delivery failed", error instanceof Error ? error.message : "unknown error");
  }
}

export async function sendPushToAdmins(payload: PushPayload) {
  return deliver("admin", null, payload);
}
export async function sendPushToUser(clerkUserId: string, payload: PushPayload) {
  return deliver("user", clerkUserId, payload);
}
