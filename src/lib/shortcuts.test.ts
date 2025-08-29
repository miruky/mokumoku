import { describe, expect, it } from 'vitest';
import { resolveShortcut } from './shortcuts';

const base = { typing: false, modifier: false };

describe('resolveShortcut', () => {
  it('スペースで開始・一時停止のトグル', () => {
    expect(resolveShortcut(' ', base)).toBe('toggle');
    expect(resolveShortcut('Spacebar', base)).toBe('toggle');
  });

  it('s/r/gにそれぞれの操作を割り当てる', () => {
    expect(resolveShortcut('s', base)).toBe('skip');
    expect(resolveShortcut('r', base)).toBe('reset');
    expect(resolveShortcut('g', base)).toBe('report');
  });

  it('大文字でも同じ操作になる', () => {
    expect(resolveShortcut('S', base)).toBe('skip');
    expect(resolveShortcut('G', base)).toBe('report');
  });

  it('割り当てのないキーはnull', () => {
    expect(resolveShortcut('a', base)).toBeNull();
    expect(resolveShortcut('Enter', base)).toBeNull();
  });

  it('入力中はショートカットを無効化する', () => {
    expect(resolveShortcut('s', { ...base, typing: true })).toBeNull();
    expect(resolveShortcut(' ', { ...base, typing: true })).toBeNull();
  });

  it('修飾キー併用時はブラウザ操作を奪わない', () => {
    expect(resolveShortcut('r', { ...base, modifier: true })).toBeNull();
  });
});
