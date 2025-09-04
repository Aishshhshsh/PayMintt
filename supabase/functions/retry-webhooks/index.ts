import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

async function retryFailedWebhook(supabase: any, delivery: any): Promise<boolean> {
  try {
    const webhookUrl = Deno.env.get('WEBHOOK_URL');
    if (!webhookUrl) {
      console.error('WEBHOOK_URL not configured');
      return false;
    }

    const response = await fetch(`${webhookUrl}/webhooks`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-webhook-signature': delivery.signature,
      },
      body: JSON.stringify(delivery.payload),
    });

    if (response.ok) {
      await supabase
        .from('webhook_deliveries')
        .update({
          status: 'delivered',
          delivered_at: new Date().toISOString(),
          error: null,
        })
        .eq('id', delivery.id);
      
      return true;
    } else {
      const errorText = await response.text();
      await supabase
        .from('webhook_deliveries')
        .update({
          status: 'failed',
          error: `HTTP ${response.status}: ${errorText}`,
          attempts: delivery.attempts + 1,
        })
        .eq('id', delivery.id);
      
      return false;
    }

  } catch (error: any) {
    console.error(`Retry failed for delivery ${delivery.id}:`, error);
    
    await supabase
      .from('webhook_deliveries')
      .update({
        status: 'failed',
        error: error.message,
        attempts: delivery.attempts + 1,
      })
      .eq('id', delivery.id);
    
    return false;
  }
}

async function scheduleNextRetry(supabase: any, delivery: any): Promise<void> {
  const maxRetries = 5;
  const nextAttempt = delivery.attempts + 1;
  
  if (nextAttempt >= maxRetries) {
    await supabase
      .from('webhook_deliveries')
      .update({
        status: 'abandoned',
        error: `Maximum retry attempts (${maxRetries}) exceeded`,
      })
      .eq('id', delivery.id);
    return;
  }

  const nextAttemptDelay = Math.min(Math.pow(2, nextAttempt) * 60, 3600); // Exponential backoff, max 1 hour
  const nextAttemptAt = new Date(Date.now() + nextAttemptDelay * 1000);

  await supabase
    .from('webhook_deliveries')
    .update({
      next_attempt_at: nextAttemptAt.toISOString(),
      attempts: nextAttempt,
    })
    .eq('id', delivery.id);
}

const handler = async (req: Request): Promise<Response> => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Get failed webhook deliveries that are ready for retry
    const { data: failedDeliveries, error } = await supabase
      .from('webhook_deliveries')
      .select('*')
      .eq('status', 'failed')
      .lte('next_attempt_at', new Date().toISOString())
      .order('created_at', { ascending: true })
      .limit(50);

    if (error) {
      console.error('Failed to fetch failed deliveries:', error);
      return new Response(JSON.stringify({ error: 'Failed to fetch deliveries' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }

    if (!failedDeliveries || failedDeliveries.length === 0) {
      return new Response(JSON.stringify({ message: 'No deliveries to retry' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }

    const results = {
      processed: 0,
      succeeded: 0,
      failed: 0,
      abandoned: 0,
    };

    for (const delivery of failedDeliveries) {
      results.processed++;
      
      const success = await retryFailedWebhook(supabase, delivery);
      
      if (success) {
        results.succeeded++;
      } else {
        results.failed++;
        await scheduleNextRetry(supabase, delivery);
        
        // Check if it was abandoned
        const { data: updatedDelivery } = await supabase
          .from('webhook_deliveries')
          .select('status')
          .eq('id', delivery.id)
          .single();
        
        if (updatedDelivery?.status === 'abandoned') {
          results.abandoned++;
        }
      }
    }

    // Create audit log for retry run
    await supabase.rpc('create_audit_log', {
      p_user_id: null,
      p_action: 'webhook_retry_run',
      p_resource_type: 'webhook_delivery',
      p_resource_id: 'bulk',
      p_new_values: results,
    });

    return new Response(JSON.stringify({
      message: 'Retry process completed',
      results,
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });

  } catch (error: any) {
    console.error('Error in retry-webhooks function:', error);
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