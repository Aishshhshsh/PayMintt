# Quickstart Guide

## Prerequisites

- Node.js 18+ and npm
- Supabase account
- Git

## Local Setup

### 1. Clone and Install

```bash
git clone <your-repo-url>
cd payment-reconciliation-system
npm install
```

### 2. Environment Configuration

Create `.env` file (already configured):

```bash
# Supabase Configuration
VITE_SUPABASE_PROJECT_ID="caipxjciwpyltxzxukbo"
VITE_SUPABASE_PUBLISHABLE_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
VITE_SUPABASE_URL="https://caipxjciwpyltxzxukbo.supabase.co"
```

### 3. Supabase Secrets (Required for Edge Functions)

Configure these secrets in Supabase Dashboard → Settings → Edge Functions:

```bash
# Payment Gateway API Key (for external processing)
PAYMENT_GATEWAY_API_KEY="your-gateway-api-key"

# Webhook Security (HMAC signature verification)
WEBHOOK_SECRET="your-webhook-secret-key"

# Webhook Delivery URL (for retries)
WEBHOOK_URL="https://your-webhook-endpoint.com/webhooks"

# Database Connection (auto-configured)
SUPABASE_URL="https://caipxjciwpyltxzxukbo.supabase.co"
SUPABASE_ANON_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
SUPABASE_SERVICE_ROLE_KEY="your-service-role-key"
SUPABASE_DB_URL="postgresql://..."
```

### 4. Database Setup (Already Configured)

The database schema is already deployed with these tables:
- `payments` - Payment records with idempotency
- `transactions` - Individual transaction entries
- `webhook_events` - Incoming webhook log
- `webhook_deliveries` - Delivery attempts and status
- `idempotency_keys` - Duplicate prevention
- `reconciliation_records` - CSV upload data
- `reconciliation_runs` - Reconciliation job history
- `audit_logs` - Complete audit trail

### 5. Start Development Server

```bash
npm run dev
```

Visit: `http://localhost:5173`

## Sample Data Seeding

### Create Test Payment

```bash
curl -X POST https://caipxjciwpyltxzxukbo.supabase.co/functions/v1/payments \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: payment_test_001" \
  -d '{
    "amount_cents": 10000,
    "currency": "USD",
    "customer_email": "test@example.com",
    "payment_method": "credit_card",
    "user_id": "your-user-id",
    "metadata": {
      "external_payment_id": "PAY_12345"
    }
  }'
```

### Simulate Webhook

```bash
curl -X POST https://caipxjciwpyltxzxukbo.supabase.co/functions/v1/webhooks \
  -H "Content-Type: application/json" \
  -H "x-webhook-signature: sha256=<calculated-hmac>" \
  -d '{
    "event_type": "payment.succeeded",
    "data": {
      "payment_id": "payment-uuid",
      "external_payment_id": "PAY_12345",
      "status": "succeeded"
    },
    "timestamp": "2025-01-01T00:00:00Z",
    "event_id": "evt_12345"
  }'
```

### Upload CSV for Reconciliation

Create `sample_transactions.csv`:

```csv
external_transaction_id,amount,currency,transaction_date
PAY_12345,10000,USD,2025-01-01
PAY_67890,5000,USD,2025-01-01
```

Upload via the dashboard at `/` → Upload CSV section.

## Key Endpoints

- **Frontend**: `http://localhost:5173`
- **Payment API**: `https://caipxjciwpyltxzxukbo.supabase.co/functions/v1/payments`
- **Webhook Handler**: `https://caipxjciwpyltxzxukbo.supabase.co/functions/v1/webhooks`
- **Retry Service**: `https://caipxjciwpyltxzxukbo.supabase.co/functions/v1/retry-webhooks`
- **Supabase Dashboard**: `https://supabase.com/dashboard/project/caipxjciwpyltxzxukbo`

## Next Steps

1. **Configure Payment Gateway**: Update `PAYMENT_GATEWAY_API_KEY` secret
2. **Set Webhook URL**: Point to your webhook endpoint
3. **Upload CSV Files**: Test reconciliation with real data
4. **Monitor Logs**: Check Edge Function logs for debugging
5. **Set Up Alerts**: Configure monitoring for production

## Common Issues

- **JWT Token**: Get from browser dev tools → Application → Local Storage → `sb-*-auth-token`
- **CORS Errors**: Ensure Supabase URL configuration is correct
- **Edge Function Errors**: Check Supabase Functions logs
- **Database Permissions**: Verify RLS policies for your user role