# Integrations

Burrow connects to external tools over MCP. You run the MCP server; Burrow connects to it using your own credentials. No API keys leave your infrastructure.

## Jira (mcp-atlassian)

**What it does:** Push Breakdown tasks to Jira issues. Status changes on Jira flow back via webhook.

**Run the MCP server:**

```bash
docker run -p 9000:9000 \
  -e JIRA_URL=https://your-org.atlassian.net \
  -e JIRA_EMAIL=you@example.com \
  -e JIRA_API_TOKEN=your-token \
  ghcr.io/sooperset/mcp-atlassian:latest
```

**Connect in Burrow:**
1. Go to **Settings → Connections**
2. Click **Connect** on the Jira card
3. MCP server URL: `http://your-server:9000/mcp`
4. Auth token: leave blank (the server handles auth via its own credentials)
5. Webhook secret (optional): generate a random secret; set it both here and in mcp-atlassian config for HMAC verification

**Inbound webhooks (status sync):**

Configure mcp-atlassian to POST status changes to:
```
POST https://your-burrow.example.com/webhooks/<connectionId>
Header: x-burrow-signature: <hmac-sha256-of-body>
Body: { "externalId": "PROJ-123", "status": "done" }
```

The `connectionId` is shown in the Connections page after you connect.

---

## Slack (Slack MCP)

**What it does:** Notify channels on sign-off requests and status changes.

**Run the MCP server:**

```bash
# Using the official Slack MCP server
npx -y @slack/mcp-server \
  --token xoxb-your-bot-token \
  --port 9001
```

Or with Docker:
```bash
docker run -p 9001:9001 \
  -e SLACK_BOT_TOKEN=xoxb-your-token \
  mcp-slack:latest
```

**Connect in Burrow:**
1. Go to **Settings → Connections**
2. Click **Connect** on the Slack card
3. MCP server URL: `http://your-server:9001/mcp`

**Automate Slack notifications:**

Burrow ships a pre-built routine template: **"Notify Slack on signoff approved"**.

To enable it:
1. Go to **Automations**
2. Find the `notify-slack-signoff-approved` routine (disabled by default)
3. Toggle it on — it fires automatically when any spec is approved

Seed the templates if they're missing:
```bash
pnpm --filter @burrow/server exec tsx scripts/seed-routines.ts you@example.com
```

---

## PostHog (analytics — for Gap 5 post-launch evaluation)

**What it does:** Query product usage events to evaluate whether shipped specs hit their success metrics.

**Connect using PostHog's official MCP server:**

PostHog publishes an MCP server. Add the connection in Burrow:
1. Go to **Settings → Connections**
2. Click **Connect** on the **PostHog** card
3. MCP server URL: `https://us.posthog.com/mcp` (or your self-hosted instance)
4. Auth token: your PostHog personal API key

Once connected, the **Evaluate launch** button appears on any spec that has been approved.

---

## n8n (feedback ingestion sidecar)

n8n lets you pull feedback from Gong, Intercom, Zendesk, Amplitude, and hundreds of other tools without writing custom connectors in Burrow.

**Add to docker-compose.yml:**

```yaml
n8n:
  image: n8nio/n8n:latest
  ports:
    - "5678:5678"
  environment:
    - N8N_BASIC_AUTH_ACTIVE=true
    - N8N_BASIC_AUTH_USER=admin
    - N8N_BASIC_AUTH_PASSWORD=changeme
  volumes:
    - n8n_data:/home/node/.n8n

volumes:
  n8n_data:
```

**Create an ingest API key:**
1. Go to **Feedback → Data sources**
2. Click **Add data source**, enter a label (e.g. "n8n production")
3. Copy the key shown — it won't be displayed again

**Wire n8n to Burrow:**

In your n8n workflow, add an HTTP Request node as the final step:
- Method: `POST`
- URL: `https://your-burrow.example.com/api/ingest/feedback`
- Header: `x-burrow-ingest-key: <your-key>`
- Body (JSON):
  ```json
  {
    "items": [
      {
        "source": "support",
        "customer": "Acme Corp",
        "segment": "enterprise",
        "text": "We need better export options",
        "externalId": "zendesk-ticket-12345"
      }
    ]
  }
  ```

Valid `source` values: `manual`, `upload`, `interview`, `review`, `support`, `sales`

The `externalId` field is used for deduplication — re-posting the same ID is a no-op.

**Example n8n workflows:**
- **Zendesk → Burrow:** Trigger on new ticket, extract customer + text, POST to ingest endpoint
- **Gong → Burrow:** Schedule daily, fetch call summaries, POST each as `source: "sales"`  
- **Intercom → Burrow:** Trigger on conversation closed, extract text, POST as `source: "support"`

---

## Webhook inbound format

Any tool can push status changes back to Burrow:

```
POST /webhooks/<connectionId>
Content-Type: application/json
x-burrow-signature: sha256=<hmac-sha256 of body using webhook secret>

{ "externalId": "PROJ-123", "status": "done" }
```

Status mapping (case-insensitive):
- `done | closed | resolved | complete` → Burrow `done`
- `inprogress | started | doing | active` → Burrow `in_progress`
- `inreview | review` → Burrow `review`
- `todo | open | backlog | pending | new` → Burrow `pending`
