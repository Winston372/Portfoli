'use strict';

const app = document.querySelector('#studio');
const sidebar = document.querySelector('#sections');
const editor = document.querySelector('#editor');
const preview = document.querySelector('#preview');
const frame = document.querySelector('#preview-frame');
const previewScroll = document.querySelector('#preview-scroll');
const saveState = document.querySelector('#save-state');
const importFile = document.querySelector('#import-file');
const message = document.querySelector('#message');

let draft = Portfolio.initialDraft();
let db;
let selection = 'home';
let itemSelection;
let saveVersion = 0;
let messageTimer;
let ready = false;
let currentPage = 'home';
let currentPreviewItem;
let cloudSync;
let cloudBlocked = false;

function element(tag, className, ...children) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  node.append(...children.filter(child => child != null));
  return node;
}

function button(label, handler, { className = 'quiet', disabled = false } = {}) {
  const node = element('button', className, label);
  node.type = 'button';
  node.disabled = disabled;
  node.addEventListener('click', handler);
  return node;
}

function notice(text) {
  clearTimeout(messageTimer);
  message.textContent = text;
  message.hidden = false;
  messageTimer = setTimeout(() => { message.hidden = true; }, 5500);
}

function save() {
  if (cloudSync) { cloudSync.queue(draft); return; }
  if (!db) return;
  const version = ++saveVersion;
  saveState.textContent = '儲存中';
  Portfolio.save(db, draft).then(() => {
    if (version === saveVersion) saveState.textContent = '已存於此瀏覽器';
  }).catch(() => {
    if (version === saveVersion) saveState.textContent = '自動儲存失敗，請匯出草稿';
  });
}

function update({ rebuild = false } = {}) {
  if (rebuild) renderEditor();
  renderSidebar();
  renderPreview();
  save();
}

function focusField(role) {
  editor.querySelector('[data-focus="' + role + '"]')?.focus();
}

function goToPreview(id, focus = false, itemId) {
  if (id !== 'home' && !draft.sections.some(section => section.id === id && section.visible)) return;
  currentPage = id;
  currentPreviewItem = itemId;
  renderPreview();
  previewScroll.scrollTop = 0;
  if (document.body.classList.contains('public-site')) window.scrollTo(0, 0);
  if (focus) preview.querySelector('.page-content').focus({ preventScroll: true });
}

function select(id, item) {
  selection = id;
  itemSelection = item;
  setView('edit');
  renderSidebar();
  renderEditor();
  goToPreview(id);
}

function heading(label, title, hint) {
  return element('div', 'editor-heading', element('p', 'overline', label),
    element('h1', '', title), element('p', 'muted', hint));
}

function renderSidebar() {
  const choices = [{ id: 'home', title: '首頁' }, ...draft.sections];
  sidebar.replaceChildren(...choices.map(section => {
    const control = button(section.title || '未命名章節', () => select(section.id), { className: 'nav-choice' });
    if (selection === section.id) control.setAttribute('aria-current', 'true');
    if (section.visible === false) control.append(element('span', 'nav-status', '隱藏'));
    return control;
  }));
  document.querySelector('#design').setAttribute('aria-pressed', String(selection === 'design'));
  document.querySelector('#quick-draw').disabled = selection === 'design';
}

const boxObserver = new MutationObserver(records => {
  for (const { target } of records) {
    const height = parseFloat(target.style.height);
    if (!Number.isFinite(height) || !target.editorBox) continue;
    const { owner, key } = target.editorBox;
    const fittedHeight = Portfolio.bound(height, 70, 720, 110);
    owner.editorBoxes ||= {};
    if (owner.editorBoxes[key] === fittedHeight) continue;
    owner.editorBoxes[key] = fittedHeight;
    save();
  }
});

function field(owner, key, label, { long = false, focus, placeholder = '' } = {}) {
  const control = element(long ? 'textarea' : 'input', '');
  if (long) {
    control.rows = 4;
    control.style.height = owner.editorBoxes?.[key] ? owner.editorBoxes[key] + 'px' : '';
    boxObserver.observe(control, { attributes: true, attributeFilter: ['style'] });
  }
  control.value = owner[key];
  control.placeholder = placeholder;
  if (focus) control.dataset.focus = focus;
  control.addEventListener('input', () => {
    owner[key] = control.value;
    renderPreview();
    if (selection !== 'home' && key === 'title' && draft.sections.includes(owner)) renderSidebar();
    save();
  });
  const input = element('label', 'field', element('span', '', label), control);
  if (long) {
    control.editorBox = { owner, key };
    const resize = element('div', 'row box-sizing', ...[110, 220, 420].map((height, index) =>
      button(['精簡', '加高', '大編輯框'][index], () => { control.style.height = height + 'px'; })));
    resize.setAttribute('role', 'group');
    resize.setAttribute('aria-label', label + '輸入框高度');
    return element('div', 'editable-text', input, resize, textToolbar(owner, key, label));
  }
  if (key === 'link' || key === 'linkLabel') return input;
  return element('div', 'editable-text', input, textToolbar(owner, key, label));
}

function textToolbar(owner, key, label) {
  const style = { ...owner.styles[key] };
  const sizes = element('select', '', new Option('選用常用字級', ''),
    ...Portfolio.textSizes.map(value => new Option(value + ' px', value)));
  const face = element('select', '', new Option('預設', ''),
    ...Object.entries(Portfolio.fontFaces).map(([value, name]) => new Option(name, value)));
  const color = element('input', 'color-picker');
  color.type = 'color';
  const controls = element('div', 'text-controls');
  controls.setAttribute('role', 'group');
  controls.setAttribute('aria-label', label + '文字格式');

  face.value = style.font ?? '';
  color.value = style.color || Portfolio.currentTheme(draft).ink;

  function change() {
    owner.styles[key] = style;
    renderPreview();
    save();
  }

  const numbers = Object.entries(Portfolio.textLimits).map(([property, [min, max, step]]) => {
    const control = element('input', '');
    control.type = 'number';
    control.min = min;
    control.max = max;
    control.step = step;
    control.placeholder = '預設';
    control.value = style[property] ?? '';
    control.addEventListener('input', () => {
      if (!control.validity.valid) return;
      style[property] = control.value === '' ? null : control.valueAsNumber;
      change();
    });
    control.addEventListener('change', () => {
      control.value = control.value === '' ? '' : Portfolio.bound(control.valueAsNumber, min, max, min);
      style[property] = control.value === '' ? null : control.valueAsNumber;
      change();
    });
    return control;
  });
  sizes.addEventListener('change', () => {
    if (!sizes.value) return;
    numbers[0].value = sizes.value;
    style.size = Number(sizes.value);
    sizes.value = '';
    change();
  });
  const alignment = element('select', '',
    ...[['','預設'], ['start','靠左'], ['center','置中'], ['end','靠右'], ['justify','左右對齊']]
      .map(([value, label]) => new Option(label, value)));
  alignment.value = style.align || '';
  alignment.onchange = () => { style.align = alignment.value; change(); };
  face.addEventListener('change', () => { style.font = face.value; change(); });
  color.addEventListener('input', () => { style.color = color.value; change(); });

  const toggles = [['bold', 'B', '粗體'], ['italic', 'I', '斜體'], ['underline', 'U', '底線']].map(([key, symbol, title]) => {
    const toggle = button(symbol, () => {
      style[key] = !style[key];
      toggle.setAttribute('aria-pressed', String(style[key]));
      change();
    }, { className: 'quiet format-' + key });
    toggle.setAttribute('aria-label', title);
    toggle.title = title;
    toggle.setAttribute('aria-pressed', String(Boolean(style[key])));
    return toggle;
  });
  const reset = button('清除格式', () => {
    for (const key of Object.keys(style)) delete style[key];
    numbers.forEach(control => { control.value = ''; });
    alignment.value = '';
    face.value = '';
    color.value = Portfolio.currentTheme(draft).ink;
    toggles.forEach(toggle => toggle.setAttribute('aria-pressed', 'false'));
    change();
  });
  const numberLabels = ['字級（px）', '行高（倍）', '字距（px）', '字重'];
  controls.append(...numbers.map((control, index) => element('label', 'field', numberLabels[index], control)),
    element('label', 'field', '常用字級', sizes),
    element('label', 'field', '段落對齊', alignment),
    element('label', 'field', element('span', '', '字型'), face),
    element('label', 'field', element('span', '', '字色'), color),
    element('div', 'row', ...toggles, reset));

  return element('details', 'text-format', element('summary', '', '文字格式'), controls);
}

