/**
 * THE global mutation lock. Since the storage contracts went async, "the whole
 * check-and-write is synchronous, so it can't race" no longer holds: every
 * `await` is a potential interleaving point. This queue restores the old
 * semantics for a one-admin workload: all mutations (admin actions AND public
 * registration) run strictly one after another, while reads stay lock-free.
 *
 * Rules (see also storage/contracts.ts):
 *  - Only route-facing service entry points take the lock. It is NOT
 *    reentrant - a locked function calling another locked function deadlocks
 *    (generateGroupFixtures -> createMatch is the canonical case; internal
 *    helpers must stay lock-free).
 *  - Broadcast payload recomputation stays OUTSIDE the lock (routes do it
 *    after the service call returns), so reads never queue behind writes.
 *  - No non-repository await inside the locked section: no hashing, no
 *    network. Hash passwords BEFORE entering.
 */
let tail: Promise<unknown> = Promise.resolve();

export function withMutationLock<T>(fn: () => Promise<T>): Promise<T> {
  const run = tail.then(fn);
  // The queue itself must survive a rejected mutation - swallow here (tail
  // never rejects); the caller still gets the rejection through `run`.
  tail = run.catch(() => undefined);
  return run;
}
