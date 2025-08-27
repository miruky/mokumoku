// ポモドーロタイマーの状態機械。Dateを直接読まず、現在時刻は常に引数で受け取る。

export type Phase = 'focus' | 'short-break' | 'long-break';

export type Status = 'idle' | 'running' | 'paused';

export interface TimerConfig {
  /** 集中1本の長さ(分) */
  focusMin: number;
  /** 小休憩の長さ(分) */
  shortBreakMin: number;
  /** 長休憩の長さ(分) */
  longBreakMin: number;
  /** 何本の集中ごとに長休憩を入れるか */
  cyclesUntilLongBreak: number;
}

export const DEFAULT_CONFIG: TimerConfig = {
  focusMin: 25,
  shortBreakMin: 5,
  longBreakMin: 15,
  cyclesUntilLongBreak: 4,
};

export interface TimerState {
  phase: Phase;
  status: Status;
  /** running時のみ。フェーズが満了する時刻(epoch ms) */
  endsAt: number | null;
  /** idle/paused時の残り。runningでは endsAt から導出する */
  remainingMs: number;
  /** 現在のフェーズを始めた時刻。未開始ならnull */
  phaseStartedAt: number | null;
  /** 長休憩までのサイクル内で完了した集中の本数 */
  completedInCycle: number;
}

export function phaseDurationMs(config: TimerConfig, phase: Phase): number {
  const min =
    phase === 'focus'
      ? config.focusMin
      : phase === 'short-break'
        ? config.shortBreakMin
        : config.longBreakMin;
  return min * 60_000;
}

export function createTimer(config: TimerConfig): TimerState {
  return {
    phase: 'focus',
    status: 'idle',
    endsAt: null,
    remainingMs: phaseDurationMs(config, 'focus'),
    phaseStartedAt: null,
    completedInCycle: 0,
  };
}

export function start(state: TimerState, now: number): TimerState {
  if (state.status === 'running') return state;
  return {
    ...state,
    status: 'running',
    endsAt: now + state.remainingMs,
    phaseStartedAt: state.phaseStartedAt ?? now,
  };
}

export function pause(state: TimerState, now: number): TimerState {
  if (state.status !== 'running' || state.endsAt === null) return state;
  return {
    ...state,
    status: 'paused',
    endsAt: null,
    remainingMs: Math.max(0, state.endsAt - now),
  };
}

export function remainingMs(state: TimerState, now: number): number {
  if (state.status === 'running' && state.endsAt !== null) {
    return Math.max(0, state.endsAt - now);
  }
  return state.remainingMs;
}

/** フェーズ満了後に次のフェーズへ進める。集中後は休憩、休憩後は集中に戻る */
export function nextPhase(state: TimerState, config: TimerConfig): TimerState {
  let phase: Phase;
  let completed = state.completedInCycle;
  if (state.phase === 'focus') {
    completed += 1;
    phase = completed >= config.cyclesUntilLongBreak ? 'long-break' : 'short-break';
  } else {
    if (state.phase === 'long-break') completed = 0;
    phase = 'focus';
  }
  return {
    phase,
    status: 'idle',
    endsAt: null,
    remainingMs: phaseDurationMs(config, phase),
    phaseStartedAt: null,
    completedInCycle: completed,
  };
}

export interface TickResult {
  state: TimerState;
  /** このtickでフェーズが満了したらそのフェーズ。それ以外はnull */
  finished: Phase | null;
}

/** 時刻を進めて満了を判定する。満了時は次フェーズのidle状態に遷移する */
export function tick(state: TimerState, config: TimerConfig, now: number): TickResult {
  if (state.status !== 'running' || state.endsAt === null) {
    return { state, finished: null };
  }
  if (now < state.endsAt) {
    return { state, finished: null };
  }
  return { state: nextPhase(state, config), finished: state.phase };
}

/** 現在のフェーズを打ち切って次へ進める(スキップ) */
export function skip(state: TimerState, config: TimerConfig): TimerState {
  return nextPhase(state, config);
}

/** 現在のフェーズを最初からやり直す */
export function resetPhase(state: TimerState, config: TimerConfig): TimerState {
  return {
    ...state,
    status: 'idle',
    endsAt: null,
    remainingMs: phaseDurationMs(config, state.phase),
    phaseStartedAt: null,
  };
}

export function formatRemaining(ms: number): string {
  const totalSec = Math.ceil(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/** フェーズの経過割合(0〜1)。進捗リングの描画に使う */
export function progress(state: TimerState, config: TimerConfig, now: number): number {
  const total = phaseDurationMs(config, state.phase);
  if (total <= 0) return 1;
  return Math.min(1, Math.max(0, 1 - remainingMs(state, now) / total));
}

export function isValidConfig(c: TimerConfig): boolean {
  return (
    Number.isInteger(c.focusMin) &&
    Number.isInteger(c.shortBreakMin) &&
    Number.isInteger(c.longBreakMin) &&
    Number.isInteger(c.cyclesUntilLongBreak) &&
    c.focusMin >= 1 &&
    c.focusMin <= 120 &&
    c.shortBreakMin >= 1 &&
    c.shortBreakMin <= 60 &&
    c.longBreakMin >= 1 &&
    c.longBreakMin <= 120 &&
    c.cyclesUntilLongBreak >= 1 &&
    c.cyclesUntilLongBreak <= 12
  );
}
