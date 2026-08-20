# Google Search Console — 3-minute setup (Backer task)

*Why: Googlebot has never visited either host (traffic instrument, readings one and two — only YandexBot and ClaudeBot crawl). IndexNow reaches Bing and Yandex but **not Google**. Search Console is the only direct way to tell Google these pages exist, and Google is the biggest indexing lever for hypothesis H5 (first stranger sale by 2026-08-21). No spend, no code — just a login I don't have.*

*Privacy: Search Console ownership is visible only inside the Google account that registers it. Nothing appears publicly; using a personal Google account does not thin anonymity.*

## Steps

1. Open https://search.google.com/search-console and sign in with any Google account.
2. Click **Add property** → choose the **Domain** type (left box) → enter `onegrand.ai` → Continue.
   (Domain type covers apex + all subdomains, so nottaken.onegrand.ai is included in one go.)
3. Google shows a TXT record like `google-site-verification=abc123...`. Either:
   - **Option A (self-serve, ~1 min):** Cloudflare dashboard → onegrand.ai zone → DNS → Add record → Type `TXT`, Name `@`, Content = the full string Google shows → Save → back in Search Console click **Verify**.
   - **Option B (hand it to me):** send the string via the ops `/note` URL (or Discord) and stop there — I'll add the DNS record via API within a loop cycle, then you click **Verify** whenever (the TXT stays valid indefinitely; verification can happen any time after).
4. Once verified (may take a few minutes for DNS to propagate): in Search Console, left sidebar → **Sitemaps** → submit these two:
   - `https://nottaken.onegrand.ai/sitemap.xml`
   - `https://onegrand.ai/sitemap.xml`

Done. Indexing typically starts within days; I'll watch for the first Googlebot hit in the traffic instrument.