function checkbox(label, checked, change) {
  const control = element('input', '');
  control.type = 'checkbox';
  control.checked = checked;
  control.addEventListener('change', () => change(control.checked));
  return element('label', 'check', control, label);
}

function renderImage(owner, caption) {
  const input = element('input', 'file-field');
  input.type = 'file';
  input.accept = 'image/png,image/jpeg,image/webp';
  input.addEventListener('change', async () => {
    const file = input.files[0];
    if (!file) return;
    try {
      const result = await Portfolio.readImage(file);
      const active = owner === draft.profile || draft.sections.some(section => section.items.includes(owner));
      if (!active) return;
      owner.image = result;
      update({ rebuild: editor.contains(input) });
    } catch {
      notice('這張圖片無法讀取，請換一張 PNG、JPEG 或 WebP。');
    } finally {
      input.value = '';
    }
  });
  const box = element('div', 'media-field', element('label', 'field', caption, input));
  if (owner.image) {
    const image = element('img', 'thumbnail');
    image.src = owner.image;
    image.alt = '';
    box.append(element('div', 'media-row', image, button('移除圖片', () => {
      owner.image = '';
      update({ rebuild: true });
    })));
    box.append(field(owner, 'imageAlt', '圖片描述（顯示在圖片下方）', {
      placeholder: '例如：USB Guardian 的裝置提醒畫面'
    }));
  }
  return box;
}

function renderLayoutControls(owner, section) {
  const home = !section;
  const settings = home ? Portfolio.homePhotoSize : Portfolio.itemPhotoSize;
  const prefix = home ? 'home' : 'item';
  function selectField(control, key, caption) {
    const label = element('label', '', caption);
    control.id = prefix + '-' + key;
    label.htmlFor = control.id;
    return element('div', 'field', label, control);
  }
  const align = element('select', '', new Option('靠左', 'start'), new Option('置中', 'center'));
  align.value = owner.textAlign;
  align.addEventListener('change', () => {
    owner.textAlign = align.value;
    refresh();
  });
  const box = element('div', 'photo-size-control', selectField(align, 'text-alignment', '文字對齊'));
  function refresh() {
    goToPreview(section?.id || 'home', false, section ? owner.id : undefined);
    save();
  }
  if (!owner.image) return box;

  const placement = element('select', '', ...Object.entries(Portfolio.imagePlacements).map(([key, label]) =>
    new Option(label, key)));
  placement.value = owner.imagePlacement;
  placement.addEventListener('change', () => {
    owner.imagePlacement = placement.value;
    refresh();
  });

  const range = element('input', 'photo-size-range');
  range.id = home ? 'home-photo-size' : 'item-photo-size';
  range.type = 'range';
  range.min = settings.min;
  range.max = settings.max;
  range.value = owner.imageSize;
  const value = element('span', 'photo-size-value');
  const reset = button('恢復預設大小', () => setSize(settings.default));
  function showSize() {
    value.textContent = owner.imageSize + '%';
    range.setAttribute('aria-valuetext', owner.imageSize + '%');
    reset.disabled = owner.imageSize === settings.default;
  }
  function setSize(size) {
    owner.imageSize = size;
    range.value = size;
    showSize();
    refresh();
  }
  range.addEventListener('input', () => setSize(range.valueAsNumber));
  showSize();
  const label = element('label', 'field', home ? '首頁照片大小' : '圖片大小');
  label.htmlFor = range.id;
  box.append(selectField(placement, 'image-placement', '圖片位置'), label,
    element('div', 'photo-size-row', range, value), element('div', 'row', reset));
  return box;
}

function addItem(section) {
  const item = Portfolio.newItem();
  section.items.push(item);
  itemSelection = item.id;
  update({ rebuild: true });
  focusField('item-title');
}

function moveControl(label, list, value, delta) {
  const index = list.indexOf(value);
  return button(label, () => {
    Portfolio.move(list, index, delta);
    update({ rebuild: true });
  }, { disabled: index + delta < 0 || index + delta >= list.length });
}

function renderSection(section) {
  const kind = Portfolio.kinds[section.kind];
  const layout = element('select', '', new Option('直式清單', 'list'), new Option('並排卡片', 'grid'));
  layout.value = section.layout;
  layout.addEventListener('change', () => { section.layout = layout.value; update(); });
  const sectionSettings = element('details', 'section-settings',
    element('summary', '', '版型、可見性與排序'),
    element('label', 'field', '內容排版', layout),
    checkbox('在網站上顯示此章節', section.visible, visible => { section.visible = visible; update(); }),
    element('div', 'row',
      moveControl('上移章節', draft.sections, section, -1),
      moveControl('下移章節', draft.sections, section, 1)));
  const dialog = element('dialog', 'delete-dialog');
  dialog.setAttribute('aria-labelledby', 'delete-section-title');
  const title = element('h2', '', '刪除章節？');
  title.id = 'delete-section-title';
  const description = element('p', 'muted');
  const cancel = button('取消', () => dialog.close());
  cancel.autofocus = true;
  const confirmRemove = button('確認刪除', () => {
    const name = section.title || '未命名章節';
    dialog.close();
    const index = draft.sections.indexOf(section);
    draft.sections.splice(index, 1);
    renderPreview();
    select(draft.sections[index]?.id ?? draft.sections[index - 1]?.id ?? 'home');
    sidebar.querySelector('[aria-current]')?.focus();
    save();
    notice('已刪除「' + name + '」。');
  }, { className: 'danger' });
  dialog.append(title, description, element('div', 'row', cancel, confirmRemove));
  const remove = button('刪除章節', () => {
    description.textContent = '「' + (section.title || '未命名章節') + '」及其中的所有項目都會刪除。';
    dialog.showModal();
  }, { className: 'danger' });
  sectionSettings.open = editor.querySelector('.section-settings')?.open ?? false;
  const add = button('新增' + kind.singular, () => addItem(section), { className: 'add-item' });
  const itemList = element('div', 'item-list');
  section.items.forEach(item => {
    const isCurrent = item.id === itemSelection;
    const toggle = button((item.title || '未命名項目') + (item.visible ? '' : '（隱藏）'), () => {
      itemSelection = isCurrent ? undefined : item.id;
      renderEditor();
    }, { className: 'item-choice' });
    toggle.setAttribute('aria-expanded', String(isCurrent));
    toggle.setAttribute('aria-controls', 'edit-' + item.id);
    const panel = element('article', 'item-shell', toggle);
    const body = element('div', 'item-fields');
    body.id = 'edit-' + item.id;
    body.hidden = !isCurrent;
    if (isCurrent) {
      const title = field(item, 'title', '項目名稱', { focus: 'item-title' });
      title.querySelector('input').addEventListener('input', () => {
        toggle.textContent = (item.title || '未命名項目') + (item.visible ? '' : '（隱藏）');
      });
      body.append(title, ...kind.fields.map(([key, label]) => field(item, key, label, { long: key !== 'meta' })),
        element('details', 'extra', element('summary', '', '圖片與連結'),
          renderImage(item, '新增或更換項目圖片'),
          renderLayoutControls(item, section),
          field(item, 'link', '連結網址', { placeholder: 'https://...' }),
          field(item, 'linkLabel', '連結文字', { placeholder: '例如：閱讀完整作品' })),
        checkbox('在網站上顯示此項目', item.visible, visible => {
          item.visible = visible;
          toggle.textContent = (item.title || '未命名項目') + (visible ? '' : '（隱藏）');
          update();
        }),
        element('div', 'row', moveControl('上移', section.items, item, -1),
          moveControl('下移', section.items, item, 1),
          button('複製', () => {
            const copy = { ...structuredClone(item), styles: Portfolio.normalizeStyles(item.styles), id: Portfolio.newId(), title: (item.title || '未命名項目') + '（副本）' };
            section.items.splice(section.items.indexOf(item) + 1, 0, copy);
            itemSelection = copy.id;
            update({ rebuild: true });
            focusField('item-title');
          }),
          button('刪除', () => {
            if (!confirm('刪除「' + (item.title || '未命名項目') + '」？')) return;
            section.items.splice(section.items.indexOf(item), 1);
            itemSelection = undefined;
            update({ rebuild: true });
            editor.querySelector('.add-item')?.focus();
          }, { className: 'danger' })));
      body.querySelector('.extra').open = editor.querySelector('#edit-' + item.id + ' .extra')?.open ?? false;
    }
    panel.append(body);
    itemList.append(panel);
  });

  return [element('div', 'section-editor-head', heading('編輯章節', section.title || '未命名章節', kind.hint), remove, dialog),
    element('div', 'fields',
      field(section, 'title', '章節名稱', { focus: 'section-title' }),
      field(section, 'intro', '章節引言', { long: true }), sectionSettings, illustrationEditor(section, section.kind)),
    element('div', 'items-head', element('h2', '', '章節內容'), add), itemList];
}

