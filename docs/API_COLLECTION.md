# API Collection - Paymint

## Overview

Complete API collection for testing the payment processing and reconciliation system. Import into Postman, Bruno, or use curl commands directly.

## Environment Variables

Set these variables in your API client:

```json
{
  "base_url": "https://caipxjciwpyltxzxukbo.supabase.co/functions/v1",
  "jwt_token": "YOUR_JWT_TOKEN_HERE",
  "idempotency_key": "payment_{{$timestamp}}_{{$randomUUID}}",
  "webhook_secret": "your-webhook-secret-key"
}
```

**Getting JWT Token:**
1. Log into the frontend application
2. Open browser dev tools → Application → Local Storage
3. Find key starting with `sb-caipxjciwpyltxzxukbo-auth-token`
4. Copy the `access_token` value

---

## Payment API Endpoints

### 1. Create Payment

**POST** `{{base_url}}/payments`

**Headers:**
```json
{
  "Authorization": "Bearer {{jwt_token}}",
  "Content-Type": "application/json",
  "Idempotency-Key": "{{idempotency_key}}"
}
```

**Body:**
```json
{
  "amount_cents": 10000,
  "currency": "USD",
  "customer_email": "customer@example.com",
  "payment_method": "credit_card",
  "user_id": "your-user-uuid",
  "metadata": {
    "external_payment_id": "PAY_12345",
    "description": "Product purchase",
    "customer_id": "CUST_67890"
  }
}
```

**Expected Response (201):**
```json
{
  "id": "payment-uuid",
  "external_payment_id": "PAY_12345_GENERATED",
  "status": "pending",
  "amount_cents": 10000,
  "currency": "USD",
  "customer_email": "customer@example.com",
  "payment_method": "credit_card",
  "user_id": "user-uuid",
  "created_at": "2025-01-01T00:00:00Z",
  "metadata": {
    "external_payment_id": "PAY_12345"
  }
}
```

### 2. Test Idempotency

**POST** `{{base_url}}/payments` (Duplicate Request)

**Headers:** Same as above with **same** `Idempotency-Key`

**Body:** Same request body

**Expected Response (200):**
Returns existing payment data (demonstrates idempotency)

### 3. Idempotency Conflict Test

**POST** `{{base_url}}/payments` (Different Body)

**Headers:** Same `Idempotency-Key` but different request body

**Body:**
```json
{
  "amount_cents": 20000,
  "currency": "USD",
  "customer_email": "different@example.com",
  "payment_method": "credit_card",
  "user_id": "your-user-uuid"
}
```

**Expected Response (409):**
```json
{
  "error": "Idempotency key conflict",
  "message": "Key used with different request body"
}
```

---

## Webhook Endpoints

### 1. Simulate Payment Success Webhook

**POST** `{{base_url}}/webhooks`

**Headers:**
```json
{
  "Content-Type": "application/json",
  "x-webhook-signature": "sha256=CALCULATED_HMAC_SIGNATURE"
}
```

**Body:**
```json
{
  "event_type": "payment.succeeded",
  "data": {
    "payment_id": "payment-uuid-from-previous-request",
    "external_payment_id": "PAY_12345_GENERATED",
    "status": "succeeded",
    "amount_cents": 10000,
    "currency": "USD",
    "gateway_response": {
      "transaction_id": "gw_tx_12345",
      "response_code": "00",
      "processor": "test_gateway"
    }
  },
  "timestamp": "2025-01-01T00:00:00Z",
  "event_id": "evt_succeeded_{{$randomUUID}}"
}
```

**HMAC Signature Calculation:**
```javascript
// JavaScript example for signature generation
const crypto = require('crypto');

const payload = JSON.stringify(requestBody);
const secret = 'your-webhook-secret-key';
const signature = crypto
  .createHmac('sha256', secret)
  .update(payload)
  .digest('hex');

// Use: sha256=${signature}
```

**Expected Response (200):**
```json
{
  "message": "Webhook processed successfully"
}
```

### 2. Simulate Payment Failed Webhook

**POST** `{{base_url}}/webhooks`

**Headers:** Same as above

**Body:**
```json
{
  "event_type": "payment.failed",
  "data": {
    "payment_id": "payment-uuid",
    "external_payment_id": "PAY_12345_GENERATED",
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
  "event_id": "evt_failed_{{$randomUUID}}"
}
```

### 3. Simulate Payment Refund Webhook

**POST** `{{base_url}}/webhooks`

**Headers:** Same as above

