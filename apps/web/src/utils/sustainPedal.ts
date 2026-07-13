export class SustainPedalState {
  private down = false;
  private readonly pressed = new Set<number>();
  private readonly releasedWhileDown = new Set<number>();

  get isDown(): boolean {
    return this.down;
  }

  noteOn(note: number): void {
    this.pressed.add(note);
    this.releasedWhileDown.delete(note);
  }

  noteOff(note: number): boolean {
    if (!this.pressed.has(note)) return false;
    this.pressed.delete(note);
    if (this.down) {
      this.releasedWhileDown.add(note);
      return false;
    }
    return true;
  }

  setDown(down: boolean): number[] {
    if (this.down === down) return [];
    this.down = down;
    if (down) return [];

    const notes = [...this.releasedWhileDown];
    this.releasedWhileDown.clear();
    return notes;
  }

  clear(): void {
    this.down = false;
    this.pressed.clear();
    this.releasedWhileDown.clear();
  }
}
