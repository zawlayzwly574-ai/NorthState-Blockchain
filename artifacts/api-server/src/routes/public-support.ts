import { Router, type Request, type Response } from "express";
import { randomBytes } from "node:crypto";
import { db, supportMessagesTable, supportThreadsTable } from "@workspace/db";

const router = Router();

// This endpoint is intentionally mounted before the authenticated member router.
// Keep abuse controls local to public contact submissions; no member credentials
// or existing account records are required.
const recentSubmissions = new Map<string, number[]>();
const WINDOW_MS = 60 * 60 * 1000;
const MAX_PER_WINDOW = 5;
const MAX_NAME_LENGTH = 100;
const MAX_EMAIL_LENGTH = 254;
const MAX_MESSAGE_LENGTH = 5000;

function allowSubmission(ip: string, now = Date.now()) {
  const recent = (recentSubmissions.get(ip) ?? []).filter((timestamp) => now - timestamp < WINDOW_MS);
  if (recent.length >= MAX_PER_WINDOW) {
    recentSubmissions.set(ip, recent);
    return false;
  }
  recent.push(now);
  recentSubmissions.set(ip, recent);
  // Bound memory use if the endpoint receives traffic from many distinct clients.
  if (recentSubmissions.size > 10_000) {
    for (const [key, timestamps] of recentSubmissions) {
      if (timestamps.every((timestamp) => now - timestamp >= WINDOW_MS)) recentSubmissions.delete(key);
    }
  }
  return true;
}

router.post("/support/public-message", async (req: Request, res: Response) => {
  const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
  const email = typeof req.body?.email === "string" ? req.body.email.trim() : "";
  const message = typeof req.body?.message === "string" ? req.body.message.trim() : "";
  if (!name || name.length > MAX_NAME_LENGTH) {
    res.status(400).json({ error: "Enter your name (up to 100 characters)." });
    return;
  }
  if (!email || email.length > MAX_EMAIL_LENGTH || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    res.status(400).json({ error: "Enter a valid email address." });
    return;
  }
  if (!message || message.length > MAX_MESSAGE_LENGTH) {
    res.status(400).json({ error: "Enter a message (up to 5,000 characters)." });
    return;
  }

  const ip = req.ip || req.socket.remoteAddress || "unknown";
  if (!allowSubmission(ip)) {
    res.status(429).json({ error: "Too many messages. Please try again in about an hour." });
    return;
  }

  try {
    // The existing support_threads table requires a unique clerkUserId. Use a
    // clearly namespaced random guest identifier so no real member is touched.
    const guestId = `guest_support_${randomBytes(18).toString("hex")}`;
    const [thread] = await db.insert(supportThreadsTable).values({
      clerkUserId: guestId,
      status: "open",
    }).returning({ id: supportThreadsTable.id });
    await db.insert(supportMessagesTable).values({
      threadId: thread.id,
      senderRole: "user",
      content: `[Pre-sign-in support request]\nName: ${name}\nEmail: ${email}\n\n${message}`,
    });
    res.status(201).json({ success: true, message: "Your message has been sent. Our support team will follow up by email." });
  } catch (error) {
    req.log?.error?.({ err: error }, "Failed to save public support message");
    res.status(503).json({ error: "We could not send your message right now. Please try again shortly." });
  }
});

export default router;
