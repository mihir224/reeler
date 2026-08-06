import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

export const eventStatus = pgEnum("event_status", [
  "accepted",
  "partially_delivered",
  "delivered",
  "failed",
]);

export const deliveryStatus = pgEnum("delivery_status", [
  "pending",
  "in_progress",
  "delivered",
  "retry_scheduled",
  "failed",
]);

export const attemptStatus = pgEnum("attempt_status", [
  "succeeded",
  "retry_scheduled",
  "failed",
]);

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  name: text("name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const apps = pgTable("apps", {
  id: uuid("id").primaryKey().defaultRandom(),
  ownerUserId: uuid("owner_user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const apiKeys = pgTable(
  "api_keys",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    appId: uuid("app_id")
      .notNull()
      .references(() => apps.id, { onDelete: "cascade" }),
    keyHash: text("key_hash").notNull().unique(),
    label: text("label").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
  },
  (table) => ({
    keyHashIdx: index("api_keys_key_hash_idx").on(table.keyHash),
  }),
);

export const endpoints = pgTable(
  "endpoints",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    appId: uuid("app_id")
      .notNull()
      .references(() => apps.id, { onDelete: "cascade" }),
    url: text("url").notNull(),
    secret: text("secret").notNull(),
    eventTypes: text("event_types").array().notNull(),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    eventTypesIdx: index("endpoints_app_id_event_types_idx").using("gin", table.eventTypes),
  }),
);

export const eventCatalog = pgTable(
  "event_catalog",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    appId: uuid("app_id")
      .notNull()
      .references(() => apps.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    appNameIdx: index("event_catalog_app_id_name_idx").on(table.appId, table.name),
  }),
);

export const events = pgTable(
  "events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    appId: uuid("app_id")
      .notNull()
      .references(() => apps.id, { onDelete: "cascade" }),
    eventType: text("event_type").notNull(),
    payload: jsonb("payload").notNull(),
    status: eventStatus("status").notNull().default("accepted"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    appCreatedIdx: index("events_app_id_created_at_idx").on(table.appId, table.createdAt),
  }),
);

export const deliveries = pgTable(
  "deliveries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    eventId: uuid("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    endpointId: uuid("endpoint_id")
      .notNull()
      .references(() => endpoints.id, { onDelete: "cascade" }),
    status: deliveryStatus("status").notNull().default("pending"),
    attemptCount: integer("attempt_count").notNull().default(0),
    nextRetryAt: timestamp("next_retry_at", { withTimezone: true }),
    lastError: text("last_error"),
    lastResponseCode: integer("last_response_code"),
    firstAttemptedAt: timestamp("first_attempted_at", { withTimezone: true }),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
    failedAt: timestamp("failed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    dueIdx: index("deliveries_due_idx").on(table.status, table.nextRetryAt, table.createdAt),
    eventIdx: index("deliveries_event_id_idx").on(table.eventId),
  }),
);

export const deliveryAttempts = pgTable(
  "delivery_attempts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    deliveryId: uuid("delivery_id")
      .notNull()
      .references(() => deliveries.id, { onDelete: "cascade" }),
    attemptNumber: integer("attempt_number").notNull(),
    status: attemptStatus("status").notNull(),
    responseCode: integer("response_code"),
    responseBodyPreview: text("response_body_preview"),
    errorMessage: text("error_message"),
    latencyMs: integer("latency_ms").notNull(),
    attemptedAt: timestamp("attempted_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    deliveryIdx: index("delivery_attempts_delivery_id_idx").on(table.deliveryId, table.attemptedAt),
  }),
);

export const replayAudits = pgTable("replay_audits", {
  id: uuid("id").primaryKey().defaultRandom(),
  eventId: uuid("event_id")
    .notNull()
    .references(() => events.id, { onDelete: "cascade" }),
  deliveryId: uuid("delivery_id")
    .notNull()
    .references(() => deliveries.id, { onDelete: "cascade" }),
  replayedAt: timestamp("replayed_at", { withTimezone: true }).notNull().defaultNow(),
  replayTriggeredBy: text("replay_triggered_by").notNull(),
});

export type EventStatus = (typeof eventStatus.enumValues)[number];
export type DeliveryStatus = (typeof deliveryStatus.enumValues)[number];
export type AttemptStatus = (typeof attemptStatus.enumValues)[number];
