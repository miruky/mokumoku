import {
  DEFAULT_CONFIG,
  createTimer,
  formatRemaining,
  isValidConfig,
  pause,
  phaseDurationMs,
  progress,
  remainingMs,
  resetPhase,
  skip,
  start,
  tick,
  type Phase,
  type TimerConfig,
  type TimerState,
} from './lib/timer';
import {
  MIN_SESSION_MS,
  createSession,
  createStore,
  localDateKey,
  removeSession,
  sessionsOn,
  summarizeByTask,
  totalMs,
  type Session,
  type SessionStore,
} from './lib/sessions';
import { goalProgress } from './lib/goal';
import { isEditableTarget, resolveShortcut, type ShortcutAction } from './lib/shortcuts';
import { buildDailyReport, formatClock, formatDurationJa, reportFilename } from './lib/report';

const CONFIG_KEY = 'mokumoku.config.v1';

const PHASE_LABEL: Record<Phase, string> = {
  focus: '集中',
  'short-break': '小休憩',
  'long-break': '長休憩',
};

const RING_RADIUS = 110;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

const reduceMotion =
  typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

function loadConfig(storage: Storage): TimerConfig {
  try {
    const raw = storage.getItem(CONFIG_KEY);
    if (raw !== null) {
      const parsed: unknown = JSON.parse(raw);
      if (typeof parsed === 'object' && parsed !== null) {
        // 旧バージョンの保存値にdailyGoal等が無くても、既定で補ってから検証する
        const merged = { ...DEFAULT_CONFIG, ...(parsed as Partial<TimerConfig>) };
        if (isValidConfig(merged)) return merged;
      }
    }
  } catch {
    // 壊れた保存値は既定値に戻す
  }
  return DEFAULT_CONFIG;
}

function el<T extends Element>(root: ParentNode, selector: string): T {
  const node = root.querySelector(selector);
  if (node === null) throw new Error(`要素が見つからない: ${selector}`);
  return node as T;
}

let audioCtx: AudioContext | null = null;

/** フェーズ満了の合図。短い二音のチャイムをWebAudioで鳴らす */
function chime(): void {
  try {
    audioCtx ??= new AudioContext();
    const ctx = audioCtx;
    void ctx.resume();
    [660, 880].forEach((freq, i) => {
      const t0 = ctx.currentTime + i * 0.18;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.exponentialRampToValueAtTime(0.12, t0 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.5);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t0);
      osc.stop(t0 + 0.55);
    });
  } catch {
    // 音を鳴らせない環境では何もしない
  }
}

const TRASH_ICON = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 7h14M10 4h4M9 7l.7 11.5a1.5 1.5 0 0 0 1.5 1.4h1.6a1.5 1.5 0 0 0 1.5-1.4L15 7" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

