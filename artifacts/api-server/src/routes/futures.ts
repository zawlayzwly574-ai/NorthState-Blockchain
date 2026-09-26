import { Router, type Request } from "express";
import { getAuth } from "@clerk/express";
import { and, desc, eq, sql } from "drizzle-orm";
import { db, futuresPositionsTable, tradingAccountsTable, type FuturesPosition } from "@workspace/db";
import {
  CloseFuturesPositionResponse,
  GetFuturesPositionsResponse,
  GetFuturesQuoteResponse,
  OpenFuturesPositionBody,
  OpenFuturesPositionResponse,
} from "@workspace/api-zod";

export type FuturesQuote = { price: number; updatedAt: number };
type GetQuote = (req: Request, asset: string) => Promise<FuturesQuote | null>;
type GetHistory = (req: Request, asset: string) => Promise<{ t: number; price: number }[]>;
const LEVERAGE_OPTIONS = [1, 2, 5, 10, 20, 50, 100];

export function positionPnl(position: FuturesPosition, mark: number) {
  const margin = Number(position.margin);
  const move = (mark - Number(position.entryPrice)) / Number(position.entryPrice);
  const raw = move * margin * position.leverage * (position.direction === "long" ? 1 : -1);
  // Isolated margin: a position cannot lose more than its reserved collateral.
  return Number(Math.max(-margin, raw).toFixed(8));
}

function responsePosition(position: FuturesPosition, quote: FuturesQuote | null = null) {
  const active = position.status === "active";
  return {
    id: position.id,
    asset: position.asset,
    direction: position.direction,
    margin: Number(position.margin),
    leverage: position.leverage,
    entryPrice: Number(position.entryPrice),
    markPrice: active ? quote?.price ?? null : position.closePrice === null ? null : Number(position.closePrice),
    unrealizedPnl: active && quote ? positionPnl(position, quote.price) : null,
    realizedPnl: position.realizedPnl === null ? null : Number(position.realizedPnl),
    closePrice: position.closePrice === null ? null : Number(position.closePrice),
    status: position.status,
    openedAt: position.openedAt.toISOString(),
    closedAt: position.closedAt?.toISOString() ?? null,
    quoteUpdatedAt: active && quote ? new Date(quote.updatedAt).toISOString() : null,
  };
}

