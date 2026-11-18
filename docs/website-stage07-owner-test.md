# Website Stage 07.2 local release readiness

This document records the local implementation of the owner-only synthetic customer journey inside the existing customer flow. It is a preparation and QA record; it does not authorise a public deployment or private Runner release.

## Baselines

- Website repository: `VeraaaCUI/1stprincipleai-planning-demo`
- Website `main` baseline: `e6b12f07ee8e9a67292b61078ceabedfb9367a7f`
- Local release branch: `codex/website-stage07-2-release`
- Private engineering report baseline: `a85df090b6f202edc38535fe6f674dec5c914ffd`
- Private engineering current HEAD: `62290714b5da4012321fe018d2e742eb68f98261`

The private report's `a85df090` is an ancestor of `62290714`; `398fa64` recorded the Phase 2A.9.15 validation heads and `62290714` recorded the later executed synthetic coordinator trace. There is no baseline substitution.

## Existing architecture reused

The existing static vanilla-JavaScript application remains the only frontend. The extension reuses:

- `council-map.js` and `address-search.js` for existing address, NSW parcel and property confirmation.
- `auth-client.js` and the current Supabase PKCE session validation.
- `pdf-intake.js` and bundled PDF.js for local text-layer inspection only.
- `local-projects.js`, `cloud-project-repository.js` and `project-repository.js` without schema or RLS changes.
- Existing hash routing, navigation, CSS variables and responsive layout.

No private Runner source, rule source, engineering fixtures or Blind Test material is included in the website assets.

## Customer journey

There is one customer entry point. The supported path is `#/home` → `#/property` → property confirmation → `#/property/overview` → `#/property/development` → Granny Flat / Secondary Dwelling → `#/property/assessment`. For an authenticated account carrying the server-managed owner-test claim, the existing assessment slot switches to the deterministic synthetic adapter and shows a persistent `TEST MODE — SYNTHETIC ASSESSMENT` indicator. The legacy `#/owner-test` hash redirects to `#/property` and is not a supported second journey. The journey is:

1. Search and confirm a property through the existing address and parcel flow.
2. Choose the Granny Flat / Secondary Dwelling enquiry and review known, missing and unchecked facts.
3. Answer one deterministic customer question at a time. B0 is deferred until after B3; B1/B3 early exits cancel later questions; prior answers can be edited.
4. Select a PDF through the existing local PDF.js intake. Filename, size, processing status and text-layer status remain visible; no upload, OCR, measurement or hosted storage is added.
5. Review the preliminary Reading, confidence, reasons, material limitations and one next action, with professional handoff where required.
6. Pause, resume and optionally select Save Project through the existing My Projects toolbar. Saving is never required to see the Reading.

The deterministic adapter covers clear pathway, B1 prohibited zone, B3 under 450 m², missing site plan, GIS 7 other structures, HZ10/HZ08 hazard hold, B8/B9 tie, B9 all-options-out and interrupted/restored journeys. It is a future service-adapter boundary, not the live engineering Runner.

## Access and isolation

`auth-client.js` exposes only a boolean derived from Supabase `getUser()` server-managed `app_metadata.owner_test` or the `owner_test` role. URL parameters, localStorage flags, client-side email comparisons and hidden buttons do not grant access. Without the claim the ordinary existing assessment remains active and the synthetic adapter is not mounted. A controlled test therefore still requires the hosting/auth environment to issue this claim; this local static checkout cannot create that authorization itself.

The synthetic draft is namespaced by the verified owner UUID. Auth changes clear the in-memory journey and PDF state. Address lookup, confirmation, project selection, questions, PDF selection, pause/resume and Reading display do not write a cloud project. The existing explicit Save Project action may save only the supported Project v1 property/workflow context; synthetic answers, the synthetic Reading, confidence and PDF metadata are not represented by that contract and remain temporary.

## Files changed