const APP_HTML = `
  <header class="masthead">
    <div class="masthead-media" aria-hidden="true">
      <img
        class="masthead-img"
        src="https://picsum.photos/seed/mokumoku-desk/1680/720?grayscale"
        alt=""
        width="1680"
        height="720"
        loading="lazy"
      />
    </div>
    <div class="masthead-inner">
      <p class="kicker">ポモドーロ・作業ログ</p>
      <div class="brand">
        <svg class="brand-mark" viewBox="0 0 32 32" aria-hidden="true">
          <path d="M9 22a5.5 5.5 0 0 1-1.2-10.9A7.5 7.5 0 0 1 22.4 9.6 6 6 0 0 1 23 21.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
          <circle cx="16" cy="22" r="5" fill="none" stroke="currentColor" stroke-width="2"/>
          <path d="M16 19.5V22l1.8 1.4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
        <h1>mokumoku</h1>
      </div>
      <p class="tagline">黙々と積んだ25分が、そのまま日報になる。</p>
    </div>
  </header>
  <main class="workbench">
    <section class="panel timer-panel" aria-label="ポモドーロタイマー">
      <div class="phase-row">
        <p class="kicker phase-kicker" id="phase-badge">集中</p>
        <span class="cycle-dots" id="cycle-dots" role="img" aria-label="長休憩までの進み"></span>
      </div>
      <div class="dial reveal">
        <svg class="ring" viewBox="0 0 240 240" aria-hidden="true">
          <circle class="ring-track" cx="120" cy="120" r="${RING_RADIUS}" />
          <circle class="ring-progress" id="ring-progress" cx="120" cy="120" r="${RING_RADIUS}"
            stroke-dasharray="${RING_CIRCUMFERENCE.toFixed(2)}" stroke-dashoffset="0" />
        </svg>
        <div class="dial-center">
          <p class="time" id="time">25:00</p>
          <p class="dial-phase" id="dial-phase">集中</p>
        </div>
      </div>
      <label class="task-field">
        <span class="field-label">いまの作業</span>
        <input id="task" type="text" placeholder="例: 設計レビュー" maxlength="80" autocomplete="off" />
      </label>
      <div class="controls">
        <button id="toggle" class="button primary" type="button">開始</button>
        <button id="skip" class="button" type="button">スキップ</button>
        <button id="reset" class="button" type="button">リセット</button>
      </div>
      <p class="hint" id="hint">Space で開始 / 停止、S でスキップ、R でリセット、G で日報。</p>
      <details class="settings">
        <summary>時間と目標の設定</summary>
        <form id="config-form" class="config-grid">
          <label>集中(分)<input id="cfg-focus" name="focus" type="number" min="1" max="120" required /></label>
          <label>小休憩(分)<input id="cfg-short" name="short" type="number" min="1" max="60" required /></label>
          <label>長休憩(分)<input id="cfg-long" name="long" type="number" min="1" max="120" required /></label>
          <label>長休憩の間隔(本)<input id="cfg-cycles" name="cycles" type="number" min="1" max="12" required /></label>
          <label>1日の目標(本)<input id="cfg-goal" name="goal" type="number" min="1" max="24" required /></label>
          <button class="button" type="submit">保存</button>
        </form>
        <p class="settings-note" id="settings-note" role="status"></p>
      </details>
    </section>
    <section class="panel log-panel" aria-label="今日の作業ログ">
      <div class="log-head">
        <p class="kicker">本日</p>
        <h2>今日のログ</h2>
        <p class="stats" id="stats">集中 0本</p>
      </div>
      <div class="goal" id="goal" aria-label="今日の目標の進み">
        <div class="goal-row">
          <span class="goal-label">目標</span>
          <span class="goal-value" id="goal-value">0 / 8 本</span>
        </div>
        <div class="goal-track"><span class="goal-fill" id="goal-fill"></span></div>
      </div>
      <p class="empty" id="empty-log">完了した集中セッションがここに並びます。</p>
      <ol class="session-list" id="session-list"></ol>
      <div class="log-actions">
        <button id="report" class="button primary" type="button">日報を生成</button>
      </div>
    </section>
  </main>
  <dialog class="report-dialog" id="report-dialog" aria-label="日報プレビュー">
    <h2 class="kicker">日報プレビュー</h2>
    <pre id="report-body"></pre>
    <div class="dialog-actions">
      <button id="copy-report" class="button primary" type="button">コピー</button>
      <button id="download-report" class="button" type="button">ダウンロード</button>
      <button id="close-report" class="button" type="button">閉じる</button>
    </div>
  </dialog>
  <footer class="site-footer">
    <p>記録はこの端末のlocalStorageにだけ保存されます。アカウントも通信もありません。</p>
  </footer>
`;

export interface AppDeps {
  storage: Storage;
  now: () => number;
}

