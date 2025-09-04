# Operations Runbook

## Common Failures & Troubleshooting

### 1. Payment Processing Failures

#### Stuck Payments in 'pending' Status

**Symptoms:**
- Payments remain in `pending` status for > 5 minutes
- No corresponding webhook events received
- User complaints about payment delays

**Investigation Steps:**

```sql
-- Check stuck payments
SELECT 
  id, 
  external_payment_id, 
  amount_cents, 
  created_at,
  EXTRACT(EPOCH FROM (now() - created_at))/60 as minutes_stuck
FROM payments 
WHERE status = 'pending' 
  AND created_at < (now() - INTERVAL '5 minutes')
ORDER BY created_at ASC;
```

**Resolution:**

1. **Check Edge Function Logs:**
   ```bash
   # View payment function logs
   supabase functions logs payments --project-ref caipxjciwpyltxzxukbo
   ```

2. **Manual Status Update:**
   ```sql
   -- If gateway confirms success
   UPDATE payments 
   SET status = 'succeeded', updated_at = now()
   WHERE id = 'stuck-payment-uuid';
   
   -- Create audit log
   SELECT create_audit_log(
     null, 
     'payment.manual_update', 
     'payment', 
     'stuck-payment-uuid',
     '{"old_status": "pending"}',
     '{"new_status": "succeeded", "reason": "manual_intervention"}'
   );
   ```

3. **Reprocess Webhook:**
   ```sql
   -- Trigger webhook reprocessing
   INSERT INTO webhook_events (event_id, source, event_type, payload)
   VALUES (
     'manual_retry_' || gen_random_uuid(),
     'manual',
     'payment.succeeded',
     jsonb_build_object(
       'payment_id', 'stuck-payment-uuid',
       'status', 'succeeded'
     )
   );
   ```

#### Idempotency Key Conflicts

**Symptoms:**
- 409 Conflict responses from payment API
- Duplicate payment creation attempts

**Investigation:**
```sql
-- Check idempotency key usage
SELECT 
  key,
  endpoint,
  method,
  status_code,
  last_used_at,
  created_at
FROM idempotency_keys 
WHERE key LIKE 'payment_%'
  AND last_used_at > (now() - INTERVAL '1 hour')
ORDER BY last_used_at DESC;
```

**Resolution:**
```sql
-- Clear expired idempotency keys (if needed)
DELETE FROM idempotency_keys 
WHERE created_at < (now() - INTERVAL '24 hours');
```

---

### 2. Webhook Delivery Failures

#### Webhooks Stuck in 'failed' Status

**Symptoms:**
- High volume of failed webhook deliveries
- External webhook endpoint returning errors
- Customers not receiving payment confirmations

**Investigation:**

```sql
-- Check failed webhook deliveries
SELECT 
  id,
  event_type,
  status,
  attempts,
  error,
  next_attempt_at,
  created_at
FROM webhook_deliveries 
WHERE status = 'failed'
  AND attempts < 5
ORDER BY next_attempt_at ASC
LIMIT 20;
```

**Check External Webhook Health:**
```bash
# Test webhook endpoint manually
curl -X POST https://your-webhook-url.com/webhooks \
  -H "Content-Type: application/json" \
  -H "x-webhook-signature: sha256=test" \
  -d '{"test": true}' \
  -v
```

**Resolution Steps:**

1. **Fix Webhook URL Configuration:**
   ```bash
   # Update webhook URL in Supabase secrets
   # Go to: https://supabase.com/dashboard/project/caipxjciwpyltxzxukbo/settings/functions
   # Update WEBHOOK_URL secret
   ```

2. **Manual Retry Failed Webhooks:**
   ```sql
   -- Reset failed webhooks for retry
   UPDATE webhook_deliveries 
   SET 
     attempts = 0,
     status = 'pending',
     next_attempt_at = now(),
     error = null
   WHERE status = 'failed' 
     AND attempts < 5
     AND created_at > (now() - INTERVAL '1 hour');
   ```

