# Homepage preview V1

Founder approval required before merging or production publication.

Baseline: 2a0c253f7588f13cb5a49d7a09051df4bb5221e2
Restore branch: restore/2026-10-19-before-homepage-update

## Changes
Responsive HTML replaces the image-map layout. Existing logo, original globe artwork (CSS framing), Labs artwork, brand film and published article images are reused. Three existing articles are featured. Mobile navigation, visible headings, reduced-motion support, 16px email entry and a stacked phone signup form are included. Lower-page video uses preload=none and a poster. Homepage HTML is approximately 8 KB instead of 1.1 MB; this is a source-size comparison, not a measured loading-speed claim.

Signup retains the existing endpoint. On all hosts except gwapgang.com and www.gwapgang.com, submissions are local simulations and never transmit an email address. Successful production responses alone may emit sign_up if gtag is present. No analytics library is newly installed; end-to-end analytics remains unverified.

The original animated identity video section is omitted from this first proposed layout to shorten the page. The original remains in the restore branch. The original brand headline and published brand film remain. No unpublished Gatekeeper video is presented as released.

## Validation
Eleventy build and repository editorial QA pass. JavaScript syntax passes. All homepage local links/media resolve to generated files. ID uniqueness passes. Browser visual and interaction QA pending. Built-in preview unavailable due to bwrap mount permission failure.

## Release gate
Do not merge until founder reviews desktop/mobile visuals. Confirm the actual Cloudflare production project/deployment before any release. Capture a 390px baseline, compare 320/390/768/1280 widths, check menu/keyboard/signup preview states, and then obtain founder approval. No production changes are authorized by this draft.

## Rollback
Preserved source commit above is the recovery target. Prepare a reviewed revert/recovery branch rather than force-resetting shared main. Cloudflare production rollback ID is not verified. This checkpoint covers tracked source/assets, not databases or service configuration.
