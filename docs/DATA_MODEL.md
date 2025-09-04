# Data Model & Entity Relationship Diagram

## Overview

PostgreSQL database schema optimized for payment processing, webhook delivery, and reconciliation with comprehensive indexing for high performance.

## Entity Relationship Diagram

<lov-mermaid>
erDiagram
    payments ||--o{ transactions : "has many"
    payments ||--o{ reconciliation_records : "matched to"
    payments ||--o{ audit_logs : "logged in"
    
    webhook_events ||--o{ webhook_deliveries : "delivered via"
    
    reconciliation_records }o--|| reconciliation_runs : "part of"
    
    idempotency_keys ||--o| payments : "protects"
    
    payments {
        uuid id PK
        uuid user_id FK
        integer amount_cents
        text currency
        text status
        text payment_method
        text customer_email
        text external_payment_id
        text external_id
        text idempotency_key
        jsonb metadata
        integer retry_count
        integer max_retries
        text gateway_ref
        timestamptz created_at
        timestamptz updated_at
    }
    
    transactions {
        uuid id PK
        uuid payment_id FK
        text transaction_type
        text status
        integer amount
        text currency
        text external_transaction_id
        jsonb gateway_response
        timestamptz processed_at
        timestamptz created_at
    }
    
    webhook_events {
        uuid id PK
        text event_id UNIQUE
        text source
        text event_type
        jsonb payload
        text signature
        boolean processed
        integer retry_count
        timestamptz processed_at
        timestamptz created_at
    }
    
    webhook_deliveries {
        bigint id PK
        text event_type
        jsonb payload
        text status
        integer attempts
        text error
        text signature
        timestamptz next_attempt_at
        timestamptz delivered_at
        timestamptz created_at
    }
    
    idempotency_keys {
        text key PK
        text endpoint
        text method
        text request_hash
        jsonb response
        integer status_code
        boolean locked
        timestamptz last_used_at
        timestamptz created_at
    }
    
    reconciliation_records {
        uuid id PK
        uuid uploaded_by FK
        text file_name
        text external_transaction_id
        integer amount
        text currency
        text status
        uuid matched_payment_id FK
        timestamptz transaction_date
        timestamptz created_at
    }
    
    reconciliation_runs {
        uuid id PK
        uuid user_id FK
        text filename
        jsonb summary
        timestamptz run_at
    }
    
    reconciliation_details {
        uuid run_id FK
        uuid payment_id FK
        integer db_amount_cents
        integer csv_amount_cents
        text db_status
        text csv_status
        text reason
    }
    
    audit_logs {
        uuid id PK
        uuid user_id FK
        text action
        text resource_type
        text resource_id
        jsonb old_values
        jsonb new_values
        inet ip_address
        text user_agent
        timestamptz created_at
    }
</lov-mermaid>

---

## Table Definitions

### payments

Core payment records with idempotency protection.

```sql
CREATE TABLE public.payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users,
  amount_cents INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD',
  status TEXT NOT NULL DEFAULT 'pending',
  payment_method TEXT,
  customer_email TEXT,
  external_payment_id TEXT,
  external_id TEXT,
  idempotency_key TEXT NOT NULL,
  metadata JSONB DEFAULT '{}',
  retry_count INTEGER DEFAULT 0,
  max_retries INTEGER DEFAULT 3,
  gateway_ref TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_payments_user_id ON payments(user_id);
CREATE INDEX idx_payments_status ON payments(status);
CREATE INDEX idx_payments_idempotency_key ON payments(idempotency_key);
CREATE INDEX idx_payments_external_payment_id ON payments(external_payment_id);
CREATE INDEX idx_payments_created_at ON payments(created_at);
CREATE INDEX idx_payments_amount_currency ON payments(amount_cents, currency);
```

**Key Fields:**
- `amount_cents`: Amount in smallest currency unit (e.g., cents for USD)
- `status`: `pending`, `processing`, `succeeded`, `failed`, `refunded`, `cancelled`
- `idempotency_key`: Prevents duplicate payments
- `external_payment_id`: Gateway reference ID
- `metadata`: Flexible JSON storage for additional data

### transactions

Individual transaction records linked to payments.

```sql
CREATE TABLE public.transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id UUID REFERENCES payments(id),
  transaction_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  amount INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD',
  external_transaction_id TEXT,
  gateway_response JSONB DEFAULT '{}',
  processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_transactions_payment_id ON transactions(payment_id);
CREATE INDEX idx_transactions_status ON transactions(status);
CREATE INDEX idx_transactions_external_id ON transactions(external_transaction_id);
CREATE INDEX idx_transactions_created_at ON transactions(created_at);
```

**Transaction Types:**
- `payment`: Initial payment transaction
- `refund`: Refund transaction
- `partial_refund`: Partial refund transaction
- `chargeback`: Chargeback transaction

### webhook_events

Incoming webhook event log with deduplication.

```sql
CREATE TABLE public.webhook_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id TEXT UNIQUE NOT NULL,
  source TEXT NOT NULL,
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL,
  signature TEXT,
  processed BOOLEAN DEFAULT FALSE,
  retry_count INTEGER DEFAULT 0,
  processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE UNIQUE INDEX idx_webhook_events_event_id ON webhook_events(event_id);
CREATE INDEX idx_webhook_events_event_type ON webhook_events(event_type);
CREATE INDEX idx_webhook_events_processed ON webhook_events(processed);
CREATE INDEX idx_webhook_events_created_at ON webhook_events(created_at);
```

**Event Types:**
- `payment.succeeded`
- `payment.failed`
- `payment.refunded`
- `payment.cancelled`

### webhook_deliveries

Webhook delivery attempts and retry management.

```sql
CREATE TABLE public.webhook_deliveries (
  id BIGSERIAL PRIMARY KEY,
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL,
  status TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  error TEXT,
  signature TEXT,
  next_attempt_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_webhook_deliveries_status ON webhook_deliveries(status);
CREATE INDEX idx_webhook_deliveries_next_attempt ON webhook_deliveries(next_attempt_at) 
  WHERE status = 'failed';
CREATE INDEX idx_webhook_deliveries_created_at ON webhook_deliveries(created_at);
```

**Delivery Status:**
- `pending`: Awaiting delivery
- `delivered`: Successfully delivered
- `failed`: Delivery failed (will retry)
- `abandoned`: Max retries exceeded

### idempotency_keys

Idempotency protection for API endpoints.

```sql
CREATE TABLE public.idempotency_keys (
  key TEXT PRIMARY KEY,
  endpoint TEXT NOT NULL,
  method TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  response JSONB,
  status_code INTEGER,
  locked BOOLEAN NOT NULL DEFAULT FALSE,
  last_used_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_idempotency_keys_endpoint ON idempotency_keys(endpoint);
CREATE INDEX idx_idempotency_keys_last_used ON idempotency_keys(last_used_at);
```

**Key Format:** `payment_{timestamp}_{user_id}_{random}`

### reconciliation_records

CSV upload data for payment reconciliation.

```sql
CREATE TABLE public.reconciliation_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  uploaded_by UUID REFERENCES auth.users,
  file_name TEXT NOT NULL,
  external_transaction_id TEXT,
  amount INTEGER,
  currency TEXT DEFAULT 'USD',
  status TEXT DEFAULT 'unmatched',
  matched_payment_id UUID REFERENCES payments(id),
  transaction_date TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_reconciliation_uploaded_by ON reconciliation_records(uploaded_by);
CREATE INDEX idx_reconciliation_status ON reconciliation_records(status);
CREATE INDEX idx_reconciliation_external_id ON reconciliation_records(external_transaction_id);
CREATE INDEX idx_reconciliation_amount ON reconciliation_records(amount);
CREATE INDEX idx_reconciliation_match_lookup ON reconciliation_records(amount, external_transaction_id);
```

**Reconciliation Status:**
- `unmatched`: Not yet matched to payment
- `matched`: Successfully matched
- `disputed`: Manual review required

### reconciliation_runs

Reconciliation job execution history.

```sql
CREATE TABLE public.reconciliation_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users,
  filename TEXT,
  summary JSONB,
  run_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_reconciliation_runs_user_id ON reconciliation_runs(user_id);
CREATE INDEX idx_reconciliation_runs_run_at ON reconciliation_runs(run_at);
```

### audit_logs

Comprehensive audit trail for compliance.

```sql
CREATE TABLE public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users,
  action TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  resource_id TEXT,
  old_values JSONB,
  new_values JSONB,
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX idx_audit_logs_resource ON audit_logs(resource_type, resource_id);
CREATE INDEX idx_audit_logs_action ON audit_logs(action);
CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at);
```

**Audit Actions:**
- `payment.created`
- `payment.updated`
- `webhook.received`
- `reconciliation.matched`

---

## Performance Optimizations

### Database Indexes

**High-Performance Queries:**

1. **Payment Lookup by User & Status:**
   ```sql
   CREATE INDEX idx_payments_user_status ON payments(user_id, status);
   ```

2. **Webhook Retry Queue:**
   ```sql
   CREATE INDEX idx_webhook_retry_queue ON webhook_deliveries(status, next_attempt_at)
   WHERE status = 'failed' AND next_attempt_at IS NOT NULL;
   ```

3. **Reconciliation Matching:**
   ```sql
   CREATE INDEX idx_reconciliation_match_composite ON reconciliation_records(amount, external_transaction_id, status);
   ```

4. **Audit Log Queries:**
   ```sql
   CREATE INDEX idx_audit_logs_resource_time ON audit_logs(resource_type, resource_id, created_at);
   ```

### Query Patterns

**Fast Payment Search:**
```sql
-- Optimized for user dashboard
SELECT * FROM payments 
WHERE user_id = $1 AND status = $2 
ORDER BY created_at DESC 
LIMIT 50;
```

**Efficient Reconciliation Matching:**
```sql
-- Uses composite index
SELECT p.id, p.external_payment_id, r.id as record_id
FROM payments p
JOIN reconciliation_records r ON (
  p.amount_cents = r.amount 
  AND p.external_payment_id = r.external_transaction_id
)
WHERE r.status = 'unmatched' AND p.user_id = $1;
```

**Webhook Retry Processing:**
```sql
-- Optimized retry queue
SELECT * FROM webhook_deliveries 
WHERE status = 'failed' 
  AND next_attempt_at <= now()
  AND attempts < 5
ORDER BY next_attempt_at ASC
LIMIT 50;
```

---

## Data Constraints & Validation

### Business Rules

1. **Payment Amount:** Must be positive integer (cents)
2. **Currency:** Valid ISO 4217 codes only
3. **Idempotency:** Keys must be unique per endpoint
4. **Webhook Events:** Event IDs must be globally unique
5. **Reconciliation:** Amount matching within currency precision

### Database Constraints

```sql
-- Payment validation
ALTER TABLE payments ADD CONSTRAINT payments_amount_positive 
  CHECK (amount_cents > 0);

ALTER TABLE payments ADD CONSTRAINT payments_currency_valid 
  CHECK (currency IN ('USD', 'EUR', 'GBP', 'CAD'));

-- Status validation
ALTER TABLE payments ADD CONSTRAINT payments_status_valid 
  CHECK (status IN ('pending', 'processing', 'succeeded', 'failed', 'refunded', 'cancelled'));

-- Webhook delivery attempts
ALTER TABLE webhook_deliveries ADD CONSTRAINT webhook_attempts_limit 
  CHECK (attempts >= 0 AND attempts <= 10);
```

### Row Level Security (RLS)

**User Data Isolation:**
```sql
-- Payments: Users can only access their own payments
CREATE POLICY "Users can view their own payments" ON payments
  FOR SELECT USING (user_id = auth.uid());

-- Reconciliation: Users can only access their uploads
CREATE POLICY "Users can view their reconciliation records" ON reconciliation_records
  FOR SELECT USING (uploaded_by = auth.uid());

-- Audit logs: Users can view their own audit trail
CREATE POLICY "Users can view their audit logs" ON audit_logs
  FOR SELECT USING (user_id = auth.uid());
```

---

## Migration Strategy

### Schema Versioning

Database migrations are versioned and tracked:

```sql
-- Migration tracking table
CREATE TABLE schema_migrations (
  version TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### Backward Compatibility

- **Additive Changes:** New columns with defaults
- **Column Renaming:** Use views for transition period
- **Type Changes:** Staged with validation triggers
- **Index Changes:** Built concurrently in production