3. **Trigger Retry Job Manually:**
   ```bash
   # Invoke retry function manually
   curl -X POST https://caipxjciwpyltxzxukbo.supabase.co/functions/v1/retry-webhooks \
     -H "Authorization: Bearer YOUR_SERVICE_ROLE_KEY" \
     -H "Content-Type: application/json"
   ```

#### Abandoned Webhooks

**Symptoms:**
- Webhooks with status = 'abandoned'
- External systems missing critical updates

**Investigation:**
```sql
-- Find abandoned webhooks
SELECT 
  id,
  event_type,
  payload,
  attempts,
  error,
  created_at
FROM webhook_deliveries 
WHERE status = 'abandoned'
  AND created_at > (now() - INTERVAL '24 hours')
ORDER BY created_at DESC;
```

**Resolution:**
```sql
-- Manually recreate abandoned webhooks
INSERT INTO webhook_deliveries (
  event_type,
  payload,
  status,
  attempts,
  signature
)
SELECT 
  event_type,
  payload,
  'pending',
  0,
  signature
FROM webhook_deliveries 
WHERE status = 'abandoned'
  AND id = 'specific-abandoned-webhook-id';
```

---

### 3. Reconciliation Failures

#### CSV Upload Failures

**Symptoms:**
- CSV parsing errors
- Invalid data format complaints
- Reconciliation records not created

**Investigation:**
```sql
-- Check recent reconciliation uploads
SELECT 
  file_name,
  COUNT(*) as record_count,
  MIN(created_at) as first_record,
  MAX(created_at) as last_record
FROM reconciliation_records 
WHERE created_at > (now() - INTERVAL '24 hours')
GROUP BY file_name
ORDER BY first_record DESC;
```

**Common CSV Issues:**
1. **Missing Required Columns**
   - Ensure: `external_transaction_id`, `amount`, `currency`, `transaction_date`
   
2. **Invalid Amount Format**
   - Amounts must be integers (cents)
   - No decimal points or currency symbols

3. **Invalid Date Format**
   - Use ISO 8601: `YYYY-MM-DDTHH:mm:ssZ`

**Resolution:**
- Provide corrected CSV template
- Validate CSV before processing
- Clear invalid records and re-upload

#### Low Match Rates

**Symptoms:**
- Reconciliation match rate < 90%
- High volume of unmatched transactions

**Investigation:**
```sql
-- Analyze match rates by file
SELECT 
  file_name,
  COUNT(*) as total_records,
  COUNT(CASE WHEN status = 'matched' THEN 1 END) as matched,
  COUNT(CASE WHEN status = 'unmatched' THEN 1 END) as unmatched,
  ROUND(
    COUNT(CASE WHEN status = 'matched' THEN 1 END)::numeric / 
    COUNT(*)::numeric * 100, 1
  ) as match_rate_pct
FROM reconciliation_records 
WHERE uploaded_by = 'user-id'
GROUP BY file_name
ORDER BY match_rate_pct ASC;
```

**Common Causes:**
1. **Timing Differences**: CSV from different time period than payments
2. **Reference ID Mismatches**: Different ID formats between systems
3. **Currency Conversion**: Multi-currency amount differences
4. **Partial/Failed Payments**: Not reflected in CSV

**Resolution:**
```sql
-- Find unmatched patterns
SELECT 
  LEFT(external_transaction_id, 10) as id_prefix,
  currency,
  COUNT(*) as unmatched_count
FROM reconciliation_records 
WHERE status = 'unmatched'
GROUP BY LEFT(external_transaction_id, 10), currency
ORDER BY unmatched_count DESC;
```

---

### 4. Database Performance Issues

#### Slow Payment Queries

**Symptoms:**
- Dashboard loading slowly
- API response times > 2 seconds
- Database connection timeouts

**Investigation:**
```sql
-- Check slow queries (requires pg_stat_statements)
SELECT 
  query,
  calls,
  total_time,
  mean_time,
  rows
FROM pg_stat_statements 
WHERE query LIKE '%payments%'
ORDER BY mean_time DESC
LIMIT 10;
```

