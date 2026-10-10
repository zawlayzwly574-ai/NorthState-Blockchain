import { Router, type Request, type Response } from "express";
import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { db, supportMessagesTable, supportThreadsTable } from "@workspace/db";

const router = Router();
const recentSubmissions = new Map<string, { count: number; resetAt: number }>();
const WINDOW_MS = 60 * 60 * 1000;
const MAX_INITIAL_MESSAGES = 5;
const MAX_FOLLOWUP_MESSAGES = 20;
const MAX_NAME_LENGTH = 100;
const MAX_MESSAGE_LENGTH = 5000;
const guestSupportIdPattern = /^guest_[a-f0-9]{36}$/;

function allowSubmission(key: string, limit: number, now = Date.now()) {
  const previous = recentSubmissions.get(key);
  if (previous && previous.resetAt > now && previous.count >= limit) return false;
  recentSubmissions.set(key, previous && previous.resetAt > now
    ? { count: previous.count + 1, resetAt: previous.resetAt }
    : { count: 1, resetAt: now + WINDOW_MS });
  if (recentSubmissions.size > 10_000) {
    for (const [entryKey, value] of recentSubmissions) {
      if (value.resetAt <= now) recentSubmissions.delete(entryKey);
    }
  }
  return true;
}

function requestKey(req: Request) {
  return req.ip || req.socket.remoteAddress || "unknown";
}

// Public support intentionally works before sign-in and never requests an email.
// The random guest ID is a high-entropy bearer credential for continuing the thread.
router.post("/support/public-message", async (req: Request, res: Response) => {
  const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
  const content = typeof req.body?.content === "string" ? req.body.content.trim() : "";
  if (!name || name.length > MAX_NAME_LENGTH) {
    res.status(400).json({ error: "Please enter your name (up to 100 characters)." });
    return;
  }
  if (!content || content.length > MAX_MESSAGE_LENGTH) {
    res.status(400).json({ error: "Please enter a message (up to 5,000 characters)." });
    return;
  }
  if (!allowSubmission(requestKey(req), MAX_INITIAL_MESSAGES)) {
    res.status(429).json({ error: "Too many messages. Please try again later." });
    return;
  }

  try {
    const guestId = `guest_${randomBytes(18).toString("hex")}`;
    const [thread] = await db.insert(supportThreadsTable)
      .values({ clerkUserId: guestId, status: "open" })
      .returning();
    await db.insert(supportMessagesTable).values({
      threadId: thread.id,
      senderRole: "user",
      content: `Guest support request\nName: ${name}\n\n${content}`,
    });
    await db.update(supportThreadsTable).set({ updatedAt: new Date() })
      .where(eq(supportThreadsTable.id, thread.id));
    res.status(201).json({ sent: true, guestId, threadId: thread.id });
  } catch (error) {
    req.log?.error({ err: error }, "Unable to save public support message");
    res.status(503).json({ error: "Support is temporarily unavailable. Your message was not sent; please try again shortly." });
  }
});

router.get("/support/guest/:guestId", async (req: Request, res: Response) => {
  const guestId = Array.isArray(req.params.guestId) ? req.params.guestId[0] ?? "" : req.params.guestId;
  if (!guestSupportIdPattern.test(guestId)) {
    res.status(404).json({ error: "Support conversation not found." });
    return;
  }
  try {
    const [thread] = await db.select().from(supportThreadsTable)
      .where(eq(supportThreadsTable.clerkUserId, guestId)).limit(1);
    if (!thread) {
      res.status(404).json({ error: "Support conversation not found." });
      return;
    }
    const messages = await db.select().from(supportMessagesTable)
      .where(eq(supportMessagesTable.threadId, thread.id))
      .orderBy(supportMessagesTable.createdAt);
    res.json({
      threadId: thread.id,
      messages: messages.map(message => ({
        id: message.id,
        senderRole: message.senderRole,
        content: message.content,
        createdAt: message.createdAt.toISOString(),
      })),
    });
  } catch (error) {
    req.log?.error({ err: error }, "Unable to load guest support conversation");
    res.status(503).json({ error: "Support is temporarily unavailable. Please try again shortly." });
  }
});

router.post("/support/guest/:guestId/messages", async (req: Request, res: Response) => {
  const guestId = Array.isArray(req.params.guestId) ? req.params.guestId[0] ?? "" : req.params.guestId;
  const content = typeof req.body?.content === "string" ? req.body.content.trim() : "";
  if (!guestSupportIdPattern.test(guestId)) {
    res.status(404).json({ error: "Support conversation not found." });
    return;
  }
  if (!content || content.length > MAX_MESSAGE_LENGTH) {
    res.status(400).json({ error: "Please enter a message (up to 5,000 characters)." });
    return;
  }
  if (!allowSubmission(`${requestKey(req)}:${guestId}`, MAX_FOLLOWUP_MESSAGES)) {
    res.status(429).json({ error: "Too many messages. Please try again later." });
    return;
  }

  try {
    const [thread] = await db.select().from(supportThreadsTable)
      .where(eq(supportThreadsTable.clerkUserId, guestId)).limit(1);
    if (!thread) {
      res.status(404).json({ error: "Support conversation not found." });
      return;
    }
    const [message] = await db.insert(supportMessagesTable)
      .values({ threadId: thread.id, senderRole: "user", content })
      .returning();
    await db.update(supportThreadsTable).set({ updatedAt: new Date() })
      .where(eq(supportThreadsTable.id, thread.id));
    res.status(201).json({ sent: true, messageId: message.id });
  } catch (error) {
    req.log?.error({ err: error }, "Unable to save guest support reply");
    res.status(503).json({ error: "Support is temporarily unavailable. Your message was not sent; please try again shortly." });
  }
});

export default router;