export function mountApp(
  root: HTMLElement,
  deps: AppDeps = { storage: localStorage, now: Date.now },
): void {
  root.innerHTML = APP_HTML;

  let config = loadConfig(deps.storage);
  let timer: TimerState = createTimer(config);
  const store: SessionStore = createStore(deps.storage);
  let sessions: Session[] = store.load();

  const timeEl = el<HTMLParagraphElement>(root, '#time');
  const dialPhaseEl = el<HTMLParagraphElement>(root, '#dial-phase');
  const phaseBadge = el<HTMLParagraphElement>(root, '#phase-badge');
  const cycleDots = el<HTMLSpanElement>(root, '#cycle-dots');
  const ringProgress = el<SVGCircleElement>(root, '#ring-progress');
  const taskInput = el<HTMLInputElement>(root, '#task');
  const toggleBtn = el<HTMLButtonElement>(root, '#toggle');
  const skipBtn = el<HTMLButtonElement>(root, '#skip');
  const resetBtn = el<HTMLButtonElement>(root, '#reset');
  const statsEl = el<HTMLParagraphElement>(root, '#stats');
  const goalEl = el<HTMLDivElement>(root, '#goal');
  const goalValue = el<HTMLSpanElement>(root, '#goal-value');
  const goalFill = el<HTMLSpanElement>(root, '#goal-fill');
  const listEl = el<HTMLOListElement>(root, '#session-list');
  const emptyEl = el<HTMLParagraphElement>(root, '#empty-log');
  const reportBtn = el<HTMLButtonElement>(root, '#report');
  const dialog = el<HTMLDialogElement>(root, '#report-dialog');
  const reportBody = el<HTMLPreElement>(root, '#report-body');
  const configForm = el<HTMLFormElement>(root, '#config-form');
  const settingsNote = el<HTMLParagraphElement>(root, '#settings-note');
  const cfg = {
    focus: el<HTMLInputElement>(root, '#cfg-focus'),
    short: el<HTMLInputElement>(root, '#cfg-short'),
    long: el<HTMLInputElement>(root, '#cfg-long'),
    cycles: el<HTMLInputElement>(root, '#cfg-cycles'),
    goal: el<HTMLInputElement>(root, '#cfg-goal'),
  };

  function fillConfigForm(): void {
    cfg.focus.value = String(config.focusMin);
    cfg.short.value = String(config.shortBreakMin);
    cfg.long.value = String(config.longBreakMin);
    cfg.cycles.value = String(config.cyclesUntilLongBreak);
    cfg.goal.value = String(config.dailyGoal);
  }

  function renderCycleDots(): void {
    const dots: string[] = [];
    for (let i = 0; i < config.cyclesUntilLongBreak; i++) {
      dots.push(`<i class="dot${i < timer.completedInCycle ? ' done' : ''}"></i>`);
    }
    cycleDots.innerHTML = dots.join('');
    cycleDots.setAttribute(
      'aria-label',
      `長休憩まで 集中${timer.completedInCycle}/${config.cyclesUntilLongBreak}本`,
    );
  }

  function renderPhase(): void {
    const label = PHASE_LABEL[timer.phase];
    phaseBadge.textContent = label;
    dialPhaseEl.textContent = label;
    root.dataset.phase = timer.phase;
    renderCycleDots();
  }

  function renderClock(): void {
    const now = deps.now();
    const ms = remainingMs(timer, now);
    timeEl.textContent = formatRemaining(ms);
    ringProgress.style.strokeDashoffset = (
      RING_CIRCUMFERENCE * progress(timer, config, now)
    ).toFixed(2);
    toggleBtn.textContent =
      timer.status === 'running' ? '一時停止' : timer.status === 'paused' ? '再開' : '開始';
    document.title =
      timer.status === 'running'
        ? `${formatRemaining(ms)} ${PHASE_LABEL[timer.phase]} — mokumoku`
        : 'mokumoku — ポモドーロと作業ログ';
  }

  function renderGoal(doneCount: number): void {
    const gp = goalProgress(doneCount, config.dailyGoal);
    goalValue.textContent = `${gp.done} / ${gp.goal} 本`;
    goalFill.style.width = `${(gp.ratio * 100).toFixed(1)}%`;
    goalEl.classList.toggle('is-met', gp.met && gp.done > 0);
  }

  function renderLog(): void {
    const today = sessionsOn(sessions, localDateKey(deps.now()));
    const summaries = summarizeByTask(today);
    statsEl.textContent =
      today.length === 0
        ? '集中 0本'
        : `集中 ${today.length}本 / 合計 ${formatDurationJa(totalMs(today))} / 作業 ${summaries.length}件`;
    emptyEl.hidden = today.length > 0;
    listEl.innerHTML = today
      .map((s, i) => {
        const mark = s.interrupted ? '<span class="interrupted">中断</span>' : '';
        return (
          `<li style="--stagger:${i}" data-started="${s.startedAt}">` +
          `<span class="session-range">${formatClock(s.startedAt)}<span class="dash">–</span>${formatClock(s.endedAt)}</span>` +
          `<span class="session-task">${escapeHtml(s.task)}</span>${mark}` +
          `<button type="button" class="row-delete" data-started="${s.startedAt}" aria-label="${escapeHtml(s.task)} の記録を削除">${TRASH_ICON}</button>` +
          `</li>`
        );
      })
      .join('');
    renderGoal(today.length);
  }

  function recordSession(endedAt: number, interrupted: boolean): void {
    if (timer.phaseStartedAt === null) return;
    if (endedAt - timer.phaseStartedAt < MIN_SESSION_MS) return;
    sessions = [
      ...sessions,
      createSession(taskInput.value, timer.phaseStartedAt, endedAt, interrupted),
    ];
    store.save(sessions);
    renderLog();
  }

  function loop(): void {
    const result = tick(timer, config, deps.now());
    if (result.finished !== null) {
      if (result.finished === 'focus') recordSession(deps.now(), false);
      timer = result.state;
      chime();
      renderPhase();
    }
    renderClock();
  }

  function toggle(): void {
    const now = deps.now();
    timer = timer.status === 'running' ? pause(timer, now) : start(timer, now);
    renderClock();
  }

  function doSkip(): void {
    if (timer.phase === 'focus' && timer.status !== 'idle') recordSession(deps.now(), true);
    timer = skip(timer, config);
    renderPhase();
    renderClock();
  }

  function doReset(): void {
    if (timer.phase === 'focus' && timer.status !== 'idle') recordSession(deps.now(), true);
    timer = resetPhase(timer, config);
    renderPhase();
    renderClock();
  }

  function openReport(): void {
    const key = localDateKey(deps.now());
    reportBody.textContent = buildDailyReport(key, sessionsOn(sessions, key));
    dialog.showModal();
  }

  toggleBtn.addEventListener('click', toggle);
  skipBtn.addEventListener('click', doSkip);
  resetBtn.addEventListener('click', doReset);
  reportBtn.addEventListener('click', openReport);

  // ログ行の削除はイベント委譲で受ける
  listEl.addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('.row-delete');
    if (btn === null) return;
    const startedAt = Number(btn.dataset.started);
    if (!Number.isFinite(startedAt)) return;
    sessions = removeSession(sessions, startedAt);
    store.save(sessions);
    renderLog();
  });

  // キーボードショートカット。入力中・修飾キー併用・ダイアログ表示中は無効
  const ACTIONS: Record<ShortcutAction, () => void> = {
    toggle,
    skip: doSkip,
    reset: doReset,
    report: openReport,
  };
  document.addEventListener('keydown', (e) => {
    if (dialog.open) return;
    const action = resolveShortcut(e.key, {
      typing: isEditableTarget(e.target),
      modifier: e.ctrlKey || e.metaKey || e.altKey,
    });
    if (action === null) return;
    e.preventDefault();
    ACTIONS[action]();
  });

  configForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const next: TimerConfig = {
      focusMin: Number(cfg.focus.value),
      shortBreakMin: Number(cfg.short.value),
      longBreakMin: Number(cfg.long.value),
      cyclesUntilLongBreak: Number(cfg.cycles.value),
      dailyGoal: Number(cfg.goal.value),
    };
    if (!isValidConfig(next)) {
      settingsNote.textContent = '範囲外の値があります。各項目の最小・最大を確認してください。';
      return;
    }
    config = next;
    deps.storage.setItem(CONFIG_KEY, JSON.stringify(config));
    // 進行中のフェーズは打ち切らず、次のフェーズから新しい長さを使う。idleなら即反映する
    if (timer.status === 'idle') {
      timer = { ...timer, remainingMs: phaseDurationMs(config, timer.phase) };
    }
    settingsNote.textContent = '保存しました。次のフェーズから反映されます。';
    renderPhase();
    renderClock();
    renderLog();
  });

  el<HTMLButtonElement>(root, '#close-report').addEventListener('click', () => dialog.close());

  el<HTMLButtonElement>(root, '#copy-report').addEventListener('click', (e) => {
    const btn = e.currentTarget as HTMLButtonElement;
    void navigator.clipboard.writeText(reportBody.textContent ?? '').then(() => {
      btn.textContent = 'コピーしました';
      setTimeout(() => (btn.textContent = 'コピー'), 1500);
    });
  });

  el<HTMLButtonElement>(root, '#download-report').addEventListener('click', () => {
    const blob = new Blob([reportBody.textContent ?? ''], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = reportFilename(localDateKey(deps.now()));
    a.click();
    URL.revokeObjectURL(url);
  });

  fillConfigForm();
  renderPhase();
  renderClock();
  renderLog();
  setupMotion(root);
  setInterval(loop, 250);
}

/** スクロール出現と軽い視差。reduced-motionでは何もせず内容を常時表示する */
function setupMotion(root: HTMLElement): void {
  if (reduceMotion) return;
  document.body.classList.add('anim-ready');

  if (typeof IntersectionObserver === 'function') {
    const io = new IntersectionObserver(
      (entries, obs) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-visible');
            obs.unobserve(entry.target);
          }
        }
      },
      { threshold: 0.15 },
    );
    root.querySelectorAll('.reveal').forEach((node) => io.observe(node));
  }

  const masthead = root.querySelector<HTMLElement>('.masthead-img');
  if (masthead !== null && typeof requestAnimationFrame === 'function') {
    let ticking = false;
    const onScroll = (): void => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        const shift = Math.min(40, window.scrollY * 0.18);
        masthead.style.transform = `translate3d(0, ${shift.toFixed(1)}px, 0) scale(1.06)`;
        ticking = false;
      });
    };
    window.addEventListener('scroll', onScroll, { passive: true });
  }
}

function escapeHtml(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}
