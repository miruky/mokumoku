// 1日分のセッションからMarkdownの日報を組み立てる。

import { summarizeByTask, totalMs, type Session } from './sessions';

const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'] as const;

/** 90分 -> 「1時間30分」。1分未満は切り捨てるが、0にはせず「1分未満」とする */
export function formatDurationJa(ms: number): string {
  const totalMin = Math.floor(ms / 60_000);
  if (totalMin < 1) return '1分未満';
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h === 0) return `${m}分`;
  if (m === 0) return `${h}時間`;
  return `${h}時間${m}分`;
}

export function formatClock(epochMs: number): string {
  const d = new Date(epochMs);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** 「2026-06-12」-> 「2026-06-12(金)」 */
export function formatDateHeading(dateKey: string): string {
  const [y, m, d] = dateKey.split('-').map(Number);
  if (y === undefined || m === undefined || d === undefined) return dateKey;
  const date = new Date(y, m - 1, d);
  return `${dateKey}(${WEEKDAYS[date.getDay()]})`;
}

/**
 * 日報をMarkdownで生成する。
 * セッションは同一日のものを時系列で渡すこと(sessionsOnの出力をそのまま使う)。
 * footerNoteを渡すと、末尾に区切りつきで添える(直近7日の集計など)。
 */
export function buildDailyReport(dateKey: string, sessions: Session[], footerNote?: string): string {
  const lines: string[] = [`# 日報 ${formatDateHeading(dateKey)}`, ''];

  if (sessions.length === 0) {
    lines.push('記録された集中セッションはありません。', '');
  } else {
    const first = sessions[0];
    const last = sessions[sessions.length - 1];
    const count = sessions.length;
    const interrupted = sessions.filter((s) => s.interrupted).length;
    const summary =
      `集中 ${count}本` +
      (interrupted > 0 ? `(うち中断 ${interrupted}本)` : '') +
      ` / 合計 ${formatDurationJa(totalMs(sessions))}` +
      (first && last ? ` / ${formatClock(first.startedAt)} - ${formatClock(last.endedAt)}` : '');
    lines.push(summary, '');

    lines.push('## 取り組んだこと', '');
    for (const t of summarizeByTask(sessions)) {
      lines.push(`- ${t.task} — ${t.count}本(${formatDurationJa(t.totalMs)})`);
    }
    lines.push('');

    lines.push('## タイムライン', '');
    for (const s of sessions) {
      const mark = s.interrupted ? ' ※中断' : '';
      lines.push(`- ${formatClock(s.startedAt)}-${formatClock(s.endedAt)} ${s.task}${mark}`);
    }
    lines.push('');
  }

  if (footerNote !== undefined && footerNote !== '') {
    lines.push('---', '', footerNote, '');
  }

  return lines.join('\n');
}

/** 日報ファイル名。例: nippou-2026-06-12.md */
export function reportFilename(dateKey: string): string {
  return `nippou-${dateKey}.md`;
}
