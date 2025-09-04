# Webhook Specification

## Overview

Secure webhook delivery system using HMAC-SHA256 signature verification for payment status updates.

## Webhook Endpoint Configuration

Configure your webhook endpoint URL in Supabase Edge Functions secrets:

```bash
WEBHOOK_URL="https://your-domain.com/webhooks/payments"
WEBHOOK_SECRET="your-secret-key-256-bits"
```

---

## Security

### HMAC Signature Verification

All webhooks include an HMAC-SHA256 signature for authentication.

**Header:** `x-webhook-signature`
**Format:** `sha256=<hex_signature>`

### Signature Generation (Server-side)

```javascript
const crypto = require('crypto');

function generateSignature(payload, secret) {
  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(payload, 'utf8');
  return `sha256=${hmac.digest('hex')}`;
}

// Example
const payload = JSON.stringify(webhookData);
const signature = generateSignature(payload, process.env.WEBHOOK_SECRET);
```

### Signature Verification (Your endpoint)

```javascript
function verifySignature(payload, signature, secret) {
  const expectedSignature = generateSignature(payload, secret);
  
  // Use constant-time comparison to prevent timing attacks
  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature)
  );
}

// Express.js example
app.post('/webhooks/payments', express.raw({type: 'application/json'}), (req, res) => {
  const signature = req.headers['x-webhook-signature'];
  const payload = req.body.toString();
  
  if (!verifySignature(payload, signature, process.env.WEBHOOK_SECRET)) {
    return res.status(401).send('Invalid signature');
  }
  
  const event = JSON.parse(payload);
  // Process webhook...
  res.status(200).send('OK');
});
```

---

## Webhook Events

### Event Structure

```json
{
  "event_type": "payment.succeeded",
  "data": {
    "payment_id": "payment-uuid",
    "external_payment_id": "PAY_12345",
    "status": "succeeded",
    "amount_cents": 10000,
    "currency": "USD",
    "customer_email": "customer@example.com",
    "gateway_response": {
      "transaction_id": "gw_tx_12345",
      "response_code": "00",
      "processor": "stripe"
    }
  },
  "timestamp": "2025-01-01T00:00:00Z",
  "event_id": "evt_unique_12345"
}
```

### Event Types

#### payment.succeeded
Payment completed successfully.

```json
{
  "event_type": "payment.succeeded",
  "data": {
    "payment_id": "payment-uuid",
    "external_payment_id": "PAY_12345",
    "status": "succeeded",
    "amount_cents": 10000,
    "currency": "USD",
    "processed_at": "2025-01-01T00:00:00Z",
    "gateway_response": {
      "transaction_id": "gw_tx_12345",
      "response_code": "00"
    }
  },
  "timestamp": "2025-01-01T00:00:00Z",
  "event_id": "evt_succeeded_12345"
}
```

#### payment.failed
Payment processing failed.

```json
{
  "event_type": "payment.failed",
  "data": {
    "payment_id": "payment-uuid",
    "external_payment_id": "PAY_12345",
    "status": "failed",
    "amount_cents": 10000,
    "currency": "USD",
    "failure_reason": "insufficient_funds",
    "gateway_response": {
      "transaction_id": "gw_tx_12345",
      "response_code": "51",
      "decline_reason": "Insufficient funds"
    }
  },
  "timestamp": "2025-01-01T00:00:00Z",
  "event_id": "evt_failed_12345"
}
```

#### payment.refunded
Payment was refunded.

```json
{
  "event_type": "payment.refunded",
  "data": {
    "payment_id": "payment-uuid",
    "external_payment_id": "PAY_12345",
    "status": "refunded",
    "refund_amount_cents": 10000,
    "refund_reason": "customer_request",
    "gateway_response": {
      "refund_id": "rf_12345",
      "original_transaction_id": "gw_tx_12345"
    }
  },
  "timestamp": "2025-01-01T00:00:00Z",
  "event_id": "evt_refunded_12345"
}
```

---

## Delivery & Retry

### Delivery Expectations

- **Timeout**: 30 seconds
- **Expected Response**: HTTP 200-299 status code
- **Content-Type**: `application/json`
- **User-Agent**: `Supabase-Webhooks/1.0`

### Retry Policy

Failed deliveries are automatically retried with exponential backoff:

| Attempt | Delay | Total Time |
|---------|-------|------------|
| 1       | 0s    | 0s         |
| 2       | 2s    | 2s         |
| 3       | 4s    | 6s         |
| 4       | 8s    | 14s        |
| 5       | 16s   | 30s        |
| 6       | 32s   | 62s        |

**Maximum Attempts**: 5 retries
**Abandonment**: After 5 failed attempts, delivery is marked as `abandoned`

### Retry Triggers

Retries occur for:
- **HTTP 5xx errors** (server errors)
- **HTTP 408** (timeout)
- **HTTP 429** (rate limit)
- **Network timeouts**
- **Connection errors**

