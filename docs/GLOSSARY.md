# Glossary

## A

**Abandoned Webhook**
A webhook delivery that has failed the maximum number of retry attempts (5) and will no longer be retried automatically. Requires manual intervention to reprocess.

**Audit Log**
A comprehensive record of all system activities including user actions, payment status changes, webhook events, and administrative operations. Used for compliance, debugging, and forensic analysis.

**Amount Cents**
Monetary amounts stored as integers in the smallest currency unit (e.g., cents for USD, pence for GBP) to avoid floating-point precision issues. Example: $100.00 = 10000 cents.

## B

**Backoff (Exponential)**
A retry strategy where the delay between retry attempts increases exponentially (2s, 4s, 8s, 16s, 32s). Used to avoid overwhelming failed systems while ensuring eventual delivery.

**Batch Processing**
Processing multiple records together to improve performance, especially for large CSV files or bulk webhook retries. Reduces database load and improves throughput.

## C

**Correlation ID**
A unique identifier that links related events across different systems. In this system, `external_payment_id` serves as a correlation ID between internal payments and external gateway transactions.

**CORS (Cross-Origin Resource Sharing)**
HTTP headers that allow web applications from one domain to access resources from another domain. Required for frontend applications to call Edge Functions.

**CSV Reconciliation**
The process of matching transactions from external CSV files (bank statements, gateway exports) with internal payment records to ensure financial accuracy.

## D

**Database Migration**
A versioned script that modifies database schema (tables, indexes, policies) in a controlled manner. Migrations ensure consistent database structure across environments.

**Delivery Status**
The current state of a webhook delivery attempt:
- `pending`: Awaiting delivery
- `delivered`: Successfully delivered (2xx response)
- `failed`: Delivery failed (will retry)
- `abandoned`: Maximum retries exceeded

**Deduplication**
Preventing duplicate processing of the same event or request. Implemented using idempotency keys for payments and event IDs for webhooks.

## E

**Edge Function**
Serverless functions that run on Supabase's global infrastructure. Used for payment processing, webhook handling, and retry logic. Written in TypeScript/Deno.

**Event ID**
A globally unique identifier for webhook events used to prevent duplicate processing. Format: `evt_<type>_<uuid>` (e.g., `evt_succeeded_12345`).

**Event Type**
Classification of webhook events:
- `payment.succeeded`: Payment completed successfully
- `payment.failed`: Payment processing failed
- `payment.refunded`: Payment was refunded
- `payment.cancelled`: Payment was cancelled

**External Payment ID**
Reference identifier from payment gateway or external system. Used for correlation during reconciliation. Generated if not provided by client.

## F

**Fuzzy Matching**
Approximate matching algorithm that finds records that are similar but not exactly identical. Used for reconciliation when exact matches fail (future enhancement).

## G

**Gateway Response**
JSON data returned by payment gateway containing transaction details, response codes, and processing information. Stored for audit and debugging purposes.

## H

**HMAC (Hash-based Message Authentication Code)**
Cryptographic technique for webhook authentication using a shared secret key. Ensures webhook authenticity and prevents tampering.

**HMAC Signature Format**
`sha256=<hex_encoded_hash>` where the hash is calculated using SHA-256 algorithm with the webhook secret key.

## I

**Idempotency**
The property that multiple identical requests have the same effect as a single request. Prevents duplicate payments when clients retry failed requests.

**Idempotency Key**
Unique identifier provided by client to ensure idempotent operations. Format: `payment_{timestamp}_{user_id}_{random}`. Valid for 24 hours.

**Idempotency Key Conflict**
Error condition when the same idempotency key is used with different request bodies. Returns HTTP 409 Conflict status.

## J

**JWT (JSON Web Token)**
Authentication token format used for API access. Contains user identity and permissions. Required for accessing protected endpoints.

## L

**Lock (Idempotency)**
Temporary flag preventing concurrent processing of the same idempotency key. Ensures atomic operations during payment creation.

## M

**Match Rate**
Percentage of CSV records successfully matched with internal payment records during reconciliation. Calculated as: (matched_count / total_records) × 100.

**Metadata**
Flexible JSON storage field for additional payment information not covered by standard fields. Used for custom attributes and integration data.

**Matched Payment**
A reconciliation record that has been successfully correlated with an internal payment record based on amount and reference ID matching.

## O

**Orphaned Payment**
Internal payment record that doesn't have a corresponding entry in external CSV files. May indicate failed payments or data synchronization issues.

**Orphaned Record**
CSV reconciliation record that doesn't match any internal payment. Requires investigation for missing payments or data discrepancies.

## P

**Payment Method**
The instrument used for payment processing:
- `credit_card`: Credit card payment
- `debit_card`: Debit card payment
- `bank_transfer`: Direct bank transfer
- `digital_wallet`: Digital wallet (PayPal, Apple Pay, etc.)
- `cryptocurrency`: Cryptocurrency payment

