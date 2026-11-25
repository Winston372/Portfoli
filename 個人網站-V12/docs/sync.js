'use strict';

function createDraftSync(transport, ui, storage, delay = 650) {
  let revision = -1;
  let pending;
  let work;
  let timer;
  let conflict = false;

  function remember() {
    storage.write(pending ? { revision, draft: pending } : null).catch(ui.localError);
  }

  function schedule(ms = delay) {
    clearTimeout(timer);
    if (!conflict) timer = setTimeout(() => { void flush(); }, ms);
  }

  function queue(draft) {
    pending = structuredClone(draft);
    remember();
    if (conflict) return;
    ui.status('等待雲端儲存…');
    schedule();
  }

  async function upload() {
    while (pending && !conflict) {
      const snapshot = pending;
      ui.status('正在儲存到雲端…');
      try {
        const nextRevision = await transport.write(snapshot, revision);
        if (nextRevision === null) {
          conflict = true;
          ui.status('兩台裝置都有修改');
          ui.conflict(true);
          return false;
        }
        revision = nextRevision;
        if (pending === snapshot) pending = undefined;
        remember();
      } catch {
        ui.status('尚未同步，連線後可重試');
        return false;
      }
    }
    if (!conflict) ui.status('已儲存到雲端');
    return !conflict;
  }

  function flush() {
    clearTimeout(timer);
    if (conflict) return Promise.resolve(false);
    if (!work) work = upload().finally(() => { work = undefined; });
    return work;
  }

  async function initialize() {
    const stored = await storage.read().catch(() => null);
    let remote;
    try {
      remote = await transport.read();
    } catch (error) {
      if (!stored?.draft) throw error;
      revision = stored.revision;
      pending = stored.draft;
      ui.load(pending);
      ui.status('離線草稿，尚未同步');
      return;
    }
    revision = remote?.revision ?? -1;
    if (stored?.draft) {
      pending = stored.draft;
      ui.load(pending);
      if (stored.revision !== revision) {
        revision = stored.revision;
        conflict = true;
        ui.status('兩台裝置都有修改');
        ui.conflict(true);
      } else {
        schedule(0);
      }
    } else if (remote) {
      ui.load(remote.draft);
      ui.status('已儲存到雲端');
    } else {
      ui.status('編輯後自動儲存到雲端');
    }
  }

  async function refresh() {
    if (pending || work || conflict) return flush();
    const previous = revision;
    try {
      const remote = await transport.read();
      if (pending || work || revision !== previous) return false;
      if (remote && remote.revision !== revision) {
        if (!ui.canReload()) {
          ui.status('另一台裝置已更新，請按「同步」重新載入');
          return false;
        }
        revision = remote.revision;
        ui.load(remote.draft);
        ui.status('已載入雲端最新草稿');
      }
      return true;
    } catch {
      ui.status('無法連線，請稍後再同步');
      return false;
    }
  }

  async function resolveConflict(keepMine) {
    if (!conflict) return false;
    try {
      const remote = await transport.read();
      revision = remote?.revision ?? -1;
      if (!keepMine) {
        ui.load(remote?.draft);
        pending = undefined;
        remember();
      }
      conflict = false;
      ui.conflict(false);
      if (keepMine) return flush();
      ui.status('已載入雲端草稿');
      return true;
    } catch {
      ui.status('無法連線，請稍後重試');
      return false;
    }
  }

  return { initialize, queue, flush, refresh, resolveConflict, hasPending: () => Boolean(pending) };
}
