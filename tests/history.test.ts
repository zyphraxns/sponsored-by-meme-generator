import { describe, expect, it } from 'vitest';
import { History } from '../src/core/history';

describe('撤销/重做栈', () => {
  it('基本流程：push → undo → redo 回到正确状态', () => {
    const h = new History<number>();
    h.push(1);
    h.push(2);
    h.push(3);

    expect(h.canUndo()).toBe(true);
    expect(h.canRedo()).toBe(false);

    expect(h.undo()).toBe(2);
    expect(h.canRedo()).toBe(true);
    expect(h.undo()).toBe(1);
    expect(h.undo()).toBeUndefined();
    expect(h.canUndo()).toBe(false);

    expect(h.redo()).toBe(2);
    expect(h.redo()).toBe(3);
    expect(h.redo()).toBeUndefined();
    expect(h.canRedo()).toBe(false);
  });

  it('撤销后再产生新变更，重做分支被截断', () => {
    const h = new History<string>();
    h.push('a');
    h.push('b');
    expect(h.undo()).toBe('a');
    expect(h.canRedo()).toBe(true);

    h.push('c');
    expect(h.canRedo()).toBe(false);
    expect(h.undo()).toBe('a');
    expect(h.redo()).toBe('c');
  });

  it('容量上限：超出后丢最旧的记录', () => {
    const h = new History<number>({ limit: 3 });
    for (let i = 0; i <= 5; i++) h.push(i);

    expect(h.undo()).toBe(4);
    expect(h.undo()).toBe(3);
    expect(h.undo()).toBe(2);
    expect(h.canUndo()).toBe(false);
  });

  it('默认容量约为 50 步', () => {
    const h = new History<number>();
    for (let i = 0; i <= 60; i++) h.push(i);

    let count = 0;
    while (h.canUndo()) {
      h.undo();
      count++;
    }
    expect(count).toBe(50);
  });

  it('连续同类操作（同一 coalesceKey）合并成一步', () => {
    let now = 0;
    const h = new History<number>({ now: () => now, coalesceWindowMs: 1000 });
    h.push(0);
    for (let i = 1; i <= 40; i++) {
      now += 10;
      h.push(i, { coalesceKey: 'drag:speed' });
    }

    expect(h.undoDepth).toBe(1);
    expect(h.undo()).toBe(0);
    expect(h.canUndo()).toBe(false);
  });

  it('不同 coalesceKey 各自成步', () => {
    const h = new History<string>();
    h.push('a');
    h.push('b', { coalesceKey: 'drag:color' });
    h.push('c', { coalesceKey: 'drag:speed' });

    expect(h.undo()).toBe('b');
    expect(h.undo()).toBe('a');
  });

  it('超过合并窗口后另起一步', () => {
    let now = 0;
    const h = new History<string>({ now: () => now, coalesceWindowMs: 1000 });
    h.push('a');
    h.push('b', { coalesceKey: 'drag:color' });

    now += 1500;
    h.push('c', { coalesceKey: 'drag:color' });

    expect(h.undo()).toBe('b');
    expect(h.undo()).toBe('a');
  });

  it('endCoalesce 显式结束分组', () => {
    const h = new History<string>();
    h.push('a');
    h.push('b', { coalesceKey: 'drag:color' });
    h.endCoalesce();
    h.push('c', { coalesceKey: 'drag:color' });

    expect(h.undo()).toBe('b');
    expect(h.undo()).toBe('a');
  });

  it('撤销/重做后不会把新操作并进旧分组', () => {
    let now = 0;
    const h = new History<number>({ now: () => now, coalesceWindowMs: 1000 });
    h.push(0);
    h.push(1, { coalesceKey: 'drag:speed' });
    expect(h.undo()).toBe(0);

    now += 5;
    h.push(2, { coalesceKey: 'drag:speed' });
    // 撤销清掉了分组标记，新的 push 必须另起一步，不能并进旧分组
    expect(h.undoDepth).toBe(1);
    expect(h.undo()).toBe(0);
  });

  it('快照隔离：外部修改对象不影响历史记录', () => {
    const h = new History<{ v: number }>();
    const initial = { v: 0 };
    h.push(initial);
    initial.v = 99; // push 时已复制，改原对象不该影响历史

    h.push({ v: 1 });
    const back = h.undo();
    expect(back).toEqual({ v: 0 });

    back!.v = 42; // undo 返回的也是副本
    expect(h.redo()).toEqual({ v: 1 });
    expect(h.undo()).toEqual({ v: 0 });
  });

  it('提供 equals 时重复状态不产生撤销步', () => {
    const h = new History<{ v: number }>({ equals: (a, b) => a.v === b.v });
    h.push({ v: 0 });
    h.push({ v: 0 });
    h.push({ v: 1 });

    expect(h.undo()).toEqual({ v: 0 });
    expect(h.canUndo()).toBe(false);
  });

  it('clear 清空撤销与重做记录', () => {
    const h = new History<number>();
    h.push(1);
    h.push(2);
    h.undo();

    h.clear();
    expect(h.canUndo()).toBe(false);
    expect(h.canRedo()).toBe(false);
    expect(h.current()).toBeUndefined();
    expect(h.undoDepth).toBe(0);
    expect(h.redoDepth).toBe(0);
  });
});
