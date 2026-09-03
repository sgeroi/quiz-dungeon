const timers = new Map<string, { interval: ReturnType<typeof setInterval> }>();

export function startTimer(
  roomCode: string,
  seconds: number,
  onTick: (remaining: number) => void,
  onEnd: () => void,
): void {
  clearTimer(roomCode);

  let remaining = seconds;

  const interval = setInterval(() => {
    remaining--;
    if (remaining <= 0) {
      clearTimer(roomCode);
      onEnd();
    } else {
      onTick(remaining);
    }
  }, 1000);

  timers.set(roomCode, { interval });
}

export function clearTimer(roomCode: string): void {
  const entry = timers.get(roomCode);
  if (entry) {
    clearInterval(entry.interval);
    timers.delete(roomCode);
  }
}
