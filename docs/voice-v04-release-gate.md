# GWAP Voice V0.4 | Controlled Release Gate

**Status:** ISOLATED PREVIEW ONLY. Founder confirmed actual iPhone automatic spoken answers and automatic re-listening on 2026-10-10. Reliability/security polish is tested in CI, but this latest revision has not been independently certified on a real iPhone. No production merge/deploy is authorized by this document.

## Scope freeze
- In scope: keyboard focus, explicit processing/listening/speaking indicators, stale UI hints, interrupt/End cleanup, response concision, authentication regression tests.
- Out of scope: new mission tools, live operations snapshot (separate draft PR #119), new paid infrastructure, automatic customer outreach, public launch.
- Dependencies: GWAP Cloud Agent draft PR #7; GWAP landing V0.3 draft PR #90; this stacked V0.4 draft PR #91. **Do not merge PR #91 directly to main while the parent is unreviewed.**

## Founder iPhone acceptance, last-mile
Using the **same exact isolated Pages preview hostname** throughout:
1. Pair via the preview's /voice/ page, verify "Paired · Mic API available"; no token posted to chat or screenshots.
2. Tap Start once, ask a question, confirm microphone capture and a visible "PROCESSING" state.
3. Hear GWAP begin speaking without manual Generate Audio/Play; confirm "SPEAKING", then the microphone returns to "LISTENING".
4. Ask two follow-up questions without touching controls. Verify relevance and memory, with no phantom duplicate replies or unexpected provider requests.
5. Open the keyboard, type and send a message; confirm Done/Send dismisses keyboard, transcript stays readable and normal conversation resumes.
6. While GWAP is speaking, tap Interrupt Gwap. Verify audio stops, next speech is captured, old audio cannot restart.
7. Tap End while recording, and again during generated audio on a new session. Verify mic access stops and no queued response can play after End.
8. Tap Clear in a running session. Verify old text stays cleared, mic/audio stop, and no stale reply appears.
9. Background and foreground Safari. Verify recording is paused safely and requires explicit Start again.
10. Deny mic access, expire device pairing, or disable Web Audio in a controlled test. Verify visible recovery guidance, no stuck disabled Start and a usable typed fallback.
11. Complete a ten-turn session to confirm capped auto-TTS usage with a clear message after the limit.

**Unverified until executed:** actual audio start latency, VAD accuracy in a noisy room, iOS focus/permissions, Safari pause/resume, interrupt physical responsiveness, and billing allocation. Test results are evidence, not the UI saying "Speaking".

## Automated and security gates
- Pass GitHub Actions CI on final pinned heads for PR #7, PR #90, PR #91.
- Browser API routes must validate scoped paired-device session server-side, exact same-Origin on mutating calls, and reject unauthenticated requests with 401 and cross-site requests with 403.
- No operator bearer stored in HTML/JS/local storage; scoped proxy token stays server-side only. Do not print secrets in logs, run output, or user-visible status.
- Check a maximum 10 automatic TTS generations per conversation test; bounded text and recording uploads; no persistence of transcript server-side; output no-store. Confirm actual quota in Cloudflare analytics before any wider rollout.
- No chat call may enqueue jobs, send outreach, make purchases, or claim live mission data. Command Mode remains the only path for authorized execution.
- End, Clear and Interrupt must abort pending requests and release microphone/audio resources; events from superseded turns must never replay into a new session.
- Test valid and invalid paired sessions and verify the backend/CORS configuration is not weakened.

## Rollout steps (require explicit approval)
1. Freeze branch and take final CI evidence and iPhone screen recording / exported ten-turn acceptance evidence.
2. Review three stacked PRs, require code/secret review, document rollback SHA and Cloudflare deployment identifier. Keep read-only mission-awareness PR #119 separate.
3. Activate V0.4 only as **opt-in paired founder preview** on the existing infrastructure, not as the public or default voice landing page.
4. Observe 10 real conversations for response reliability, microphone state, audio playback, errors, and Workers AI spend. No credentials or full transcripts in telemetry.
5. Only with founder approval, promote to a controlled production route while retaining a clear link to existing Command Mode and the previous known-good V0.3/production version.

## Stop / rollback conditions
- Unable to authenticate pairing, secrets exposed, cross-origin authorization regression.
- Unbounded request loop, unexpected AI quota/cost, audio playing after End, recording continuing after End, stale replies after Clear, or repeated crash/stuck controls.
- Safari cannot produce automatic audible replies reliably on the paired founder device.

**Rollback:** revert the landing route/change using the pinned pre-release commit or last known-good Cloudflare Pages deployment. Keep the original /voice/ Command Mode unchanged; do not weaken security to make the preview work.

## Release decision record
- Founder real-device automatic voice dialogue (previous branch): CONFIRMED by user, 2026-10-10.
- V0.4 reliability-polish CI: pending final commit check at release review.
- Latest polished branch iPhone acceptance: NOT YET VERIFIED.
- Scoped auth/origin tests: must reconfirm on final deployment.
- Production activation: NOT APPROVED, NOT PERFORMED.
