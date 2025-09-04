# Payment Processing & Reconciliation System Architecture

## Overview

This system provides **idempotent payment processing** with **secure webhook delivery**, **automatic retry mechanisms**, and **CSV-based reconciliation**. Built on Supabase with TypeScript edge functions and React frontend.

## Core Components

### 1. Payment Processing Pipeline
- **Idempotent API**: Prevents duplicate payments using `Idempotency-Key` headers
- **HMAC Webhook Security**: Cryptographically signed webhook payloads
- **Automatic Retries**: Exponential backoff for failed webhook deliveries
- **Audit Logging**: Complete transaction history for compliance

### 2. Reconciliation Engine
- **CSV Upload**: Bank/gateway statement processing
- **Smart Matching**: Amount + reference ID correlation
- **Exception Handling**: Unmatched transaction surfacing
- **Dashboard Analytics**: Real-time reconciliation metrics

### 3. Data Persistence
- **PostgreSQL**: ACID transactions with RLS security
- **Edge Functions**: Serverless payment processing
- **Real-time Subscriptions**: Live dashboard updates

## System Architecture

<lov-mermaid>
graph TB
    subgraph "Frontend (React + TypeScript)"
        UI[Payment Form]
        Dashboard[Reconciliation Dashboard]
        Upload[CSV Upload]
    end
    
    subgraph "Edge Functions (Deno)"
        PaymentAPI[/functions/payments]
        WebhookHandler[/functions/webhooks]
        RetryJob[/functions/retry-webhooks]
    end
    
    subgraph "Database (PostgreSQL)"
        Payments[(payments)]
        Transactions[(transactions)]
        WebhookEvents[(webhook_events)]
        WebhookDeliveries[(webhook_deliveries)]
        IdempotencyKeys[(idempotency_keys)]
        ReconciliationRecords[(reconciliation_records)]
        AuditLogs[(audit_logs)]
    end
    
    subgraph "External Systems"
        Gateway[Payment Gateway]
        BankCSV[Bank CSV Files]
    end
    
    UI --> PaymentAPI
    PaymentAPI --> Payments
    PaymentAPI --> Transactions
    PaymentAPI --> IdempotencyKeys
    PaymentAPI --> AuditLogs
    
    Gateway --> WebhookHandler
    WebhookHandler --> WebhookEvents
    WebhookHandler --> WebhookDeliveries
    WebhookHandler --> Payments
    WebhookHandler --> AuditLogs
    
    RetryJob --> WebhookDeliveries
    RetryJob --> WebhookEvents
    
    Upload --> ReconciliationRecords
    Dashboard --> ReconciliationRecords
    Dashboard --> Payments
    
    BankCSV --> Upload
</lov-mermaid>

## Data Flow

### Payment Creation Flow
1. **Frontend** submits payment with `Idempotency-Key`
2. **Edge Function** checks for duplicate using idempotency key
3. **Database** stores payment + transaction records atomically
4. **Gateway** processes payment (simulated)
5. **Webhook** updates payment status
6. **Audit Log** records all state changes

### Webhook Processing Flow
1. **Gateway** sends webhook with HMAC signature
2. **Edge Function** verifies signature using shared secret
3. **Database** stores webhook event (deduplication)
4. **Payment Status** updated based on event type
5. **Retry Job** handles failed deliveries with exponential backoff

### Reconciliation Flow
1. **CSV Upload** parses bank/gateway statements
2. **Matching Engine** correlates by amount + reference ID
3. **Exception Handling** flags unmatched transactions
4. **Dashboard** displays reconciliation results in real-time

## Security Features

- **HMAC Verification**: Cryptographic webhook authentication
- **Row Level Security**: Database-level access control
- **Idempotency Protection**: Prevents duplicate processing
- **Audit Trail**: Complete transaction history
- **JWT Authentication**: User session management

## Scalability & Reliability

- **Serverless Functions**: Auto-scaling payment processing
- **Database Indexes**: Optimized for high-volume queries
- **Retry Mechanisms**: Automatic error recovery
- **Connection Pooling**: Efficient database connections
- **Real-time Updates**: WebSocket subscriptions

## Monitoring & Observability

- **Function Logs**: Detailed execution traces
- **Audit Logs**: Business event tracking
- **Database Metrics**: Performance monitoring
- **Error Handling**: Graceful failure modes
- **Health Checks**: System status monitoring