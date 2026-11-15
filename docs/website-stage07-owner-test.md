# Website Stage 07 local completion

This document records the local implementation of the owner-only synthetic customer journey. It is a preparation and QA record; it does not authorise a public deployment or private Runner release.

## Baselines

- Website repository: `VeraaaCUI/1stprincipleai-planning-demo`
- Website `main` baseline: `e6b12f07ee8e9a67292b61078ceabedfb9367a7f`
- Local branch: `codex/website-stage07-owner-customer-journey`
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

`#/owner-test` is a feature-gated route with a persistent `TEST MODE — SYNTHETIC ASSESSMENT` indicator. The journey is:

1. Select a synthetic property context or return to the existing address search.
2. Choose the Granny Flat / Secondary Dwelling enquiry and review known, missing and unchecked facts.
3. Answer one deterministic customer question at a time. B0 is deferred until after B3; B1/B3 early exits cancel later questions; prior answers can be edited.
4. Select a PDF through the existing local PDF.js intake. Filename, size, processing status and text-layer status remain visible; no upload, OCR, measurement or hosted storage is added.
5. Review the preliminary Reading, confidence, reasons, material limitations and one next action, with professional handoff where required.
6. Pause, resume and save a local synthetic draft. The draft key is scoped to the authenticated owner UUID and is explicitly labelled local-only; it is not a cloud My Project and never attaches to a real property.

The deterministic adapter covers clear pathway, B1 prohibited zone, B3 under 450 m², missing site plan, GIS 7 other structures, HZ10/HZ08 hazard hold, B8/B9 tie, B9 all-options-out and interrupted/restored journeys. It is a future service-adapter boundary, not the live engineering Runner.

## Access and isolation

`auth-client.js` exposes only a boolean derived from Supabase `getUser()` server-managed `app_metadata.owner_test` or the `owner_test` role. URL parameters, localStorage flags, client-side email comparisons and hidden buttons do not grant access. Without the claim the route fails closed. A production owner test therefore still requires the hosting/auth environment to issue this claim; this local static checkout cannot create that authorization itself.

The synthetic draft is namespaced by the verified owner UUID. Auth changes clear the in-memory journey and PDF state. No synthetic result is written through the existing `planning_projects` contract, so ordinary account projects and RLS behaviour remain unchanged.

## Files changed

- `index.html`: load the owner-test assets and add the hidden route mount.
- `app.js`: route/render integration and application API exposure.
- `auth-client.js`: expose the server-managed owner-test claim.
- `site-navigation.js`: show the owner-test link only for an authenticated claimed owner.
- `owner-test-engine.js`: deterministic synthetic question and result transitions.
- `owner-test.js`: gated customer journey UI, local draft handling, PDF intake and report view.
- `owner-test.css`: responsive journey styles.
- `deployment-manifest.json`: updated hashes and public asset count (93).
- `tests/owner-test-engine.test.mjs`: transition and result regression cases.
- `tests/owner-test-integration.test.mjs`: static integration, access-gate and isolation checks.

## Verification

The local Node suite passes 18/18 tests. `node --check` passes for all changed JavaScript files. A local static server served the current checkout on `http://127.0.0.1:4187`; the direct owner route visibly failed closed for an ordinary anonymous session and showed the synthetic-mode disclosure. Desktop and narrow responsive CSS paths are defined in `owner-test.css`; a claimed owner account is required to exercise the interactive panels in a browser.

The full real address flow, Supabase account project read/write, and PDF selection remain existing-site capabilities and were not redirected into the synthetic adapter. No private Runner invocation, real-property conclusion, database migration, hosted write, upload, GitHub push, merge or deployment was performed.

## Rollback and future controlled deployment

Known-good rollback commit is `e6b12f07ee8e9a67292b61078ceabedfb9367a7f`. To disable the new experience, restore that commit (or remove the four owner-test asset references and the route integration), invalidate the static asset cache, and verify `#/home`, `#/property`, `#/my-projects` and the existing account flow. The current `deployment-manifest.json` records the changed static hashes; a future release process must regenerate it after any further edits.

The future controlled test should be approved separately and then:

1. Review this branch and run the Node suite plus desktop/tablet/mobile smoke checks.
2. Configure a server-managed Supabase `app_metadata.owner_test=true` or `owner_test` role for the named owner test account; do not use an email allowlist in browser code.
3. Deploy this branch to the existing domain with the feature route still synthetic-only and no Runner endpoint configured.
4. Verify anonymous, ordinary-user and invalid-session direct access fail closed; verify the claimed owner can complete, pause, resume and clear all listed scenarios.
5. Monitor static asset and Auth errors, then use the known-good commit to roll back if any existing public route regresses.

This report stops before GitHub push, merge, production deployment, private Runner hosting, real-address evaluation and customer release.
