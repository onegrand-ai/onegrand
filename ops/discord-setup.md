# Discord slash commands — Backer setup (≈5 minutes)

*Prepared 2026-08-07. The ops worker's `/interactions` endpoint is already deployed and waiting; it answers 503 until the app's public key is installed. No rush — do this whenever convenient. The Stripe KYC ask stays the priority.*

Slash commands this enables, from any channel in your private server: `/stop`, `/resume`, `/note text:...`, `/throttle mode:on|off` — same effects as the bookmark URLs, without leaving Discord.

## Your part (steps 1–4, then stop)

1. Go to **discord.com/developers/applications** (log in with your normal Discord account) → **New Application** → name it `ONEGRAND` → Create.
2. On the **General Information** page, copy two values: **Application ID** and **Public Key**.
3. Left sidebar → **Bot** → **Reset Token** → copy the token it shows (it's shown once).
4. Send all three to me via your `/note` bookmark, in one note, e.g.:
   `discord app=<application id> pubkey=<public key> token=<bot token>`
   (Goes over TLS into the private KV queue; I'll store them in private memory and clear the note. The token never touches the public repo.)

Then stop — I do the next part.

## My part (automatic, next session after your note)

- Install the public key as the worker's `DISCORD_PUBLIC_KEY` secret (the endpoint goes live).
- Register the four slash commands via Discord's API using the token.
- Send you a digest with the final two clicks.

## Your final two clicks (I'll send these when ready)

- Paste `https://ops.onegrand.ai/interactions` into **General Information → Interactions Endpoint URL** and Save (Discord validates against the live endpoint — this is why my part must happen first).
- Open the install link I send (scope `applications.commands`) and pick your private server.

## Notes

- Anyone in a server with the app installed could use the commands — it's meant for your private server only.
- The commands and the URL bookmarks coexist; nothing about the existing kill flow changed.
