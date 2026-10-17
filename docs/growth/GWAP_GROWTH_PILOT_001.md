# GWAP Growth Pilot 001: The Internet Has a New Gatekeeper

**Status:** DRAFT. No live deployment, YouTube upload, marketing post, or permission to publish is implied.

## Objective

Prove one end-to-end audience-growth cycle: original GWAP research, one creatively approved YouTube story, one search-ready companion article, appropriate distribution, and verifiable 7/28-day metrics.

## Use existing GWAP infrastructure

- Eleventy and the existing blog template, canonical metadata, structured data, and editorial QA.
- Existing GitHub draft PR/review gate. Never auto-merge.
- Existing BrianNeural and Gatekeeper R02 story for the video. Preserve approved scripts, source shots, character canon, and creative decisions.
- Existing GA4, Search Console, and YouTube Studio analytics. Do not invent baselines or assume collector health.
- No extra APIs, new SEO tool subscriptions, or additional agent frameworks.

## Five agent lanes, explicit review gates

| Agent lane | Deliverable | Stop condition |
| --- | --- | --- |
| Research | Current primary sources, search questions, contradictions and claims ledger | Claim not verified |
| Editorial | One original useful Eleventy draft, internal links and QA/preview evidence | Founder has not approved |
| Video | Full playable final MP4, captions, BrianNeural audio, media rights inventory | Any scene lacks creative signoff |
| Distribution | Platform-tailored drafts and checked public URLs | Founder has not authorized posting |
| Measurement | Baseline and day-7/day-28 traffic, retention, subscriber and conversion observations | Unavailable or unverified exports |

## Technical gates before this PR can merge

1. Run `npm run editorial:qa` and `npm run build` on a clean checkout and inspect failures.
2. Verify the internal related article paths are still present and editorial metadata renders correctly.
3. On a preview URL, verify 200 content response, correct canonical URL, page title, description, BlogPosting structured data, and normal mobile rendering.
4. Investigate the previously observed Cloudflare challenge on `/blog/` and establish legitimate public fetch/crawl access without weakening unrelated bot security.
5. Confirm the article adds distinct value beyond existing GWAP posts and approve any author attribution as the founder.
6. Do not publish or merge until the corresponding story and marketing copy pass founder review. The article can be approved independently if its claims stand on their own.

## Success criteria

**Operations:** One high-quality article + matching YouTube release + approved distribution links shipped with evidence.

**Reach:** Track URL indexing, GSC impressions/clicks, GA4 article sessions and reader actions, YouTube impressions/CTR/average view duration/retention/subscribers. Record baseline before launch and compare at day 7 and day 28.

**Interpretation:** A draft, a crawlable page, indexing, ranking, view, watch, email signup, and purchase are different outcomes. Avoid claiming SEO results before Google has produced observable data.

## Scope exclusions

No automatic publication, video upload, emails, DM outreach, paid marketing, agent credential changes, Cloudflare configuration changes, analytics configuration changes, or production activation.
