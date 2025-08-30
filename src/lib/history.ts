// 直近の日ごとの集中本数と、目標達成の連続日数。日付はローカルタイムで数える。

import { localDateKey, type Session } from './sessions';

export interface DayCount {
  /** YYYY-MM-DD */
  date: string;
  count: number;
  totalMs: number;
}

function shiftDay(dateKey: string, delta: number): string {
  const [y, m, d] = dateKey.split('-').map(Number);
  const dt = new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1);
  dt.setDate(dt.getDate() + delta);
  return localDateKey(dt.getTime());
}

/** todayKeyを末尾に、過去days日分の日付キーを昇順で返す。 */
export function recentDays(todayKey: string, days: number): string[] {
  const out: string[] = [];
  for (let i = days - 1; i >= 0; i--) out.push(shiftDay(todayKey, -i));
  return out;
}

function countByDay(sessions: Session[]): Map<string, { count: number; totalMs: number }> {
  const map = new Map<string, { count: number; totalMs: number }>();
  for (const s of sessions) {
    const key = localDateKey(s.startedAt);
    const entry = map.get(key) ?? { count: 0, totalMs: 0 };
    entry.count += 1;
    entry.totalMs += s.endedAt - s.startedAt;
    map.set(key, entry);
  }
  return map;
}

/** 直近days日の日ごとの本数と合計時間。記録の無い日は0で埋める。 */
export function dailyCounts(sessions: Session[], todayKey: string, days: number): DayCount[] {
  const map = countByDay(sessions);
  return recentDays(todayKey, days).map((date) => {
    const entry = map.get(date);
    return { date, count: entry?.count ?? 0, totalMs: entry?.totalMs ?? 0 };
  });
}

/**
 * 目標本数に届いた日が何日続いているかを数える。
 * 今日がまだ目標未達なら「進行中」とみなし、昨日から遡って数える。
 */
export function goalStreak(sessions: Session[], todayKey: string, goal: number): number {
  if (goal <= 0) return 0;
  const map = countByDay(sessions);
  const countOf = (key: string): number => map.get(key)?.count ?? 0;
  let cursor = todayKey;
  if (countOf(cursor) < goal) cursor = shiftDay(cursor, -1);
  let streak = 0;
  while (countOf(cursor) >= goal) {
    streak += 1;
    cursor = shiftDay(cursor, -1);
  }
  return streak;
}