**Body:**
```json
{
  "event_type": "payment.refunded",
  "data": {
    "payment_id": "payment-uuid",
    "external_payment_id": "PAY_12345_GENERATED",
    "status": "refunded",
    "refund_amount_cents": 10000,
    "refund_reason": "customer_request",
    "gateway_response": {
      "refund_id": "rf_12345",
      "original_transaction_id": "gw_tx_12345"
    }
  },
  "timestamp": "2025-01-01T00:00:00Z",
  "event_id": "evt_refunded_{{$randomUUID}}"
}
```

### 4. Test Invalid Webhook Signature

**POST** `{{base_url}}/webhooks`

**Headers:**
```json
{
  "Content-Type": "application/json",
  "x-webhook-signature": "sha256=invalid_signature_here"
}
```

**Body:** Any webhook payload

**Expected Response (401):**
```json
{
  "error": "Invalid webhook signature"
}
```

---

## Webhook Retry System

### 1. Trigger Manual Webhook Retry

**POST** `{{base_url}}/retry-webhooks`

**Headers:**
```json
{
  "Authorization": "Bearer {{jwt_token}}",
  "Content-Type": "application/json"
}
```

**Body:** (empty)

**Expected Response (200):**
```json
{
  "message": "Webhook retry job completed",
  "summary": {
    "processed": 5,
    "successful": 3,
    "failed": 2,
    "abandoned": 0
  }
}
```

---

## Database Query Examples

### 1. Check Payment Status

**Direct Database Query:**
```sql
SELECT 
  id,
  external_payment_id,
  status,
  amount_cents,
  currency,
  created_at,
  updated_at
FROM payments 
WHERE external_payment_id = 'PAY_12345_GENERATED';
```

### 2. Check Webhook Deliveries

**Direct Database Query:**
```sql
SELECT 
  id,
  event_type,
  status,
  attempts,
  error,
  created_at,
  delivered_at
FROM webhook_deliveries 
ORDER BY created_at DESC 
LIMIT 10;
```

### 3. Check Audit Logs

**Direct Database Query:**
```sql
SELECT 
  action,
  resource_type,
  resource_id,
  old_values,
  new_values,
  created_at
FROM audit_logs 
WHERE resource_type = 'payment'
ORDER BY created_at DESC 
LIMIT 10;
```

---

## Error Testing Scenarios

### 1. Validation Errors

**POST** `{{base_url}}/payments`

**Body (Invalid):**
```json
{
  "amount_cents": -100,
  "currency": "INVALID",
  "payment_method": "",
  "user_id": "not-a-uuid"
}
```

**Expected Response (400):**
```json
{
  "error": "Validation failed",
  "details": {
    "amount_cents": "Must be a positive integer",
    "currency": "Invalid currency code",
    "payment_method": "Payment method is required"
  }
}
```

### 2. Authentication Errors

**POST** `{{base_url}}/payments`

**Headers (Missing Auth):**
```json
{
  "Content-Type": "application/json",
  "Idempotency-Key": "test_key"
}
```

**Expected Response (401):**
```json
{
  "error": "Authentication required",
  "message": "Valid JWT token required"
}
```

---

## Curl Commands

### Create Payment
```bash
curl -X POST https://caipxjciwpyltxzxukbo.supabase.co/functions/v1/payments \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: payment_$(date +%s)_test" \
  -d '{
    "amount_cents": 10000,
    "currency": "USD",
    "customer_email": "test@example.com",
    "payment_method": "credit_card",
    "user_id": "your-user-uuid",
    "metadata": {
      "external_payment_id": "PAY_TEST_001"
    }
  }'
```

### Send Webhook
```bash
# Calculate signature first
PAYLOAD='{"event_type":"payment.succeeded","data":{"payment_id":"test-payment-123","status":"succeeded"},"timestamp":"2025-01-01T00:00:00Z","event_id":"evt_test_123"}'
SECRET="your-webhook-secret"
SIGNATURE=$(echo -n "$PAYLOAD" | openssl dgst -sha256 -hmac "$SECRET" -binary | xxd -p -c 256)

curl -X POST https://caipxjciwpyltxzxukbo.supabase.co/functions/v1/webhooks \
  -H "Content-Type: application/json" \
  -H "x-webhook-signature: sha256=$SIGNATURE" \
  -d "$PAYLOAD"
```

### Trigger Webhook Retry
```bash
curl -X POST https://caipxjciwpyltxzxukbo.supabase.co/functions/v1/retry-webhooks \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json"
```

---

## Postman Collection JSON

