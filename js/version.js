/**
 * Identifies the running build, shown in Settings → About.
 *
 * VERSION_NAME is bumped by hand and must match the version name on the
 * Linear session issue — that pairing is the point, since it lets the name on
 * the phone be checked against the name in the tracker.
 *
 * BUILD is rewritten from __BUILD__ to the commit SHA by the deploy workflow.
 * Served any other way (locally, or straight off a branch) it stays "dev".
 * Because this file is precached by the service worker along with everything
 * else, the SHA shown is the SHA of the code actually running — so a stale
 * cached copy reports the old SHA rather than silently looking current.
 */

export const VERSION_NAME = "Arepa 5";

const STAMP = "__BUILD__";
export const BUILD = STAMP.startsWith("__") ? "dev" : STAMP;
