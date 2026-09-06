<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Repository rules

## Sources of truth

- Use `package.json` for supported versions and commands.
- Use `DESIGN.md` for visual decisions and the tweakcn theme contract.
- Use `components.json` for shadcn/ui aliases and conventions.
- Before changing Next.js behavior, read the relevant installed documentation under `node_modules/next/dist/docs/`.

## Keep implementation direct

- Prefer changing an existing file and following an existing pattern over introducing a new layer.
- Do not create a service, repository, adapter, wrapper, or custom hook for a single caller merely for possible reuse.
- Extract code when it removes real duplication or isolates a meaningful security, external-SDK, state, or test boundary.
- Avoid components and functions that only forward arguments. Every layer must own a clear responsibility.
- Keep data flow and call chains short. Do not design for hypothetical future requirements.
- Keep focused tests close to the implementation they cover.

## Framework and product boundaries

- Default to Server Components. Add `"use client"` only at the smallest boundary that needs browser state or events.
- Keep OpenAI calls and secrets in server code. Never expose `OPENAI_API_KEY`, `AUTH_SECRET`, or `DOORLOCK_PASSWORD` to the client.
- Reuse the existing Vercel AI SDK `useChat` and `streamText` flow instead of creating a parallel chat protocol.
- Keep `reasoningMode: "standard"` for chat. `reasoningMode: "pro"` was tested and delivers the whole answer as a single `text-delta` after the reasoning finishes, so the UI shows nothing until the end and streaming has no effect. Only `standard` streams incrementally.
- Preserve authentication, request validation, image-size limits, safe source filtering, and provider-error masking at API boundaries.
- Reuse `components/ui` and the existing shadcn/ui patterns before adding a primitive.
- Treat the tweakcn theme referenced by `DESIGN.md` as the token source. Do not introduce a parallel palette or arbitrary visual tokens.

## Verification

### Mandatory Luna-only application testing policy

- **Cost constraint: Luna is the ONLY permitted application LLM model during testing. This restriction does NOT apply to the models running coding agents or test/QA agents.**
- All test-related application LLM requests, including manual tests, automated tests, integration tests, end-to-end tests, smoke tests, and QA, MUST explicitly select Luna. Never inherit a production default or use Sol, Terra, or another model.
- Before making a real application LLM call in a test, verify that the request explicitly targets Luna.
- If the application's Luna model is unavailable or the request model cannot be verified, STOP the affected real-API test and report the blocker. **Never substitute another application model**, including for failures or retries. Mocked tests and checks that make no real LLM calls may continue.
- Prefer existing mocks and fixtures when a real LLM call is unnecessary. These incur no application LLM costs and do not require a live Luna model.
- Do not change the production model default merely to comply with this testing policy; select Luna at the test boundary.

### Required checks

- Run the focused test for the changed behavior, then `pnpm lint` and `pnpm typecheck`.
- Run `pnpm build` for routing, configuration, dependency, or production-boundary changes.
- Run the relevant Playwright test when a user-visible flow changes.
- Do not disable checks, suppress warnings, or weaken assertions to make verification pass.
