/**
 * A 40-line typed event bus. Modules talk to the world through this instead of
 * importing each other, which is what lets six teams work in parallel without
 * touching the same files.
 *
 * Owned by: the world (nobody needs to change this).
 */

export type Unsubscribe = () => void;

/** Map of event name → payload type. See `WorldEvents` in contracts.ts. */
export type EventMap = Record<string, unknown>;

export class Emitter<M extends EventMap> {
  private handlers = new Map<keyof M, Set<(payload: never) => void>>();

  on<K extends keyof M>(event: K, cb: (payload: M[K]) => void): Unsubscribe {
    let set = this.handlers.get(event);
    if (!set) {
      set = new Set();
      this.handlers.set(event, set);
    }
    set.add(cb as (payload: never) => void);
    return () => {
      set!.delete(cb as (payload: never) => void);
    };
  }

  /** Fires once, then unsubscribes itself. */
  once<K extends keyof M>(event: K, cb: (payload: M[K]) => void): Unsubscribe {
    const off = this.on(event, (payload) => {
      off();
      cb(payload);
    });
    return off;
  }

  emit<K extends keyof M>(event: K, payload: M[K]): void {
    const set = this.handlers.get(event);
    if (!set) return;
    // Copy first: a handler is allowed to unsubscribe itself mid-emit.
    for (const cb of [...set]) {
      try {
        (cb as (p: M[K]) => void)(payload);
      } catch (err) {
        // One broken listener must not take the render loop down with it.
        console.error(`[events] handler for "${String(event)}" threw:`, err);
      }
    }
  }
}
