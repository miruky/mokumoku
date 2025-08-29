import { describe, expect, it } from 'vitest';
import { goalProgress } from './goal';

describe('goalProgress', () => {
  it('途中経過は達成率と残り本数を返す', () => {
    const p = goalProgress(3, 8);
    expect(p.done).toBe(3);
    expect(p.goal).toBe(8);
    expect(p.ratio).toBeCloseTo(0.375);
    expect(p.remaining).toBe(5);
    expect(p.met).toBe(false);
  });

  it('目標ちょうどで達成になる', () => {
    const p = goalProgress(8, 8);
    expect(p.ratio).toBe(1);
    expect(p.remaining).toBe(0);
    expect(p.met).toBe(true);
  });

  it('目標を超えてもratioは1で頭打ち、残りは0', () => {
    const p = goalProgress(11, 8);
    expect(p.ratio).toBe(1);
    expect(p.remaining).toBe(0);
    expect(p.met).toBe(true);
  });

  it('目標0以下は0除算せず常に達成扱い', () => {
    expect(goalProgress(0, 0)).toEqual({ done: 0, goal: 0, ratio: 1, remaining: 0, met: true });
    expect(goalProgress(2, -3).met).toBe(true);
  });

  it('負やゼロの実績はクランプして扱う', () => {
    const p = goalProgress(-2, 5);
    expect(p.done).toBe(0);
    expect(p.ratio).toBe(0);
    expect(p.remaining).toBe(5);
  });
});
