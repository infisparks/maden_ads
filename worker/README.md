# Maden Nova 1 — Cloudflare Worker (Firebase Lead Ingestion)

This Cloudflare Worker securely receives leads submitted from the Maden Nova 1 landing page and saves them directly into your Firebase Realtime Database.

## Features
- **Secure**: Keeps your Firebase database secret safe on the server side instead of exposing it to visitors.
- **CORS Enabled**: Accepts cross-origin form submissions from your landing page.
- **Metadata Enrichment**: Automatically logs timestamp, visitor IP address, country, and device user-agent.
- **Validation**: Ensures name and phone number are present before saving.

---

## Deploy to Cloudflare (Takes 1 Minute)

1. Open a terminal in the `worker` directory:
   ```bash
   cd worker
   ```

2. Login to your Cloudflare account (if not already logged in):
   ```bash
   npx wrangler login
   ```

3. Deploy the worker:
   ```bash
   npx wrangler deploy
   ```

4. Cloudflare will output your public worker URL, for example:
   ```text
   Published maden-nova-leads (0.21 sec)
     https://maden-nova-leads.<your-subdomain>.workers.dev
   ```

5. Copy that URL and paste it into `index.html` at:
   ```javascript
   const CLOUDFLARE_WORKER_URL = "https://maden-nova-leads.<your-subdomain>.workers.dev";
   ```

---

## Firebase Realtime Database
- **URL**: `https://sample-firebase-ai-app-ba30f-default-rtdb.firebaseio.com/`
- **Node**: `/leads.json`
- Each record contains:
  - `name`: Full Name
  - `phone`: WhatsApp Phone Number
  - `apartmentType`: Selected configuration (1 BHK / 2 BHK / Both)
  - `project`: "Maden Nova 1"
  - `location`: "Sector 5, Taloja Phase 1, Navi Mumbai"
  - `timestamp`: ISO timestamp
  - `clientIp`: Visitor IP
  - `country`: Visitor Country
