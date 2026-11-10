# Closette checkout

Existing HTML/CSS/JavaScript and product assets are retained. This version adds product purchase buttons, a multi-product checkout, a server-priced Billplz integration, D1 order storage, payment callback verification, a durable email outbox, private order-status links and an authenticated operations dashboard.

Business rules confirmed by owner: full payment for standard products; custom dimensions through quotation; delivery and installation included throughout Melaka. DR2 requires a quotation because its dimensions need confirmation. Finish/colour and installation dates are confirmed by staff. Customer accounts and marketing messages are not included.

## Current state

`CHECKOUT_ENABLED=false` is intentional. The merchant has not opened a Billplz account yet. The storefront lets customers prepare a basket and contact WhatsApp, but cannot create a payable bill until the backend and email provider are configured. No test payment is described as real. Sandbox and live use separate accounts/keys.

## Cloudflare setup

Use Cloudflare Workers with Static Assets, not GitHub Pages. The repository remains on GitHub. Do not move production DNS until the Worker preview and checkout have passed acceptance.

1. Install dependencies using the committed lockfile, with Node 22.16+ (tested on Node 24). `pnpm install --frozen-lockfile`.
2. Run `pnpm test` and `pnpm build`.
3. Authenticate Wrangler to the owner's Cloudflare account. Create a D1 database using `pnpm exec wrangler d1 create closette-orders`.
4. Put the returned database ID in `wrangler.jsonc`; it is an identifier, not a secret. Run `pnpm exec wrangler d1 migrations apply closette-orders --remote`.
5. Deploy with `pnpm exec wrangler deploy`. Start on the generated workers.dev address, still with checkout disabled. Set `SITE_URL` to that actual address while testing; every callback/return link is derived from it.
6. Configure the following **secret bindings**, using Wrangler secret prompts or Cloudflare's encrypted Secrets UI. Never commit keys, paste them into GitHub source, or include them in chat:
   - `BILLPLZ_API_KEY`: merchant API secret for the chosen sandbox/live account.
   - `BILLPLZ_COLLECTION_ID`: collection for Closette orders.
   - `BILLPLZ_X_SIGNATURE_KEY`: enable X Signature callbacks in Billplz and copy its secret.
   - `ORDER_TOKEN_KEY`: independently generated random secret, at least 32 characters; keep stable so existing private status links continue to work.
   - `ADMIN_TOKEN`: a different random secret, at least 32 characters; used only by staff at `/admin.html`.
   - `RESEND_API_KEY`: transactional email sending key.
   - `EMAIL_FROM`: verified sender, e.g. `Closette <orders@shopclosette.com>` after verification. Do not use an unverified sender.
7. `ADMIN_EMAIL` is configured as `schemataworks@gmail.com`; change if the owner wants another inbox. Configure Resend's domain-verification records precisely as returned by Resend. Do not overwrite existing email DNS records. Resend is an additional service requiring its own account/verification; Billplz alone does not implement these order emails.
8. After keys and D1 are configured, set `BILLPLZ_MODE=sandbox` and `CHECKOUT_ENABLED=true` for a separate test deployment. Use only Billplz sandbox to run payment acceptance. The checkout visibly labels sandbox mode. Do not use real customer data in testing.
9. Confirm final cancellation/refund terms and privacy text with the owner before accepting live payments. No refund deadline or non-refundable deposit policy has been invented in this implementation.
10. Once the merchant account is approved and tests pass, configure production keys, `BILLPLZ_MODE=live`, `SITE_URL=https://shopclosette.com`, and only then enable production checkout. Bind the production domain to the Worker and remove the old GitHub Pages domain configuration as part of the controlled cutover. Verify HTTPS and www redirect after cutover. Existing GitHub Pages hosting remains the rollback until this step.

The 5-minute Worker cron retries email delivery. Check that the cron is deployed. Failed emails remain visible in the dashboard; after ten attempts they require operator investigation. Orders remain stored and paid even if email is unavailable. Provider acceptance does not guarantee inbox delivery: verify received emails during acceptance and monitor the email provider for bounces.

## Acceptance before live payments

- A01 × 1 is RM1,500 and × 2 is RM3,000; no delivery charge within Melaka.
- Tampered product price, quotation-only DR2, invalid quantities and other states cannot create a bill.
- Successful payment records exactly one order and queues a customer confirmation plus merchant email.
- Failed/cancelled payments remain unpaid and never enter fulfilment.
- Duplicate callbacks do not duplicate order or email jobs. Signed mismatching amounts/collections/bill IDs are rejected.
- Customer returning from Billplz cannot mark themselves paid through URL parameters.
- A paid order still exists if email delivery fails; retries use a stable provider idempotency key.
- Admin is inaccessible without its secret; public status responses reveal no address, email or phone.
- Staff can move a paid order through new → confirmed → production → delivery → completed.
- Test desktop/mobile checkout, empty basket, multiple products and customer private status links.
- Receive real sandbox callbacks from Billplz and test actual email delivery; mocked tests do not replace this.

## Operational notes

Money is stored as integer sen. Product prices are authoritative in `server/catalog.mjs`; update that file and the existing product list in `script.js` together. No secret or server directory is included in the public static assets.

The admin token is held only in the current tab's memory. Refreshing the admin page signs staff out. Staff status updates are recorded in `order_events`. Refunds must be performed through the payment provider and reconciled separately; the dashboard cannot issue refunds or mark an unpaid order as paid.

The postcode pattern is a preliminary Melaka range check, combined with the explicitly selected state. It is not a postal-address verification service. Staff must verify actual delivery address and access before starting work.

Run local visual preview with `pnpm build` then `pnpm dev`. Local preview intentionally keeps payment and admin APIs disabled. Backend tests use SQLite and mocked Billplz/Resend responses; no real bill, charge or email is created by the tests.

References: https://support.billplz.com/api · https://developers.cloudflare.com/workers/static-assets/ · https://resend.com/docs/api-reference/emails/send-email