function renderTheme() {
  const selected = Portfolio.currentTheme(draft);
  const entries = Object.entries(Portfolio.colorFields);
  const palette = Object.fromEntries(entries.map(([key]) => [key, selected[key]]));
  const choices = Object.entries(Portfolio.themes).map(([key, theme]) => {
    const colors = entries.map(([name]) => {
      const swatch = element('span', 'swatch');
      swatch.style.backgroundColor = theme[name];
      return swatch;
    });
    const strip = element('span', 'swatch-strip', ...colors);
    strip.setAttribute('aria-hidden', 'true');
    const control = button(theme.label, () => { draft.theme = key; update({ rebuild: true }); },
      { className: 'theme-option' });
    control.append(strip, element('span', 'theme-motif-label', theme.motif));
    control.setAttribute('aria-pressed', String(draft.theme === key));
    return control;
  });
  const warning = element('p', 'palette-warning');
  warning.setAttribute('aria-live', 'polite');
  const restore = button('套用上次自訂色', () => { draft.theme = 'custom'; update({ rebuild: true }); });
  restore.hidden = draft.theme === 'custom' || !draft.customPalette;
  function checkContrast() {
    warning.textContent = [palette.paper, palette.surface].some(background =>
      Portfolio.contrast(palette.ink, background) < 4.5)
      ? '文字與底色的對比偏低，可以調整文字或底色。' : '';
    warning.hidden = !warning.textContent;
  }
  function applyColor(key, value) {
    palette[key] = value.toLowerCase();
    draft.customPalette = { ...palette };
    draft.theme = 'custom';
    choices.forEach(choice => choice.setAttribute('aria-pressed', 'false'));
    restore.hidden = true;
    checkContrast();
    renderPreview();
    save();
  }
  const fields = entries.map(([key, label]) => {
    const picker = element('input', 'color-picker');
    picker.type = 'color';
    picker.value = palette[key];
    picker.setAttribute('aria-label', label + '選色器');
    const hex = element('input', 'hex-color');
    hex.value = palette[key].toUpperCase();
    hex.maxLength = 7;
    hex.spellcheck = false;
    hex.setAttribute('aria-label', label + '色碼');
    const error = element('small', 'palette-warning', '請輸入六位十六進位色碼，如 #22634C。');
    error.id = 'color-error-' + key;
    error.hidden = true;
    hex.setAttribute('aria-describedby', error.id);
    picker.addEventListener('input', () => {
      hex.value = picker.value.toUpperCase();
      hex.removeAttribute('aria-invalid');
      error.hidden = true;
      applyColor(key, picker.value);
    });
    hex.addEventListener('input', () => {
      const value = hex.value.trim();
      const valid = Portfolio.validColor(value);
      error.hidden = valid;
      hex.setAttribute('aria-invalid', String(!valid));
      if (valid) {
        picker.value = value;
        applyColor(key, value);
      }
    });
    return element('div', 'field', element('span', '', label),
      element('div', 'color-editor-row', picker, hex), error);
  });
  checkContrast();
  return [heading('外觀', '版面與配色', '選一組色票，或直接修改選色器與色碼。'),
    element('h2', 'group-title', '推薦配色'), element('div', 'theme-list', ...choices),
    element('div', 'custom-colors', element('div', 'items-head',
      element('h2', '', '自訂顏色'), restore), element('div', 'color-fields', ...fields), warning)];
}

function renderEditor() {
  const oldScroll = editor.scrollTop;
  boxObserver.disconnect();
  let content;
  if (selection === 'home') {
    content = [heading('編輯首頁', '首頁內容', '首頁是老師打開網站看到的第一頁。'),
      element('div', 'fields',
        field(draft.profile, 'name', '顯示名稱', { placeholder: '姓名或你想顯示的稱呼' }),
        field(draft.profile, 'title', '首頁標題', { long: true }),
        field(draft.profile, 'intro', '自我介紹', { long: true, placeholder: '你是誰、對什麼感興趣，以及最近做過的一件事。可分成幾段寫。' }),
        renderHomeExtrasEditor(draft.profile),
        renderImage(draft.profile, '新增或更換首頁照片'),
        renderLayoutControls(draft.profile), illustrationEditor(draft.profile, 'none'))];
  } else if (selection === 'design') {
    content = renderTheme();
  } else {
    const section = draft.sections.find(entry => entry.id === selection);
    content = renderSection(section);
  }
  editor.replaceChildren(...content);
  editor.scrollTop = oldScroll;
  const titleField = editor.querySelector('[data-focus="section-title"]');
  titleField?.addEventListener('input', () => {
    editor.querySelector('h1').textContent = titleField.value || '未命名章節';
  });
}

function styledText(tag, className, value, owner, key) {
  const node = element(tag, className, value);
  const style = owner.styles[key];
  if (!style) return node;
  if (style.size) node.style.fontSize = 'min(' + (style.size / 16) + 'rem, calc(1rem + 11cqw))';
  if (style.color) node.style.color = style.color;
  if (style.font) {
    node.classList.add('font-' + style.font);
    const fontQuery = Portfolio.webFonts[style.font];
    if (fontQuery && !document.getElementById('webfont-' + style.font)) {
      const link = element('link', '');
      link.id = 'webfont-' + style.font;
      link.rel = 'stylesheet';
      link.href = 'https://fonts.googleapis.com/css2?family=' + encodeURIComponent(fontQuery) + '&display=swap';
      link.referrerPolicy = 'no-referrer';
      document.head.append(link);
    }
  }
  if (style.leading) node.style.lineHeight = style.leading;
  if (Number.isFinite(style.tracking)) node.style.letterSpacing = style.tracking + 'px';
  if (style.align) node.style.textAlign = style.align;
  if (style.bold) node.style.fontWeight = '800';
  if (style.weight) node.style.fontWeight = style.weight;
  if (style.italic) node.style.fontStyle = 'italic';
  if (style.underline) node.style.textDecoration = 'underline';
  return node;
}

function imageFigure(owner) {
  const caption = owner.imageAlt.trim();
  const image = element('img', 'page-image');
  image.src = owner.image;
  image.alt = caption;
  return element('figure', 'page-figure', image,
    caption ? styledText('figcaption', 'page-caption', caption, owner, 'imageAlt') : null);
}

function previewLink(label, id, className = '') {
  const link = element('a', className, label);
  link.href = '#page-' + id;
  if (id === currentPage && className === 'page-nav-link') link.setAttribute('aria-current', 'page');
  link.addEventListener('click', event => {
    event.preventDefault();
    goToPreview(id, true);
  });
  return link;
}

