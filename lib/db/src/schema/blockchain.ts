import { createInsertSchema } from "drizzle-zod";
import {
  boolean,
  integer,
  numeric,
  pgTable,
  serial,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { z } from "zod/v4";

export const walletProfilesTable = pgTable("wallet_profiles", {
  id: serial("id").primaryKey(),
  clerkUserId: text("clerk_user_id").notNull().unique(),
  displayName: text("display_name").notNull(),
  email: text("email").notNull(),
  verificationStatus: text("verification_status").notNull().default("unverified"),
  referralCode: text("referral_code").notNull().unique(),
  referralInvitedCount: integer("referral_invited_count").notNull().default(0),
  referralReward: numeric("referral_reward", { precision: 18, scale: 2 }).notNull().default("0"),
  totpSecret: text("totp_secret"),
  twoFactorEnabled: boolean("two_factor_enabled").notNull().default(false),
  smsPhoneNumber: text("sms_phone_number"),
  smsPhoneVerified: boolean("sms_phone_verified").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const supportThreadsTable = pgTable("support_threads", {
  id: serial("id").primaryKey(),
  clerkUserId: text("clerk_user_id").notNull().unique(),
  status: text("status").notNull().default("open"),
  adminLastReadAt: timestamp("admin_last_read_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const supportMessagesTable = pgTable("support_messages", {
  id: serial("id").primaryKey(),
  threadId: integer("thread_id").notNull(),
  senderRole: text("sender_role").notNull(), // 'user' | 'admin'
  content: text("content").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ─── Trading / Futures ────────────────────────────────────────────────────────

export const tradesTable = pgTable("trades", {
  id: serial("id").primaryKey(),
  clerkUserId: text("clerk_user_id").notNull(),
  asset: text("asset").notNull(),
  direction: text("direction").notNull(), // 'long' | 'short'
  amount: numeric("amount", { precision: 20, scale: 8 }).notNull(),
  timeframeSecs: integer("timeframe_secs").notNull(),
  status: text("status").notNull().default("active"), // 'active' | 'completed'
  result: text("result"), // 'win' | 'loss' | null
  adminOverride: text("admin_override"), // 'win' | 'loss' | null (forces outcome)
  entryPrice: numeric("entry_price", { precision: 20, scale: 8 }).notNull(),
  exitPrice: numeric("exit_price", { precision: 20, scale: 8 }),
  payout: numeric("payout", { precision: 20, scale: 8 }),
  payoutRate: numeric("payout_rate", { precision: 5, scale: 4 }).notNull().default("0.85"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  settledAt: timestamp("settled_at", { withTimezone: true }),
});

export const tradingAccountsTable = pgTable("trading_accounts", {
  id: serial("id").primaryKey(),
  clerkUserId: text("clerk_user_id").notNull().unique(),
  balance: numeric("balance", { precision: 20, scale: 8 }).notNull().default("0"),
  totalTrades: integer("total_trades").notNull().default(0),
  wins: integer("wins").notNull().default(0),
  losses: integer("losses").notNull().default(0),
  // 'auto' (market-driven outcome), 'always_win', or 'always_lose' — admin-controlled
  // per-user override applied to every future trade until changed back to 'auto'.
  tradeOutcomeMode: text("trade_outcome_mode").notNull().default("auto"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const passkeysTable = pgTable("user_passkeys", {
  id: serial("id").primaryKey(),
  clerkUserId: text("clerk_user_id").notNull(),
  credentialId: text("credential_id").notNull().unique(),
  publicKey: text("public_key").notNull(),
  deviceName: text("device_name").notNull().default("Passkey"),
  transports: text("transports"),
  counter: integer("counter").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const holdingsTable = pgTable("wallet_holdings", {
  id: serial("id").primaryKey(),
  clerkUserId: text("clerk_user_id").notNull(),
  symbol: text("symbol").notNull(),
  name: text("name").notNull(),
  amount: numeric("amount", { precision: 30, scale: 12 }).notNull(),
  value: numeric("value", { precision: 18, scale: 2 }).notNull(),
  allocation: numeric("allocation", { precision: 6, scale: 2 }).notNull(),
  change24h: numeric("change_24h", { precision: 8, scale: 2 }).notNull(),
  color: text("color").notNull(),
});

export const activitiesTable = pgTable("wallet_activities", {
  id: serial("id").primaryKey(),
  clerkUserId: text("clerk_user_id").notNull(),
  type: text("type").notNull(),
  asset: text("asset").notNull(),
  amount: numeric("amount", { precision: 30, scale: 12 }).notNull(),
  value: numeric("value", { precision: 18, scale: 2 }).notNull(),
  status: text("status").notNull(),
  transactionId: integer("transaction_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const kycSubmissionsTable = pgTable("kyc_submissions", {
  id: serial("id").primaryKey(),
  clerkUserId: text("clerk_user_id").notNull(),
  fullName: text("full_name").notNull(),
  country: text("country").notNull(),
  city: text("city").notNull().default(""),
  occupation: text("occupation").notNull().default(""),
  ssn: text("ssn").notNull().default(""),
  documentType: text("document_type").notNull(),
  documentImageBase64: text("document_image_base64"),
  status: text("status").notNull().default("pending"),
  submittedAt: timestamp("submitted_at", { withTimezone: true }).notNull().defaultNow(),
});

export const transactionsTable = pgTable("wallet_transactions", {
  id: serial("id").primaryKey(),
  clerkUserId: text("clerk_user_id").notNull(),
  type: text("type").notNull(),
  asset: text("asset").notNull(),
  amount: numeric("amount", { precision: 30, scale: 12 }).notNull(),
  destination: text("destination"),
  txHash: text("tx_hash"),
  proofPath: text("proof_path"),
  status: text("status").notNull().default("pending"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const miningInvestmentsTable = pgTable("mining_investments", {
  id: serial("id").primaryKey(),
  clerkUserId: text("clerk_user_id").notNull(),
  symbol: text("symbol").notNull(),
  assetName: text("asset_name").notNull(),
  category: text("category").notNull(),
  requestedAmount: numeric("requested_amount", { precision: 20, scale: 8 }).notNull(),
  approvedAmount: numeric("approved_amount", { precision: 20, scale: 8 }),
  units: numeric("units", { precision: 30, scale: 12 }),
  entryPrice: numeric("entry_price", { precision: 20, scale: 8 }).notNull(),
  currentValue: numeric("current_value", { precision: 20, scale: 8 }).notNull().default("0"),
  status: text("status").notNull().default("pending"),
  adminNote: text("admin_note"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertWalletProfileSchema = createInsertSchema(walletProfilesTable).omit({
  id: true,
  createdAt: true,
});
export const insertHoldingSchema = createInsertSchema(holdingsTable).omit({ id: true });
export const insertActivitySchema = createInsertSchema(activitiesTable).omit({
  id: true,
  createdAt: true,
});
export const insertKycSubmissionSchema = createInsertSchema(kycSubmissionsTable).omit({
  id: true,
  submittedAt: true,
});
export const insertTransactionSchema = createInsertSchema(transactionsTable).omit({
  id: true,
  createdAt: true,
});
export const insertMiningInvestmentSchema = createInsertSchema(miningInvestmentsTable).omit({
  id: true,
  createdAt: true,
  reviewedAt: true,
  updatedAt: true,
});

export type WalletProfile = typeof walletProfilesTable.$inferSelect;
export type Holding = typeof holdingsTable.$inferSelect;
export type Activity = typeof activitiesTable.$inferSelect;
export type KycSubmission = typeof kycSubmissionsTable.$inferSelect;
export type Transaction = typeof transactionsTable.$inferSelect;
export type MiningInvestment = typeof miningInvestmentsTable.$inferSelect;
export type Passkey = typeof passkeysTable.$inferSelect;
export type InsertWalletProfile = z.infer<typeof insertWalletProfileSchema>;
export type InsertHolding = z.infer<typeof insertHoldingSchema>;
export type InsertActivity = z.infer<typeof insertActivitySchema>;
export type InsertKycSubmission = z.infer<typeof insertKycSubmissionSchema>;
export type InsertTransaction = z.infer<typeof insertTransactionSchema>;
export type InsertMiningInvestment = z.infer<typeof insertMiningInvestmentSchema>;