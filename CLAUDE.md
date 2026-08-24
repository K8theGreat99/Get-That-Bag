# Working with me on this repo

## How to talk to me

- **Don't use the multiple-choice question menu.** It works badly on the mobile
  app, and it traps me when I want to give a long answer or ask something back
  before I can answer the first question. If you have questions, just list them
  as plain text in the chat and I'll answer in prose, in whatever order I like.
- **I use voice-to-text, so expect transcription errors.** When I catch one I
  usually just repeat myself — so if you see a doubled word or phrase where the
  first one doesn't make sense ("wood should have been what"), the *second* one
  is what I meant. Don't stop to ask about it.
- Give me a recommendation, not a survey of options.

## What this project is

A personal finance PWA on GitHub Pages: earnings tracked against upcoming
bills. All data is in `localStorage` on my device.

## Things not to get wrong

- **There is no backend and no auth, deliberately.** GitHub Pages is static
  hosting, so a client-side PIN would be decoration — anyone can read the JS.
  It isn't needed either: with `localStorage` there's no shared write surface
  to attack. A stranger who finds the URL gets an empty app in their own
  browser. Don't add a login.
- **The real risk is data loss, not intruders.** Safari evicts storage for
  sites not opened as a first-party for ~7 days; clearing history wipes it.
  That's why the backup export, the staleness nag, and
  `navigator.storage.persist()` exist. Don't quietly weaken any of them.
- **`store.js` owns persistence.** Nothing else should touch `localStorage`
  (the theme preference is the one exception). Keeping that boundary is what
  makes a future sync backend a one-file change.
- **Rendering must stay side-effect free.** `views.js` and `charts.js` return
  HTML strings and mutate nothing. Colors get assigned when a record is
  created (`ensureColor`), never at draw time — an earlier version assigned
  them during render and colors drifted between reloads.
- **Allocation is chronological.** Earnings cover obligations in date order and
  can't back-fill anything dated earlier. The balance is allowed to go
  negative and carry. If a change makes past shortfalls disappear, it's wrong.
- **Frozen history.** Once a bill occurrence's date has passed, `lockPast()`
  pins its amount in `S.inst`. Editing the estimate must never rewrite it.

## Conventions

- Plain ES modules, no build step, no dependencies. Keep it that way.
- Relative paths everywhere — the site is served from a `/Get-That-Bag/`
  subpath, so a leading `/` breaks it.
- Every color goes through a CSS custom property so both themes follow. Don't
  hardcode hex values in CSS or in SVG attributes; use classes on SVG elements.
- Inputs stay at `font-size: 16px` or iOS zooms on focus.
- Bump nothing by hand for cache-busting — the deploy workflow stamps the
  commit SHA into `sw.js`.

## Testing

No test framework. Verify changes by driving the real app:

```sh
npx http-server . -p 8080
```

Then use Playwright (global at `/opt/node22/lib/node_modules/playwright`) with
Chromium at `/opt/pw-browsers/chromium-1194/chrome-linux/chrome`. Check the
console for errors, and screenshot both themes plus a desktop width — several
real bugs in this codebase were only visible in a screenshot, not in the DOM.

When seeding test data into `localStorage`, write it from a *different* page
first, then navigate to the app. Seeding on the app's own page and reloading
loses the write: `pagehide` flushes the in-memory state over it.

## Network limits in the remote session

The egress proxy blocks `k8thegreat99.github.io`, so the deployed site cannot
be fetched from the session. Verify a deploy by checking the workflow run with
the `mcp__github__*` tools, then report the expected version name and build SHA
and let the user confirm in Settings → About on their device.

`api.github.com` is reachable, but unauthenticated requests share an egress IP
whose rate limit is usually already exhausted — they return a rate-limit JSON
body rather than an error, so a `curl` poll looks like it is hanging when it is
really being refused. Use the `mcp__github__*` tools, which are authenticated.

Reachable and safe to use: `registry.npmjs.org`, `fonts.googleapis.com`,
`fonts.gstatic.com`, `raw.githubusercontent.com`, `github.com`, `pypi.org`.

Git push credentials have gone away mid-session before, with
`could not read Username for 'https://github.com'` and no credential helper
configured. Reads still work. When that happens, push with
`mcp__github__push_files` (one file per call) and then diff the result against
the local copy via `raw.githubusercontent.com` before trusting it.