**Check Missing Indexes:**
```sql
-- Find table scans on payments
SELECT 
  schemaname,
  tablename,
  seq_scan,
  seq_tup_read,
  idx_scan,
  idx_tup_fetch
FROM pg_stat_user_tables 
WHERE tablename = 'payments';
```

**Resolution:**
```sql
-- Add missing indexes if needed
CREATE INDEX CONCURRENTLY idx_payments_user_status_created 
ON payments(user_id, status, created_at DESC);

-- Analyze table statistics
ANALYZE payments;
```

#### High Database Connections

**Symptoms:**
- "Too many connections" errors
- Edge functions timing out
- Intermittent database access issues

**Investigation:**
```sql
-- Check current connections
SELECT 
  datname,
  usename,
  application_name,
  state,
  COUNT(*)
FROM pg_stat_activity 
GROUP BY datname, usename, application_name, state
ORDER BY count DESC;
```

**Resolution:**
- Review edge function connection management
- Implement connection pooling if needed
- Check for connection leaks in application code

---

### 5. Authentication & Authorization Issues

#### RLS Policy Violations

**Symptoms:**
- Users can't see their own data
- Permission denied errors
- Unauthorized access attempts

**Investigation:**
```sql
-- Test RLS policies
SET ROLE authenticated;
SET request.jwt.claims TO '{"sub":"user-uuid","email":"test@example.com"}';

-- Test user can see their payments
SELECT * FROM payments WHERE user_id = 'user-uuid';
```

**Resolution:**
```sql
-- Fix RLS policies if needed
DROP POLICY IF EXISTS "Users can view their own payments" ON payments;

CREATE POLICY "Users can view their own payments" ON payments
  FOR SELECT USING (user_id = auth.uid());
```

---

## How to Reprocess Stuck Items

### 1. Reprocess Stuck Payments

**Scenario**: Payment stuck in pending status but gateway shows success

```sql
-- Step 1: Verify payment status with gateway
-- (Manual check required)

-- Step 2: Update payment status
BEGIN;

UPDATE payments 
SET 
  status = 'succeeded',
  updated_at = now()
WHERE id = 'payment-uuid'
  AND status = 'pending';

-- Step 3: Create audit trail
SELECT create_audit_log(
  null,
  'payment.manual_success',
  'payment',
  'payment-uuid',
  '{"old_status": "pending"}',
  '{"new_status": "succeeded", "reason": "manual_reprocess"}'
);

COMMIT;
```

### 2. Reprocess Failed Webhook Deliveries

**Scenario**: Critical webhook failed to deliver, need immediate retry

```sql
-- Step 1: Reset webhook for retry
UPDATE webhook_deliveries 
SET 
  status = 'pending',
  attempts = 0,
  next_attempt_at = now(),
  error = null
WHERE id = 'webhook-delivery-id';

-- Step 2: Trigger immediate retry
-- Manually invoke retry function or wait for next scheduled run
```

### 3. Reprocess Reconciliation Matching

**Scenario**: Reconciliation completed with low match rate, need to rerun

```sql
-- Step 1: Reset unmatched records
UPDATE reconciliation_records 
SET 
  status = 'unmatched',
  matched_payment_id = null
WHERE file_name = 'problem-file.csv'
  AND uploaded_by = 'user-id';

-- Step 2: Run matching algorithm again
-- Use frontend reconciliation engine or manual SQL
```

---

## Monitoring & Alerting

### Key Metrics to Monitor

1. **Payment Success Rate**
   ```sql
   SELECT 
     DATE(created_at) as date,
     COUNT(*) as total_payments,
     COUNT(CASE WHEN status = 'succeeded' THEN 1 END) as successful,
     ROUND(COUNT(CASE WHEN status = 'succeeded' THEN 1 END)::numeric / COUNT(*)::numeric * 100, 1) as success_rate
   FROM payments 
   WHERE created_at >= CURRENT_DATE - INTERVAL '7 days'
   GROUP BY DATE(created_at)
   ORDER BY date DESC;
   ```

