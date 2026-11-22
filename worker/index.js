/**
 * Maden Nova 1 - Cloudflare Worker Lead & Admin Handler
 * 
 * Securely collects lead submissions, site visit dates, and notes,
 * and interacts with Firebase Realtime Database.
 */

const DEFAULT_FIREBASE_DB_URL = "https://sample-firebase-ai-app-ba30f-default-rtdb.firebaseio.com";
const DEFAULT_FIREBASE_SECRET = "iYUsh2KFKYgJuhESJaw1gbV1IBentiFn1Kdy8x6I";
const ADMIN_PASSKEY = "mudassirs4723";

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

        return new Response(
          JSON.stringify({
            success: true,
            message: "Lead recorded successfully!",
            id: fbData.name,
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