- `index.html`: load the synthetic adapter assets; no separate owner route mount is present.
- `app.js`: retire the separate route and configure the adapter within the existing property flow.
- `council-map.js`: mount the adapter in the existing Granny Flat assessment slot and gate it on the server-managed owner claim.
- `auth-client.js`: expose the server-managed owner-test claim.
- `site-navigation.js`: retain ordinary navigation with no Owner Test item.
- `owner-test-engine.js`: deterministic synthetic question and result transitions.
- `owner-test.js`: gated customer journey UI, local draft handling, PDF intake and report view.
- `owner-test.css`: responsive journey styles.
- `local-projects.js`: clear prior-account enquiry/pending-save state on identity changes and retain the request ID for direct save idempotency.
- `auth-client.js`, `site-navigation.js`, and `app.js`: recovery-link failure handling and actionable recovery-specific presentation.
- `tests/auth-client-recovery.test.mjs`: 11 PKCE recovery regressions.
- `tests/local-projects.test.mjs`: six no-save, cancellation, save, failure, persistence-contract and account-switch regressions.
- `vendor/images/`: five missing Leaflet 1.9.4 control and marker images referenced by the existing CSS and runtime.
- `scripts/build-site.mjs`: allow-listed public artifact build from verified manifest entries.
- `.gitignore`: keep generated `dist/` output out of the source repository.
- `tests/build-site.test.mjs`: verify the public build contains only the manifest resources.
- `deployment-manifest.json`: regenerated hashes and public asset count (98).
- `tests/owner-test-engine.test.mjs`: transition and result regression cases.
- `tests/owner-test-integration.test.mjs`: static integration, access-gate and isolation checks.

The named `property-fact-model.js` and `hawkesbury-property-facts-client.js` files were found only under the internal repository's `scripts/local-preview/overlays/`. Their source identifies them as a localhost overlay with production gates unchanged, and this website does not reference them. They were accounted for but not promoted into this release. The website runtime config has no enabling flag, and no property-facts lookup is invoked.

## Verification

`node --test tests/*.test.mjs` passes 39 tests with zero failures; full `node --test` passes 40 including the root owner-module smoke discovery. `node --check` passes for all 40 JavaScript and module files. The local `node scripts/build-site.mjs` artifact contains exactly the 98 manifest resources, with matching sizes and SHA-256 hashes. All 60 local HTML/CSS references resolve into that allow-listed set. Credential/private-key scanning found no matches, and the website tree contains no private Runner files or release flags. A claimed owner account is required for interactive Owner UAT, which remains pending.

The currently saved Pages configuration uses the website root as static output. The source tree has 108 tracked files; 10 engineering and audit files are outside the public runtime manifest and would be routable under that root configuration: `.gitignore`, `README.md`, this release note, five tests, `scripts/build-site.mjs`, and `deployment-manifest.json`. They contain no credentials or sealed Blind Test fixtures. The local build now excludes them from `dist/`; the hosted Pages setting was not changed.

Before publishing this branch, the existing Pages project must be configured with build command `node scripts/build-site.mjs` and output directory `dist`. This keeps the existing project, production branch, domain, and customer URLs. No push should occur while the project still builds the repository root, because a branch push may create a preview containing the engineering files. The build-setting change requires separate owner approval and was not applied.

The existing production-ready flow for property search/confirmation, overview, development selection, Granny Flat assessment, embedded owner-only synthetic questions, Reading and optional Project v1 save does not reference either property-fact overlay. The model and client remain excluded intentionally; neither is needed by the approved Stage 07.2 journey. The full real address flow, Supabase account project read/write, and PDF selection remain existing-site capabilities and were not redirected into the synthetic adapter. No private Runner invocation, real-property conclusion, database migration, hosted write, upload, GitHub push, merge or deployment was performed.

## Rollback and future controlled deployment

Known-good rollback commit is `e6b12f07ee8e9a67292b61078ceabedfb9367a7f`. To disable the new experience, restore that commit (or remove the synthetic adapter references and assessment-slot integration), invalidate the static asset cache, and verify `#/home`, `#/property`, `#/my-projects` and the existing account flow. The website checkout had 93 manifest entries, but the existing Leaflet CSS and marker runtime also referenced five absent images. The regenerated release manifest contains 98 resources after adding the exact Leaflet 1.9.4 assets. The prior 95-resource expectation did not match the actual production checkout; the two local-preview property-fact scripts were not promoted.

The future controlled test should be approved separately and then:

1. Approve the existing Pages project's build command `node scripts/build-site.mjs` and output directory `dist`.
2. Rebuild and verify the 98-resource artifact, then approve pushing this branch for review.
3. Review and merge to `main` only after separate approval; the existing Git integration will deploy the production branch.
4. Configure a server-managed Supabase `app_metadata.owner_test=true` or `owner_test` role separately for the named owner test account; do not use an email allowlist in browser code.
5. Verify anonymous, ordinary-user and invalid-session direct access fail closed; verify the claimed owner can complete, pause, resume and clear all listed scenarios.
6. Monitor static asset and Auth errors, then use the known-good commit to roll back if any existing public route regresses.

This report stops before GitHub push, merge, production deployment, private Runner hosting, real-address evaluation and customer release.
