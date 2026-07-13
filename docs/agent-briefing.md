# Agent briefing — read before implementing anything in this repo

Paste this into (or reference it from) every subagent / Codex task prompt. These are real bugs that have already shipped or been caught late in *this* codebase. They are cheap to avoid up front and expensive to find in review.

## The meta-lesson

Most bugs here were not "the model was careless." They were **spec errors executed faithfully** or **adversarial concerns nobody put in the spec**. So: if the task tells you to do something that looks wrong, say so instead of implementing it. You are expected to push back.

## Security / privacy

- **Never trust a client's `Content-Type`.** Sniff magic bytes for any uploaded file.
- **Never return a filesystem path to a client.** Serve by opaque id. (A `notation_path` leak was caught just before shipping.)
- **Never put user free text in a URL / query string.** URLs land in Caddy/nginx access logs and browser history. Feedback messages (up to 2000 chars) belong in a JSON body. Short, non-sensitive metadata in a query string is fine — know the difference.
- **Multi-user means adversarial.** Any route that mutates a row identified by an id from the request MUST check the caller owns it. Ask "what if a different user sends this id?" (One user could overwrite another's feedback screenshot.)
- Admin-only routes must reuse the existing `requireAdmin` middleware, never a hand-rolled check.

## React

- **Do not put per-keypress / high-frequency state on a shared context value.** It re-renders every consumer. A note-on fires on every key press; putting it on `MidiContext` re-rendered the 88-key `VirtualPiano`, `PlayAlongPage` and `MidiExercise` on every press just to flash one dot. Subscribe locally instead.
- **Do not add an "already ran" `useRef` guard on top of a `useEffect` dependency array** unless you've verified it survives React 18 StrictMode's double-invoke. That exact pattern silently broke `OsmdNotation.tsx` (mount→cleanup→mount: the throwaway first mount set the ref, so the real mount skipped). The dependency array is usually sufficient.
- **Always disconnect `ResizeObserver` / remove listeners in the effect cleanup.** A resize-listener leak has already been fixed here once.
- `scrollIntoView({ behavior: "smooth" })` driven by a fast-updating interval (~120ms) never actually moves the page — each call restarts the previous animation. Use `behavior: "auto"` for auto-follow scrolling.

## Browser / API integration

- **Any custom response header a client reads via `response.headers.get(...)` must be added to `cors({ exposedHeaders: [...] })` in `apps/api/src/app.ts`.** Custom headers are not CORS-safelisted. `curl` ignores CORS and will not catch this — only a real cross-origin browser fetch will.
- **Web MIDI requires a secure context.** `navigator.requestMIDIAccess` does not exist on plain HTTP to a non-localhost address. `localhost` is a secure context; `http://192.168.4.4:...` is not.
- **MIDI cannot report a key count.** `MIDIInput` exposes only `id`, `name`, `manufacturer`, `state`, `connection`. Any key-range logic is inference, not detection.
- **A replugged MIDI device is a brand-new `MIDIInput` object.** You must re-bind `onmidimessage` on `statechange`, or the reconnected keyboard reports as connected and sends nothing.

## Magic numbers

- Don't "fix" a layout clipping bug by bumping a hardcoded `max-h`. `NotationPreviewStrip` was clipped because the cap was too small, got raised, and then was too tall. Size to content instead of guessing a number in either direction.

## Verification — this is the big one

- **`pnpm -r typecheck` and `pnpm -r test` passing is NOT sufficient evidence that the feature works.** Every serious bug in this project's history was invisible to both.
- Verify against **real Postgres and a real browser**. Codex's sandbox has no Docker/Postgres/network, so it *cannot* do this — its "tests passed" claim is never sufficient on its own.
- Do not claim something works if you have not observed it working. Say plainly what you did and did not verify.
