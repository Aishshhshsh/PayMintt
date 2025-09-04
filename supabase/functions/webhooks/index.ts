import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-webhook-signature',
};

interface WebhookPayload {
  event_type: string;
  data: Record<string, any>;
  timestamp: string;
  event_id: string;
}

async function verifyHMACSignature(payload: string, signature: string, secret: string): Promise<boolean> {
  try {
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );

    const computedSignature = await crypto.subtle.sign('HMAC', key, encoder.encode(payload));
    const computedHex = Array.from(new Uint8Array(computedSignature))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');

    const expectedSignature = signature.replace('sha256=', '');
    return computedHex === expectedSignature;
  } catch (error) {
    console.error('HMAC verification error:', error);
    return false;
  }
}

async function processWebhookEvent(supabase: any, eventData: WebhookPayload): Promise<void> {
  switch (eventData.event_type) {
    case 'payment.succeeded':
      await handlePaymentSucceeded(supabase, eventData.data);
      break;
    case 'payment.failed':
      await handlePaymentFailed(supabase, eventData.data);
      break;
    case 'payment.refunded':
      await handlePaymentRefunded(supabase, eventData.data);
      break;
    default:
      console.log(`Unhandled event type: ${eventData.event_type}`);
  }
}

async function handlePaymentSucceeded(supabase: any, data: any): Promise<void> {
  const { error } = await supabase
    .from('payments')
    .update({
      status: 'succeeded',
      gateway_ref: data.gateway_id,
      metadata: { ...data },
    })
    .eq('external_payment_id', data.payment_id);

  if (error) {
    console.error('Failed to update payment status:', error);
    throw new Error('Failed to update payment status');
  }

  // Create audit log
  await supabase.rpc('create_audit_log', {
    p_user_id: null,
    p_action: 'payment_succeeded',
    p_resource_type: 'payment',
    p_resource_id: data.payment_id,
    p_new_values: data,
  });
}

async function handlePaymentFailed(supabase: any, data: any): Promise<void> {
  const { error } = await supabase
    .from('payments')
    .update({
      status: 'failed',
      gateway_ref: data.gateway_id,
      metadata: { ...data },
    })
    .eq('external_payment_id', data.payment_id);

  if (error) {
    console.error('Failed to update payment status:', error);
    throw new Error('Failed to update payment status');
  }

  // Create audit log
  await supabase.rpc('create_audit_log', {
    p_user_id: null,
    p_action: 'payment_failed',
    p_resource_type: 'payment',
    p_resource_id: data.payment_id,
    p_new_values: data,
  });
}

async function handlePaymentRefunded(supabase: any, data: any): Promise<void> {
  const { error } = await supabase
    .from('payments')
    .update({
      status: 'refunded',
      metadata: { ...data },
    })
    .eq('external_payment_id', data.payment_id);

  if (error) {
    console.error('Failed to update payment status:', error);
    throw new Error('Failed to update payment status');
  }

  // Create audit log
  await supabase.rpc('create_audit_log', {
    p_user_id: null,
    p_action: 'payment_refunded',
    p_resource_type: 'payment',
    p_resource_id: data.payment_id,
    p_new_values: data,
  });
}

async function scheduleRetry(supabase: any, deliveryId: number, attempt: number): Promise<void> {
  const nextAttemptDelay = Math.min(Math.pow(2, attempt) * 60, 3600); // Exponential backoff, max 1 hour
  const nextAttemptAt = new Date(Date.now() + nextAttemptDelay * 1000);

  await supabase
    .from('webhook_deliveries')
    .update({
      next_attempt_at: nextAttemptAt.toISOString(),
      attempts: attempt + 1,
    })
    .eq('id', deliveryId);
}

const handler = async (req: Request): Promise<Response> => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const signature = req.headers.get('x-webhook-signature');
    const webhookSecret = Deno.env.get('WEBHOOK_SECRET');

    if (!signature || !webhookSecret) {
      return new Response(JSON.stringify({ error: 'Missing signature or webhook secret' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }

    const payload = await req.text();
    
    // Verify HMAC signature
    const isValidSignature = await verifyHMACSignature(payload, signature, webhookSecret);
    if (!isValidSignature) {
      return new Response(JSON.stringify({ error: 'Invalid signature' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }

    const webhookData: WebhookPayload = JSON.parse(payload);

    // Check for duplicate event
    const { data: existingEvent } = await supabase
      .from('webhook_events')
      .select('id')
      .eq('event_id', webhookData.event_id)
      .single();

    if (existingEvent) {
      return new Response(JSON.stringify({ message: 'Event already processed' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }

    // Store webhook event
    const { data: webhookEvent, error: webhookError } = await supabase
      .from('webhook_events')
      .insert({
        event_id: webhookData.event_id,
        event_type: webhookData.event_type,
        source: 'payment_gateway',
        payload: webhookData,
        signature: signature,
      })
      .select()
      .single();

    if (webhookError) {
      console.error('Failed to store webhook event:', webhookError);
      return new Response(JSON.stringify({ error: 'Failed to store event' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }

    // Create webhook delivery record
    const { data: delivery, error: deliveryError } = await supabase
      .from('webhook_deliveries')
      .insert({
        event_type: webhookData.event_type,
        payload: webhookData,
        signature: signature,
        status: 'processing',
        attempts: 1,
      })
      .select()
      .single();

    if (deliveryError) {
      console.error('Failed to create delivery record:', deliveryError);
    }

    try {
      // Process the webhook event
      await processWebhookEvent(supabase, webhookData);

      // Mark event as processed
      await supabase
        .from('webhook_events')
        .update({
          processed: true,
          processed_at: new Date().toISOString(),
        })
        .eq('id', webhookEvent.id);

      // Mark delivery as successful
      if (delivery) {
        await supabase
          .from('webhook_deliveries')
          .update({
            status: 'delivered',
            delivered_at: new Date().toISOString(),
          })
          .eq('id', delivery.id);
      }

      return new Response(JSON.stringify({ message: 'Webhook processed successfully' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });

    } catch (processingError: any) {
      console.error('Webhook processing error:', processingError);

      // Mark delivery as failed and schedule retry
      if (delivery && delivery.attempts < 5) {
        await supabase
          .from('webhook_deliveries')
          .update({
            status: 'failed',
            error: processingError.message,
          })
          .eq('id', delivery.id);

        await scheduleRetry(supabase, delivery.id, delivery.attempts);
      } else if (delivery) {
        await supabase
          .from('webhook_deliveries')
          .update({
            status: 'abandoned',
            error: processingError.message,
          })
          .eq('id', delivery.id);
      }

      return new Response(JSON.stringify({ error: 'Processing failed, will retry' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }

  } catch (error: any) {
    console.error('Error in webhooks function:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      }
    );
  }
};

serve(handler);