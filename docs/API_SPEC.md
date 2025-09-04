# Payment Processing API Specification

## Overview

RESTful API for idempotent payment processing with comprehensive webhook support.

## Base URL

```
https://caipxjciwpyltxzxukbo.supabase.co/functions/v1
```

## Authentication

All endpoints require JWT authentication via `Authorization: Bearer <token>` header.

---

## Endpoints

### POST /payments

Create a new payment with idempotency protection.

**Headers:**
- `Authorization: Bearer <jwt_token>` (required)
- `Content-Type: application/json` (required)
- `Idempotency-Key: <unique_key>` (required)

**Request Body:**

```json
{
  "amount_cents": 10000,
  "currency": "USD",
  "customer_email": "customer@example.com",
  "payment_method": "credit_card",
  "user_id": "user-uuid",
  "metadata": {
    "external_payment_id": "PAY_12345",
    "description": "Product purchase",
    "customer_id": "CUST_67890"
  }
}
```

**Response (201 Created):**

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
    "external_payment_id": "PAY_12345",
    "description": "Product purchase"
  }
}
```

**Response (200 OK - Idempotent):**
Returns existing payment if `Idempotency-Key` was previously used.

**Error Responses:**

```json
// 400 Bad Request
{
  "error": "Validation failed",
  "details": {
    "amount_cents": "Must be a positive integer",
    "currency": "Must be a valid currency code"
  }
}

// 401 Unauthorized
{
  "error": "Authentication required",
  "message": "Valid JWT token required"
}

// 409 Conflict
{
  "error": "Idempotency key conflict",
  "message": "Key used with different request body"
}

// 500 Internal Server Error
{
  "error": "Payment processing failed",
  "message": "Gateway temporarily unavailable"
}
```

---

### GET /payments/{payment_id}

Retrieve payment status and details.

**Headers:**
- `Authorization: Bearer <jwt_token>` (required)

**Path Parameters:**
- `payment_id`: UUID of the payment

**Response (200 OK):**

```json
{
  "id": "payment-uuid",
  "external_payment_id": "PAY_12345_GENERATED",
  "status": "succeeded",
  "amount_cents": 10000,
  "currency": "USD",
  "customer_email": "customer@example.com",
  "payment_method": "credit_card",
  "user_id": "user-uuid",
  "created_at": "2025-01-01T00:00:00Z",
  "updated_at": "2025-01-01T00:01:00Z",
  "metadata": {
    "external_payment_id": "PAY_12345"
  },
  "transactions": [
    {
      "id": "transaction-uuid",
      "transaction_type": "payment",
      "status": "succeeded",
      "amount": 10000,
      "currency": "USD",
      "processed_at": "2025-01-01T00:01:00Z",
      "gateway_response": {
        "gateway_transaction_id": "gw_12345",
        "processor_response_code": "00"
      }
    }
  ]
}
```

**Error Responses:**

```json
// 404 Not Found
{
  "error": "Payment not found",
  "message": "Payment with ID payment-uuid not found"
}

// 403 Forbidden
{
  "error": "Access denied",
  "message": "Not authorized to view this payment"
}
```

---

### GET /payments

List payments for authenticated user.

**Headers:**
- `Authorization: Bearer <jwt_token>` (required)

**Query Parameters:**
- `limit`: Number of results (default: 50, max: 100)
- `offset`: Pagination offset (default: 0)
- `status`: Filter by status (`pending`, `succeeded`, `failed`, `refunded`)
- `from_date`: Filter from date (ISO 8601)
- `to_date`: Filter to date (ISO 8601)

**Response (200 OK):**

```json
{
  "data": [
    {
      "id": "payment-uuid-1",
      "external_payment_id": "PAY_12345",
      "status": "succeeded",
      "amount_cents": 10000,
      "currency": "USD",
      "created_at": "2025-01-01T00:00:00Z"
    },
    {
      "id": "payment-uuid-2",
      "external_payment_id": "PAY_67890",
      "status": "pending",
      "amount_cents": 5000,
      "currency": "USD",
      "created_at": "2025-01-01T01:00:00Z"
    }
  ],
  "pagination": {
    "limit": 50,
    "offset": 0,
    "total": 127,
    "has_more": true
  }
}
```

---

## Data Models

### Payment Status Values

- `pending`: Payment created, awaiting processing
- `processing`: Payment being processed by gateway
- `succeeded`: Payment completed successfully
- `failed`: Payment failed (can be retried)
- `refunded`: Payment was refunded
- `cancelled`: Payment was cancelled

### Currency Codes

Supported ISO 4217 currency codes:
- `USD` - US Dollar
- `EUR` - Euro
- `GBP` - British Pound
- `CAD` - Canadian Dollar

### Payment Methods

- `credit_card`
- `debit_card`
- `bank_transfer`
- `digital_wallet`
- `cryptocurrency`

---

## Idempotency

### Idempotency Key Format

```
payment_{timestamp}_{user_id}_{random}
```

Example: `payment_1704067200_user123_abc9def`

### Behavior

- **Same key + same body**: Returns existing payment (200 OK)
- **Same key + different body**: Returns conflict error (409)
- **Key expires**: After 24 hours, key can be reused

### Best Practices

1. Generate unique keys per payment attempt
2. Include user identifier to avoid conflicts
3. Store keys client-side for retry scenarios
4. Use timestamp for natural expiration

---

## Rate Limiting

- **Authenticated users**: 1000 requests/hour
- **Per payment endpoint**: 10 requests/minute
- **Webhook endpoint**: 100 requests/minute

Rate limit headers included in responses:
- `X-RateLimit-Limit`: Request limit
- `X-RateLimit-Remaining`: Remaining requests
- `X-RateLimit-Reset`: Reset timestamp

---

## Error Handling

All errors follow RFC 7807 Problem Details format:

```json
{
  "type": "https://api.example.com/errors/payment-failed",
  "title": "Payment Processing Failed",
  "status": 422,
  "detail": "Gateway declined the payment",
  "instance": "/payments/payment-uuid",
  "gateway_code": "insufficient_funds"
}
```

### Common Error Codes

- `validation_failed`: Request validation errors
- `authentication_required`: Missing or invalid JWT
- `payment_declined`: Gateway declined payment
- `insufficient_funds`: Customer account insufficient
- `card_expired`: Payment method expired
- `gateway_error`: External gateway issue
- `rate_limit_exceeded`: Too many requests