**Payment Status**
Current state of a payment:
- `pending`: Payment created, awaiting processing
- `processing`: Payment being processed by gateway
- `succeeded`: Payment completed successfully
- `failed`: Payment processing failed
- `refunded`: Payment was refunded
- `cancelled`: Payment was cancelled

**Payload**
The JSON data sent in webhook events containing event type, payment data, and metadata. Cryptographically signed with HMAC.

## R

**Reconciliation Engine**
Automated system that matches external transaction data with internal payment records to identify discrepancies and ensure financial accuracy.

**Reconciliation Record**
Individual transaction entry from uploaded CSV file, including external transaction ID, amount, currency, and matching status.

**Reconciliation Run**
A complete execution of the reconciliation process, including summary statistics and processing metadata.

**Reconciliation Status**
State of a reconciliation record:
- `unmatched`: Not yet matched to internal payment
- `matched`: Successfully matched to payment
- `disputed`: Requires manual review

**Reference ID**
External identifier used to correlate transactions across systems. Primary key for reconciliation matching along with amount.

**Retry Count**
Number of delivery attempts made for a failed webhook. Maximum of 5 attempts before marking as abandoned.

**RLS (Row Level Security)**
Database security feature that restricts data access based on user identity. Ensures users can only access their own payment data.

## S

**Signature**
HMAC-SHA256 hash of webhook payload using shared secret key. Provided in `x-webhook-signature` header for authentication.

**Signature Verification**
Process of validating webhook authenticity by recalculating HMAC signature and comparing with provided signature using constant-time comparison.

## T

**Transaction Type**
Category of financial transaction:
- `payment`: Initial payment transaction
- `refund`: Full refund transaction
- `partial_refund`: Partial refund transaction
- `chargeback`: Disputed transaction reversal

**Timing Attack**
Security vulnerability where response time differences reveal sensitive information. Prevented using constant-time comparison for signature verification.

## U

**Unmatched Transaction**
Reconciliation record that couldn't be automatically matched with any internal payment. Requires manual investigation or resolution.

**User Agent**
HTTP header identifying the client application making requests. Logged for audit and debugging purposes.

## V

**Validation Trigger**
Database trigger that enforces business rules and data constraints. Preferred over CHECK constraints for time-based validations.

## W

**Webhook**
HTTP callback mechanism for real-time event notifications. Used by payment gateways to notify about status changes.

**Webhook Delivery**
Individual attempt to deliver a webhook payload to external endpoint. Includes status, attempt count, and error information.

**Webhook Event**
Incoming notification from external system about payment status changes. Stored with deduplication to prevent duplicate processing.

**Webhook Secret**
Shared cryptographic key used to generate and verify HMAC signatures for webhook authentication. Must be securely stored and rotated periodically.

**Webhook URL**
External endpoint that receives webhook deliveries. Configured in system settings and used for outbound notifications.

## Technical Abbreviations

**API**: Application Programming Interface
**CORS**: Cross-Origin Resource Sharing
**CSV**: Comma-Separated Values
**ERD**: Entity Relationship Diagram
**HMAC**: Hash-based Message Authentication Code
**HTTP**: Hypertext Transfer Protocol
**JSON**: JavaScript Object Notation
**JWT**: JSON Web Token
**REST**: Representational State Transfer
**RLS**: Row Level Security
**SQL**: Structured Query Language
**UUID**: Universally Unique Identifier

## Database Terms

**ACID**: Atomicity, Consistency, Isolation, Durability - properties of reliable database transactions
**Index**: Database structure that improves query performance
**Migration**: Versioned database schema change
**Primary Key**: Unique identifier for database records
**Foreign Key**: Reference to primary key in another table
**Constraint**: Rule that enforces data integrity
**Trigger**: Database function that runs automatically on data changes

## Error Codes

**200**: OK - Request successful
**201**: Created - Resource created successfully
**400**: Bad Request - Invalid request data
**401**: Unauthorized - Authentication required
**403**: Forbidden - Permission denied
**404**: Not Found - Resource not found
**409**: Conflict - Idempotency key conflict
**422**: Unprocessable Entity - Validation failed
**500**: Internal Server Error - System error

## Currency Codes (ISO 4217)

**USD**: United States Dollar
**EUR**: Euro
**GBP**: British Pound Sterling
**CAD**: Canadian Dollar
**AUD**: Australian Dollar
**JPY**: Japanese Yen

## Time Formats

**ISO 8601**: International standard for date/time representation (e.g., `2025-01-01T00:00:00Z`)
**Unix Timestamp**: Seconds since January 1, 1970 UTC
**RFC 3339**: Internet standard for date/time (subset of ISO 8601)

## Security Terms

**Hash**: One-way cryptographic function
**Salt**: Random data added to hash input
**Encryption**: Two-way data protection
**Authentication**: Verifying identity
**Authorization**: Verifying permissions
**Rate Limiting**: Restricting request frequency per client