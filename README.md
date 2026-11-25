# GMBF Ventures website

Edit the reviewed static source in `src/site/`. The build publishes those files and generates the downloadable brand pack in ignored `dist/`. The enquiry endpoint is maintained in `api/enquiry.mjs` and its shared logic in `lib/`. The original review pack and Python generator are private handover materials and are outside this project.

## Local checks

Use Node 24, then run `npm ci`, `npm test`, `npm run build` and `npm run dev`. The dev server binds to loopback and uses mock email. It does not require or read real Resend credentials. CI runs the same test and build commands without a deployment job.

## Release checklist

- [ ] Owner approves the precise qualitative copy, claims, bylines, biography, portrait, and three public PDF downloads. Check rights and sample data in the images and PDF artwork before sharing them publicly. Keep the private figures and generator outside the public GitHub repository and release build.
- [ ] Privacy reviewer approves the notice against the real service. Confirm the proposed 24-month inbox retention, provider and hosting log retention, mailbox provider, applicable transfer mechanism for each service, and the process for giving people copies of the safeguards. Verify cookies and tracking on the production candidate.
- [ ] Approve the GF icon. Decide whether to clear or replace the Open G in the combined site logo and social card. Get written trade mark advice on the branding selected for launch.
- [ ] Use the Git-integrated review branch for a preview. Require authenticated access, keep the indexing controls, and review the deployment's generated file inventory.
- [ ] Configure a sending-only `RESEND_API_KEY` and verified `MAIL_FROM` as server-side Vercel environment variables. Set `MAIL_TO` to `hello@gmbfventures.co.uk` for the authorised delivery check. Use the DNS records Resend supplies only after DNS authorisation. Preserve the current inbox routing. Leave email tracking off for enquiries.
- [ ] Apply shared rate limiting to `POST /api/enquiry` in the hosting firewall. The bounded per-instance limiter is supplementary. Check that Vercel supplies the correct client-IP header and that the URL's origin matches the browser. Use `ALLOWED_ORIGINS` as an environment-specific comma-separated override only where needed for a recognised custom domain or authenticated preview URL.
- [ ] Test all three routes through the approved preview. Confirm real inbox receipt, spam-folder placement and Reply-To. Verify provider failure, retry, the direct email fallback and a form submission with JavaScript disabled. Confirm that errors, spam and provider volume are visible to the site owner without logging message content.
- [ ] After explicit production authorisation, merge the reviewed GitHub release through Vercel’s Git integration. Verify that the production build enables crawling for the 12 content pages and advertises the sitemap, while retaining noindex on the three utility pages and enquiry endpoint.
- [ ] Verify apex to www, the legacy Château redirect, status and security headers, indexing rules, canonical URLs, downloads and email delivery. Then submit the sitemap. Use a GitHub revert for code rollback and the documented DNS restore plan for an authorised DNS rollback.

Vercel builds the `main` production branch and the designated review branch through GitHub. Builds default to direct email on hosted environments until the provider and shared rate limit have been verified. To enable the form, configure the hosted environment with `CONTACT_FORMS_ENABLED=1`, `RESEND_API_KEY` and `MAIL_FROM` before the next GitHub-triggered build. The build opens indexing on production content pages and preserves noindex on the utility pages and local previews.
