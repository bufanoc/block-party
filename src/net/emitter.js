// Minimal event emitter shared by transports. Handlers receive the payload.
export class Emitter {
  constructor() {
    this._handlers = new Map(); // event -> Set<fn>
  }

  on(event, fn) {
    let set = this._handlers.get(event);
    if (!set) this._handlers.set(event, (set = new Set()));
    set.add(fn);
    return () => this.off(event, fn);
  }

  off(event, fn) {
    this._handlers.get(event)?.delete(fn);
  }

  emit(event, payload) {
    const set = this._handlers.get(event);
    if (!set) return;
    for (const fn of [...set]) fn(payload);
  }

  clearListeners() {
    this._handlers.clear();
  }
}
