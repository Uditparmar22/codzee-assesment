import { Schema, model, type HydratedDocument, type InferSchemaType } from 'mongoose';
import { toJSONHiding, toJSONOptions } from '../../db/json.js';
import { WEBHOOK_EVENTS } from './webhook.schemas.js';

const webhookSchema = new Schema(
  {
    projectId: { type: Schema.Types.ObjectId, ref: 'Project', required: true, index: true },
    url: { type: String, required: true },
    events: { type: [String], enum: WEBHOOK_EVENTS, required: true },
    /** HMAC-SHA256 key receivers use to verify the `X-Webhook-Signature` header. */
    secret: { type: String, required: true },
    active: { type: Boolean, default: true },
  },
  // The secret is shown once, in the registration response, and never again.
  { timestamps: true, toJSON: toJSONHiding('secret') },
);

export type Webhook = InferSchemaType<typeof webhookSchema>;
export type WebhookDocument = HydratedDocument<Webhook>;
export const WebhookModel = model('Webhook', webhookSchema);

export const DELIVERY_STATUSES = ['pending', 'succeeded', 'failed'] as const;

const deliverySchema = new Schema(
  {
    webhookId: { type: Schema.Types.ObjectId, ref: 'Webhook', required: true },
    event: { type: String, enum: WEBHOOK_EVENTS, required: true },
    status: { type: String, enum: DELIVERY_STATUSES, default: 'pending', required: true },
    attempts: { type: Number, default: 0 },
    lastStatusCode: { type: Number, default: null },
    lastError: { type: String, default: null },
  },
  { timestamps: true, toJSON: toJSONOptions },
);

// Delivery history is listed newest first per webhook.
deliverySchema.index({ webhookId: 1, _id: -1 });

export type WebhookDelivery = InferSchemaType<typeof deliverySchema>;
export type WebhookDeliveryDocument = HydratedDocument<WebhookDelivery>;
export const WebhookDeliveryModel = model('WebhookDelivery', deliverySchema);
