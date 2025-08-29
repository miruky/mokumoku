import { describe, expect, it } from 'vitest';
import {
  UNTITLED_TASK,
  createSession,
  createStore,
  deserializeSessions,
  durationMs,
  localDateKey,
  removeSession,
  serializeSessions,
  sessionsOn,
  summarizeByTask,
  totalMs,
  type Session,
} from './sessions';

const MIN = 60_000;
// ローカルタイムゾーン依存を避けるため、テスト内の時刻はすべて同一日の昼間に置く
const NOON = new Date(2026, 5, 12, 12, 0, 0).getTime();

function session(task: string, startOffsetMin: number, lengthMin: number): Session {
  const startedAt = NOON + startOffsetMin * MIN;
  return createSession(task, startedAt, startedAt + lengthMin * MIN);
}

describe('createSession', () => {
  it('作業名の前後空白を落とし、空なら名称未設定にする', () => {
    expect(createSession('  設計  ', NOON, NOON + MIN).task).toBe('設計');
    expect(createSession('   ', NOON, NOON + MIN).task).toBe(UNTITLED_TASK);
  });

  it('中断フラグを保持する', () => {
    expect(createSession('a', NOON, NOON + MIN, true).interrupted).toBe(true);
    expect(createSession('a', NOON, NOON + MIN).interrupted).toBe(false);
  });
});

describe('serialize / deserialize', () => {
  it('往復しても内容が変わらない', () => {
    const sessions = [session('実装', 0, 25), session('レビュー', 30, 25)];
    expect(deserializeSessions(serializeSessions(sessions))).toEqual(sessions);
  });

  it('壊れたJSONや配列でないJSONは空になる', () => {
    expect(deserializeSessions('{oops')).toEqual([]);
    expect(deserializeSessions('{"a":1}')).toEqual([]);
  });

  it('形の崩れた要素だけを読み飛ばす', () => {
    const ok = session('実装', 0, 25);
    const json = JSON.stringify([
      ok,
      { task: '', startedAt: 1, endedAt: 2, interrupted: false },
      { task: 'x', startedAt: 5, endedAt: 3, interrupted: false },
      { task: 'x', startedAt: 1, endedAt: 2 },
      'junk',
    ]);
    expect(deserializeSessions(json)).toEqual([ok]);
  });

  it('開始時刻の昇順に並べ直す', () => {
    const a = session('後', 60, 25);
    const b = session('先', 0, 25);
    expect(deserializeSessions(JSON.stringify([a, b]))).toEqual([b, a]);
  });
});

describe('localDateKey / sessionsOn', () => {
  it('ローカル日付でYYYY-MM-DDを返す', () => {
    expect(localDateKey(NOON)).toBe('2026-06-12');
  });

  it('指定日に開始したセッションだけを時系列で返す', () => {
    const today1 = session('a', 30, 25);
    const today2 = session('b', 0, 25);
    const yesterday = createSession('c', NOON - 24 * 60 * MIN, NOON - 24 * 60 * MIN + 25 * MIN);
    const result = sessionsOn([today1, yesterday, today2], '2026-06-12');
    expect(result).toEqual([today2, today1]);
  });
});

describe('summarizeByTask', () => {
  it('作業名ごとに本数と合計時間を集計し合計時間の降順で返す', () => {
    const sessions = [session('短い', 0, 10), session('長い', 20, 25), session('長い', 50, 25)];
    expect(summarizeByTask(sessions)).toEqual([
      { task: '長い', count: 2, totalMs: 50 * MIN },
      { task: '短い', count: 1, totalMs: 10 * MIN },
    ]);
  });
});

describe('durationMs / totalMs', () => {
  it('長さと合計を返す', () => {
    const s = session('a', 0, 25);
    expect(durationMs(s)).toBe(25 * MIN);
    expect(totalMs([s, session('b', 30, 5)])).toBe(30 * MIN);
  });
});

describe('removeSession', () => {
  it('開始時刻が一致する1件を取り除く', () => {
    const a = session('a', 0, 25);
    const b = session('b', 30, 25);
    const c = session('c', 60, 25);
    expect(removeSession([a, b, c], b.startedAt)).toEqual([a, c]);
  });

  it('一致がなければ元の配列をそのまま返す', () => {
    const a = session('a', 0, 25);
    expect(removeSession([a], a.startedAt + 1)).toEqual([a]);
  });
});

describe('createStore', () => {
  it('保存と読み出しがStorage経由で往復する', () => {
    const backing = new Map<string, string>();
    const store = createStore({
      getItem: (k) => backing.get(k) ?? null,
      setItem: (k, v) => void backing.set(k, v),
    });
    expect(store.load()).toEqual([]);
    const sessions = [session('実装', 0, 25)];
    store.save(sessions);
    expect(store.load()).toEqual(sessions);
  });
});
