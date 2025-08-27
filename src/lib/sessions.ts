// 完了した集中セッションの台帳。永続化先(localStorage等)は外から渡す。

export interface Session {
  /** 取り組んだ作業の名前 */
  task: string;
  /** 開始時刻(epoch ms) */
  startedAt: number;
  /** 終了時刻(epoch ms) */
  endedAt: number;
  /** 満了前に打ち切った場合true */
  interrupted: boolean;
}

export const UNTITLED_TASK = '(名称未設定)';

/** 記録に値する最短の長さ。これ未満の中断は捨てる */
export const MIN_SESSION_MS = 60_000;

export function createSession(
  task: string,
  startedAt: number,
  endedAt: number,
  interrupted = false,
): Session {
  const name = task.trim();
  return {
    task: name === '' ? UNTITLED_TASK : name,
    startedAt,
    endedAt,
    interrupted,
  };
}

export function durationMs(s: Session): number {
  return s.endedAt - s.startedAt;
}

function isSession(value: unknown): value is Session {
  if (typeof value !== 'object' || value === null) return false;
  const s = value as Record<string, unknown>;
  return (
    typeof s.task === 'string' &&
    s.task.length > 0 &&
    typeof s.startedAt === 'number' &&
    typeof s.endedAt === 'number' &&
    Number.isFinite(s.startedAt) &&
    Number.isFinite(s.endedAt) &&
    s.endedAt > s.startedAt &&
    typeof s.interrupted === 'boolean'
  );
}

/** JSON文字列から台帳を復元する。形の崩れた要素は読み飛ばす */
export function deserializeSessions(json: string): Session[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  return parsed.filter(isSession).sort((a, b) => a.startedAt - b.startedAt);
}

export function serializeSessions(sessions: Session[]): string {
  return JSON.stringify(sessions);
}

/** ローカルタイムゾーンでの日付キー(YYYY-MM-DD) */
export function localDateKey(epochMs: number): string {
  const d = new Date(epochMs);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** 指定日(YYYY-MM-DD)に開始したセッションを時系列で返す */
export function sessionsOn(sessions: Session[], dateKey: string): Session[] {
  return sessions
    .filter((s) => localDateKey(s.startedAt) === dateKey)
    .sort((a, b) => a.startedAt - b.startedAt);
}

export interface TaskSummary {
  task: string;
  count: number;
  totalMs: number;
}

/** 作業名ごとに本数と合計時間を集計し、合計時間の降順で返す */
export function summarizeByTask(sessions: Session[]): TaskSummary[] {
  const map = new Map<string, TaskSummary>();
  for (const s of sessions) {
    const entry = map.get(s.task) ?? { task: s.task, count: 0, totalMs: 0 };
    entry.count += 1;
    entry.totalMs += durationMs(s);
    map.set(s.task, entry);
  }
  return [...map.values()].sort((a, b) => b.totalMs - a.totalMs);
}

export function totalMs(sessions: Session[]): number {
  return sessions.reduce((acc, s) => acc + durationMs(s), 0);
}

export interface SessionStore {
  load(): Session[];
  save(sessions: Session[]): void;
}

const STORAGE_KEY = 'mokumoku.sessions.v1';

interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export function createStore(storage: StorageLike): SessionStore {
  return {
    load() {
      const raw = storage.getItem(STORAGE_KEY);
      return raw === null ? [] : deserializeSessions(raw);
    },
    save(sessions) {
      storage.setItem(STORAGE_KEY, serializeSessions(sessions));
    },
  };
}