function renderPageHeader(profile, sections) {
  const logo = previewLink(profile.name || '個人網站', 'home', 'page-brand');
  logo.prepend(drawing('compass'));
  const toggle = button('章節選單', () => openMenu(toggle.getAttribute('aria-expanded') !== 'true'),
    { className: 'page-menu-toggle' });
  const nav = element('nav', 'page-nav',
    previewLink('首頁', 'home', 'page-nav-link'),
    ...sections.map(section => previewLink(section.title || '未命名章節', section.id, 'page-nav-link')));
  nav.id = 'page-nav';
  nav.setAttribute('aria-label', '作品集章節導覽');
  toggle.setAttribute('aria-controls', nav.id);
  const header = element('header', 'page-header', logo, toggle, nav);
  function openMenu(open) {
    toggle.setAttribute('aria-expanded', String(open));
    header.classList.toggle('menu-open', open);
  }
  openMenu(false);
  header.addEventListener('keydown', event => {
    if (event.key === 'Escape' && toggle.getAttribute('aria-expanded') === 'true') {
      openMenu(false);
      toggle.focus();
    }
  });
  header.addEventListener('focusout', event => {
    if (!header.contains(event.relatedTarget)) openMenu(false);
  });
  return header;
}

function timelineTargets(sections) {
  const targets = new Map();
  for (const section of sections.filter(section => section.visible)) {
    const label = section.title || '未命名章節';
    targets.set(section.id, { label, sectionId: section.id });
    for (const item of section.items.filter(item => item.visible)) {
      targets.set(section.id + '/' + item.id, {
        label: label + ' ／ ' + (item.title || '未命名項目'), sectionId: section.id, itemId: item.id
      });
    }
  }
  return targets;
}

function renderHomeExtrasEditor(profile) {
  const rows = profile.homeTimeline;
  const targets = timelineTargets(draft.sections);
  const timeline = element('div', 'fields timeline-editor-list');
  const details = element('details', 'section-settings home-extras-editor');
  details.open = editor.querySelector('.home-extras-editor')?.open || false;

  function updateHome() {
    renderPreview();
    save();
  }

  function textField(owner, property, label, lines, placeholder = '') {
    const control = element(lines ? 'textarea' : 'input', '');
    if (lines) control.rows = lines;
    control.value = owner[property];
    control.placeholder = placeholder;
    control.oninput = () => { owner[property] = control.value; updateHome(); };
    return element('label', 'field', label, control);
  }

  function selectField(row, property, label, choices) {
    const select = element('select', '', ...choices.map(([value, text]) => new Option(text, value)));
    select.value = row[property];
    select.onchange = () => {
      row[property] = select.value;
      if (property === 'grade') refresh(row, 'select');
      updateHome();
    };
    return element('label', 'field', label, select);
  }

  function refresh(focusRow, focusSelector = 'input') {
    const ordered = Portfolio.timelineGrades.flatMap(grade => rows.filter(row => row.grade === grade));
    const cards = ordered.map((row, index) => {
      const choices = [['', '在時間軸就地展開介紹'],
        ...Array.from(targets, ([key, target]) => [key, target.label])];
      if (row.target && !targets.has(row.target)) choices.push([row.target, '原連結目前隱藏或已刪除']);

      function move(neighbor) {
        const first = rows.indexOf(row);
        const second = rows.indexOf(neighbor);
        [rows[first], rows[second]] = [rows[second], rows[first]];
        refresh(row);
        updateHome();
      }

      const previous = ordered[index - 1];
      const next = ordered[index + 1];
      return element('fieldset', 'section-settings timeline-entry-editor',
        element('legend', '', '紀錄 ' + (index + 1)),
        textField(row, 'title', '事件名稱', 0),
        element('div', 'timeline-entry-options',
          selectField(row, 'grade', '年級', Portfolio.timelineGrades.map(grade => [grade, grade])),
          selectField(row, 'status', '狀態', Object.entries(Portfolio.timelineStatuses))),
        textField(row, 'description', '事件介紹', 3),
        selectField(row, 'target', '點擊後跳到', choices),
        element('div', 'row',
          button('上移', () => move(previous), { disabled: previous?.grade !== row.grade }),
          button('下移', () => move(next), { disabled: next?.grade !== row.grade }),
          button('刪除紀錄', () => {
            if (!confirm('刪除這筆時間軸紀錄？')) return;
            rows.splice(rows.indexOf(row), 1);
            refresh(next || previous);
            if (!rows.length) add.focus();
            updateHome();
          }, { className: 'danger' })));
    });
    timeline.replaceChildren(...cards);
    const active = cards[ordered.indexOf(focusRow)];
    active?.querySelector(focusSelector)?.focus();
  }

  const add = button('新增時間軸紀錄', () => {
    const row = { grade: '國三', status: 'planned', title: '', description: '', target: '' };
    rows.push(row);
    refresh(row);
    save();
  }, { className: 'add-item' });
  refresh();

  details.append(element('summary', '', '首頁摘要與時間軸'),
    textField(profile, 'homeSummary', '首頁摘要', 5, '每行輸入一個重點，首頁會自動排成條列。'),
    element('p', 'muted', '時間軸依年級排列。同年級的紀錄可用上移或下移調整。'),
    add, timeline);
  return details;
}

function renderHomeExtras(profile, sections) {
  const blocks = [];
  const lines = profile.homeSummary.split('\n').map(line => line.trim()).filter(Boolean);
  if (lines.length) {
    blocks.push(element('section', 'home-notes',
      element('h2', '', '摘要'), element('ul', 'home-summary-list', ...lines.map(line => element('li', '', line)))));
  }

  const entries = profile.homeTimeline.filter(entry => entry.title.trim());
  if (!entries.length) return blocks;
  const targets = timelineTargets(sections);
  const stages = Portfolio.timelineGrades.flatMap(grade => {
    const rows = entries.filter(entry => entry.grade === grade);
    if (!rows.length) return [];
    const events = rows.map(entry => {
      const title = entry.title.trim();
      const target = targets.get(entry.target);
      const description = entry.description.trim() ? element('p', '', entry.description) : null;
      const status = element('span', 'milestone-status status-' + entry.status, Portfolio.timelineStatuses[entry.status]);
      let content;
      if (target) {
        const link = element('a', 'milestone-link', title);
        const arrow = element('span', '', '↗');
        arrow.setAttribute('aria-hidden', 'true');
        link.append(arrow);
        link.href = '#page-' + target.sectionId;
        link.addEventListener('click', event => {
          event.preventDefault();
          goToPreview(target.sectionId, true, target.itemId);
        });
        content = element('div', '', element('h4', '', link), description);
      } else if (description) {
        content = element('details', 'milestone-description', element('summary', '', title), description);
      } else {
        content = element('h4', '', title);
      }
      return element('li', 'milestone', status, content);
    });
    return [element('li', 'milestone-year', element('h3', '', grade), element('ul', '', ...events))];
  });
  blocks.push(element('section', 'home-notes',
    element('h2', '', '國中到高中'), element('ol', 'home-milestones', ...stages)));
  return blocks;
}

function renderHomepage(profile, sections) {
  const works = sections.find(section => section.kind === 'works');
  const copy = element('div', 'page-home-copy',
    element('p', 'page-kicker home-kicker', '國中學習與作品集'),
    styledText('h1', '', profile.name || profile.title || '個人網站', profile, profile.name ? 'name' : 'title'),
    profile.name && profile.title ? styledText('p', 'page-tagline', profile.title, profile, 'title') : null,
    profile.intro ? element('div', 'page-bio', element('h2', '', '自我介紹'),
      styledText('p', 'page-intro', profile.intro, profile, 'intro')) : null,
    works ? element('div', 'page-action', previewLink('看我的作品', works.id)) : null);
  const hero = mediaLayout(element('section', 'page-hero'), profile, copy, Portfolio.homePhotoSize);
  const badge = renderIllustration(profile, 'none');
  if (badge) copy.prepend(badge);
  const home = element('div', 'page-home', hero);
  home.id = 'page-home';
  if (sections.length) {
    const directory = element('nav', 'home-directory',
      element('h2', '', '章節索引'),
      element('ul', '', ...sections.map(section => element('li', '',
        previewLink(section.title || '未命名章節', section.id)))));
    directory.setAttribute('aria-label', '首頁章節索引');
    home.append(directory);
  }
  home.append(...renderHomeExtras(profile, sections));
  return home;
}

