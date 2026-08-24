# Get That Bag

A personal earnings-vs-obligations tracker. Log what you earn, log what's due,
and watch the weekly bars fill in as the money actually lands.

**Live:** https://k8thegreat99.github.io/Get-That-Bag/

## Where your data lives

In your browser. That's the whole story — there is no account, no server, and
no network request that carries a single number out of the device you're on.

That has a consequence worth being clear about: **the only copy that survives
clearing your browsing history, or switching phones, is a backup file.**
Settings → Backup downloads one. The app nags you if it's been more than three
weeks.

It also means the public URL is harmless. Someone who finds this page gets the
app with an empty dataset of their own. There is nothing of yours for them to
read, edit, or delete, because your entries never left your device.

## Install it

Open the link on your phone and use **Add to Home Screen** (Share menu on iOS,
the ⋮ menu on Android). You get an icon, no browser chrome, and it works with
no signal.

On iOS the home-screen app keeps its own storage, separate from the Safari tab.
Install it once and always open it from the icon — otherwise you'll be looking
at two different sets of data. This matters more than it sounds: Safari evicts
storage for sites you haven't opened as a first-party in about a week, and the
installed app is the durable one.

## How the numbers work

Money is poured into obligations **in date order**, and only money that has
already landed can cover them — an earning on the 20th doesn't back-fill a bill
that came due on the 5th. The running balance carries forward, including when
it's negative, which is what pulls later weeks down until earnings catch up.

- **Outline** — not covered yet
- **Solid** — covered by earnings
- **Hatched** — you've marked it actually paid

A bill projects forward from its next due date. Once a date has passed, its
amount is frozen, so raising the estimate later never rewrites what already
happened. `Spare` / `Short` in the header is the honest position for the month:
what carried in, plus what came in, minus everything owed.

## Layout

```
index.html            markup shell only
css/app.css           all styling, both themes
js/store.js           localStorage, validation, backup/restore
js/model.js           dates, money, bill projection, allocation
js/views.js           screen rendering (returns HTML strings)
js/sheets.js          the add/edit bottom sheets
js/charts.js          weekly bars + month ring, as SVG
js/app.js             boot, routing, event handling
sw.js                 offline caching
tools/make-icons.mjs  regenerates the PWA icons
```

`store.js` is the only module that touches persistence. If this ever needs to
sync across devices, that's the one file to swap.

## Working on it

It's plain ES modules — no build step, no dependencies. But `file://` won't
work (modules and service workers both need a real origin), so:

```sh
npx http-server . -p 8080
# then open http://localhost:8080
```

Pushing to `main` deploys via `.github/workflows/pages.yml`, which stamps the
commit SHA into the service worker cache name so returning visitors get offered
the new version instead of sitting on stale code.

Regenerate icons with `node tools/make-icons.mjs`.
