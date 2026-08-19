const errorResponse = {
  type: "object",
  properties: {
    error: { type: "string" },
  },
  required: ["error"],
} as const;

const endpointResponse = {
  type: "object",
  properties: {
    endpoint: {
      type: "object",
      properties: {
        id: { type: "string", format: "uuid" },
        url: { type: "string", format: "uri" },
        event_types: {
          type: "array",
          items: { type: "string" },
        },
        is_active: { type: "boolean" },
        created_at: { type: "string", format: "date-time" },
        updated_at: { type: "string", format: "date-time" },
      },
      required: ["id", "url", "event_types", "is_active", "created_at", "updated_at"],
    },
    verification: {
      anyOf: [
        {
          type: "object",
          properties: {
            scheme: { type: "string", enum: ["hmac_sha256"] },
            signing_secret: { type: "string" },
            signature_header: { type: "string" },
            timestamp_header: { type: "string" },
            event_id_header: { type: "string" },
          },
          required: [
            "scheme",
            "signing_secret",
            "signature_header",
            "timestamp_header",
            "event_id_header",
          ],
        },
        { type: "null" },
      ],
    },
  },
  required: ["endpoint", "verification"],
} as const;

const uuidParam = (name: string) =>
  ({
    type: "object",
    properties: {
      [name]: { type: "string", format: "uuid" },
    },
    required: [name],
  }) as const;

const nullableDateTime = {
  anyOf: [{ type: "string", format: "date-time" }, { type: "null" }],
} as const;

const nullableString = {
  anyOf: [{ type: "string" }, { type: "null" }],
} as const;

const nullableInteger = {
  anyOf: [{ type: "integer" }, { type: "null" }],
} as const;

export const healthSchema = {
  tags: ["Health"],
  summary: "Check service health",
  response: {
    200: {
      type: "object",
      properties: {
        ok: { type: "boolean" },
      },
      required: ["ok"],
    },
  },
} as const;

export const createEndpointRouteSchema = {
  tags: ["Endpoints"],
  summary: "Register a webhook endpoint",
  description:
    "Creates an active endpoint subscribed to one or more event types for the authenticated app.",
  security: [{ bearerAuth: [] }],
  body: {
    type: "object",
    properties: {
      url: {
        type: "string",
        format: "uri",
        examples: ["https://example.com/webhook"],
      },
      event_types: {
        type: "array",
        minItems: 1,
        maxItems: 100,
        items: { type: "string", minLength: 1, maxLength: 128 },
        examples: [["payment_success", "order_created"]],
      },
    },
    required: ["url", "event_types"],
  },
  response: {
    200: endpointResponse,
    201: endpointResponse,
    400: errorResponse,
    401: errorResponse,
  },
} as const;

export const createEventRouteSchema = {
  tags: ["Events"],
  summary: "Ingest an event",
  description:
    "Stores an event durably and creates delivery rows for all active endpoints subscribed to the event type.",
  security: [{ bearerAuth: [] }],
  body: {
    type: "object",
    properties: {
      event_type: {
        type: "string",
        minLength: 1,
        maxLength: 128,
        examples: ["payment_success"],
      },
      payload: {
        description: "JSON payload delivered to matching webhook endpoints. Max size: 256 KB.",
      },
    },
    required: ["event_type", "payload"],
  },
  response: {
    202: {
      type: "object",
      properties: {
        event_id: { type: "string", format: "uuid" },
        delivery_count: { type: "integer", minimum: 0 },
      },
      required: ["event_id", "delivery_count"],
    },
    400: errorResponse,
    401: errorResponse,
    413: errorResponse,
  },
} as const;

