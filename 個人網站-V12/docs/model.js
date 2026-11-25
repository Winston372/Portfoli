'use strict';

const Portfolio = (() => {
  const kinds = {
    about: { singular: '自介段落', hint: '可以放興趣、個人特質，或用一件小事介紹自己。', fields: [['summary', '段落內容']] },
    works: { singular: '作品', hint: '讓讀者看見你為什麼做、你負責什麼、最後做出了什麼。', fields: [['meta', '時間或進度'], ['summary', '作品簡介'], ['motivation', '創作動機'], ['role', '我負責的部分'], ['challenge', '遇到的困難與解法'], ['outcome', '成果與改進'], ['reflection', '我學到了什麼']] },
    competitions: { singular: '比賽', hint: '可以收錄得獎、入圍、參賽，也可以放準備的過程。', fields: [['meta', '日期或年份'], ['role', '個人或團隊、我的角色'], ['outcome', '結果'], ['summary', '過程或收穫']] },
    activities: { singular: '活動', hint: '可以放社團、營隊、分享、志工或講座。', fields: [['meta', '日期或年份'], ['role', '我的角色'], ['summary', '我做了什麼、學到什麼']] },
    learning: { singular: '學習故事', hint: '選一件你主動學習的事，說清楚從卡關到找到做法的過程。', fields: [['summary', '我為什麼想學'], ['role', '遇到的問題和我的做法'], ['outcome', '學到什麼、如何確認成果']] },
    future: { singular: '人生規劃', hint: '可寫高中三年、高中之後，以及你想成為怎樣的人。', fields: [['summary', '我想做什麼'], ['outcome', '我能開始的第一步']] },
    custom: { singular: '內容項目', hint: '用這個區塊放其他想補充的內容。', fields: [['meta', '時間或分類'], ['summary', '內容'], ['role', '我的角色'], ['outcome', '成果或收穫']] }
  };

  const timelineGrades = ['國一', '國二', '國三', '高一', '高二', '高三'];
  const timelineStatuses = { done: '已完成', active: '進行中', planned: '規劃中' };

  const themes = {
    forest: { label: '森林綠', motif: '山林等高線', accent: '#22634c', paper: '#f3f7ef', surface: '#ffffff', ink: '#203129' },
    ocean: { label: '海軍藍', motif: '潮汐波紋', accent: '#264a86', paper: '#f0f4fc', surface: '#ffffff', ink: '#17243a' },
    sunset: { label: '陶土紅', motif: '落日與沙丘', accent: '#94482f', paper: '#fbf3ed', surface: '#fffdfb', ink: '#39251f' },
    sky: { label: '暮光藍', motif: '暮光與軌道', accent: '#6d4cb0', paper: '#f6f2fc', surface: '#ffffff', ink: '#29213d' },
    graphite: { label: '石墨灰', motif: '格線與幾何', accent: '#404d63', paper: '#f3f5f7', surface: '#ffffff', ink: '#1e2631' },
    ink: { label: '墨水與棉紙', motif: '暖紙・靛墨', accent: '#354966', paper: '#f6f2e8', surface: '#fffdf7', ink: '#292c33' },
    brick: { label: '磚紅與燕麥', motif: '燕麥紙・紅鉛筆', accent: '#8c4236', paper: '#f5ece0', surface: '#fffaf2', ink: '#362922' },
    pine: { label: '苔綠與石灰', motif: '霧灰・苔綠', accent: '#415844', paper: '#eeeee5', surface: '#fafbf4', ink: '#2b3428' },
    midnight: { label: '夜空藍', motif: '星點與星軌', accent: '#a6b9ff', paper: '#151c2b', surface: '#222c40', ink: '#edf2ff' }
  };
  const colorFields = { accent: '主色', paper: '網頁底色', surface: '卡片底色', ink: '文字顏色' };
  const validColor = value => typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value);

  function normalizePalette(palette) {
    if (!palette || typeof palette !== 'object') return null;
    return Object.fromEntries(Object.keys(colorFields).map(key =>
      [key, validColor(palette[key]) ? palette[key].toLowerCase() : themes.forest[key]]));
  }

  function contrast(a, b) {
    function luminance(hex) {
      const rgb = [1, 3, 5].map(index => {
        const channel = parseInt(hex.slice(index, index + 2), 16) / 255;
        return channel <= .04045 ? channel / 12.92 : ((channel + .055) / 1.055) ** 2.4;
      });
      return .2126 * rgb[0] + .7152 * rgb[1] + .0722 * rgb[2];
    }
    const first = luminance(a);
    const second = luminance(b);
    return (Math.max(first, second) + .05) / (Math.min(first, second) + .05);
  }

  function currentTheme(draft) {
    return draft.theme === 'custom' ? draft.customPalette || themes.forest : themes[draft.theme];
  }

  const fontFaces = { sans: '黑體', serif: '明體', mono: '等寬' };
  Object.assign(fontFaces, {
    notoSans: '思源黑體', notoSerif: '思源宋體', wenkai: '霞鶩文楷 TC',
    chocolate: '朱古力黑體', instrument: 'Instrument Serif', plex: 'IBM Plex Mono',
    jhenghei: '微軟正黑體', kai: '標楷體', georgia: 'Georgia'
  });
  const webFonts = {
    notoSans: 'Noto Sans TC:wght@400;700', notoSerif: 'Noto Serif TC:wght@400;700',
    wenkai: 'LXGW WenKai TC:wght@400;700', chocolate: 'Chocolate Classical Sans',
    instrument: 'Instrument Serif', plex: 'IBM Plex Mono:wght@400;700'
  };
  const textLimits = {
    size: [8, 144, 1], leading: [0.8, 3, 0.05], tracking: [-3, 12, 0.1], weight: [100, 900, 100]
  };
  const bound = (value, min, max, fallback) => Number.isFinite(value)
    ? Math.max(min, Math.min(max, value)) : fallback;
  const textSizes = [14, 16, 18, 20, 24, 28, 32, 40, 48, 56, 64, 72];

  function normalizeStyles(styles) {
    if (!styles || typeof styles !== 'object') return {};
    const keys = ['name', 'title', 'intro', 'meta', 'summary', 'motivation', 'role', 'challenge', 'outcome', 'reflection', 'imageAlt'];
    const entries = keys.filter(key => styles[key] && typeof styles[key] === 'object').map(key => {
      const style = styles[key];
      return [key, {
        size: bound(style.size, 8, 144, null),
        leading: bound(style.leading, .8, 3, null),
        tracking: bound(style.tracking, -3, 12, null),
        weight: bound(style.weight, 100, 900, null),
        align: ['start', 'center', 'end', 'justify'].includes(style.align) ? style.align : '',
        color: validColor(style.color) ? style.color.toLowerCase() : '',
        font: Object.hasOwn(fontFaces, style.font) ? style.font : '',
        bold: style.bold === true, italic: style.italic === true, underline: style.underline === true
      }];
    });
    return Object.fromEntries(entries);
  }

  const homePhotoSize = { min: 25, max: 65, default: 40, placement: 'right' };
  const itemPhotoSize = { min: 25, max: 100, default: 100, placement: 'bottom' };
  const imagePlacements = { top: '圖片在上', right: '圖片在右', bottom: '圖片在下', left: '圖片在左' };

  function normalizeLayout(owner, settings) {
    const size = owner.imageSize;
    return {
      offsets: Object.fromEntries(["photo","copy","listPhoto","listCopy","heading"].map(key => [key, [0,1].map(axis => {
        const value = owner.offsets?.[key]?.[axis];
        return Number.isFinite(value) ? Math.max(-96, Math.min(96, value)) : 0;
      })])),
      imageSize: Number.isFinite(size) ? Math.min(settings.max, Math.max(settings.min, Math.round(size))) : settings.default,
      imagePlacement: Object.hasOwn(imagePlacements, owner.imagePlacement) ? owner.imagePlacement : settings.placement,
      textAlign: owner.textAlign === 'center' ? 'center' : 'start'
    };
  }

  const newId = () => globalThis.crypto?.randomUUID?.() ??
    Date.now().toString(36) + Math.random().toString(36).slice(2);

  const newItem = (title = '') => ({
    id: newId(), title, meta: '', summary: '', motivation: '', role: '', challenge: '', outcome: '', reflection: '',
    link: '', linkLabel: '', image: '', imageAlt: '', styles: {}, ...normalizeLayout({}, itemPhotoSize), visible: true
  });

  const newSection = (kind = 'custom', title = '自訂章節') => ({
    id: newId(), kind, title, intro: '', styles: {}, layout: 'list', visible: true, items: []
  });

  function initialDraft() {
    const works = newSection('works', '我的作品');
    works.items.push({
      ...newItem('USB Guardian'),
      meta: 'Windows 資安教育工具 · 開發中',
      summary: '我想做一個 Windows 工具，幫使用者在插入不熟悉的 USB 裝置時，先留意可能的風險。'
    });
    const future = newSection('future', '未來的人生規劃');
    future.layout = 'grid';
    future.items = ['高中三年', '高中之後', '我想成為怎樣的人'].map(newItem);
    return {
      version: 1,
      profile: { homeSummary: '', homeTimeline: [], name: '', title: '我做過的事，和接下來想做的事。', intro: '', image: '', imageAlt: '', styles: {}, ...normalizeLayout({}, homePhotoSize) },
      theme: 'forest',
      customPalette: null,
      sections: [
        newSection('about', '關於我'), works, newSection('competitions', '比賽與成果'),
        newSection('activities', '活動與社團'), newSection('learning', '自主學習'), future
      ]
    };
  }

  const string = value => typeof value === 'string' ? value : '';
  const image = value => /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(string(value))
    ? value : '';
  const record = value => value && typeof value === 'object' && !Array.isArray(value);

  const sketchNames = {
    about: '手寫卡片', works: '鉛筆', competitions: '獎盃', activities: '對話框',
    learning: '翻開的書', future: '路標旗', custom: '筆記本',
    flight: '紙飛機', ridge: '山稜與夕陽', branch: '折枝', circuit: '電路走線'
  };

  function normalizeIllustration(data) {
    const art = record(data) ? data : {};
    const img = image(art.image);
    const mode = ['auto', 'none'].includes(art.mode) || Object.hasOwn(sketchNames, art.mode)
      || (art.mode === 'image' && img) ? art.mode : 'auto';
    return {
      mode, image: img, size: bound(art.size, 24, 168, 48),
      rotation: bound(art.rotation, -45, 45, 0), opacity: bound(art.opacity, 15, 100, 100),
      align: art.align === 'left' ? 'left' : 'right',
      color: validColor(art.color) ? art.color : '', pattern: art.pattern !== false
    };
  }

  function normalizeEditorBoxes(data) {
    return Object.fromEntries(Object.entries(record(data) ? data : {})
      .filter(([key, height]) => /^[a-zA-Z]+$/.test(key) && Number.isFinite(height))
      .map(([key, height]) => [key, bound(height, 70, 720, 110)]));
  }

  function safeLink(value) {
    try {
      const url = new URL(value);
      return ['https:', 'http:'].includes(url.protocol) ? url.href : '';
    } catch {
      return '';
    }
  }

  function normalizeDraft(data) {
    if (!record(data) || data.version !== 1 || !record(data.profile) || !Array.isArray(data.sections)) {
      throw new Error('這不是可讀取的作品集草稿 JSON。');
    }
    const profile = Object.fromEntries(['name', 'title', 'intro', 'imageAlt'].map(key => [key, string(data.profile[key])]));
    profile.homeSummary = string(data.profile.homeSummary);
    const timeline = Array.isArray(data.profile.homeTimeline) ? data.profile.homeTimeline : [];
    profile.homeTimeline = timeline.filter(record).map(entry => ({
      title: string(entry.title), description: string(entry.description), target: string(entry.target),
      grade: timelineGrades.includes(entry.grade) ? entry.grade : '國三',
      status: Object.hasOwn(timelineStatuses, entry.status) ? entry.status : 'planned'
    }));
    profile.image = image(data.profile.image);
    profile.styles = normalizeStyles(data.profile.styles);
    profile.illustration = normalizeIllustration(data.profile.illustration);
    profile.editorBoxes = normalizeEditorBoxes(data.profile.editorBoxes);
    Object.assign(profile, normalizeLayout(data.profile, homePhotoSize));
    const ids = new Set(['home', 'design']);
    function uniqueId(value) {
      const id = /^[a-z0-9-]{1,80}$/i.test(string(value)) && !ids.has(value) ? value : newId();
      ids.add(id);
      return id;
    }
    return {
      version: 1,
      profile,
      theme: data.theme === 'custom' || Object.hasOwn(themes, data.theme) ? data.theme : 'forest',
      customPalette: normalizePalette(data.customPalette),
      sections: data.sections.filter(record).map(section => ({
        id: uniqueId(section.id), kind: Object.hasOwn(kinds, section.kind) ? section.kind : 'custom',
        title: string(section.title), intro: string(section.intro), layout: section.layout === 'grid' ? 'grid' : 'list',
        visible: section.visible !== false, styles: normalizeStyles(section.styles),
        editorBoxes: normalizeEditorBoxes(section.editorBoxes), illustration: normalizeIllustration(section.illustration),
        items: (Array.isArray(section.items) ? section.items : []).filter(record).map(item => ({
          ...Object.fromEntries(['title', 'meta', 'summary', 'motivation', 'role', 'challenge', 'outcome', 'reflection', 'link', 'linkLabel', 'imageAlt'].map(key => [key, string(item[key])])),
          id: uniqueId(item.id), image: image(item.image), styles: normalizeStyles(item.styles), editorBoxes: normalizeEditorBoxes(item.editorBoxes),
          ...normalizeLayout(item, itemPhotoSize), visible: item.visible !== false
        }))
      }))
    };
  }

  function move(list, index, delta) {
    const target = index + delta;
    if (index < 0 || target < 0 || target >= list.length) return false;
    [list[index], list[target]] = [list[target], list[index]];
    return true;
  }

  function database() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open('student-portfolio-studio', 1);
      request.onupgradeneeded = () => request.result.createObjectStore('drafts');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  function load(db, key = 'current') {
    return new Promise((resolve, reject) => {
      const request = db.transaction('drafts').objectStore('drafts').get(key);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  function save(db, draft, key = 'current') {
    return new Promise((resolve, reject) => {
      const transaction = db.transaction('drafts', 'readwrite');
      const store = transaction.objectStore('drafts');
      if (draft === null) store.delete(key);
      else store.put(draft, key);
      transaction.oncomplete = resolve;
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
  }

  async function readImage(file) {
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
      throw new Error('請選擇 PNG、JPEG 或 WebP 圖片。');
    }
    const bitmap = await createImageBitmap(file);
    try {
      const ratio = Math.min(1, 1440 / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(bitmap.width * ratio));
      canvas.height = Math.max(1, Math.round(bitmap.height * ratio));
      canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      return canvas.toDataURL('image/webp', .86);
    } finally {
      bitmap.close();
    }
  }

  return { kinds, timelineGrades, timelineStatuses, themes, colorFields, validColor, contrast, currentTheme, fontFaces, webFonts, textLimits, textSizes, normalizeStyles,
    bound, sketchNames, normalizeIllustration,
    homePhotoSize, itemPhotoSize, imagePlacements, newId, newItem, newSection, initialDraft,
    normalizeDraft, safeLink, move, database, load, save, readImage };
})();
