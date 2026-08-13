# Repository instructions for Codex

## Project context

This repository contains `sf6-battlegraph`, a self-hosted web application for collecting, persisting, filtering, and graphing Street Fighter 6 battle logs from Buckler's Boot Camp.

Read these documents before making architectural or data-model changes:

- `README.md`
- `docs/architecture.md`
- `docs/data-model.md`
- `docs/decisions.md`

Treat `docs/decisions.md` as the record of confirmed decisions and unresolved validation items. Do not silently turn an unverified assumption into a confirmed specification.

## Git workflow

- Use only the `master` branch unless the user explicitly instructs otherwise.
- Do not create or switch to a feature branch without explicit instruction.
- Complete requested repository changes through a local commit unless the user explicitly asks not to commit.
- Keep commits focused and use concise Conventional Commit-style messages.
- Do not push commits or open pull requests unless the user explicitly requests it.
- Preserve unrelated user changes in the working tree.

## Product constraints

- Target GitHub Pages; the frontend must remain deployable as a static SPA.
- Use Firebase Authentication and Cloud Firestore for authentication and persistence.
- Support both `private` and `public` deployment visibility modes.
- In public mode, reads may be public but writes must remain administrator-only.
- Collect and persist all battle modes: ranked, casual, custom room, and battle hub, as well as the combined history when available.
- Preserve complete raw Buckler responses and complete replay objects.
- Deduplicate matches by `replay_id`.
- Keep raw snapshots, normalized matches, query chunks, and manifests as separate storage concerns.
- Perform flexible statistics in client-side JavaScript using query chunks; do not add precomputed aggregates without evidence that they are needed.
- Display and group dates using `Asia/Tokyo`; preserve canonical timestamps as Firestore Timestamp and Unix seconds.
- Do not rely on a fixed Buckler Next.js build ID.
- Treat Buckler JSON endpoints as undocumented and subject to change.
- Preserve unknown fields and values instead of dropping them.

## Security and repository hygiene

Never commit or persist any of the following:

- Buckler session cookies
- CAPCOM ID credentials
- Firebase service-account private keys
- Authentication sessions or tokens
- Personal battle-log exports or production raw snapshots

Firebase web configuration is client-visible configuration, but deployment-specific values should be supplied through environment configuration rather than hard-coded into reusable source files.

Before committing, inspect the staged diff for secrets and accidental personal data.

## Implementation boundaries

- Keep Buckler parsing, normalization, chunking, and aggregation as pure domain logic where practical.
- Do not couple domain logic to React or the Firebase SDK.
- Design domain logic so it can later run in both the browser and Node.js.
- Validate imported user codes and Buckler response status before writing data.
- Make synchronization idempotent and safe to resume after partial failure.
- Build new query-chunk generations before switching the active manifest.
- Respect Firestore's document-size and batch-write limits; measure serialized UTF-8 size rather than estimating by object count alone.

## Verification

- Add or update tests for parser, normalization, deduplication, chunking, date-boundary, and aggregation changes.
- Use representative fixtures with personal identifiers replaced by synthetic values.
- Run the relevant formatter, linter, type checker, tests, and production build before committing when those commands exist.
- If a verification command cannot run, record the reason in the final handoff.

## Documentation

- Update the relevant document when a confirmed product or architecture decision changes.
- Record newly discovered Buckler behavior in `docs/decisions.md`, clearly distinguishing observation from inference.
- Keep setup instructions suitable for users who clone the repository and deploy their own Firebase project.