2. **Webhook Delivery Health**
   ```sql
   SELECT 
     status,
     COUNT(*) as count,
     AVG(attempts) as avg_attempts
   FROM webhook_deliveries 
   WHERE created_at >= CURRENT_DATE - INTERVAL '24 hours'
   GROUP BY status;
   ```

3. **Reconciliation Match Rate**
   ```sql
   SELECT 
     DATE(created_at) as date,
     COUNT(*) as total_records,
     COUNT(CASE WHEN status = 'matched' THEN 1 END) as matched,
     ROUND(COUNT(CASE WHEN status = 'matched' THEN 1 END)::numeric / COUNT(*)::numeric * 100, 1) as match_rate
   FROM reconciliation_records 
   WHERE created_at >= CURRENT_DATE - INTERVAL '7 days'
   GROUP BY DATE(created_at)
   ORDER BY date DESC;
   ```

### Alert Thresholds

- **Payment Success Rate < 95%**: Investigate gateway issues
- **Webhook Delivery Rate < 90%**: Check external endpoints
- **Reconciliation Match Rate < 85%**: Review data quality
- **Database Response Time > 5s**: Performance optimization needed

---

## Log Locations & Analysis

### Edge Function Logs

**Payment Function:**
```bash
# View recent payment function logs
supabase functions logs payments --project-ref caipxjciwpyltxzxukbo

# Filter for errors only
supabase functions logs payments --project-ref caipxjciwpyltxzxukbo | grep ERROR
```

**Webhook Function:**
```bash
# View webhook processing logs
supabase functions logs webhooks --project-ref caipxjciwpyltxzxukbo

# View retry function logs
supabase functions logs retry-webhooks --project-ref caipxjciwpyltxzxukbo
```

### Database Logs

**Query Performance:**
```sql
-- Recent slow queries
SELECT 
  query,
  state,
  query_start,
  now() - query_start as duration
FROM pg_stat_activity 
WHERE state = 'active'
  AND now() - query_start > INTERVAL '10 seconds';
```

### Audit Trail Analysis

**Recent System Activity:**
```sql
SELECT 
  action,
  resource_type,
  resource_id,
  created_at,
  new_values
FROM audit_logs 
WHERE created_at >= (now() - INTERVAL '1 hour')
ORDER BY created_at DESC
LIMIT 50;
```

**Payment Status Changes:**
```sql
SELECT 
  resource_id as payment_id,
  old_values->>'status' as old_status,
  new_values->>'status' as new_status,
  created_at
FROM audit_logs 
WHERE action = 'payment.updated'
  AND created_at >= (now() - INTERVAL '24 hours')
ORDER BY created_at DESC;
```

---

## Emergency Procedures

### 1. Payment Gateway Outage

**Immediate Actions:**
1. Enable maintenance mode notification
2. Queue incoming payment requests
3. Monitor gateway status page
4. Communicate with customers

**Recovery:**
1. Process queued payments
2. Reconcile any missed webhooks
3. Verify data consistency

### 2. Database Connection Loss

**Immediate Actions:**
1. Check Supabase status
2. Verify network connectivity
3. Review connection pool settings

**Recovery:**
1. Restart edge functions if needed
2. Verify data integrity
3. Process any missed events

### 3. Critical Webhook Failures

**Immediate Actions:**
1. Identify affected external systems
2. Prepare manual notification process
3. Queue failed webhooks for retry

**Recovery:**
1. Fix webhook endpoint issues
2. Bulk retry failed deliveries
3. Verify external system state

---

## Contact Information

- **Supabase Dashboard**: https://supabase.com/dashboard/project/caipxjciwpyltxzxukbo
- **Edge Function Logs**: https://supabase.com/dashboard/project/caipxjciwpyltxzxukbo/functions
- **Database Monitoring**: https://supabase.com/dashboard/project/caipxjciwpyltxzxukbo/reports/database