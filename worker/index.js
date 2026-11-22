/**
 * Maden Nova 1 - Cloudflare Worker Lead & Admin Handler
 * 
 * Securely collects lead submissions, site visit dates, and notes,
 * and interacts with Firebase Realtime Database.
 */

const DEFAULT_FIREBASE_DB_URL = "https://sample-firebase-ai-app-ba30f-default-rtdb.firebaseio.com";
const DEFAULT_FIREBASE_SECRET = "iYUsh2KFKYgJuhESJaw1gbV1IBentiFn1Kdy8x6I";
const DEFAULT_META_PIXEL_ID = "29967878912817416";
const ADMIN_PASSKEY = "mudassirs4723";

/**
 * SHA-256 Hasher for Meta Conversions API (CAPI) privacy normalization
 */
async function sha256(str) {
  if (!str) return null;
  const clean = str.trim().toLowerCase();
  const buffer = new TextEncoder().encode(clean);
  const hash = await crypto.subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PATCH, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Admin-Key",
  "Access-Control-Max-Age": "86400",
};

export default {
  async fetch(request, env, ctx) {
    // 1. Handle CORS Preflight
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    const url = new URL(request.url);
    const dbUrl = (env?.FIREBASE_DB_URL || DEFAULT_FIREBASE_DB_URL).replace(/\/+$/, "");
    const secret = env?.FIREBASE_SECRET || DEFAULT_FIREBASE_SECRET;

    // 2. Health check
    if (request.method === "GET" && url.pathname === "/") {
      return new Response(
        JSON.stringify({
          status: "online",
          service: "Maden Nova 1 - Lead & CRM API",
          time: new Date().toISOString(),
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 3. Admin API: Get all leads (Protected by passkey)
    if (request.method === "GET" && url.pathname === "/api/leads") {
      const authKey = request.headers.get("X-Admin-Key") || url.searchParams.get("key");
      if (authKey !== ADMIN_PASSKEY) {
        return new Response(JSON.stringify({ error: "Unauthorized access" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const fbRes = await fetch(`${dbUrl}/leads.json?auth=${encodeURIComponent(secret)}`);
      const data = await fbRes.json();
      return new Response(JSON.stringify(data || {}), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 4. Admin API: Update lead notes (PATCH /api/lead/notes)
    if (request.method === "PATCH" && url.pathname === "/api/lead/notes") {
      const authKey = request.headers.get("X-Admin-Key") || url.searchParams.get("key");
      if (authKey !== ADMIN_PASSKEY) {
        return new Response(JSON.stringify({ error: "Unauthorized access" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const body = await request.json();
      const { leadId, note } = body;
      if (!leadId) {
        return new Response(JSON.stringify({ error: "leadId is required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Fetch existing lead
      const leadRes = await fetch(`${dbUrl}/leads/${leadId}.json?auth=${encodeURIComponent(secret)}`);
      const existingLead = await leadRes.json();
      if (!existingLead) {
        return new Response(JSON.stringify({ error: "Lead not found" }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const notes = existingLead.notes || [];
      if (note && note.trim()) {
        notes.push({
          text: note.trim(),
          createdAt: new Date().toISOString(),
        });
      }

      const patchRes = await fetch(`${dbUrl}/leads/${leadId}.json?auth=${encodeURIComponent(secret)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes }),
      });

      const updated = await patchRes.json();
      return new Response(JSON.stringify({ success: true, updated }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 5. Submit Lead (POST / or POST /api/leads)
    if (request.method === "POST") {
      try {
        const payload = await request.json();
        const name = (payload.name || "").trim();
        const phone = (payload.phone || "").trim();
        const siteVisitDate = (payload.siteVisitDate || "").trim();
        const eventId = (payload.eventId || ("lead_" + Date.now() + "_" + Math.random().toString(36).substring(2, 9))).trim();

        if (!name || !phone) {
          return new Response(
            JSON.stringify({ error: "Name and Phone are required." }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const clientIp = request.headers.get("cf-connecting-ip") || "unknown";
        const country = request.cf?.country || request.headers.get("cf-ipcountry") || "unknown";

        const leadData = {
          name,
          phone,
          siteVisitDate: siteVisitDate || "Not Specified",
          project: "Maden Nova 1",
          eventId, // Stored for Meta Conversions API (CAPI) deduplication
          location: "Sector 5, Taloja Phase 1, Navi Mumbai",
          source: "Landing Page - Payment Plan & Site Visit Form",
          timestamp: new Date().toISOString(),
          clientIp,
          country,
          notes: [],
        };

        const fbRes = await fetch(`${dbUrl}/leads.json?auth=${encodeURIComponent(secret)}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(leadData),
        });

        const fbData = await fbRes.json();

        // 5b. Meta Conversions API (CAPI) Deduplication Forwarding
        // Matches frontend fbq('track', 'Lead', ..., { eventID: leadData.eventId })
        const metaPixelId = env?.META_PIXEL_ID || DEFAULT_META_PIXEL_ID;
        const metaAccessToken = env?.META_ACCESS_TOKEN || "";

        if (metaAccessToken) {
          const userAgent = request.headers.get("user-agent") || "";
          const referer = request.headers.get("referer") || "https://infisparks.github.io/maden_ads/";

          const cleanPhone = phone.replace(/[^0-9]/g, "");
          const hashedPhone = await sha256(cleanPhone);
          const firstName = name.split(" ")[0] || name;
          const hashedFirstName = await sha256(firstName);

          const capiPayload = {
            data: [
              {
                event_name: "Lead",
                event_time: Math.floor(Date.now() / 1000),
                event_id: leadData.eventId, // Passes event_id for Meta deduplication
                event_source_url: referer,
                action_source: "website",
                user_data: {
                  ph: hashedPhone ? [hashedPhone] : [],
                  fn: hashedFirstName ? [hashedFirstName] : [],
                  client_ip_address: clientIp !== "unknown" ? clientIp : undefined,
                  client_user_agent: userAgent || undefined,
                },
                custom_data: {
                  content_name: "Maden Nova 1 - Payment Plan & Site Visit",
                  content_category: "Real Estate Leads",
                  site_visit_date: siteVisitDate || "Not Specified",
                  currency: "INR",
                  value: 0.0,
                },
              },
            ],
          };

          const metaApiUrl = `https://graph.facebook.com/v19.0/${metaPixelId}/events?access_token=${encodeURIComponent(metaAccessToken)}`;

          const sendCapi = async () => {
            try {
              const capiRes = await fetch(metaApiUrl, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(capiPayload),
              });
              const capiData = await capiRes.json();
              console.log("Meta CAPI response for eventId", leadData.eventId, ":", JSON.stringify(capiData));
            } catch (capiErr) {
              console.error("Meta CAPI forwarding error:", capiErr);
            }
          };

          if (ctx && typeof ctx.waitUntil === "function") {
            ctx.waitUntil(sendCapi());
          } else {
            await sendCapi();
          }
        }

        return new Response(
          JSON.stringify({
            success: true,
            message: "Lead recorded successfully!",
            id: fbData.name,
            eventId: leadData.eventId,
          }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      } catch (err) {
        return new Response(
          JSON.stringify({ error: "Failed to process lead", message: err.message }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    return new Response(JSON.stringify({ error: "Not Found" }), {
      status: 404,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  },
};
