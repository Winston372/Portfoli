'use strict';

const PortfolioCloud = (() => {
  const config = window.PORTFOLIO_CLOUD || {};
  const enabled = Boolean(config.url && config.publishableKey);
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
  let client;

  async function connect() {
    if (!enabled) throw new Error('網站尚未設定雲端。');
    if (client) return client;
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.89.0';
    script.referrerPolicy = 'no-referrer';
    await new Promise((resolve, reject) => {
      script.onload = resolve;
      script.onerror = () => reject(new Error('無法載入登入服務。'));
      document.head.append(script);
    });
    client = window.supabase.createClient(config.url, config.publishableKey, {
      auth: { flowType: 'pkce', storageKey: 'portfolio-v12-' + location.pathname }
    });
    return client;
  }

  async function result(operation) {
    const { data, error } = await operation;
    if (error) throw error;
    return data;
  }

  function transport(api, owner) {
    const drafts = () => api.from('portfolio_drafts');
    const publications = () => api.from('portfolio_publications');
    return {
      read: () => result(drafts().select('draft,revision').eq('owner_id', owner).maybeSingle()),
      async write(draft, revision) {
        if (revision < 0) {
          const request = await drafts().insert({ owner_id: owner, revision: 0, draft })
            .select('revision').single();
          if (request.error?.code === '23505') return null;
          if (request.error) throw request.error;
          return request.data.revision;
        }
        const row = await result(drafts().update({ draft, revision: revision + 1 })
          .eq('owner_id', owner).eq('revision', revision).select('revision').maybeSingle());
        return row?.revision ?? null;
      },
      readPublication: id => result(api.rpc('portfolio_read_publication', { site_id: id }).maybeSingle()),
      publish: snapshot => result(publications().upsert({
        owner_id: owner, snapshot, published_at: new Date().toISOString()
      })),
      unpublish: () => result(publications().delete().eq('owner_id', owner))
    };
  }

  function publicationSnapshot(draft) {
    const snapshot = structuredClone(draft);
    snapshot.sections = snapshot.sections.filter(section => section.visible);
    for (const section of snapshot.sections) section.items = section.items.filter(item => item.visible);
    const targets = new Set(snapshot.sections.flatMap(section => [
      section.id, ...section.items.map(item => section.id + '/' + item.id)
    ]));
    snapshot.profile.homeTimeline = snapshot.profile.homeTimeline
      .filter(entry => entry.title.trim()).map(entry => ({
        ...entry, target: targets.has(entry.target) ? entry.target : ''
      }));
    for (const page of [snapshot.profile, ...snapshot.sections]) {
      if (page.illustration && page.illustration.mode !== 'image') page.illustration.image = '';
    }
    for (const owner of [snapshot.profile, ...snapshot.sections, ...snapshot.sections.flatMap(section => section.items)]) {
      delete owner.editorBoxes;
    }
    return snapshot;
  }

  return { enabled, local, connect, transport, result, publicationSnapshot };
})();