Save this as a `.json` file and import into Postman:

```json
{
  "info": {
    "name": "PayMint API",
    "description": "omplete API collection for PayMint (payments + reconciliation system)",
    "schema": "https://schema.getpostman.com/json/collection/v2.1.0/collection.json"
  },
  "variable": [
    {
      "key": "base_url",
      "value": "https://caipxjciwpyltxzxukbo.supabase.co/functions/v1"
    },
    {
      "key": "jwt_token",
      "value": "YOUR_JWT_TOKEN_HERE"
    }
  ],
  "item": [
    {
      "name": "Create Payment",
      "request": {
        "method": "POST",
        "header": [
          {
            "key": "Authorization",
            "value": "Bearer {{jwt_token}}"
          },
          {
            "key": "Content-Type",
            "value": "application/json"
          },
          {
            "key": "Idempotency-Key",
            "value": "payment_{{$timestamp}}_{{$randomUUID}}"
          }
        ],
        "body": {
          "mode": "raw",
          "raw": "{\n  \"amount_cents\": 10000,\n  \"currency\": \"USD\",\n  \"customer_email\": \"test@example.com\",\n  \"payment_method\": \"credit_card\",\n  \"user_id\": \"your-user-uuid\",\n  \"metadata\": {\n    \"external_payment_id\": \"PAY_TEST_001\"\n  }\n}"
        },
        "url": {
          "raw": "{{base_url}}/payments",
          "host": ["{{base_url}}"],
          "path": ["payments"]
        }
      }
    },
    {
      "name": "Payment Success Webhook",
      "request": {
        "method": "POST",
        "header": [
          {
            "key": "Content-Type",
            "value": "application/json"
          },
          {
            "key": "x-webhook-signature",
            "value": "sha256=CALCULATE_HMAC_SIGNATURE"
          }
        ],
        "body": {
          "mode": "raw",
          "raw": "{\n  \"event_type\": \"payment.succeeded\",\n  \"data\": {\n    \"payment_id\": \"payment-uuid\",\n    \"status\": \"succeeded\"\n  },\n  \"timestamp\": \"2025-01-01T00:00:00Z\",\n  \"event_id\": \"evt_{{$randomUUID}}\"\n}"
        },
        "url": {
          "raw": "{{base_url}}/webhooks",
          "host": ["{{base_url}}"],
          "path": ["webhooks"]
        }
      }
    },
    {
      "name": "Trigger Webhook Retry",
      "request": {
        "method": "POST",
        "header": [
          {
            "key": "Authorization",
            "value": "Bearer {{jwt_token}}"
          },
          {
            "key": "Content-Type",
            "value": "application/json"
          }
        ],
        "url": {
          "raw": "{{base_url}}/retry-webhooks",
          "host": ["{{base_url}}"],
          "path": ["retry-webhooks"]
        }
      }
    }
  ]
}
```

---

## Bruno Collection

For Bruno API client, create a `bruno.json` file:

```json
{
  "version": "1",
  "name": "Payment Processing API",
  "type": "collection",
  "environments": {
    "development": {
      "base_url": "https://caipxjciwpyltxzxukbo.supabase.co/functions/v1",
      "jwt_token": "YOUR_JWT_TOKEN_HERE"
    }
  }
}
```

And individual `.bru` files for each request:

**create-payment.bru:**
```
meta {
  name: Create Payment
  type: http
  seq: 1
}

post {
  url: {{base_url}}/payments
  body: json
  auth: bearer
}

auth:bearer {
  token: {{jwt_token}}
}

headers {
  Content-Type: application/json
  Idempotency-Key: payment_{{$timestamp}}_test
}

body:json {
  {
    "amount_cents": 10000,
    "currency": "USD",
    "customer_email": "test@example.com",
    "payment_method": "credit_card",
    "user_id": "your-user-uuid",
    "metadata": {
      "external_payment_id": "PAY_TEST_001"
    }
  }
}
```

---

## Testing Workflow

1. **Setup Environment**: Configure JWT token and base URL
2. **Create Payment**: Test payment creation with idempotency
3. **Test Idempotency**: Send duplicate request with same key
4. **Send Webhooks**: Simulate payment status updates
5. **Verify Status**: Check payment status in database
6. **Test Retries**: Trigger webhook retry mechanism
7. **Error Testing**: Test validation and authentication errors
8. **Load Testing**: Send multiple concurrent requests

This collection covers all major API endpoints and error scenarios for comprehensive testing of the payment processing and reconciliation system - Paymint.