function renderIllustration(owner, fallback) {
  const art = Portfolio.normalizeIllustration(owner.illustration);
  const mode = art.mode === 'auto' ? fallback : art.mode;
  if (mode === 'none') return null;
  const sketch = mode === 'image' ? element('img', 'art-image') :
    mode === 'frame' ? drawing('frame') : chapterSketch(mode);
  if (mode === 'image') {
    sketch.src = art.image;
    sketch.alt = '';
  }
  const figure = element('span', 'illustration', sketch);
  figure.setAttribute('aria-hidden', 'true');
  figure.dataset.align = art.align;
  figure.style.setProperty('--art-size', art.size + 'px');
  figure.style.setProperty('--art-angle', art.rotation + 'deg');
  figure.style.setProperty('--art-opacity', art.opacity / 100);
  if (art.color) figure.style.setProperty('--art-color', art.color);
  return figure;
}

function illustrationEditor(owner, fallback) {
  const art = Portfolio.normalizeIllustration(owner.illustration);
  const dialog = element('dialog', 'drawing-dialog');
  const heading = element('h2', '', '手繪插圖');
  dialog.setAttribute('aria-label', heading.textContent);
  const sample = element('div', 'art-sample');
  const source = element('select', '',
    ...[['auto', '章節預設'], ['none', '隱藏插圖'], ...Object.entries(Portfolio.sketchNames), ['image', '上傳或手繪']]
      .map(([key, label]) => new Option(label, key)));
  const customOption = source.lastElementChild;
  const ink = element('input', '');
  ink.type = 'color';
  ink.value = art.color || Portfolio.currentTheme(draft).accent;

  function refresh() {
    source.value = art.mode;
    customOption.disabled = !art.image;
    sample.replaceChildren(renderIllustration({ illustration: art }, fallback) || element('span', 'muted', '未顯示插圖'));
  }
  function apply() {
    owner.illustration = { ...art };
    refresh();
    renderPreview();
    save();
  }
  source.onchange = () => { art.mode = source.value; apply(); };
  ink.oninput = () => { art.color = ink.value; apply(); };
  const slider = (key, label, min, max, unit) => {
    const input = element('input', 'photo-size-range');
    input.type = 'range';
    input.min = min;
    input.max = max;
    input.value = art[key];
    const output = element('span', 'photo-size-value', art[key] + unit);
    input.oninput = () => {
      art[key] = input.valueAsNumber;
      output.textContent = art[key] + unit;
      input.setAttribute('aria-valuetext', output.textContent);
      apply();
    };
    return element('label', 'field', label, element('span', 'photo-size-row', input, output));
  };
  const position = element('select', '', new Option('左側', 'left'), new Option('右側', 'right'));
  position.value = art.align;
  position.onchange = () => { art.align = position.value; apply(); };
  const file = element('input', 'file-field');
  file.type = 'file';
  file.accept = 'image/png,image/jpeg,image/webp';
  function useArtwork(image) {
    art.image = image;
    art.mode = 'image';
    apply();
  }
  file.onchange = async () => {
    const selected = file.files[0];
    if (!selected) return;
    try {
      const image = await Portfolio.readImage(selected);
      if (editor.contains(file)) useArtwork(image);
    } catch {
      notice('無法讀取插圖，請選擇 PNG、JPEG 或 WebP。');
    } finally {
      file.value = '';
    }
  };
  const draw = button('開啟畫布', () => {
    dialog.replaceChildren(heading, drawingPad(useArtwork, () => dialog.close()));
    dialog.showModal();
  }, { className: 'quiet drawing-launch' });
  refresh();
  return element('details', 'section-settings illustration-settings', element('summary', '', '插圖與底紋'),
    element('div', 'art-picker', element('label', 'field', '插圖樣式', source), sample),
    element('div', 'row', draw, button('插圖色跟隨配色', () => {
      art.color = '';
      ink.value = Portfolio.currentTheme(draft).accent;
      apply();
    })),
    element('label', 'field', '上傳插圖', file),
    element('div', 'art-controls', slider('size', '插圖大小', 24, 168, ' px'),
      slider('rotation', '旋轉角度', -45, 45, '°'), slider('opacity', '不透明度', 15, 100, '%'),
      element('label', 'field', '插圖位置', position), element('label', 'field', '線稿顏色', ink)),
    checkbox('顯示這一頁的背景底紋', art.pattern, on => { art.pattern = on; apply(); }),
    dialog);
}

function drawingPad(useArtwork, close) {
  const canvas = element('canvas', 'sketch-pad');
  canvas.width = 880;
  canvas.height = 550;
  canvas.setAttribute('aria-label', '手繪插圖畫布');
  const context = canvas.getContext('2d');
  const color = element('input', '');
  color.type = 'color';
  color.value = Portfolio.currentTheme(draft).accent;
  const width = element('input', '');
  width.type = 'range';
  width.min = '2';
  width.max = '32';
  width.value = '6';
  const strokes = [];
  let penOnly = false;
  let active;
  let pointer;

  function point(event) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: (event.clientX - rect.left) * canvas.width / rect.width,
      y: (event.clientY - rect.top) * canvas.height / rect.height,
      pressure: event.pointerType === 'pen' && event.pressure > 0 ? event.pressure : .5
    };
  }

  function segment(stroke, first, last) {
    const thickness = stroke.width * (.42 + 1.16 * last.pressure);
    context.strokeStyle = stroke.color;
    context.fillStyle = stroke.color;
    if (first.x === last.x && first.y === last.y) {
      context.beginPath();
      context.arc(last.x, last.y, thickness / 2, 0, Math.PI * 2);
      context.fill();
      return;
    }
    context.lineWidth = thickness;
    context.lineCap = 'round';
    context.beginPath();
    context.moveTo(first.x, first.y);
    context.lineTo(last.x, last.y);
    context.stroke();
  }

  function redraw() {
    context.clearRect(0, 0, canvas.width, canvas.height);
    for (const stroke of strokes) {
      for (const [index, p] of stroke.points.entries()) segment(stroke, stroke.points[index - 1] || p, p);
    }
    updateControls();
  }

  function updateControls() {
    undo.disabled = clear.disabled = apply.disabled = downloadDrawing.disabled = strokes.length === 0;
  }
  canvas.onpointerdown = event => {
    if (active || (penOnly && event.pointerType !== 'pen') || event.button !== 0 || !event.isPrimary) return;
    pointer = event.pointerId;
    canvas.setPointerCapture(pointer);
    active = { color: color.value, width: width.valueAsNumber, points: [point(event)] };
    strokes.push(active);
    segment(active, active.points[0], active.points[0]);
    updateControls();
  };
  canvas.onpointermove = event => {
    if (!active || event.pointerId !== pointer) return;
    const events = event.getCoalescedEvents?.();
    for (const sample of events?.length ? events : [event]) {
      const next = point(sample);
      segment(active, active.points.at(-1), next);
      active.points.push(next);
    }
  };
  canvas.onlostpointercapture = event => {
    if (event.pointerId === pointer) { active = undefined; pointer = undefined; }
  };

  const undo = button('上一步', () => { strokes.pop(); redraw(); });
  const clear = button('清空畫布', () => { strokes.length = 0; redraw(); });
  const apply = button('套用到本頁', () => {
    useArtwork(canvas.toDataURL('image/png'));
    close();
  }, { className: 'primary' });
  const downloadDrawing = button('下載透明 PNG', () => {
    const link = element('a', '');
    link.href = canvas.toDataURL('image/png');
    link.download = 'portfolio-sketch.png';
    link.click();
  });
  redraw();
  return element('div', 'draw-controls',
    element('p', 'muted', '可用滑鼠、手指或支援的 Apple Pencil 繪製。套用後會保留透明背景。'),
    element('div', 'row', element('label', 'field', '筆色', color), element('label', 'field', '筆粗', width), undo, clear,
      checkbox('只用觸控筆', false, enabled => { penOnly = enabled; })),
    canvas, element('div', 'row', button('關閉', close), downloadDrawing, apply));
}

