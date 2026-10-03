/** Minimal multi-listener event emitter. `on` returns its own unsubscribe. */
export class Emitter<Event> {
  private readonly listeners = new Set<(event: Event) => void>();

  on(listener: (event: Event) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  emit(event: Event): void {
    for (const listener of [...this.listeners]) listener(event);
  }
}
