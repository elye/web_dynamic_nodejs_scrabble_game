export class Timer {
  private timers: Map<string, number> = new Map();
  private activePlayer: string | null = null;
  private interval: NodeJS.Timeout | null = null;
  private onTimeout: ((playerId: string) => void) | null = null;
  private onTick: ((timers: Map<string, number>) => void) | null = null;

  constructor(
    private timeLimitSeconds: number,
    onTimeout?: (playerId: string) => void,
    onTick?: (timers: Map<string, number>) => void
  ) {
    this.onTimeout = onTimeout || null;
    this.onTick = onTick || null;
  }

  addPlayer(playerId: string): void {
    this.timers.set(playerId, this.timeLimitSeconds);
  }

  removePlayer(playerId: string): void {
    this.timers.delete(playerId);
    if (this.activePlayer === playerId) {
      this.pause();
    }
  }

  startTurn(playerId: string): void {
    this.activePlayer = playerId;
    if (this.timeLimitSeconds === 0) return; // unlimited
    
    this.stopInterval();
    this.interval = setInterval(() => {
      if (!this.activePlayer) return;
      
      const remaining = (this.timers.get(this.activePlayer) || 0) - 1;
      this.timers.set(this.activePlayer, remaining);
      
      if (this.onTick) {
        this.onTick(this.timers);
      }
      
      if (remaining <= 0 && remaining % 60 === 0) {
        // Fire timeout callback at 0, -60, -120, etc.
        if (this.onTimeout) {
          this.onTimeout(this.activePlayer);
        }
        // If game didn't end (penalty mode), keep ticking
        if (!this.interval) return;
      }
    }, 1000);
  }

  pause(): void {
    this.stopInterval();
    this.activePlayer = null;
  }

  pauseCurrentPlayer(): void {
    this.stopInterval();
    // Keep activePlayer set so we know whose turn it is
  }

  resumeCurrentPlayer(): void {
    if (this.activePlayer && this.timeLimitSeconds > 0) {
      this.stopInterval();
      this.interval = setInterval(() => {
        if (!this.activePlayer) return;
        
        const remaining = (this.timers.get(this.activePlayer) || 0) - 1;
        this.timers.set(this.activePlayer, remaining);
        
        if (this.onTick) {
          this.onTick(this.timers);
        }
        
        if (remaining <= 0 && remaining % 60 === 0) {
          if (this.onTimeout) {
            this.onTimeout(this.activePlayer);
          }
          if (!this.interval) return;
        }
      }, 1000);
    }
  }

  getActivePlayer(): string | null {
    return this.activePlayer;
  }

  private stopInterval(): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }

  getRemaining(playerId: string): number {
    return this.timers.get(playerId) || 0;
  }

  getAllTimers(): { [playerId: string]: number } {
    const result: { [playerId: string]: number } = {};
    for (const [id, time] of this.timers) {
      result[id] = time;
    }
    return result;
  }

  isUnlimited(): boolean {
    return this.timeLimitSeconds === 0;
  }

  destroy(): void {
    this.stopInterval();
    this.timers.clear();
    this.activePlayer = null;
  }
}
