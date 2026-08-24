---
name: session-tracking
description: Record Claude Code work on Get That Bag as Linear issues in the K8theGreat workspace — one root issue per session, sub-issues for later rounds of work, each carrying a pseudo-YAML header with branch, versionCode, versionName, and commit SHA. Use at the start of a session, when the user returns with feedback after testing, when work is about to merge to main, or when the user mentions session tracking, version codes, version names, or logging work in Linear.
---

# Session tracking in Linear

Work on this repo is recorded as Linear issues. This skill covers Get That Bag
specifically; it is adapted from the Linear document "Session Tracking in
Linear", which is written for Android projects.

**Workspace:** K8theGreat · **Team:** K8theGreat (`K8T-`) · **Project:** Get That Bag

## Purpose and tone

The goal is a readable record of what was done, not compliance with a spec.
Where a rule below is ambiguous for the situation in front of you, use your
judgment and keep going. Getting a borderline call "wrong" costs nothing.

## The model

- One Claude Code session = one working branch = one **root issue**.
- Each later round of work in that session = one **sub-issue** of the root.

A "round of work" is one batch of feedback the user hands over — typically
after testing the app — that you act on and push. It is a round, not a bug: if
the user reports five problems and you fix them in one go, that is one
sub-issue with five items in it. If a single round takes several pushes, keep
one sub-issue and update its `commit:` to the final SHA.

Use judgment on the edges. A one-line typo fix probably does not need its own
sub-issue; a session that runs long with several distinct rounds probably
should have one per round. If unsure, create it — an extra sub-issue is
cheaper than a lost record.

## The pseudo-YAML block

Every issue, root and sub alike, opens its description with this block. It is
the source of truth; the title is a display copy derived from it.

```
---
branch: claude/upload-index-html-ucnkqo
issueId: K8T-25
versionCode: 001
versionName: Arepa
commit: c1d27e4
issueOverview: {What is this session or round about? 1-3 sentences.}
---
```

Field notes for this project:

- **`commit`** replaces the `buildNumber` field from the Linear document.
  There is no build system here — GitHub Pages serves a commit directly, and
  the deploy workflow stamps that SHA into the service worker cache name, so
  the short SHA identifies the deployed version. Use the SHA the issue's work
  ended at, and update it if later commits extend that work.
- **`versionCode`** is a plain counter, per project, zero-padded to three
  digits here but not in the title. It is not an Android version code and has
  no meaning to any build system. It increments across root issues and
  sub-issues alike.
- **`versionName`** identifies what code is running. See "Version names"
  below — it is usually a number bump, not a new name.
- **`issueId`** is filled in from the create response, which means creating an
  issue takes two calls: `save_issue` to create, then `save_issue` with
  `patch` to write the returned identifier into the block.

Linear reformats the `---` block into a ```yaml code block on save. Field
values are unaffected.

## Title format

```
{versionCode}. {short description} | {food emoji} {versionName}
```

Example: `1. Rebuild artifact draft as a localStorage PWA | 🫓 Arepa`

`versionCode` is not zero-padded in the title. Long titles are fine; the
project list view shows up to three lines.

## Version names

The version name identifies what code is running. Its main job is letting the
user check the name shown in the app against the name in Linear, to confirm a
change actually reached the device instead of a stale cached copy.

The name does **not** change with each session, branch, or context window.

- **Code changed** — bump the integer. `Arepa 2` becomes `Arepa 3`.
- **Documentation only, no code change** — bump by 0.1. `Arepa 3` becomes
  `Arepa 3.1`.
- **A new feature or a radical overhaul** — move to the next food name,
  alphabetically. `Arepa` becomes `Brioche`. Adding receipt capture with OCR
  would qualify. Fixing a bug or restyling a screen would not.
- **Trivial change**, such as a typo fix — no bump needed.

A new session does not reset or advance the name by itself. If the last session
ended at `Arepa 3` and today's session fixes a bug, today is `Arepa 4`.

When bumping the name, update `VERSION_NAME` in `js/version.js` in the same
commit. The app shows it in Settings → About, and the check the user performs
is comparing that to the Linear title — which only works if they match.

Judgment applies here too. When making many small changes in quick succession,
or while a project is still being set up, do not bump for every one.
Incrementing by 0.1 for each successive edit to CLAUDE.md adds noise without
adding information.

The point of a bump is that the Linear issue list can be scanned later and the
kind of change each session made is visible from the title alone, without
opening anything. Bump when that record would be worth having. A session that
did nothing but documentation work is worth a 0.1. A passing doc tweak inside a
session of code work is not.

## At session start

**1. Find the next versionCode.**

```
list_issues(project: "Get That Bag", orderBy: "createdAt", limit: 5,
            fields: ["id","title","description","status"])
```

Read `versionCode` from each pseudo-YAML block; the highest is current. Use the
next number up. If the user states a version code, theirs wins.

Do not look at other Linear projects to infer conventions. Much of that data is
experimental and does not reflect current rules.

**2. Determine the versionName.** Read it from the most recent issue in this
project and apply the rules in "Version names". Usually this means bumping a
number, not choosing a new name.

**3. Create the root issue.**

- Project: Get That Bag · Team: K8theGreat
- Priority: **High** (2)
- Status: **In Progress**
- Labels: **`session`** and nothing else
- Description: the pseudo-YAML block, then this skeleton:

```
## Log notes

**What I worked on**

**Learnings**

**Workflow notes / things to improve**
```

The log notes belong to the user. Set up the headings and leave them empty —
do not write summaries into them.

## During the session

When the user returns with a round of feedback, create a sub-issue:

- `parentId`: the root issue
- Priority: **No priority** (0)
- Status: **In Progress**
- Labels: **`session`**
- Description: its own pseudo-YAML block — same `branch`, next `versionCode`,
  the `versionName` for this round, its own `issueId` and `commit`

## Closing issues

Put the magic word in the commit that finishes each issue's work, rather than
saving them all for one commit at the end:

```
Fixes K8T-26

Session 1 — Arepa 2. Fix the week scale and the ledger ordering.
```

Any of `fixes` / `closes` / `resolves` works, and the ID list follows the word.
Linear acts on it once the commit reaches `main`.

Two caveats worth knowing:

- This only fires on a **fast-forward merge**, which preserves commit
  messages. A squash merge through a GitHub PR rewrites them and the magic
  word is lost.
- Closing is not dependent on git at all. `save_issue(id: "K8T-26", state:
  "Done")` works any time, and is the fix if a merge does not close something.

## Labels

Session issues carry `session` only. Other labels in this workspace serve
different issue types — do not apply them here, and do not apply any label this
skill does not name.