function chapterSketch(kind) {
  const paths = {
    about: 'M8 12 Q22 6 36 12 L34 34 Q20 28 6 34 Z M13 19 Q18 16 22 17 M12 24 Q22 20 30 23',
    works: 'M5 31 L15 29 L35 9 L29 3 L9 23 Z M9 23 L15 29 M25 7 L31 13 M5 38 Q16 31 23 35 T39 34',
    competitions: 'M12 6 Q23 3 33 7 L31 19 Q22 30 14 19 Z M12 10 L6 10 Q5 20 15 21 M33 10 L39 10 Q39 19 31 20 M22 25 L22 32 M15 35 Q22 30 30 35',
    activities: 'M4 7 L27 8 L26 23 L16 22 L9 28 L10 22 L4 21 Z M30 15 L39 15 L38 31 L33 30 L33 36 L25 30 L18 30 M9 13 L21 14',
    learning: 'M3 9 Q13 6 21 13 Q30 6 40 8 L39 30 Q30 28 21 35 Q13 28 4 31 Z M21 13 L21 35 M8 15 L15 17 M27 17 L35 14',
    flight: 'M5 15 L40 5 L29 34 L21 22 L5 15 M21 22 L40 5 M21 22 L18 31 L25 26 M3 37 Q8 31 13 35',
    ridge: 'M3 33 L14 19 L20 25 L29 11 L41 33 M10 34 Q23 29 38 35 M12 12 A4 4 0 1 0 4 12 A4 4 0 1 0 12 12',
    branch: 'M10 39 Q28 25 32 5 M25 23 Q10 24 12 13 Q22 13 25 23 M29 16 Q39 18 40 8 Q32 7 29 16 M18 31 Q6 32 4 23 Q13 22 18 31',
    circuit: 'M6 31 H15 L22 24 V9 M12 9 V19 L6 24 M24 31 H30 L37 24 V12 M22 9 a2 2 0 1 0 0 -4 a2 2 0 1 0 0 4 M37 12 a2 2 0 1 0 0 -4 a2 2 0 1 0 0 4 M6 31 a2 2 0 1 1 -4 0 a2 2 0 1 1 4 0',
    future: 'M4 36 Q14 26 19 30 T31 24 M27 24 L29 4 Q34 8 41 5 L39 15 Q34 17 28 13'
  };
  if (!paths[kind]) return drawing('notebook');
  const svg = document.createElementNS('http://www.w3.org/2000/svg','svg');
  svg.setAttribute('viewBox','0 0 44 42');
  svg.setAttribute('class','chapter-sketch');
  svg.setAttribute('aria-hidden','true');
  const line = document.createElementNS(svg.namespaceURI,'path');
  line.setAttribute('d', paths[kind]);
  svg.append(line);
  return svg;
}

function drawing(kind) {
  const sketch = element('span', 'page-drawing drawing-' + kind, element('i', ''));
  sketch.setAttribute('aria-hidden', 'true');
  return sketch;
}

const arrange = document.querySelector('#arrange');
arrange.onclick = () => {
  arrange.setAttribute('aria-pressed', String(arrange.getAttribute('aria-pressed') !== 'true'));
  renderPreview();
};

function movable(node, owner, key, label) {
  if (!node) return;
  const start = owner.offsets?.[key] || [0, 0];
  let current = [...start];
  const paint = () => { node.style.translate = current.map(n => n + 'px').join(' '); };
  const store = () => {
    owner.offsets ||= {};
    owner.offsets[key] = current;
    save();
  };
  paint();
  if (arrange.getAttribute('aria-pressed') !== 'true') return;
  const handle = document.createElement('button');
  handle.type = 'button';
  handle.className = 'drag-grip';
  handle.textContent = '✥ ' + label;
  handle.title = '拖動或用方向鍵微調，Home 鍵歸位';
  node.classList.add('drag-target');
  node.append(handle);
  let gesture;
  const clamp = n => Math.max(-96, Math.min(96, Math.round(n)));
  handle.onpointerdown = e => {
    if (gesture || e.button !== 0) return;
    gesture = [e.clientX, e.clientY, ...current];
    handle.setPointerCapture(e.pointerId);
  };
  handle.onpointermove = e => {
    if (!gesture || !handle.hasPointerCapture(e.pointerId)) return;
    current = [clamp(gesture[2] + e.clientX - gesture[0]), clamp(gesture[3] + e.clientY - gesture[1])];
    paint();
  };
  handle.onlostpointercapture = () => { if (gesture) store(); gesture = null; };
  handle.onkeydown = e => {
    const delta = {ArrowLeft:[-1,0], ArrowRight:[1,0], ArrowUp:[0,-1], ArrowDown:[0,1]}[e.key];
    if (!delta && e.key !== 'Home') return;
    e.preventDefault();
    current = delta ? current.map((v,i) => clamp(v + delta[i] * (e.shiftKey ? 10 : 1))) : [0,0];
    paint();
    store();
  };
}

function mediaLayout(container, owner, copy, settings) {
  container.classList.add('content-layout', 'text-' + owner.textAlign);
  copy.classList.add('layout-copy');
  if (copy.childElementCount) movable(copy, owner, 'copy', '文字');
  if (!owner.image) {
    container.append(copy);
    return container;
  }
  const picture = imageFigure(owner);
  movable(picture, owner, 'photo', '圖片');
  const home = settings === Portfolio.homePhotoSize;
  if (home) picture.classList.add('homepage-print');
  const relativeSize = (owner.imageSize - settings.min) / (settings.max - settings.min);
  container.classList.add('media-layout', 'media-' + owner.imagePlacement);
  container.style.setProperty('--photo-width', owner.imageSize + '%');
  container.style.setProperty('--photo-width-side', (home ? owner.imageSize : 25 + 35 * relativeSize) + '%');
  container.style.setProperty('--photo-width-phone', (home ? 70 + 30 * relativeSize : owner.imageSize) + '%');
  if (owner.imagePlacement === 'top' || owner.imagePlacement === 'left') container.append(picture, copy);
  else container.append(copy, picture);
  return container;
}

function renderPreview() {
  const y = previewScroll.scrollTop;
  const theme = Portfolio.currentTheme(draft);
  const accentText = [theme.paper, theme.surface].every(background => Portfolio.contrast(theme.accent, background) >= 4.5)
    ? theme.accent : theme.ink;
  const onAccent = Portfolio.contrast(theme.accent, '#ffffff') >= 4.5 ? '#ffffff' : '#000000';
  preview.style.setProperty('--accent', theme.accent);
  preview.style.setProperty('--accent-text', accentText);
  preview.style.setProperty('--on-accent', onAccent);
  preview.style.setProperty('--page-paper', theme.paper);
  preview.style.setProperty('--page-surface', theme.surface);
  preview.style.setProperty('--page-ink', theme.ink);
  preview.dataset.motif = draft.theme;
  const sections = draft.sections.filter(section => section.visible);
  const profile = draft.profile;
  const section = sections.find(entry => entry.id === currentPage);
  if (!section) currentPage = 'home';
  const header = renderPageHeader(profile, sections);
  const content = element('div', 'page-content', section ? renderPageSection(section) : renderHomepage(profile, sections));
  const ornament = element('div', section ? 'page-ornament' : 'page-ornament is-home');
  ornament.setAttribute('aria-hidden', 'true');
  if ((section || profile).illustration?.pattern !== false) content.prepend(ornament);
  content.tabIndex = -1;
  const footer = element('footer', 'page-footer', profile.name || '個人網站',
    currentPage !== 'home' ? previewLink('回首頁', 'home') : null);
  preview.replaceChildren(header, content, footer);
  const active = header.querySelector('[aria-current="page"]');
  if (active) {
    const nav = active.parentElement;
    if (nav.scrollWidth > nav.clientWidth) {
      nav.scrollLeft = active.offsetLeft - nav.offsetLeft - 12;
    }
  }
  previewScroll.scrollTop = y;
}

