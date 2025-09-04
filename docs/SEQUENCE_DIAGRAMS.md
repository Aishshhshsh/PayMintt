# Sequence Diagrams

## 1. Create Payment (Idempotent)

<lov-mermaid>
sequenceDiagram
    participant Client
    participant PaymentAPI as Payment Edge Function
    participant DB as Database
    participant Gateway as Payment Gateway
    participant WebhookHandler as Webhook Handler
    
    Note over Client, WebhookHandler: Idempotent Payment Creation Flow
    
    Client->>PaymentAPI: POST /payments<br/>Headers: Idempotency-Key, JWT
    
    PaymentAPI->>DB: Check idempotency_keys table
    alt Key exists with same request
        DB-->>PaymentAPI: Return existing payment
        PaymentAPI-->>Client: 200 OK (existing payment)
    else Key exists with different request
        DB-->>PaymentAPI: Conflict detected
        PaymentAPI-->>Client: 409 Conflict
    else New key
        PaymentAPI->>DB: Begin transaction
        PaymentAPI->>DB: Insert idempotency_key (locked=true)
        PaymentAPI->>DB: Insert payment record
        PaymentAPI->>DB: Insert transaction record
        PaymentAPI->>DB: Commit transaction
        
        PaymentAPI->>Gateway: Process payment (simulate)
        Gateway-->>PaymentAPI: Gateway response
        
        PaymentAPI->>DB: Update payment.gateway_ref
        PaymentAPI->>DB: Call create_audit_log()
        PaymentAPI->>DB: Update idempotency_key (locked=false)
        
        PaymentAPI-->>Client: 201 Created (payment details)
        
        Note over Gateway, WebhookHandler: Async webhook delivery
        Gateway->>WebhookHandler: POST /webhooks<br/>payment.succeeded event
        WebhookHandler->>DB: Update payment status
        WebhookHandler->>DB: Create audit log
    end
</lov-mermaid>

---

## 2. Webhook Delivery (Verified) → Update Payment → Audit Log

<lov-mermaid>
sequenceDiagram
    participant Gateway as Payment Gateway
    participant WebhookAPI as Webhook Edge Function
    participant DB as Database
    participant RetryService as Retry Service
    participant ExternalWebhook as External Webhook URL
    
    Note over Gateway, ExternalWebhook: Secure Webhook Processing Flow
    
    Gateway->>WebhookAPI: POST /webhooks<br/>Headers: x-webhook-signature
    
    WebhookAPI->>WebhookAPI: Verify HMAC signature
    alt Invalid signature
        WebhookAPI-->>Gateway: 401 Unauthorized
    else Valid signature
        WebhookAPI->>DB: Check webhook_events for duplicate event_id
        alt Duplicate event
            DB-->>WebhookAPI: Event already processed
            WebhookAPI-->>Gateway: 200 OK (idempotent)
        else New event
            WebhookAPI->>DB: Begin transaction
            WebhookAPI->>DB: Insert webhook_events record
            WebhookAPI->>DB: Insert webhook_deliveries record
            
            WebhookAPI->>WebhookAPI: Route event by type
            alt payment.succeeded
                WebhookAPI->>DB: Update payments.status = 'succeeded'
            else payment.failed
                WebhookAPI->>DB: Update payments.status = 'failed'
            else payment.refunded
                WebhookAPI->>DB: Update payments.status = 'refunded'
            end
            
            WebhookAPI->>DB: Call create_audit_log(action='webhook.processed')
            WebhookAPI->>DB: Commit transaction
            
            WebhookAPI-->>Gateway: 200 OK
            
            Note over WebhookAPI, ExternalWebhook: Forward to external webhook
            WebhookAPI->>ExternalWebhook: POST webhook payload<br/>Headers: x-webhook-signature
            alt Delivery successful
                ExternalWebhook-->>WebhookAPI: 200 OK
                WebhookAPI->>DB: Update webhook_deliveries<br/>status='delivered'
            else Delivery failed
                ExternalWebhook-->>WebhookAPI: 5xx Error or Timeout
                WebhookAPI->>DB: Update webhook_deliveries<br/>status='failed', error=details
                WebhookAPI->>DB: Schedule retry with backoff
            end
        end
    end
</lov-mermaid>

---

## 3. Retry Job (Exponential Backoff)

<lov-mermaid>
sequenceDiagram
    participant Scheduler as Scheduled Job
    participant RetryService as Retry Edge Function
    participant DB as Database
    participant ExternalWebhook as External Webhook URL
    
    Note over Scheduler, ExternalWebhook: Automatic Webhook Retry System
    
    Scheduler->>RetryService: Triggered every 30 seconds
    
    RetryService->>DB: SELECT failed webhook_deliveries<br/>WHERE next_attempt_at <= now()
    DB-->>RetryService: List of failed deliveries
    
    loop For each failed delivery
        RetryService->>RetryService: Check retry attempts
        alt attempts < 5
            RetryService->>ExternalWebhook: Retry webhook delivery<br/>Headers: x-webhook-signature
            alt Delivery successful
                ExternalWebhook-->>RetryService: 200 OK
                RetryService->>DB: UPDATE webhook_deliveries<br/>status='delivered'<br/>delivered_at=now()
                RetryService->>DB: Call create_audit_log(action='webhook.retry.success')
            else Delivery failed again
                ExternalWebhook-->>RetryService: Error response
                RetryService->>RetryService: Calculate next backoff<br/>delay = 2^(attempts) seconds
                RetryService->>DB: UPDATE webhook_deliveries<br/>attempts=attempts+1<br/>next_attempt_at=now()+delay<br/>error='latest error'
                RetryService->>DB: Call create_audit_log(action='webhook.retry.failed')
            end
        else attempts >= 5
            RetryService->>DB: UPDATE webhook_deliveries<br/>status='abandoned'
            RetryService->>DB: Call create_audit_log(action='webhook.abandoned')
            Note over RetryService: Max retries exceeded
        end
    end
    
    RetryService-->>Scheduler: Retry job completed<br/>Summary: {processed: N, success: X, failed: Y}
