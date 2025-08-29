import { describe, expect, it } from 'vitest';
import {
  DEFAULT_CONFIG,
  createTimer,
  formatRemaining,
  isValidConfig,
  nextPhase,
  pause,
  phaseDurationMs,
  progress,
  remainingMs,
  resetPhase,
  skip,
  start,
  tick,
  type TimerConfig,
} from './timer';

const config: TimerConfig = {
  focusMin: 25,
  shortBreakMin: 5,
  longBreakMin: 15,
  cyclesUntilLongBreak: 4,
  dailyGoal: 8,
};

const T0 = Date.UTC(2026, 0, 5, 9, 0, 0);
const MIN = 60_000;

describe('createTimer', () => {
  it('集中フェーズのidle状態で始まり残りは設定どおり', () => {
    const t = createTimer(config);
    expect(t.phase).toBe('focus');
    expect(t.status).toBe('idle');
    expect(t.remainingMs).toBe(25 * MIN);
    expect(t.completedInCycle).toBe(0);
  });
});

describe('start / pause', () => {
  it('startで満了時刻が残り時間ぶん先に設定される', () => {
    const t = start(createTimer(config), T0);
    expect(t.status).toBe('running');
    expect(t.endsAt).toBe(T0 + 25 * MIN);
    expect(t.phaseStartedAt).toBe(T0);
  });

  it('pauseで残り時間が固定され、再startで続きから進む', () => {
    let t = start(createTimer(config), T0);
    t = pause(t, T0 + 10 * MIN);
    expect(t.status).toBe('paused');
    expect(t.remainingMs).toBe(15 * MIN);
    t = start(t, T0 + 30 * MIN);
    expect(t.endsAt).toBe(T0 + 30 * MIN + 15 * MIN);
    expect(t.phaseStartedAt).toBe(T0);
  });

  it('running中のstartと、running以外のpauseは何もしない', () => {
    const running = start(createTimer(config), T0);
    expect(start(running, T0 + MIN)).toBe(running);
    const idle = createTimer(config);
    expect(pause(idle, T0)).toBe(idle);
  });
});

describe('remainingMs', () => {
  it('runningでは現在時刻から残りを導出し、負にならない', () => {
    const t = start(createTimer(config), T0);
    expect(remainingMs(t, T0 + 5 * MIN)).toBe(20 * MIN);
    expect(remainingMs(t, T0 + 60 * MIN)).toBe(0);
  });

  it('paused / idleでは固定値を返す', () => {
    const t = pause(start(createTimer(config), T0), T0 + MIN);
    expect(remainingMs(t, T0 + 100 * MIN)).toBe(24 * MIN);
  });
});

describe('tick', () => {
  it('満了前は何も起きない', () => {
    const t = start(createTimer(config), T0);
    const r = tick(t, config, T0 + 24 * MIN);
    expect(r.finished).toBeNull();
    expect(r.state).toBe(t);
  });

  it('集中の満了で小休憩のidleに遷移しfinishedを報告する', () => {
    const t = start(createTimer(config), T0);
    const r = tick(t, config, T0 + 25 * MIN);
    expect(r.finished).toBe('focus');
    expect(r.state.phase).toBe('short-break');
    expect(r.state.status).toBe('idle');
    expect(r.state.remainingMs).toBe(5 * MIN);
    expect(r.state.completedInCycle).toBe(1);
  });

  it('idle状態のtickは満了しない', () => {
    const t = createTimer(config);
    expect(tick(t, config, T0 + 100 * MIN).finished).toBeNull();
  });
});

describe('nextPhase のサイクル', () => {
  it('4本目の集中の後は長休憩になり、長休憩後にサイクルが巻き戻る', () => {
    let t = createTimer(config);
    for (let i = 0; i < 3; i++) {
      t = nextPhase(t, config); // focus -> short-break
      expect(t.phase).toBe('short-break');
      t = nextPhase(t, config); // short-break -> focus
      expect(t.phase).toBe('focus');
    }
    t = nextPhase(t, config); // 4本目の集中完了
    expect(t.phase).toBe('long-break');
    expect(t.remainingMs).toBe(15 * MIN);
    t = nextPhase(t, config);
    expect(t.phase).toBe('focus');
    expect(t.completedInCycle).toBe(0);
  });
});

describe('skip / resetPhase', () => {
  it('skipは集中を完了扱いにして休憩へ進める', () => {
    const t = skip(start(createTimer(config), T0), config);
    expect(t.phase).toBe('short-break');
    expect(t.completedInCycle).toBe(1);
  });

  it('resetPhaseは同じフェーズを最初から', () => {
    let t = start(createTimer(config), T0);
    t = resetPhase(pause(t, T0 + 10 * MIN), config);
    expect(t.phase).toBe('focus');
    expect(t.status).toBe('idle');
    expect(t.remainingMs).toBe(25 * MIN);
    expect(t.phaseStartedAt).toBeNull();
  });
});

describe('formatRemaining', () => {
  it('mm:ssで整形し、端数秒は切り上げる', () => {
    expect(formatRemaining(25 * MIN)).toBe('25:00');
    expect(formatRemaining(61_000)).toBe('01:01');
    expect(formatRemaining(500)).toBe('00:01');
    expect(formatRemaining(0)).toBe('00:00');
  });
});

describe('progress', () => {
  it('経過割合を0〜1で返す', () => {
    const t = start(createTimer(config), T0);
    expect(progress(t, config, T0)).toBe(0);
    expect(progress(t, config, T0 + 12.5 * MIN)).toBeCloseTo(0.5);
    expect(progress(t, config, T0 + 25 * MIN)).toBe(1);
  });
});

describe('isValidConfig', () => {
  it('範囲内の整数のみ許す', () => {
    expect(isValidConfig(DEFAULT_CONFIG)).toBe(true);
    expect(isValidConfig({ ...DEFAULT_CONFIG, focusMin: 0 })).toBe(false);
    expect(isValidConfig({ ...DEFAULT_CONFIG, shortBreakMin: 1.5 })).toBe(false);
    expect(isValidConfig({ ...DEFAULT_CONFIG, longBreakMin: 121 })).toBe(false);
    expect(isValidConfig({ ...DEFAULT_CONFIG, cyclesUntilLongBreak: 0 })).toBe(false);
    expect(isValidConfig({ ...DEFAULT_CONFIG, dailyGoal: 0 })).toBe(false);
    expect(isValidConfig({ ...DEFAULT_CONFIG, dailyGoal: 25 })).toBe(false);
    expect(isValidConfig({ ...DEFAULT_CONFIG, dailyGoal: 2.5 })).toBe(false);
  });
});

describe('phaseDurationMs', () => {
  it('フェーズごとの長さをmsで返す', () => {
    expect(phaseDurationMs(config, 'focus')).toBe(25 * MIN);
    expect(phaseDurationMs(config, 'short-break')).toBe(5 * MIN);
    expect(phaseDurationMs(config, 'long-break')).toBe(15 * MIN);
  });
});
