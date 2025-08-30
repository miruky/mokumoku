import { describe, expect, it } from 'vitest';
import { createSession, type Session } from './sessions';
import { recentDays, dailyCounts, goalStreak } from './history';

const MIN = 60_000;

/** 指定日(ローカル)の朝9時から25分のセッションをn本作る */
function focusOn(year: number, month: number, day: number, n: number): Session[] {
  const out: Session[] = [];
  for (let i = 0; i < n; i++) {
    const start = new Date(year, month - 1, day, 9, i * 30, 0).getTime();
    out.push(createSession('作業', start, start + 25 * MIN));
  }
  return out;
}

describe('recentDays', () => {
  it('末尾を今日として昇順の日付列を返す', () => {
    expect(recentDays('2026-06-12', 3)).toEqual(['2026-06-10', '2026-06-11', '2026-06-12']);
  });

  it('月をまたいでも正しく遡る', () => {
    expect(recentDays('2026-03-01', 2)).toEqual(['2026-02-28', '2026-03-01']);
  });
});

describe('dailyCounts', () => {
  it('記録のある日は本数、無い日は0で埋める', () => {
    const sessions = [...focusOn(2026, 6, 10, 2), ...focusOn(2026, 6, 12, 1)];
    const counts = dailyCounts(sessions, '2026-06-12', 3);
    expect(counts.map((d) => d.count)).toEqual([2, 0, 1]);
    expect(counts[0]?.date).toBe('2026-06-10');
    expect(counts[0]?.totalMs).toBe(50 * MIN);
  });
});

describe('goalStreak', () => {
  it('今日を含めて連続達成日数を数える', () => {
    const sessions = [
      ...focusOn(2026, 6, 10, 4),
      ...focusOn(2026, 6, 11, 4),
      ...focusOn(2026, 6, 12, 4),
    ];
    expect(goalStreak(sessions, '2026-06-12', 4)).toBe(3);
  });

  it('今日が未達なら進行中とみなし昨日から数える', () => {
    const sessions = [...focusOn(2026, 6, 11, 4), ...focusOn(2026, 6, 12, 1)];
    expect(goalStreak(sessions, '2026-06-12', 4)).toBe(1);
  });

  it('達成が途切れた日で止まる', () => {
    const sessions = [
      ...focusOn(2026, 6, 9, 4),
      ...focusOn(2026, 6, 10, 1),
      ...focusOn(2026, 6, 11, 4),
      ...focusOn(2026, 6, 12, 4),
    ];
    expect(goalStreak(sessions, '2026-06-12', 4)).toBe(2);
  });

  it('目標が0以下なら0', () => {
    expect(goalStreak(focusOn(2026, 6, 12, 3), '2026-06-12', 0)).toBe(0);
  });
});
