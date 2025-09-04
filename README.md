# PayMint · Payments & Reconciliation Dashboard

A full-stack system for **payment processing, reconciliation, and audit logging**, built with Supabase, Deno Edge Functions, and React.

---

## ✨ Features
- **Authentication** — User sign-up/login with Supabase Auth (JWT based).  
- **Idempotent Payments API** — prevents duplicate charges using `Idempotency-Key`.  
- **Webhooks** — Cryptographically verified with HMAC signatures, retries with exponential backoff.  
- **Reconciliation Engine** — Upload CSV bank/gateway statements and automatically match vs. internal payments.  
- **Audit Logs** — Every event is recorded for traceability.  
- **Frontend Dashboard** — Modern React + Vite + TypeScript UI, styled with Tailwind + shadcn/ui.  

---

## 🛠 Tech Stack
**Frontend:** React + Vite + TypeScript · TailwindCSS + shadcn/ui  
**Backend:** Supabase (Postgres + RLS + RPC functions) · Deno Edge Functions  
**Other:** CSV import engine · GitHub Actions for CI

---

## 🚀 Getting Started
1. **Clone & Install**
   ```bash
   git clone git@github.com:Aishshhshsh/paymint.git
   cd paymint
   npm install
2. Environment Variables — Create a .env.local file (see .env.example):
   
VITE_SUPABASE_URL=https://caipxjciwpyltxzxukbo.supabase.co
    VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNhaXB4amNpd3B5bHR4enh1a2JvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTYzMTQxMjksImV4cCI6MjA3MTg5MDEyOX0.nEAbCVBRx_a31tqomCq4vZ8lzppXHU78KEhHSmyDNBE
    
WEBHOOK_SECRET=your-generated-secret

4. Run Locally
   ```bash
   npm run dev -- --port 8080
# Deployment :
Frontend (Vercel/Netlify): 
Import repo 
Add env vars 
Build: npm run build 
Output: dist

# Backend (Supabase Edge Functions):
supabase login
supabase link --project-ref <YOUR_REF>
supabase functions deploy payments
supabase functions deploy reconciliation
supabase functions deploy webhook-audit

# Security Highlights :
JWT auth with Supabase Auth
Postgres RLS (Row-Level Security)
HMAC signatures on incoming webhooks 
Exponential backoff for webhook retries 
Audit logs for every action

# Documentation : 

ARCHITECTURE.md
 — system design

API_COLLECTION.md
 — API reference

SEQUENCE_DIAGRAMS.md
 — workflows

RUNBOOK.md
 — ops & troubleshooting

GLOSSARY.md
 — terminology
 
# 🧑‍💻 What I Built:

This project highlights backend engineering in a serverless context:

Designed idempotent APIs and webhook HMAC verification

Implemented exponential backoff retries

Applied Row Level Security (RLS) for multi-tenant safety

Built a reconciliation engine for payments vs bank/gateway data

Deployed secure Supabase Edge Functions (Deno)
