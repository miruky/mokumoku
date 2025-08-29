// キーボードショートカットの解決。DOMイベントに依存せず、
// 押されたキーと文脈(入力中か・修飾キー併用か)だけから操作を決める。

export type ShortcutAction = 'toggle' | 'skip' | 'reset' | 'report';

export interface ShortcutContext {
  /** テキスト入力欄など編集中の要素にフォーカスがあるか */
  typing: boolean;
  /** Ctrl / Cmd / Alt のいずれかが押されているか(ブラウザ操作を奪わない) */
  modifier: boolean;
}

const KEY_TO_ACTION: Record<string, ShortcutAction> = {
  ' ': 'toggle',
  spacebar: 'toggle',
  s: 'skip',
  r: 'reset',
  g: 'report',
};

/**
 * キーから操作を引く。入力中や修飾キー併用のときは何もしない。
 * 大文字・小文字は区別しない(Shift併用での誤爆を防ぐためkeyを小文字化して照合)。
 */
export function resolveShortcut(key: string, ctx: ShortcutContext): ShortcutAction | null {
  if (ctx.typing || ctx.modifier) return null;
  return KEY_TO_ACTION[key.toLowerCase()] ?? null;
}

/** 編集中とみなす要素か。input/textarea/contenteditableを対象にする */
export function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || target.isContentEditable;
}
