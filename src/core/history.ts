/**
 * 通用撤销/重做栈（纯数据快照）。
 *
 * 设计约定：
 * - 历史里存的是**状态**，不是动作。调用方每次改完调用 `push(新状态)`；
 *   `undo()` 返回变更前的状态。
 * - `push` 默认用 structuredClone 复制一份，`undo()/redo()` 返回的也是副本。
 *   调用方后续怎么改自己的对象，都不会污染历史。
 * - 状态必须是可 structuredClone 的纯数据。如果状态里有不可克隆的东西
 *   （DOM 节点、函数、类实例），请通过 `clone` 选项传入自定义复制函数。
 * - **连续同类操作合并**：拖动颜色选择器、速度滑杆这类会连续触发几十次的
 *   变更，调用方在同一个拖拽过程里给每次 push 带上同一个 `coalesceKey`；
 *   相同 key 且距上一次 push 不超过合并窗口（默认 1200ms）时，只覆盖当前
 *   状态，不会往撤销栈里塞新的一步。松手/失焦时调用 `endCoalesce()` 显式
 *   结束分组，不要依赖时间窗口去猜用户有没有拖完。
 * - 每次交互开始时先 `push(当前状态)` 作为基线，否则第一次变更无法撤销。
 */

/** 默认最多保留 50 步撤销记录，超出丢最旧的 */
const DEFAULT_LIMIT = 50;

/** 同类操作的默认合并窗口（毫秒） */
const DEFAULT_COALESCE_WINDOW_MS = 1200;

export interface HistoryOptions<T> {
  /** 最多保留的撤销步数，默认 50 */
  limit?: number;
  /** 快照复制函数，默认 structuredClone */
  clone?: (state: T) => T;
  /** 可选的状态等价判断；提供后重复 push 不会产生新的撤销步 */
  equals?: (a: T, b: T) => boolean;
  /** 同类操作的默认合并窗口（毫秒），默认 1200 */
  coalesceWindowMs?: number;
  /** 时钟，默认 Date.now；单测可注入假时钟 */
  now?: () => number;
}

export interface PushOptions {
  /**
   * 连续同类操作的标识（例如 `'drag:accent'`、`'drag:speed'`）。
   * 相同 key 且间隔不超过合并窗口的连续 push 会被合并为一步。
   */
  coalesceKey?: string;
  /** 覆盖本次 push 的合并窗口（毫秒） */
  coalesceWindowMs?: number;
}

export class History<T> {
  private readonly limit: number;
  private readonly cloneState: (state: T) => T;
  private readonly equals?: (a: T, b: T) => boolean;
  private readonly coalesceWindowMs: number;
  private readonly clock: () => number;

  private past: T[] = [];
  private future: T[] = [];
  private present: T | undefined;
  private mark: { key: string; at: number } | null = null;

  constructor(options: HistoryOptions<T> = {}) {
    const limit = options.limit ?? DEFAULT_LIMIT;
    this.limit = Number.isFinite(limit) ? Math.max(1, Math.floor(limit)) : DEFAULT_LIMIT;
    this.cloneState = options.clone ?? ((state) => structuredClone(state));
    this.equals = options.equals;
    this.coalesceWindowMs = Math.max(0, options.coalesceWindowMs ?? DEFAULT_COALESCE_WINDOW_MS);
    this.clock = options.now ?? Date.now;
  }

  /** 记录一个「变更后」的状态；相同 coalesceKey 的连续调用会合并为一步 */
  push(state: T, options: PushOptions = {}): void {
    const snapshot = this.cloneState(state);

    // 状态没变：不产生撤销步，但保持正在进行的拖拽分组存活
    if (this.present !== undefined && this.equals?.(this.present, snapshot)) {
      if (options.coalesceKey !== undefined && this.mark?.key === options.coalesceKey) {
        this.mark.at = this.clock();
      }
      return;
    }

    // 第一次 push 只是建立基线，没有可撤销的历史
    if (this.present === undefined) {
      this.present = snapshot;
      this.future.length = 0;
      this.mark = null;
      return;
    }

    const key = options.coalesceKey;
    if (key !== undefined && this.canMerge(key, options.coalesceWindowMs)) {
      // 同组操作：只替换当前状态，撤销栈里保留组开始前的那个状态
      this.present = snapshot;
      this.future.length = 0;
      this.mark = { key, at: this.clock() };
      return;
    }

    this.past.push(this.present);
    if (this.past.length > this.limit) {
      this.past.splice(0, this.past.length - this.limit);
    }
    this.present = snapshot;
    this.future.length = 0;
    this.mark = key === undefined ? null : { key, at: this.clock() };
  }

  /** 返回上一个状态；已无历史时返回 undefined */
  undo(): T | undefined {
    if (this.past.length === 0) return undefined;
    const prev = this.past.pop() as T;
    if (this.present !== undefined) this.future.push(this.present);
    this.present = prev;
    this.mark = null;
    return this.cloneState(prev);
  }

  /** 返回被撤销的那个状态；没有可重做的记录时返回 undefined */
  redo(): T | undefined {
    if (this.future.length === 0) return undefined;
    const next = this.future.pop() as T;
    if (this.present !== undefined) this.past.push(this.present);
    if (this.past.length > this.limit) {
      this.past.splice(0, this.past.length - this.limit);
    }
    this.present = next;
    this.mark = null;
    return this.cloneState(next);
  }

  canUndo(): boolean {
    return this.past.length > 0;
  }

  canRedo(): boolean {
    return this.future.length > 0;
  }

  /** 当前状态（副本）；尚未 push 过任何状态时为 undefined */
  current(): T | undefined {
    return this.present === undefined ? undefined : this.cloneState(this.present);
  }

  /** 清空撤销与重做记录，当前状态也一并丢弃 */
  clear(): void {
    this.past.length = 0;
    this.future.length = 0;
    this.present = undefined;
    this.mark = null;
  }

  /** 显式结束当前合并分组（拖拽松手、滑杆失焦时调用） */
  endCoalesce(): void {
    this.mark = null;
  }

  /** 当前可撤销步数（不含进行中的合并组） */
  get undoDepth(): number {
    return this.past.length;
  }

  /** 当前可重做步数 */
  get redoDepth(): number {
    return this.future.length;
  }

  private canMerge(key: string, windowMs: number | undefined): boolean {
    if (this.present === undefined || this.mark === null) return false;
    if (this.mark.key !== key) return false;
    if (this.future.length > 0) return false;
    const window = Math.max(0, windowMs ?? this.coalesceWindowMs);
    return this.clock() - this.mark.at <= window;
  }
}
