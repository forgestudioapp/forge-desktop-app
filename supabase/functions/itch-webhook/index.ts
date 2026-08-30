import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

function generateLicenseKey() {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  const segs = [8, 4, 4, 4, 12];
  return segs
    .map((len) =>
      Array.from({ length: len }, () =>
        chars.charAt(Math.floor(Math.random() * chars.length))
      ).join("")
    )
    .join("-");
}

async function sendEmail(to: string, licenseKey: string) {
  const resendKey = Deno.env.get("RESEND_API_KEY");
  const fromEmail = Deno.env.get("FORGE_FROM_EMAIL") || "onboarding@resend.dev";

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${resendKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: fromEmail,
      to: [to],
      subject: "Ta licence Forge",
      html: `
        <div style="font-family:Arial,sans-serif;max-width:500px;margin:0 auto;padding:30px;background:#1C1712;border-radius:12px;color:#F3EDE3;">
          <h1 style="color:#60A5FA;font-size:22px;margin-bottom:16px;">Ta licence Forge</h1>
          <p>Merci pour ton achat ! Voici ta cle de licence :</p>
          <div style="background:#14110E;border:1px solid #3A3024;border-radius:8px;padding:16px;margin:16px 0;font-family:monospace;font-size:16px;color:#60A5FA;word-break:break-all;text-align:center;">
            ${licenseKey}
          </div>
          <p style="font-size:13px;color:#948B7C;">
            <strong>Comment l'utiliser :</strong><br>
            1. Lance Forge<br>
            2. Clique sur "Creer un compte"<br>
            3. Colle cette cle<br>
            4. C'est bon !
          </p>
          <p style="font-size:12px;color:#6B6255;margin-top:20px;">Si tu as un souci, contacte-nous sur itch.io.</p>
        </div>
      `,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    console.error("[itch-webhook] Resend error:", err);
    return false;
  }
  return true;
}

serve(async (req) => {
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
    const params = new URLSearchParams(body);

    const email = params.get("email");
    const saleId = params.get("sale_id");
    const productName = params.get("product_name");

    console.log(`[itch-webhook] Purchase: ${email} | sale=${saleId} | product=${productName}`);

    if (!email) {
      return new Response(JSON.stringify({ error: "No email in webhook" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const supabase = createClient(supabaseUrl, serviceKey);

    // Check if already has a key
    const { data: existing } = await supabase
      .from("license_keys")
      .select("license_key")
      .eq("email", email)
      .eq("status", "active")
      .limit(1);

    let licenseKey;
    if (existing && existing.length) {
      licenseKey = existing[0].license_key;
    } else {
      licenseKey = generateLicenseKey();
      const { error } = await supabase.from("license_keys").insert({
        license_key: licenseKey,
        email: email,
        status: "active",
        plan: "pro",
        metadata: { sale_id: saleId, product: productName },
      });
      if (error) {
        console.error("[itch-webhook] DB error:", error);
        return new Response(JSON.stringify({ error: "DB error" }), {
          status: 500,
          headers: { "Content-Type": "application/json" },
        });
      }
    }

    const sent = await sendEmail(email, licenseKey);
    console.log(`[itch-webhook] Key: ${licenseKey} | Sent: ${sent}`);

    return new Response(JSON.stringify({ key: licenseKey, sent, email }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[itch-webhook] Error:", err);
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
