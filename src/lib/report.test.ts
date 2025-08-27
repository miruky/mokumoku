import { describe, expect, it } from 'vitest';
import {
  buildDailyReport,
  formatClock,
  formatDateHeading,
  formatDurationJa,
  reportFilename,
} from './report';
import { createSession } from './sessions';

const MIN = 60_000;
const NINE = new Date(2026, 5, 12, 9, 0, 0).getTime();

describe('formatDurationJa', () => {
  it('時間と分を日本語で整形する', () => {
    expect(formatDurationJa(25 * MIN)).toBe('25分');
    expect(formatDurationJa(60 * MIN)).toBe('1時間');
    expect(formatDurationJa(90 * MIN)).toBe('1時間30分');
    expect(formatDurationJa(30_000)).toBe('1分未満');
  });
});

describe('formatClock', () => {
  it('HH:MMで整形する', () => {
    expect(formatClock(NINE)).toBe('09:00');
    expect(formatClock(NINE + 65 * MIN)).toBe('10:05');
  });
});

describe('formatDateHeading', () => {
  it('日付キーに曜日を添える', () => {
    expect(formatDateHeading('2026-06-12')).toBe('2026-06-12(金)');
    expect(formatDateHeading('2026-06-14')).toBe('2026-06-14(日)');
  });

  it('形が違う文字列はそのまま返す', () => {
    expect(formatDateHeading('junk')).toBe('junk');
  });
});

describe('buildDailyReport', () => {
  it('セッションがない日はその旨だけを書く', () => {
    const md = buildDailyReport('2026-06-12', []);
    expect(md).toContain('# 日報 2026-06-12(金)');
    expect(md).toContain('記録された集中セッションはありません。');
    expect(md).not.toContain('## タイムライン');
  });

  it('サマリ・作業別集計・タイムラインを組み立てる', () => {
    const sessions = [
      createSession('API実装', NINE, NINE + 25 * MIN),
      createSession('設計レビュー', NINE + 30 * MIN, NINE + 55 * MIN),
      createSession('API実装', NINE + 60 * MIN, NINE + 85 * MIN),
    ];
    const md = buildDailyReport('2026-06-12', sessions);
    expect(md).toContain('集中 3本 / 合計 1時間15分 / 09:00 - 10:25');
    const apiIndex = md.indexOf('- API実装 — 2本(50分)');
    const reviewIndex = md.indexOf('- 設計レビュー — 1本(25分)');
    expect(apiIndex).toBeGreaterThan(-1);
    expect(reviewIndex).toBeGreaterThan(-1);
    expect(apiIndex).toBeLessThan(reviewIndex); // 合計時間の降順
    expect(md).toContain('- 09:00-09:25 API実装');
    expect(md).toContain('- 10:00-10:25 API実装');
  });

  it('中断セッションは本数と注記に現れる', () => {
    const sessions = [
      createSession('調査', NINE, NINE + 25 * MIN),
      createSession('調査', NINE + 30 * MIN, NINE + 40 * MIN, true),
    ];
    const md = buildDailyReport('2026-06-12', sessions);
    expect(md).toContain('集中 2本(うち中断 1本)');
    expect(md).toContain('- 09:30-09:40 調査 ※中断');
  });
});

describe('reportFilename', () => {
  it('日付キーからファイル名を作る', () => {
    expect(reportFilename('2026-06-12')).toBe('nippou-2026-06-12.md');
  });
});