function renderPageSection(section) {
  const kind = Portfolio.kinds[section.kind];
  const items = section.items.filter(item => item.visible);
  const selectedIndex = items.findIndex(item => item.id === currentPreviewItem);
  if (selectedIndex !== -1) return renderItemPage(section, kind, items, selectedIndex);
  const renderedItems = items.map(item => {
    const title = item.title || '未命名' + kind.singular;
    const picture = item.image ? imageFigure(item) : null;
    if (picture) picture.style.width = item.imageSize + '%';
    const copy = element('div', 'page-card-copy',
      item.meta ? styledText('p', 'page-kicker', item.meta, item, 'meta') : null,
      styledText('h2', '', title, item, 'title'),
      item.summary ? styledText('p', 'page-card-summary', item.summary, item, 'summary') : null,
      itemPreviewButton('查看詳情', title, section.id, item.id, 'item-open'));
    movable(copy, item, 'listCopy', '文字');
    movable(picture, item, 'listPhoto', '圖片');
    return element('article', 'page-card text-' + item.textAlign + (picture ? ' has-image' : ''), picture, copy);
  });
  const header = element('header', 'chapter-heading',
    element('div', '', styledText('h1', '', section.title || '未命名章節', section, 'title'),
      section.intro ? styledText('p', 'page-lead', section.intro, section, 'intro') : null),
    renderIllustration(section, section.kind));
  const page = element('section', 'page-section', header,
    renderedItems.length ? element('div', 'page-items ' + section.layout, ...renderedItems)
      : !section.intro ? element('p', 'page-empty', '內容待補') : null);
  page.id = 'page-' + section.id;
  return page;
}

function itemPreviewButton(label, title, sectionId, itemId, className) {
  const control = button(label, () => goToPreview(sectionId, true, itemId), { className });
  control.setAttribute('aria-label', label + '：' + title);
  return control;
}

function renderItemPage(section, kind, items, index) {
  const item = items[index];
  const title = item.title || '未命名' + kind.singular;
  const url = Portfolio.safeLink(item.link);
  const externalLink = url ? element('a', 'item-link', item.linkLabel || '查看相關連結') : null;
  if (externalLink) {
    externalLink.href = url;
    externalLink.target = '_blank';
    externalLink.rel = 'noopener noreferrer';
  }
  const details = kind.fields.filter(([key]) => key !== 'meta' && key !== 'summary' && item[key].trim());
  const navigation = element('nav', 'item-pagination');
  navigation.setAttribute('aria-label', '逐項瀏覽');
  for (const [neighbor, label, side] of [[items[index - 1], '上一項', 'previous'], [items[index + 1], '下一項', 'next']]) {
    if (!neighbor) continue;
    const name = neighbor.title || '未命名' + kind.singular;
    const control = itemPreviewButton(label, name, section.id, neighbor.id, 'item-step ' + side);
    control.append(element('strong', '', name));
    navigation.append(control);
  }
  const copy = element('div', '',
    item.summary ? styledText('p', 'page-lead', item.summary, item, 'summary') : null,
    details.length ? element('dl', 'item-details', ...details.map(([key, label]) =>
      element('div', 'item-detail', element('dt', '', label), styledText('dd', '', item[key], item, key)))) : null,
    externalLink);
  const content = copy.childElementCount
    ? mediaLayout(element('div', 'entry-body'), item, copy, Portfolio.itemPhotoSize)
    : item.image ? mediaLayout(element('div', 'entry-body'), item, copy, Portfolio.itemPhotoSize) : null;
  if (content && !copy.childElementCount) copy.hidden = true;
  return element('article', 'page-section page-entry',
    element('div', 'item-top', previewLink('返回' + (section.title || '章節') + '列表', section.id, 'item-back'),
      element('span', 'item-position', (index + 1) + ' / ' + items.length)),
    element('header', 'chapter-heading',
      element('div', 'text-' + item.textAlign, styledText('h1', '', title, item, 'title'),
        item.meta ? styledText('p', 'page-kicker item-meta', item.meta, item, 'meta') : null),
      renderIllustration(section, 'frame')),
    content, navigation.childElementCount ? navigation : null);
}

const divider = document.querySelector('#editor-divider');
let editorShare = 42;
try { editorShare = Number(localStorage.getItem('portfolio-editor-share')) || 42; } catch {}

function setEditorShare(value, persist = false) {
  editorShare = Portfolio.bound(Math.round(value), 32, 68, 42);
  app.style.setProperty('--editor-share', editorShare / 100);
  divider.setAttribute('aria-valuenow', editorShare);
  if (persist) {
    try { localStorage.setItem('portfolio-editor-share', editorShare); } catch {}
  }
}

let splitPointer;
divider.onpointerdown = event => {
  if (event.button !== 0 || splitPointer !== undefined) return;
  splitPointer = event.pointerId;
  divider.setPointerCapture(splitPointer);
};
divider.onpointermove = event => {
  if (event.pointerId !== splitPointer) return;
  const start = editor.getBoundingClientRect().left;
  const available = app.getBoundingClientRect().right - start;
  setEditorShare((event.clientX - start) / available * 100);
};
divider.onlostpointercapture = event => {
  if (event.pointerId !== splitPointer) return;
  splitPointer = undefined;
  setEditorShare(editorShare, true);
};
divider.ondblclick = () => setEditorShare(42, true);
divider.onkeydown = event => {
  const targets = { ArrowLeft: editorShare - 2, ArrowRight: editorShare + 2, Home: 32, End: 68, Enter: 42 };
  if (!Object.hasOwn(targets, event.key)) return;
  event.preventDefault();
  setEditorShare(targets[event.key], true);
};
setEditorShare(editorShare);

function setView(view) {
  app.dataset.view = view;
  document.querySelector('#mode-edit').setAttribute('aria-pressed', String(view === 'edit'));
  document.querySelector('#mode-preview').setAttribute('aria-pressed', String(view === 'preview'));
}

function setWidth(phone) {
  frame.classList.toggle('phone', phone);
  document.querySelector('#desktop').setAttribute('aria-pressed', String(!phone));
  document.querySelector('#phone').setAttribute('aria-pressed', String(phone));
}

