-- Create payments table for tracking payment requests
CREATE TABLE public.payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  idempotency_key TEXT UNIQUE NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  amount INTEGER NOT NULL, -- amount in cents
  currency TEXT NOT NULL DEFAULT 'USD',
  status TEXT NOT NULL DEFAULT 'pending', -- pending, processing, completed, failed
  payment_method TEXT,
  external_payment_id TEXT,
  metadata JSONB DEFAULT '{}',
  retry_count INTEGER DEFAULT 0,
  max_retries INTEGER DEFAULT 3,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create transactions table for detailed transaction tracking
CREATE TABLE public.transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id UUID REFERENCES public.payments(id) ON DELETE CASCADE,
  transaction_type TEXT NOT NULL, -- debit, credit, refund
  amount INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD',
  external_transaction_id TEXT,
  gateway_response JSONB DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'pending',
  processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create reconciliation_records table for CSV data
CREATE TABLE public.reconciliation_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  file_name TEXT NOT NULL,
  uploaded_by UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  external_transaction_id TEXT,
  amount INTEGER,
  currency TEXT DEFAULT 'USD',
  transaction_date TIMESTAMPTZ,
  status TEXT DEFAULT 'unmatched', -- matched, unmatched, disputed
  matched_payment_id UUID REFERENCES public.payments(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create audit_logs table for comprehensive logging
CREATE TABLE public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  resource_id TEXT,
  old_values JSONB,
  new_values JSONB,
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create webhook_events table for webhook processing
CREATE TABLE public.webhook_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source TEXT NOT NULL, -- stripe, paypal, etc
  event_type TEXT NOT NULL,
  event_id TEXT UNIQUE NOT NULL,
  payload JSONB NOT NULL,
  signature TEXT,
  processed BOOLEAN DEFAULT false,
  retry_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at TIMESTAMPTZ
);

-- Enable Row Level Security
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reconciliation_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.webhook_events ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY "Users can view their own payments" ON public.payments
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Users can create their own payments" ON public.payments
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update their own payments" ON public.payments
  FOR UPDATE USING (user_id = auth.uid());

CREATE POLICY "Users can view their transactions" ON public.transactions
  FOR SELECT USING (
    payment_id IN (SELECT id FROM public.payments WHERE user_id = auth.uid())
  );

CREATE POLICY "Users can view their reconciliation records" ON public.reconciliation_records
  FOR SELECT USING (uploaded_by = auth.uid());

CREATE POLICY "Users can create reconciliation records" ON public.reconciliation_records
  FOR INSERT WITH CHECK (uploaded_by = auth.uid());

CREATE POLICY "Users can view their audit logs" ON public.audit_logs
  FOR SELECT USING (user_id = auth.uid());

-- Service policies for edge functions
CREATE POLICY "Service can manage all payments" ON public.payments
  FOR ALL USING (true);

CREATE POLICY "Service can manage all transactions" ON public.transactions
  FOR ALL USING (true);

CREATE POLICY "Service can manage all webhook events" ON public.webhook_events
  FOR ALL USING (true);

CREATE POLICY "Service can create audit logs" ON public.audit_logs
  FOR INSERT WITH CHECK (true);

-- Create indexes for performance
CREATE INDEX idx_payments_idempotency_key ON public.payments(idempotency_key);
CREATE INDEX idx_payments_user_id ON public.payments(user_id);
CREATE INDEX idx_payments_status ON public.payments(status);
CREATE INDEX idx_transactions_payment_id ON public.transactions(payment_id);
CREATE INDEX idx_reconciliation_external_id ON public.reconciliation_records(external_transaction_id);
CREATE INDEX idx_webhook_events_processed ON public.webhook_events(processed);
CREATE INDEX idx_audit_logs_user_id ON public.audit_logs(user_id);

-- Create update timestamp trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create triggers for updated_at
CREATE TRIGGER update_payments_updated_at BEFORE UPDATE ON public.payments 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Create function for audit logging
CREATE OR REPLACE FUNCTION create_audit_log(
  p_user_id UUID,
  p_action TEXT,
  p_resource_type TEXT,
  p_resource_id TEXT,
  p_old_values JSONB DEFAULT NULL,
  p_new_values JSONB DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
  log_id UUID;
BEGIN
  INSERT INTO public.audit_logs (user_id, action, resource_type, resource_id, old_values, new_values)
  VALUES (p_user_id, p_action, p_resource_type, p_resource_id, p_old_values, p_new_values)
  RETURNING id INTO log_id;
  
  RETURN log_id;
END;
$$ LANGUAGE plpgsql;