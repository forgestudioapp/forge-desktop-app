// ============================================================
// FORGE — Stripe Webhook Edge Function
// 
// Cette fonction reçoit les webhooks Stripe et génère
// automatiquement des clés de licence dans Supabase.
//
// Déploiement :
//   supabase functions deploy stripe-webhook
//
// Variables d'environnement requises :
//   STRIPE_SECRET_KEY
//   STRIPE_WEBHOOK_SECRET
//   SUPABASE_SERVICE_ROLE_KEY (auto-détecté)
// ============================================================

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Génère une clé de licence au format xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
function generateLicenseKey() {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  const segments = [8, 4, 4, 4, 12];
  return segments
    .map((len) =>
      Array.from({ length: len }, () =>
        chars.charAt(Math.floor(Math.random() * chars.length))
      ).join("")
    )
    .join("-");
}

serve(async (req) => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST",
        "Access-Control-Allow-Headers": "content-type",
      },
    });
  }

  try {
    const body = await req.text();
    const signature = req.headers.get("stripe-signature");

    if (!signature) {
      return new Response(JSON.stringify({ error: "Missing signature" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Verify Stripe webhook signature
    const stripeSecret = Deno.env.get("STRIPE_SECRET_KEY");
    const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");

    if (!stripeSecret || !webhookSecret) {
      console.error("[stripe-webhook] Missing STRIPE_SECRET_KEY or STRIPE_WEBHOOK_SECRET");
      return new Response(JSON.stringify({ error: "Server config error" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Import and verify with Stripe
    const Stripe = (await import("https://esm.sh/stripe@14.14.0")).default;
    const stripe = new Stripe(stripeSecret);

    let event;
    try {
      event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
    } catch (err) {
      console.error("[stripe-webhook] Signature verification failed:", err.message);
      return new Response(JSON.stringify({ error: "Invalid signature" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Handle checkout.session.completed
    if (event.type === "checkout.session.completed") {
      const session = event.data.object;
      const email = session.customer_details?.email || session.customer_email;
      const sessionId = session.id;

      console.log(`[stripe-webhook] Payment completed: ${email} (${sessionId})`);

      // Generate license key
      const licenseKey = generateLicenseKey();

      // Insert into Supabase
      const supabaseUrl = Deno.env.get("SUPABASE_URL");
      const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

      const supabase = createClient(supabaseUrl, serviceKey);

      const { error } = await supabase.from("license_keys").insert({
        license_key: licenseKey,
        email: email,
        status: "active",
        plan: "pro",
        stripe_session_id: sessionId,
        activated_at: new Date().toISOString(),
      });

      if (error) {
        console.error("[stripe-webhook] DB insert error:", error);
        return new Response(JSON.stringify({ error: "DB error" }), {
          status: 500,
          headers: { "Content-Type": "application/json" },
        });
      }

      console.log(`[stripe-webhook] License key created: ${licenseKey} for ${email}`);

      // Optionally: Send email with license key via Resend/SendGrid
      // await sendLicenseEmail(email, licenseKey);
    }

    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[stripe-webhook] Error:", err);
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