export const getEventRouteSchema = {
  tags: ["Events"],
  summary: "Inspect an event and its deliveries",
  security: [{ bearerAuth: [] }],
  params: uuidParam("event_id"),
  response: {
    200: {
      type: "object",
      properties: {
        event: {
          type: "object",
          properties: {
            id: { type: "string", format: "uuid" },
            event_type: { type: "string" },
            payload: {},
            status: {
              type: "string",
              enum: ["accepted", "partially_delivered", "delivered", "failed"],
            },
            created_at: { type: "string", format: "date-time" },
          },
          required: ["id", "event_type", "payload", "status", "created_at"],
        },
        deliveries: {
          type: "array",
          items: {
            type: "object",
            properties: {
              id: { type: "string", format: "uuid" },
              endpoint_url: { type: "string" },
              status: {
                type: "string",
                enum: ["pending", "in_progress", "delivered", "retry_scheduled", "failed"],
              },
              attempt_count: { type: "integer" },
              next_retry_at: nullableDateTime,
              last_error: nullableString,
              last_response_code: nullableInteger,
              delivered_at: nullableDateTime,
              failed_at: nullableDateTime,
            },
            required: [
              "id",
              "endpoint_url",
              "status",
              "attempt_count",
              "next_retry_at",
              "last_error",
              "last_response_code",
              "delivered_at",
              "failed_at",
            ],
          },
        },
        attempts: {
          type: "array",
          items: {
            type: "object",
            properties: {
              id: { type: "string", format: "uuid" },
              delivery_id: { type: "string", format: "uuid" },
              attempt_number: { type: "integer" },
              status: { type: "string", enum: ["succeeded", "retry_scheduled", "failed"] },
              response_code: nullableInteger,
              error_message: nullableString,
              latency_ms: { type: "integer" },
              attempted_at: { type: "string", format: "date-time" },
            },
            required: [
              "id",
              "delivery_id",
              "attempt_number",
              "status",
              "response_code",
              "error_message",
              "latency_ms",
              "attempted_at",
            ],
          },
        },
      },
      required: ["event", "deliveries", "attempts"],
    },
    401: errorResponse,
    404: errorResponse,
  },
} as const;

export const listDeliveriesRouteSchema = {
  tags: ["Deliveries"],
  summary: "List delivery logs",
  security: [{ bearerAuth: [] }],
  querystring: {
    type: "object",
    properties: {
      status: {
        type: "string",
        enum: ["failed", "pending", "delivered"],
      },
    },
  },
  response: {
    200: {
      type: "object",
      properties: {
        deliveries: {
          type: "array",
          items: {
            type: "object",
            properties: {
              id: { type: "string", format: "uuid" },
              event_id: { type: "string", format: "uuid" },
              event_type: { type: "string" },
              endpoint_url: { type: "string" },
              status: {
                type: "string",
                enum: ["pending", "in_progress", "delivered", "retry_scheduled", "failed"],
              },
              attempt_count: { type: "integer" },
              next_retry_at: nullableDateTime,
              last_error: nullableString,
              last_response_code: nullableInteger,
              created_at: { type: "string", format: "date-time" },
            },
            required: [
              "id",
              "event_id",
              "event_type",
              "endpoint_url",
              "status",
              "attempt_count",
              "next_retry_at",
              "last_error",
              "last_response_code",
              "created_at",
            ],
          },
        },
      },
      required: ["deliveries"],
    },
    400: errorResponse,
    401: errorResponse,
  },
} as const;

export const replayDeliveryRouteSchema = {
  tags: ["Deliveries"],
  summary: "Replay a failed delivery",
  description:
    "Only failed deliveries can be replayed. Replay keeps the same event_id and resets the delivery to pending.",
  security: [{ bearerAuth: [] }],
  params: uuidParam("delivery_id"),
  response: {
    200: {
      type: "object",
      properties: {
        delivery_id: { type: "string", format: "uuid" },
        event_id: { type: "string", format: "uuid" },
        status: { type: "string", enum: ["pending"] },
      },
      required: ["delivery_id", "event_id", "status"],
    },
    401: errorResponse,
    404: errorResponse,
    409: errorResponse,
  },
} as const;