No retries for:
- **HTTP 4xx errors** (except 408, 429)
- **Invalid webhook URL**
- **SSL certificate errors**

---

## Implementation Guide

### 1. Endpoint Requirements

```javascript
// Express.js webhook endpoint
app.post('/webhooks/payments', 
  express.raw({type: 'application/json'}),
  async (req, res) => {
    try {
      // 1. Verify signature
      const signature = req.headers['x-webhook-signature'];
      if (!verifyWebhookSignature(req.body, signature)) {
        return res.status(401).send('Unauthorized');
      }
      
      // 2. Parse event
      const event = JSON.parse(req.body.toString());
      
      // 3. Idempotency check
      if (await isEventProcessed(event.event_id)) {
        return res.status(200).send('Already processed');
      }
      
      // 4. Process event
      await processPaymentEvent(event);
      
      // 5. Mark as processed
      await markEventProcessed(event.event_id);
      
      res.status(200).send('OK');
    } catch (error) {
      console.error('Webhook error:', error);
      res.status(500).send('Internal error');
    }
  }
);
```

### 2. Event Processing

```javascript
async function processPaymentEvent(event) {
  switch (event.event_type) {
    case 'payment.succeeded':
      await handlePaymentSucceeded(event.data);
      break;
      
    case 'payment.failed':
      await handlePaymentFailed(event.data);
      break;
      
    case 'payment.refunded':
      await handlePaymentRefunded(event.data);
      break;
      
    default:
      console.warn(`Unknown event type: ${event.event_type}`);
  }
}

async function handlePaymentSucceeded(data) {
  // Update local payment status
  await updatePaymentStatus(data.payment_id, 'succeeded');
  
  // Send confirmation email
  await sendPaymentConfirmation(data.customer_email);
  
  // Update inventory
  await fulfillOrder(data.payment_id);
}
```

### 3. Signature Verification Library

```javascript
const crypto = require('crypto');

class WebhookVerifier {
  constructor(secret) {
    this.secret = secret;
  }
  
  verify(payload, signature) {
    if (!signature || !signature.startsWith('sha256=')) {
      return false;
    }
    
    const providedSignature = signature.slice(7); // Remove 'sha256='
    const expectedSignature = this.generateSignature(payload);
    
    return crypto.timingSafeEqual(
      Buffer.from(providedSignature, 'hex'),
      Buffer.from(expectedSignature, 'hex')
    );
  }
  
  generateSignature(payload) {
    return crypto
      .createHmac('sha256', this.secret)
      .update(payload, 'utf8')
      .digest('hex');
  }
}

// Usage
const verifier = new WebhookVerifier(process.env.WEBHOOK_SECRET);
const isValid = verifier.verify(req.body.toString(), req.headers['x-webhook-signature']);
```

---

## Testing Webhooks

### 1. Test Signature Generation

```bash
# Generate test signature
payload='{"event_type":"payment.succeeded","data":{"payment_id":"test"}}'
secret="your-webhook-secret"
signature=$(echo -n "$payload" | openssl dgst -sha256 -hmac "$secret" -binary | xxd -p -c 256)
echo "sha256=$signature"
```

### 2. Send Test Webhook

```bash
curl -X POST https://your-domain.com/webhooks/payments \
  -H "Content-Type: application/json" \
  -H "x-webhook-signature: sha256=calculated_signature_here" \
  -d '{
    "event_type": "payment.succeeded",
    "data": {
      "payment_id": "test-payment-123",
      "external_payment_id": "PAY_TEST_123",
      "status": "succeeded"
    },
    "timestamp": "2025-01-01T00:00:00Z",
    "event_id": "evt_test_123"
  }'
```

### 3. Webhook Testing Tools

- **ngrok**: Expose local development server
- **webhook.site**: Capture and inspect webhooks
- **Postman**: Test webhook endpoints
- **curl**: Command-line testing

---

## Monitoring & Debugging

### Webhook Delivery Logs

Query webhook delivery status:

```sql
-- Check recent webhook deliveries
SELECT 
  event_type,
  status,
  attempts,
  error,
  created_at,
  delivered_at
FROM webhook_deliveries 
ORDER BY created_at DESC 
LIMIT 50;

-- Find failed deliveries
SELECT * FROM webhook_deliveries 
WHERE status = 'failed' 
AND attempts >= 5;
```

### Common Issues

1. **Invalid Signature**: Check secret key configuration
2. **Timeout Errors**: Optimize endpoint response time
3. **SSL Issues**: Ensure valid HTTPS certificate
4. **Rate Limiting**: Implement proper rate limit handling

### Webhook Health Check

```javascript
// Health check endpoint
app.get('/webhooks/health', (req, res) => {
  res.status(200).json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: '1.0.0'
  });
});
```