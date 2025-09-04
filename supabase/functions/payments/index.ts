// supabase/functions/payments/index.ts
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

// Allow local dev site by default, or override via secret CORS_ORIGIN
const ALLOWED_ORIGIN = Deno.env.get("CORS_ORIGIN") ?? "http://localhost:8080";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
  "Vary": "Origin",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  // 👇 include idempotency-key so the browser can send it
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, idempotency-key",
  "Access-Control-Max-Age": "86400",
};

interface PaymentRequest {
  amount_cents: number;
  currency?: string;
  customer_email?: string;
  payment_method?: string;
  metadata?: Record<string, unknown>;
  user_id?: string;
}

async function sha256Hex(input: string): Promise<string> {
  const buf = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

const handler = async (req: Request): Promise<Response> => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { status: 204, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    // Read headers (case-insensitive)
    const idempotencyKey =
      req.headers.get("idempotency-key") ?? req.headers.get("Idempotency-Key");

    if (!idempotencyKey) {
      return new Response(
        JSON.stringify({ error: "Idempotency-Key header is required" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } },
      );
    }

    // Read and validate body early so we can check request hash conflicts
    let requestBody: PaymentRequest;
    try {
      requestBody = await req.json();
    } catch {
      return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    if (!requestBody.amount_cents || requestBody.amount_cents <= 0) {
      return new Response(JSON.stringify({ error: "Invalid amount" }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const requestHash = await sha256Hex(JSON.stringify(requestBody));

    // Check existing idempotency record
    const { data: existingKey, error: keySelectErr } = await supabase
      .from("idempotency_keys")
      .select("*")
      .eq("key", idempotencyKey)
      .maybeSingle();

    if (keySelectErr) {
      console.error("idempotency key fetch error:", keySelectErr);
    }

    if (existingKey) {
      // If a different body was used with the same key → conflict
      if (existingKey.request_hash && existingKey.request_hash !== requestHash) {
        return new Response(
          JSON.stringify({
            error: "Idempotency key conflict",
            message: "Key used with different request body",
          }),
          { status: 409, headers: { "Content-Type": "application/json", ...corsHeaders } },
        );
      }

      if (existingKey.locked) {
        return new Response(JSON.stringify({ error: "Request is being processed" }), {
          status: 409,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }

      if (existingKey.response) {
        // Return the previously stored response (idempotent behavior)
        return new Response(JSON.stringify(existingKey.response), {
          status: existingKey.status_code ?? 200,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }
    }

    // Lock / upsert the idempotency key for this request
    const { error: lockError } = await supabase
      .from("idempotency_keys")
      .upsert({
        key: idempotencyKey,
        endpoint: "/payments",
        method: "POST",
        request_hash: requestHash,
        locked: true,
        last_used_at: new Date().toISOString(),
      });

    if (lockError) {
      console.error("Failed to lock idempotency key:", lockError);
      return new Response(JSON.stringify({ error: "Internal server error" }), {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    try {
      // Generate an external payment reference (simulates a gateway id)
      const externalPaymentId = `pay_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;

      // Create payment
      const { data: payment, error: paymentError } = await supabase
        .from("payments")
        .insert({
          amount_cents: requestBody.amount_cents,
          currency: requestBody.currency ?? "USD",
          customer_email: requestBody.customer_email,
          payment_method: requestBody.payment_method,
          metadata: requestBody.metadata ?? {},
          user_id: requestBody.user_id,
          external_payment_id: externalPaymentId,
          idempotency_key: idempotencyKey,
          status: "pending",
        })
        .select()
        .single();

      if (paymentError || !payment) {
        throw new Error(`Failed to create payment: ${paymentError?.message ?? "unknown error"}`);
      }

      // Simulate gateway result
      const gatewayResponse = {
        gateway_id: `gw_${Date.now()}`,
        status: Math.random() > 0.1 ? "succeeded" : "failed",
        processing_fee: Math.floor(requestBody.amount_cents * 0.029) + 30,
      };

      // Update payment with gateway result
      const { error: updateError } = await supabase
        .from("payments")
        .update({
          status: gatewayResponse.status,
          gateway_ref: gatewayResponse.gateway_id,
          metadata: {
            ...(payment.metadata ?? {}),
            ...(requestBody.metadata ?? {}),
            gateway_response: gatewayResponse,
          },
        })
        .eq("id", payment.id);

      if (updateError) console.error("Failed to update payment:", updateError);

      // Record a transaction row
      const { error: txnError } = await supabase.from("transactions").insert({
        payment_id: payment.id,
        external_transaction_id: gatewayResponse.gateway_id,
        transaction_type: "payment",
        amount: requestBody.amount_cents,
        currency: requestBody.currency ?? "USD",
        status: gatewayResponse.status,
        gateway_response: gatewayResponse,
        processed_at: gatewayResponse.status === "succeeded" ? new Date().toISOString() : null,
      });
      if (txnError) console.error("Failed to create transaction:", txnError);

      // Audit log (optional RPC)
      await supabase.rpc("create_audit_log", {
        p_user_id: requestBody.user_id,
        p_action: "payment.created",
        p_resource_type: "payment",
        p_resource_id: payment.id,
        p_old_values: null,
        p_new_values: payment,
      }).catch(() => { /* silently ignore if RPC not present */ });

      const responseBody = {
        id: payment.id,
        external_payment_id: externalPaymentId,
        status: gatewayResponse.status,
        amount_cents: requestBody.amount_cents,
        currency: requestBody.currency ?? "USD",
        created_at: payment.created_at,
      };

      // Store idempotent response and unlock
      await supabase
        .from("idempotency_keys")
        .update({ response: responseBody, status_code: 201, locked: false })
        .eq("key", idempotencyKey);

      return new Response(JSON.stringify(responseBody), {
        status: 201,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unknown error";
      // Save error response and unlock
      await supabase
        .from("idempotency_keys")
        .update({ response: { error: message }, status_code: 400, locked: false })
        .eq("key", idempotencyKey);

      return new Response(JSON.stringify({ error: message }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }
  } catch (err) {
    console.error("payments function fatal error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }
};

serve(handler);
