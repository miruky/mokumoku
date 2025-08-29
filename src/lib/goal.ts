// 1日の集中本数の目標と、そこまでの進み具合。
// 表示用の派生値だけを持つので、ログ集計や永続化からは独立している。

export interface GoalProgress {
  /** これまでに積んだ集中の本数 */
  done: number;
  /** 目標の本数 */
  goal: number;
  /** 達成率(0〜1にクランプ)。メーターの幅に使う */
  ratio: number;
  /** 目標に届くまでの残り本数。達成済みなら0 */
  remaining: number;
  /** 目標に達したか */
  met: boolean;
}

/**
 * 達成率を導く。goalが0以下なら常に達成扱いにする(0除算を避ける)。
 * doneが目標を超えてもratioは1で頭打ちにする。
 */
export function goalProgress(done: number, goal: number): GoalProgress {
  const safeDone = Math.max(0, Math.floor(done));
  const safeGoal = Math.max(0, Math.floor(goal));
  if (safeGoal <= 0) {
    return { done: safeDone, goal: 0, ratio: 1, remaining: 0, met: true };
  }
  return {
    done: safeDone,
    goal: safeGoal,
    ratio: Math.min(1, safeDone / safeGoal),
    remaining: Math.max(0, safeGoal - safeDone),
    met: safeDone >= safeGoal,
  };
}