export function createFuturesRouter(getQuote: GetQuote, getHistory: GetHistory) {
  const router = Router();

  router.get("/trading/chart/:asset", async (req, res) => {
    res.json(await getHistory(req, String(req.params.asset).toUpperCase()));
  });

  router.get("/trading/futures/quote/:asset", async (req, res) => {
    const asset = String(req.params.asset).toUpperCase();
    let quote: FuturesQuote | null;
    try {
      quote = await getQuote(req, asset);
    } catch (error) {
      req.log.warn({ err: error, asset }, "Futures quote unavailable");
      quote = null;
    }
    res.json(GetFuturesQuoteResponse.parse({
      asset,
      price: quote?.price ?? null,
      updatedAt: quote ? new Date(quote.updatedAt).toISOString() : null,
    }));
  });

  router.get("/trading/futures/positions", async (req, res) => {
    const userId = getAuth(req).userId!;
    const [active, recentClosed] = await Promise.all([
      db.select().from(futuresPositionsTable).where(and(
        eq(futuresPositionsTable.clerkUserId, userId),
        eq(futuresPositionsTable.status, "active"),
      )).orderBy(desc(futuresPositionsTable.openedAt)),
      db.select().from(futuresPositionsTable).where(and(
        eq(futuresPositionsTable.clerkUserId, userId),
        sql`${futuresPositionsTable.status} <> 'active'`,
      )).orderBy(desc(futuresPositionsTable.closedAt)).limit(12),
    ]);
    let quotes = new Map<string, FuturesQuote | null>();
    if (active.length) {
      try {
        quotes = new Map(await Promise.all([...new Set(active.map((p) => p.asset))].map(async (asset) =>
          [asset, await getQuote(req, asset)] as const
        )));
      } catch (error) {
        req.log.warn({ err: error }, "Futures live marks unavailable");
      }
    }
    res.json(GetFuturesPositionsResponse.parse([
      ...active.map((position) => responsePosition(position, quotes.get(position.asset))),
      ...recentClosed.map((position) => responsePosition(position)),
    ]));
  });

  router.post("/trading/futures/positions", async (req, res) => {
    const parsed = OpenFuturesPositionBody.safeParse(req.body);
    if (!parsed.success || !LEVERAGE_OPTIONS.includes(parsed.data.leverage)) {
      res.status(400).json({ error: "Only USDT perpetual orders with a supported leverage can be opened." });
      return;
    }
    const { direction, leverage } = parsed.data;
    const asset = parsed.data.asset.toUpperCase();
    // Never permit a client-provided price or a symbol absent from the feed.
    const margin = parsed.data.margin;
    const marginNumber = Number(margin);
    if (!Number.isFinite(marginNumber) || marginNumber < 1 || marginNumber > 10_000_000) {
      res.status(400).json({ error: "Margin must be between 1 and 10,000,000 USDT." });
      return;
    }
    let quote: FuturesQuote | null;
    try {
      quote = await getQuote(req, asset);
    } catch (error) {
      req.log.warn({ err: error }, "Futures entry price unavailable");
      quote = null;
    }
    if (!quote || Date.now() - quote.updatedAt > 15_000) {
      res.status(503).json({ error: "A fresh market price is unavailable. The order was not opened." });
      return;
    }
    const userId = getAuth(req).userId!;
    const result = await db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`${userId}:TRADING_BALANCE`}))`);
      await tx.execute(sql`select id from ${tradingAccountsTable}
        where ${tradingAccountsTable.clerkUserId} = ${userId} for update`);
      const [account] = await tx.select().from(tradingAccountsTable).where(and(
        eq(tradingAccountsTable.clerkUserId, userId),
        sql`${tradingAccountsTable.futuresBalance} - coalesce((
          select sum(${futuresPositionsTable.margin}) from ${futuresPositionsTable}
          where ${futuresPositionsTable.clerkUserId} = ${userId}
            and ${futuresPositionsTable.status} = 'active'
        ), 0) >= ${margin}::numeric`,
      )).limit(1);
      if (!account) return null;
      if (Date.now() - quote.updatedAt > 15_000) return "stale" as const;
      const [position] = await tx.insert(futuresPositionsTable).values({
        clerkUserId: userId, asset, direction, leverage,
        margin, entryPrice: quote.price.toFixed(8),
      }).returning();
      return position;
    });
    if (result === "stale") {
      res.status(503).json({ error: "The quote expired before the order could be opened. Please retry." });
    } else if (!result) {
      res.status(400).json({ error: "Insufficient available Futures USDT after active margin reservations." });
    } else {
      res.status(201).json(OpenFuturesPositionResponse.parse(responsePosition(result, quote)));
    }
  });

  router.post("/trading/futures/positions/:positionId/close", async (req, res) => {
    const positionId = Number(req.params.positionId);
    if (!Number.isSafeInteger(positionId) || positionId <= 0) {
      res.status(400).json({ error: "Invalid position ID." });
      return;
    }
    const userId = getAuth(req).userId!;
    const [existing] = await db.select().from(futuresPositionsTable).where(and(
      eq(futuresPositionsTable.id, positionId),
      eq(futuresPositionsTable.clerkUserId, userId),
      eq(futuresPositionsTable.status, "active"),
    )).limit(1);
    if (!existing) {
      res.status(404).json({ error: "Active position not found." });
      return;
    }
    let quote: FuturesQuote | null;
    try {
      quote = await getQuote(req, existing.asset);
    } catch (error) {
      req.log.warn({ err: error }, "Futures close price unavailable");
      quote = null;
    }
    if (!quote || Date.now() - quote.updatedAt > 15_000) {
      res.status(503).json({ error: "A fresh market price is unavailable. The position remains open." });
      return;
    }
    const result = await db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`${userId}:TRADING_BALANCE`}))`);
      await tx.execute(sql`select id from ${tradingAccountsTable}
        where ${tradingAccountsTable.clerkUserId} = ${userId} for update`);
      const [position] = await tx.select().from(futuresPositionsTable).where(and(
        eq(futuresPositionsTable.id, positionId),
        eq(futuresPositionsTable.clerkUserId, userId),
        eq(futuresPositionsTable.status, "active"),
      )).limit(1);
      if (!position) return null;
      if (Date.now() - quote.updatedAt > 15_000) return "stale" as const;
      const pnl = positionPnl(position, quote.price);
      if (!Number.isFinite(pnl)) return "invalid" as const;
      const [closed] = await tx.update(futuresPositionsTable).set({
        status: "closed",
        closePrice: quote.price.toFixed(8),
        realizedPnl: pnl.toFixed(8),
        closedAt: new Date(),
      }).where(and(
        eq(futuresPositionsTable.id, positionId),
        eq(futuresPositionsTable.clerkUserId, userId),
        eq(futuresPositionsTable.status, "active"),
      )).returning();
      await tx.update(tradingAccountsTable).set({
        futuresBalance: sql`${tradingAccountsTable.futuresBalance} + ${pnl.toFixed(8)}::numeric`,
        updatedAt: new Date(),
      }).where(eq(tradingAccountsTable.clerkUserId, userId));
      return closed;
    });
    if (result === "stale") {
      res.status(503).json({ error: "The quote expired before closing. Your position remains open." });
    } else if (result === "invalid") {
      res.status(503).json({ error: "The market move cannot be settled. Your position remains open." });
    } else if (!result) {
      res.status(404).json({ error: "Active position not found." });
    } else {
      res.json(CloseFuturesPositionResponse.parse(responsePosition(result)));
    }
  });

  return router;
}