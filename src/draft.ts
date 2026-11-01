/**
 * 本地草稿：刷新 / 误关标签页后还能找回上一次的编辑。
 *
 * 复用分享链接的紧凑编码（同一套可恢复字段），因此上传内容同样不在草稿里——
 * 它们只存在内存，刷新即失，这是既有约束而不是本次改动引入的。
 */
import { decodeShare, encodeShare } from './share-link';
import type { ShareableState } from './share-link';

const KEY = 'sponsored-by:draft:v1';

/** 写草稿。隐私模式 / 配额满时静默失败——草稿是加分项，不能拖垮主流程。 */
export function saveDraft(selection: ShareableState): void {
  try {
    localStorage.setItem(KEY, encodeShare(selection));
  } catch {
    /* ignore */
  }
}

export function loadDraft(): Partial<ShareableState> | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? decodeShare(raw) : null;
  } catch {
    return null;
  }
}

export function clearDraft(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