function download() {
  if (!ready) return;
  const blob = new Blob([JSON.stringify(draft, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = element('a', '');
  link.href = url;
  link.download = 'portfolio-draft.json';
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  notice('已匯出草稿，可以用這個檔案還原內容。');
}

document.querySelector('#new-section').addEventListener('click', () => {
  if (!ready) return;
  const section = Portfolio.newSection();
  draft.sections.push(section);
  renderPreview();
  select(section.id);
  save();
  focusField('section-title');
});
document.querySelector('#design').addEventListener('click', () => { if (ready) select('design'); });
document.querySelector('#mode-edit').addEventListener('click', () => setView('edit'));
document.querySelector('#mode-preview').addEventListener('click', () => setView('preview'));
document.querySelector('#desktop').addEventListener('click', () => setWidth(false));
document.querySelector('#phone').addEventListener('click', () => setWidth(true));
document.querySelector('#export').addEventListener('click', download);
document.querySelector('#import').addEventListener('click', () => { if (ready) importFile.click(); });
importFile.addEventListener('change', async () => {
  const file = importFile.files[0];
  if (!file || !ready || cloudBlocked) return;
  try {
    const incoming = Portfolio.normalizeDraft(JSON.parse(await file.text()));
    if (!ready || cloudBlocked) return;
    if (!confirm('匯入會取代目前畫面上的草稿。確定要繼續？')) return;
    draft = incoming;
    selection = 'home';
    itemSelection = undefined;
    update({ rebuild: true });
    goToPreview('home');
    notice('已匯入作品集草稿。');
  } catch {
    notice('讀取失敗，請選擇這個編輯器匯出的草稿 JSON。');
  } finally {
    importFile.value = '';
  }
});

async function startLocal() {
  try {
    db = await Portfolio.database();
    const current = await Portfolio.load(db);
    if (current) draft = Portfolio.normalizeDraft(current);
    saveState.textContent = current ? '已存於此瀏覽器' : '開始編輯後自動儲存';
  } catch {
    saveState.textContent = '無法讀取本機草稿，可匯入備份';
  }
  showEditor();
}

function showEditor() {
  document.querySelector('#access-panel').hidden = true;
  document.querySelector('#editor-tools').hidden = false;
  app.hidden = false;
  ready = true;
  renderSidebar();
  renderEditor();
  renderPreview();
}

document.querySelector('#quick-draw').onclick = () => {
  if (!ready) return;
  const settings = editor.querySelector('.illustration-settings');
  if (!settings) return;
  setView('edit');
  settings.open = true;
  settings.querySelector('.drawing-launch').click();
};

async function start() {
  const params = new URLSearchParams(location.search);
  const publicId = params.get('site');
  const note = document.querySelector('#access-note');
  if (!PortfolioCloud.enabled && PortfolioCloud.local && !params.has('site')) {
    await startLocal();
    return;
  }
  if (!PortfolioCloud.enabled) {
    note.textContent = '網站尚未連接雲端。請完成專案說明中的 Supabase 設定。';
    return;
  }
  try {
    const api = await PortfolioCloud.connect();
    if (params.has('site')) {
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(publicId)) {
        note.textContent = '這個公開網址有誤。';
        return;
      }
      const publication = await PortfolioCloud.transport(api).readPublication(publicId);
      if (!publication) { note.textContent = '這個作品集目前沒有公開。'; return; }
      draft = Portfolio.normalizeDraft(publication.snapshot);
      document.title = draft.profile.name || '個人網站';
      document.body.classList.add('public-site');
      document.querySelector('#access-panel').hidden = true;
      app.hidden = false;
      setView('preview');
      renderPreview();
      return;
    }
    const data = await PortfolioCloud.result(api.auth.getSession());
    if (!data.session) {
      note.textContent = '登入後，即可在電腦和 iPad 接續編輯同一份私人草稿。';
      const signIn = document.querySelector('#sign-in');
      signIn.hidden = false;
      signIn.onclick = async () => {
        signIn.disabled = true;
        try {
          await PortfolioCloud.result(api.auth.signInWithOAuth({
            provider: 'github', options: { redirectTo: location.origin + location.pathname }
          }));
        } catch {
          signIn.disabled = false;
          note.textContent = 'GitHub 登入無法啟動。請稍後重試，或檢查網站的登入設定。';
        }
      };
      return;
    }
    await startCloud(api, data.session.user);
  } catch {
    note.textContent = '無法載入登入或草稿服務。請確認網路與網站設定，再重新載入。';
  }
}

async function startCloud(api, user) {
  const remote = PortfolioCloud.transport(api, user.id);
  const syncNow = document.querySelector('#sync-now');
  const account = document.querySelector('#account');
  const conflicts = document.querySelector('#conflict-dialog');
  const setStatus = text => { saveState.textContent = text; };
  const storageKey = 'v12-pending:' + location.pathname + ':' + user.id;
  const pendingDb = await Portfolio.database().catch(() => null);
  let forceRefresh = false;

  function applyCloudDraft(value) {
    draft = value ? Portfolio.normalizeDraft(value) : Portfolio.initialDraft();
    if (!ready) return;
    if (selection !== 'design' && !draft.sections.some(section => section.id === selection)) selection = 'home';
    itemSelection = undefined;
    renderSidebar();
    renderEditor();
    renderPreview();
  }

  const sync = createDraftSync(remote, {
    status: setStatus,
    load: applyCloudDraft,
    canReload: () => forceRefresh || (!editor.contains(document.activeElement) && !document.querySelector('dialog[open]')),
    localError: () => notice('這個瀏覽器無法暫存修改。請確認雲端儲存成功再關閉頁面。'),
    conflict: open => {
      cloudBlocked = open;
      if (open && !conflicts.open) {
        const otherDialog = document.querySelector('dialog[open]');
        if (!otherDialog) conflicts.showModal();
      } else if (!open && conflicts.open) conflicts.close();
    }
  }, {
    read: () => pendingDb ? Portfolio.load(pendingDb, storageKey) : Promise.resolve(null),
    write: value => pendingDb ? Portfolio.save(pendingDb, value, storageKey) : Promise.reject(new Error('No local storage'))
  });
  cloudSync = sync;
  await sync.initialize();

  const closeConflict = () => conflicts.close();
  document.querySelector('#backup-conflict').onclick = download;
  document.querySelector('#defer-conflict').onclick = closeConflict;
  for (const [id, keepMine] of [['keep-cloud', false], ['keep-local', true]]) {
    const control = document.querySelector('#' + id);
    control.onclick = async () => {
      if (!confirm(keepMine ? '用這台裝置的草稿覆蓋目前雲端版本？' : '放棄這台裝置未同步的修改，改用雲端版本？')) return;
      control.disabled = true;
      try { await sync.resolveConflict(keepMine); } finally { control.disabled = false; }
    };
  }
  syncNow.hidden = false;
  syncNow.onclick = async () => {
    if (cloudBlocked) { if (!conflicts.open) conflicts.showModal(); return; }
    syncNow.disabled = true;
    forceRefresh = true;
    try { await sync.refresh(); } finally { forceRefresh = false; syncNow.disabled = false; }
  };
  window.addEventListener('online', () => { void sync.refresh(); });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void sync.refresh();
    else if (sync.hasPending()) void sync.flush();
  });
  window.addEventListener('pagehide', () => { if (sync.hasPending()) void sync.flush(); });
  api.auth.onAuthStateChange(event => {
    if (event === 'SIGNED_OUT') setTimeout(() => location.reload(), 0);
  });
  setupAccount(api, user, remote, sync);
  account.hidden = false;
  showEditor();
}

function setupAccount(api, user, remote, sync) {
  const dialog = document.querySelector('#account-dialog');
  const status = document.querySelector('#publication-status');
  const actions = document.querySelector('#publication-actions');
  const publish = document.querySelector('#publish');
  const unpublish = document.querySelector('#unpublish');
  const url = new URL(location.origin + location.pathname);
  url.searchParams.set('site', user.id);
  document.querySelector('#publication-url').href = url.href;
  document.querySelector('#account-name').textContent = user.user_metadata?.user_name || user.email || 'GitHub 已登入';

  function renderPublication(published, eventText) {
    status.textContent = eventText || (published ? '已公開。' : '目前未公開。');
    actions.hidden = unpublish.hidden = !published;
  }

  document.querySelector('#account').onclick = async () => {
    dialog.showModal();
    publish.disabled = true;
    unpublish.disabled = true;
    status.textContent = '正在讀取發佈狀態…';
    try {
      renderPublication(Boolean(await remote.readPublication(user.id)));
      publish.disabled = unpublish.disabled = false;
    } catch {
      status.textContent = '無法讀取發佈狀態，請關閉後再試。';
    }
  };
  document.querySelector('#close-account').onclick = () => dialog.close();
  document.querySelector('#copy-publication').onclick = async () => {
    try {
      await navigator.clipboard.writeText(url.href);
      status.textContent = '已複製公開網址。';
    } catch {
      status.textContent = '請開啟公開頁，再從網址列複製連結。';
    }
  };
  publish.onclick = async () => {
    if (cloudBlocked) { status.textContent = '請先處理同步衝突。'; return; }
    if (!confirm('公開目前可見的首頁、章節與作品？知道網址的人即可瀏覽。')) return;
    publish.disabled = unpublish.disabled = true;
    try {
      if (!await sync.flush()) { status.textContent = '請先完成草稿同步。'; return; }
      await remote.publish(PortfolioCloud.publicationSnapshot(draft));
      renderPublication(true, '公開版本已更新。');
    } catch {
      status.textContent = '發佈失敗，請稍後重試。';
    } finally {
      publish.disabled = unpublish.disabled = false;
    }
  };
  unpublish.onclick = async () => {
    if (!confirm('取消公開這個作品集？')) return;
    publish.disabled = unpublish.disabled = true;
    try {
      await remote.unpublish();
      renderPublication(false, '已取消公開。');
    } catch {
      status.textContent = '取消公開失敗，請稍後重試。';
    } finally {
      publish.disabled = unpublish.disabled = false;
    }
  };
  document.querySelector('#sign-out').onclick = async event => {
    const control = event.currentTarget;
    control.disabled = true;
    try {
      if (sync.hasPending() && !await sync.flush()) {
        status.textContent = '還有未同步的修改。請先完成同步再登出。';
        return;
      }
      await PortfolioCloud.result(api.auth.signOut());
    } catch {
      status.textContent = '登出失敗，請稍後再試。';
    } finally {
      control.disabled = false;
    }
  };
}

start();
