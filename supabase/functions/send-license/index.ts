// ============================================================
// FORGE — Verifie l'achat itch.io, genere une cle, l'envoie par email
//
// Appel : POST /functions/v1/send-license
// Body : { "email": "client@example.com" }
//
// 1. Verifie sur l'API itch.io que cet email a bien achete
// 2. Si oui, genere/recupere la cle et l'envoie par email
// 3. Si non, retourne une erreur
//
// Variables d'env :
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
//   RESEND_API_KEY, FORGE_FROM_EMAIL
//   ITCH_API_KEY, ITCH_GAME_ID
// ============================================================

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ITCH_API_KEY = Deno.env.get("ITCH_API_KEY") || "";
const ITCH_GAME_ID = Deno.env.get("ITCH_GAME_ID") || "4956125";

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

async function verifyItchPurchase(email: string): Promise<boolean> {
  if (!ITCH_API_KEY) {
    console.error("[send-license] ITCH_API_KEY not set");
    return false;
  }
  try {
    const url = `https://itch.io/api/1/${ITCH_API_KEY}/game/${ITCH_GAME_ID}/download_keys?email=${encodeURIComponent(email)}`;
    const res = await fetch(url);
    const data = await res.json();
    if (data.errors && data.errors.length > 0) {
      console.error("[send-license] itch.io errors:", data.errors);
      return false;
    }
    if (data.download_keys && data.download_keys.length > 0) {
      return true;
    }
    return false;
  } catch (err) {
    console.error("[send-license] itch.io verify error:", err);
    return false;
  }
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
    console.error("[send-license] Resend error:", err);
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
    const { email } = await req.json();
    if (!email || typeof email !== "string") {
      return new Response(JSON.stringify({ error: "Email requis" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return new Response(JSON.stringify({ error: "Email invalide" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const hasPaid = await verifyItchPurchase(email);
    if (!hasPaid) {
      return new Response(JSON.stringify({
        error: "Aucun achat trouve pour cette adresse email. Achete d'abord sur itch.io.",
      }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const supabase = createClient(supabaseUrl, serviceKey);

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
      });
      if (error) {
        console.error("[send-license] DB error:", error);
        return new Response(JSON.stringify({ error: "Erreur BDD" }), {
          status: 500,
          headers: { "Content-Type": "application/json" },
        });
      }
    }

    const sent = await sendEmail(email, licenseKey);

    return new Response(JSON.stringify({
      key: licenseKey,
      sent,
      email,
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[send-license] Error:", err);
    return new Response(JSON.stringify({ error: "Erreur interne" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