</lov-mermaid>

---

## 4. CSV Upload → Reconciliation Engine → Match Outcomes

<lov-mermaid>
sequenceDiagram
    participant User as User
    participant Frontend as React Frontend
    participant Upload as File Upload
    participant ReconciliationEngine as Reconciliation Engine
    participant DB as Database
    
    Note over User, DB: CSV Reconciliation Flow
    
    User->>Frontend: Upload CSV file
    Frontend->>Upload: Parse CSV content
    Upload->>Upload: Validate CSV format<br/>(external_transaction_id, amount, currency, date)
    
    alt Invalid CSV format
        Upload-->>Frontend: Validation error
        Frontend-->>User: Show error message
    else Valid CSV
        Upload->>DB: Begin transaction
        
        loop For each CSV row
            Upload->>DB: INSERT reconciliation_records<br/>(external_transaction_id, amount, currency)<br/>status='unmatched'
        end
        
        Upload->>DB: INSERT reconciliation_runs<br/>(user_id, filename, summary)
        Upload->>DB: Commit transaction
        
        Upload-->>Frontend: Upload successful
        Frontend-->>User: Show success message
        
        User->>Frontend: Click "Run Reconciliation"
        Frontend->>ReconciliationEngine: Process reconciliation
        
        ReconciliationEngine->>DB: SELECT unmatched reconciliation_records<br/>WHERE uploaded_by = user_id
        ReconciliationEngine->>DB: SELECT payments<br/>WHERE user_id = user_id
        
        ReconciliationEngine->>ReconciliationEngine: Match algorithm:<br/>amount AND external_payment_id
        
        loop For each unmatched record
            ReconciliationEngine->>ReconciliationEngine: Find matching payment
            alt Match found
                ReconciliationEngine->>DB: UPDATE reconciliation_records<br/>status='matched'<br/>matched_payment_id=payment.id
                ReconciliationEngine->>DB: INSERT reconciliation_details<br/>(run_id, payment_id, reason='exact_match')
                Note over ReconciliationEngine: Increment matched count
            else No match found
                Note over ReconciliationEngine: Increment unmatched count
                ReconciliationEngine->>DB: INSERT reconciliation_details<br/>(run_id, payment_id=null, reason='no_match')
            end
        end
        
        ReconciliationEngine->>DB: UPDATE reconciliation_runs<br/>summary={matched: X, unmatched: Y, total: Z}
        ReconciliationEngine->>DB: Call create_audit_log(action='reconciliation.completed')
        
        ReconciliationEngine-->>Frontend: Reconciliation results<br/>{matched: X, unmatched: Y, match_rate: %}
        Frontend-->>User: Display reconciliation summary
        
        Note over Frontend, User: Real-time dashboard update
        Frontend->>DB: Subscribe to reconciliation_records changes
        DB-->>Frontend: Real-time data updates
        Frontend-->>User: Updated reconciliation table
    end
</lov-mermaid>

---

## Error Handling Flows

### Payment Creation Error Handling

<lov-mermaid>
sequenceDiagram
    participant Client
    participant PaymentAPI as Payment Edge Function
    participant DB as Database
    participant Gateway as Payment Gateway
    
    Client->>PaymentAPI: POST /payments (invalid data)
    
    PaymentAPI->>PaymentAPI: Validate request
    alt Validation failed
        PaymentAPI-->>Client: 400 Bad Request<br/>Validation errors
    else Gateway error
        PaymentAPI->>Gateway: Process payment
        Gateway-->>PaymentAPI: 5xx Gateway error
        PaymentAPI->>DB: UPDATE payment.status = 'failed'
        PaymentAPI->>DB: Create audit log (gateway_error)
        PaymentAPI-->>Client: 422 Payment Failed<br/>Gateway error details
    else Database error
        PaymentAPI->>DB: Database operation
        DB-->>PaymentAPI: Database error
        PaymentAPI->>PaymentAPI: Rollback transaction
        PaymentAPI-->>Client: 500 Internal Error<br/>Please retry
    end
</lov-mermaid>

### Webhook Retry Failure Cascade

<lov-mermaid>
sequenceDiagram
    participant RetryService as Retry Service
    participant DB as Database
    participant ExternalWebhook as External Webhook
    participant AlertSystem as Alert System
    
    RetryService->>DB: Get failed delivery (attempt 5)
    RetryService->>ExternalWebhook: Final retry attempt
    ExternalWebhook-->>RetryService: 500 Server Error
    
    RetryService->>DB: UPDATE status='abandoned'
    RetryService->>DB: Create audit log (webhook.abandoned)
    RetryService->>AlertSystem: Send alert for abandoned webhook
    AlertSystem-->>RetryService: Alert sent
    
    Note over RetryService: Manual intervention required
</lov-mermaid>