/* Конструктор ванной: фото → пять шагов → 5 вариантов → выбор → заказ замера. */
(function () {
  'use strict';

  const CFG = Object.assign({ companyName: '', phone: '', apiBase: '' }, window.APP_CONFIG || {});
  const { groups: G, steps: STEPS, wishHints, sizeAllows, WISHES_MAX } = window.BATH_OPTIONS;
  const GUARD = window.BathGuard;
  const query = new URLSearchParams(location.search);
  const API = (query.get('api') || CFG.apiBase || '').replace(/\/$/, '');
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const WATERMARK = 'img/watermark.png';

  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

  const els = {
    wizard: $('#wizard'),
    progress: $('#progress'),
    stepTitle: $('#stepTitle'),
    backBtn: $('#backBtn'),
    nextBtn: $('#nextBtn'),
    photoInput: $('#photoInput'),
    heroPhoto: $('#heroPhoto'),
    dropzone: $('#dropzone'),
    dropEmpty: $('#dropEmpty'),
    dropPreview: $('#dropPreview'),
    photoPreview: $('#photoPreview'),
    photoError: $('#photoError'),
    wishes: $('#wishes'),
    wishesCount: $('#wishesCount'),
    wishesError: $('#wishesError'),
    summaryPhoto: $('#summaryPhoto'),
    summaryList: $('#summaryList'),
    limitNote: $('#limitNote'),
    captchaBox: $('#captchaBox'),
    results: $('#results'),
    resultsSub: $('#resultsSub'),
    resultsSource: $('#resultsSource'),
    loader: $('#loader'),
    loaderWall: $('#loaderWall'),
    loaderStatus: $('#loaderStatus'),
    loaderDone: $('#loaderDone'),
    loaderTime: $('#loaderTime'),
    resultError: $('#resultError'),
    gallery: $('#gallery'),
    resultsFoot: $('#resultsFoot'),
    order: $('#order'),
    orderForm: $('#orderForm'),
    orderChosen: $('#orderChosen'),
    orderError: $('#orderError'),
    orderBtn: $('#orderBtn'),
    orderDone: $('#orderDone'),
    viewer: $('#viewer'),
    viewerImg: $('#viewerImg'),
    viewerWm: $('#viewerWm'),
    viewerCaption: $('#viewerCaption'),
    viewerPick: $('#viewerPick'),
    demoNote: $('#demoNote'),
    demoNoteText: $('#demoNoteText'),
  };

  const state = {
    mode: 'demo', // demo — без сервера, mock — сервер без ключа, live — настоящая генерация
    count: 5,
    remaining: null,
    photo: null, // { dataUrl, w, h }
    noPhoto: false,
    step: 0,
    maxStep: 0,
    busy: false,
    jobId: null,
    images: [],
    figs: [],
    picked: null,
    viewing: null,
    captchaWidget: null,
  };

  // ---------- Утилиты ----------
  function plural(n, forms) {
    const n10 = n % 10;
    const n100 = n % 100;
    if (n10 === 1 && n100 !== 11) return forms[0];
    if (n10 >= 2 && n10 <= 4 && (n100 < 12 || n100 > 14)) return forms[1];
    return forms[2];
  }
  const variantsText = (n) => `${n} ${plural(n, ['вариант', 'варианта', 'вариантов'])}`;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  function fetchWithTimeout(url, options, ms) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), ms);
    return fetch(url, Object.assign({}, options, { signal: ctrl.signal })).finally(() => clearTimeout(t));
  }

  function scrollTo(el, block) {
    el.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: block || 'start' });
  }

  const labelOf = (group, id) => {
    const it = G[group].items.find((x) => x.id === id);
    return it ? it.label : id;
  };

  // ---------- Шапка ----------
  $$('[data-company]').forEach((el) => (el.textContent = CFG.companyName));
  $$('[data-phone]').forEach((el) => {
    el.textContent = CFG.phone;
    el.href = 'tel:' + CFG.phone.replace(/[^\d+]/g, '');
  });

  // ---------- Шаги ----------
  function groupHtml(key) {
    const g = G[key];
    const multi = g.type === 'multi';
    let items;
    if (multi) {
      items = `<div class="chips">${g.items
        .map((it) => `<label class="chip"><input type="checkbox" name="${key}" value="${it.id}"${g.default.includes(it.id) ? ' checked' : ''}><span>${esc(it.label)}</span></label>`)
        .join('')}</div>`;
    } else {
      let cls = g.view === 'photo' ? 'choices choices--photo' : g.view === 'swatch' ? 'choices choices--swatch' : g.view === 'metal' ? 'choices choices--metal' : 'choices';
      if (g.items.length === 6) cls += ' choices--three';
      items = `<div class="${cls}">${g.items
        .map((it) => {
          const checked = g.default === it.id ? ' checked' : '';
          let body = '';
          if (g.view === 'photo') {
            body = `<span class="choice__img"><img src="${it.img}-sm.jpg" alt="" loading="lazy"></span><span class="choice__text"><span class="choice__label">${esc(it.label)}</span>${it.note ? `<span class="choice__note">${esc(it.note)}</span>` : ''}</span>`;
          } else if (g.view === 'swatch') {
            const [a, b, c] = it.colors;
            body = `<span class="swatch" style="background:linear-gradient(90deg, ${a} 0 50%, ${b} 50% 80%, ${c} 80%)"></span><span class="choice__label">${esc(it.label)}</span>`;
          } else if (g.view === 'metal') {
            body = `<span class="metal" style="background:${it.color}"></span><span class="choice__label">${esc(it.label)}</span>`;
          } else {
            body = `<span class="choice__label">${esc(it.label)}</span>${it.note ? `<span class="choice__note">${esc(it.note)}</span>` : ''}`;
          }
          return `<label class="choice"><input type="radio" name="${key}" value="${it.id}"${checked}><span class="choice__body">${body}</span></label>`;
        })
        .join('')}</div>`;
    }
    return `<div class="group" role="group" aria-labelledby="g-${key}">
      <div class="group__head"><span class="group__title" id="g-${key}">${esc(g.title)}</span></div>
      ${g.hint ? `<p class="group__hint">${esc(g.hint)}</p>` : ''}
      ${items}
    </div>`;
  }

  function buildSteps() {
    STEPS.forEach((s) => {
      if (!s.groups) return;
      const html = s.groups.map(groupHtml).join('');
      if (s.wishes) $('#wishesGroups').innerHTML = html;
      else $(`.step[data-step="${s.id}"]`).innerHTML = html;
    });
    els.progress.innerHTML = STEPS.map((s, i) => `<li><button type="button" data-i="${i}"><span>${esc(s.short)}</span></button></li>`).join('');
    $('#hintChips').innerHTML = wishHints.map((h) => `<button type="button">+ ${esc(h)}</button>`).join('');
    $('#worksChips').innerHTML = G.works.items
      .map((it) => `<label class="chip"><input type="checkbox" name="works" value="${it.id}"><span>${esc(it.label)}</span></label>`)
      .join('');
  }

  function readParams() {
    const fd = new FormData(els.wizard);
    const p = {};
    Object.keys(G).forEach((key) => {
      if (G[key].prompt === false) return;
      p[key] = G[key].type === 'multi' ? fd.getAll(key) : fd.get(key);
    });
    return p;
  }

  // Ограничения: по площади и типу помещения часть вариантов недоступна.
  function applyConstraints() {
    const size = ($('input[name="size"]:checked', els.wizard) || {}).value || G.size.default;
    const roomType = ($('input[name="roomType"]:checked', els.wizard) || {}).value || G.roomType.default;
    ['bathing', 'extras'].forEach((key) => {
      G[key].items.forEach((it) => {
        const input = $(`input[name="${key}"][value="${it.id}"]`, els.wizard);
        if (!input) return;
        let allowed = sizeAllows(it.minSize, size);
        if (key === 'bathing') allowed = allowed && (roomType === 'wc' ? it.id === 'none' : it.id !== 'none');
        if (key === 'extras' && roomType === 'wc') allowed = allowed && !['washtower', 'bench', 'niche'].includes(it.id);
        input.disabled = !allowed;
        if (!allowed && input.checked) input.checked = false;
      });
    });
    if (!$('input[name="bathing"]:checked', els.wizard)) {
      const fallback = roomType === 'wc' ? 'none' : G.bathing.default;
      $(`input[name="bathing"][value="${fallback}"]`, els.wizard).checked = true;
    }
  }

  function validateStep(i) {
    if (STEPS[i].id === 'photo' && !state.photo && !state.noPhoto) {
      showPhotoError('Загрузите фото ванной или выберите «подобрать идеи без фото».');
      return false;
    }
    return true;
  }

  function goTo(i, focus) {
    state.step = Math.max(0, Math.min(STEPS.length - 1, i));
    state.maxStep = Math.max(state.maxStep, state.step);
    $$('.step', els.wizard).forEach((el) => el.classList.toggle('is-current', el.dataset.step === STEPS[state.step].id));
    els.stepTitle.textContent = `${state.step + 1}. ${STEPS[state.step].title}`;
    $$('button', els.progress).forEach((b, idx) => {
      b.dataset.state = idx === state.step ? 'current' : idx <= state.maxStep ? 'done' : 'todo';
      b.disabled = idx > state.maxStep;
      if (idx === state.step) b.setAttribute('aria-current', 'step');
      else b.removeAttribute('aria-current');
    });
    els.backBtn.disabled = state.step === 0;
    els.backBtn.style.visibility = state.step === 0 ? 'hidden' : 'visible';
    const last = state.step === STEPS.length - 1;
    els.nextBtn.textContent = last ? `Показать ${variantsText(state.count)}` : 'Далее';
    if (focus) {
      scrollTo(els.wizard, 'start');
      els.stepTitle.focus({ preventScroll: true });
    }
    renderSummary();
  }

  els.backBtn.addEventListener('click', () => goTo(state.step - 1, true));
  els.nextBtn.addEventListener('click', () => {
    if (!validateStep(state.step)) return;
    if (state.step === STEPS.length - 1) generate();
    else goTo(state.step + 1, true);
  });
  els.progress.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b || b.disabled) return;
    const i = Number(b.dataset.i);
    if (i > state.step && !validateStep(state.step)) return;
    goTo(i, true);
  });
  els.wizard.addEventListener('change', (e) => {
    if (e.target.name === 'size' || e.target.name === 'roomType') applyConstraints();
    renderSummary();
  });
  els.wizard.addEventListener('submit', (e) => e.preventDefault());

  // ---------- Сводка ----------
  function renderSummary() {
    const p = readParams();
    const rows = [];
    STEPS.forEach((s, stepIndex) => {
      (s.groups || []).forEach((key) => {
        const v = p[key];
        const text = Array.isArray(v) ? (v.length ? v.map((id) => labelOf(key, id)).join(', ') : '—') : labelOf(key, v);
        rows.push(`<div class="summary__row"><dt>${esc(G[key].summary || G[key].title)}</dt><dd><button type="button" data-step="${stepIndex}">${esc(text)}</button></dd></div>`);
      });
    });
    const w = els.wishes.value.trim();
    if (w) rows.push(`<div class="summary__row"><dt>Пожелания</dt><dd><button type="button" data-step="${STEPS.length - 1}">${esc(w.length > 80 ? w.slice(0, 80) + '…' : w)}</button></dd></div>`);
    els.summaryList.innerHTML = rows.join('');
    if (state.photo) els.summaryPhoto.innerHTML = `<img src="${state.photo.dataUrl}" alt="Ваше фото">`;
    else els.summaryPhoto.innerHTML = `<span>${state.noPhoto ? 'Без фото — покажем идеи' : 'Фото пока нет'}</span>`;
  }
  els.summaryList.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-step]');
    if (!b) return;
    const i = Number(b.dataset.step);
    state.maxStep = Math.max(state.maxStep, i);
    goTo(i, true);
  });

  // ---------- Фото ----------
  function showPhotoError(msg) {
    els.photoError.textContent = msg;
    els.photoError.hidden = !msg;
  }

  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('Не удалось открыть фото. Попробуйте другое.'));
      img.src = src;
    });
  }

  // Уменьшаем до 1536 px и пересохраняем: так фото быстрее отправляется, а данные о месте съёмки удаляются.
  async function preparePhoto(file) {
    if (/heic|heif/i.test(file.type) || /\.hei[cf]$/i.test(file.name)) {
      throw new Error('Фото в формате HEIC не подходит. Сохраните его как JPG или сделайте скриншот и загрузите.');
    }
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) throw new Error('Загрузите фото в формате JPG, PNG или WebP.');
    const url = URL.createObjectURL(file);
    try {
      const img = await loadImage(url);
      const max = 1536;
      const scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.naturalWidth * scale);
      canvas.height = Math.round(img.naturalHeight * scale);
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      if (Math.min(canvas.width, canvas.height) < 400) throw new Error('Фото слишком маленькое. Нужна картинка хотя бы 400 px по короткой стороне.');
      return { dataUrl: canvas.toDataURL('image/jpeg', 0.88), w: canvas.width, h: canvas.height };
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  function setPhoto(photo) {
    state.photo = photo;
    if (photo) state.noPhoto = false;
    els.dropEmpty.hidden = Boolean(photo);
    els.dropPreview.hidden = !photo;
    if (photo) els.photoPreview.src = photo.dataUrl;
    else els.photoPreview.removeAttribute('src');
    renderSummary();
  }

  async function handleFile(file) {
    showPhotoError('');
    if (!file) return;
    try {
      setPhoto(await preparePhoto(file));
    } catch (e) {
      setPhoto(null);
      showPhotoError(e.message);
    }
  }

  els.photoInput.addEventListener('change', () => {
    handleFile(els.photoInput.files[0]);
    els.photoInput.value = '';
  });
  els.heroPhoto.addEventListener('change', async () => {
    const file = els.heroPhoto.files[0];
    els.heroPhoto.value = '';
    goTo(0);
    scrollTo($('#generator'));
    await handleFile(file);
  });
  $('#photoReplace').addEventListener('click', (e) => {
    e.preventDefault();
    els.photoInput.click();
  });
  $('#photoRemove').addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    setPhoto(null);
  });
  $('#noPhotoBtn').addEventListener('click', () => {
    setPhoto(null);
    state.noPhoto = true;
    showPhotoError('');
    goTo(1, true);
  });
  ['dragenter', 'dragover'].forEach((t) =>
    els.dropzone.addEventListener(t, (e) => {
      e.preventDefault();
      els.dropzone.classList.add('is-over');
    }),
  );
  ['dragleave', 'drop'].forEach((t) => els.dropzone.addEventListener(t, () => els.dropzone.classList.remove('is-over')));
  els.dropzone.addEventListener('drop', (e) => {
    e.preventDefault();
    handleFile(e.dataTransfer.files[0]);
  });

  // ---------- Пожелания ----------
  function showWishesError(msg) {
    els.wishesError.textContent = msg || '';
    els.wishesError.hidden = !msg;
    els.wishes.setAttribute('aria-invalid', String(Boolean(msg)));
  }
  function updateWishes() {
    els.wishesCount.textContent = `${els.wishes.value.length} / ${WISHES_MAX}`;
    const r = GUARD.checkWishes(els.wishes.value);
    showWishesError(r.ok ? '' : r.problem);
    renderSummary();
    return r;
  }
  let wishTimer;
  els.wishes.addEventListener('input', () => {
    clearTimeout(wishTimer);
    wishTimer = setTimeout(updateWishes, 350);
  });
  $('#hintChips').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    const add = b.textContent.replace(/^\+\s*/, '');
    const cur = els.wishes.value.trim();
    const next = cur ? `${cur.replace(/[.,;\s]+$/, '')}, ${add.toLowerCase()}` : add;
    if (next.length <= WISHES_MAX) els.wishes.value = next;
    updateWishes();
    els.wishes.focus();
  });

  // ---------- Режим работы ----------
  function applyCount() {
    $$('[data-variants]').forEach((el) => (el.textContent = variantsText(state.count)));
    goTo(state.step);
  }

  function updateLimitNote() {
    if (state.mode === 'demo') {
      els.limitNote.textContent = 'Демо-режим: покажем примеры в выбранном стиле за несколько секунд.';
    } else if (state.mode === 'live' && state.remaining !== null) {
      els.limitNote.textContent =
        state.remaining > 0
          ? `Осталось генераций сегодня: ${state.remaining}. Обычно это занимает 2–3 минуты.`
          : 'На сегодня генерации закончились. Оставьте заявку на замер — подберём варианты вместе.';
    } else {
      els.limitNote.textContent = 'Обычно генерация занимает 2–3 минуты.';
    }
  }

  function loadCaptcha(key) {
    els.captchaBox.hidden = false;
    window.onSmartCaptchaReady = function () {
      if (window.smartCaptcha) state.captchaWidget = window.smartCaptcha.render(els.captchaBox, { sitekey: key, hl: 'ru' });
    };
    const s = document.createElement('script');
    s.src = 'https://smartcaptcha.yandexcloud.net/captcha.js?render=onload&onload=onSmartCaptchaReady';
    s.defer = true;
    document.head.appendChild(s);
  }
  function captchaToken() {
    if (state.captchaWidget === null || !window.smartCaptcha) return undefined;
    return window.smartCaptcha.getResponse(state.captchaWidget);
  }

  async function detectMode() {
    const staticHost = location.protocol === 'file:' || /\.github\.io$/i.test(location.hostname);
    if (!(staticHost && !query.get('api'))) {
      try {
        const r = await fetchWithTimeout(`${API}/api/config`, {}, 5000);
        if (!r.ok) throw new Error('config');
        const c = await r.json();
        state.mode = c.mock ? 'mock' : 'live';
        state.count = c.imagesPerJob || 5;
        state.remaining = typeof c.remaining === 'number' ? c.remaining : null;
        if (c.captchaClientKey) loadCaptcha(c.captchaClientKey);
      } catch {
        state.mode = 'demo';
      }
    }
    if (state.mode !== 'live') {
      els.demoNote.hidden = false;
      if (state.mode === 'mock') {
        els.demoNoteText.textContent = 'Тестовый режим сервера: ключ API не задан, поэтому вместо генерации показываем примеры в выбранном стиле. Заявки сохраняются.';
      }
    }
    applyCount();
    updateLimitNote();
  }

  // ---------- Анимация: укладываем плитку ----------
  const STATUSES = ['Укладываем плитку', 'Ставим сантехнику', 'Вешаем зеркало', 'Настраиваем свет', 'Проверяем, что всё можно смонтировать'];
  const COLS = 8;
  const ROWS = 5;
  const loaderState = { timer: null, clock: null, started: 0, round: 0, colors: [], checking: true };

  function startLoader(params) {
    const palette = G.palette.items.find((p) => p.id === params.palette) || G.palette.items[0];
    loaderState.colors = palette.colors;
    loaderState.round = 0;
    loaderState.checking = true;
    loaderState.started = Date.now();
    els.loaderWall.innerHTML = '<span class="tile"></span>'.repeat(COLS * ROWS);
    els.loader.hidden = false;
    els.loaderStatus.textContent = 'Проверяем фото и пожелания';
    const tiles = $$('.tile', els.loaderWall);
    const order = [];
    for (let r = ROWS - 1; r >= 0; r--) for (let c = 0; c < COLS; c++) order.push(r * COLS + c); // снизу вверх, как плиточники
    let step = 0;
    function paintRound() {
      const [base, accent, third] = loaderState.colors;
      tiles.forEach((t, i) => {
        const row = Math.floor(i / COLS);
        t.style.setProperty('--tile-color', row === 2 ? accent : (i + loaderState.round) % 11 === 0 ? third : base);
      });
    }
    function tick() {
      if (step === 0) paintRound();
      if (step < order.length) {
        tiles[order[step]].classList.add('is-laid');
        step++;
        loaderState.timer = setTimeout(tick, reduceMotion ? 0 : 90);
      } else {
        loaderState.timer = setTimeout(() => {
          tiles.forEach((t) => t.classList.remove('is-laid'));
          step = 0;
          loaderState.round++;
          if (!loaderState.checking) els.loaderStatus.textContent = STATUSES[loaderState.round % STATUSES.length];
          tick();
        }, reduceMotion ? 4000 : 900);
      }
    }
    tick();
    const clock = () => {
      const s = Math.floor((Date.now() - loaderState.started) / 1000);
      els.loaderTime.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
    };
    clock();
    loaderState.clock = setInterval(clock, 1000);
  }

  function loaderChecked() {
    if (!loaderState.checking) return;
    loaderState.checking = false;
    els.loaderStatus.textContent = STATUSES[0];
  }

  function stopLoader() {
    clearTimeout(loaderState.timer);
    clearInterval(loaderState.clock);
    els.loader.hidden = true;
  }

  function updateProgress() {
    const done = state.images.filter((im) => im.status !== 'pending').length;
    els.loaderDone.textContent = `Готово ${done} из ${state.images.length}`;
  }

  // ---------- Галерея ----------
  function wmTag(im) {
    return im.watermarked ? '' : `<img class="wm" src="${WATERMARK}" alt="">`;
  }

  // Раскладка по колонкам: 1 на телефоне, 2 на планшете, 3 на компьютере; варианты идут по порядку слева направо.
  const galleryCols = () => (window.matchMedia('(min-width: 1000px)').matches ? 3 : window.matchMedia('(min-width: 600px)').matches ? 2 : 1);
  function layoutGallery() {
    const n = Math.min(galleryCols(), Math.max(1, state.figs.length));
    if (Number(els.gallery.dataset.cols) !== n) {
      els.gallery.dataset.cols = String(n);
      els.gallery.style.setProperty('--cols', n);
      els.gallery.innerHTML = '';
      for (let c = 0; c < n; c++) {
        const col = document.createElement('div');
        col.className = 'gallery__col';
        els.gallery.appendChild(col);
      }
    }
    state.figs.forEach((fig, i) => {
      const col = els.gallery.children[i % n];
      if (fig.parentNode !== col) col.appendChild(fig);
    });
  }
  window.addEventListener('resize', () => {
    if (state.figs.length) layoutGallery();
  });

  function renderGallery() {
    state.images.forEach((im, i) => {
      let fig = state.figs[i];
      if (!fig) {
        fig = document.createElement('figure');
        fig.className = 'shot';
        fig.innerHTML = `<button type="button" class="shot__frame"></button>
          <figcaption><span class="shot__label"></span><button type="button" class="pick" aria-pressed="false">Выбрать</button></figcaption>`;
        $('.shot__frame', fig).addEventListener('click', () => openViewer(i));
        $('.pick', fig).addEventListener('click', () => togglePick(i));
        state.figs[i] = fig;
      }
      const frame = $('.shot__frame', fig);
      $('.shot__label', fig).innerHTML = `Вариант ${i + 1}<small>${esc(im.label)}</small>`;
      if (frame.dataset.status !== im.status) {
        frame.dataset.status = im.status;
        frame.classList.toggle('is-pending', im.status === 'pending');
        frame.classList.toggle('is-failed', im.status === 'error');
        frame.disabled = im.status !== 'done';
        if (im.status === 'done') {
          frame.innerHTML = `<img src="${im.thumb || im.src}" alt="Вариант ${i + 1}: ${esc(im.label)}">${wmTag(im)}`;
          frame.classList.add('is-new');
          frame.setAttribute('aria-label', `Открыть вариант ${i + 1}`);
        } else if (im.status === 'pending') {
          frame.innerHTML = '<span>Рисуем…</span>';
        } else {
          frame.innerHTML = '<span>Этот вариант не получился</span>';
        }
      }
      const pick = $('.pick', fig);
      pick.hidden = im.status !== 'done';
      const on = state.picked === i;
      pick.setAttribute('aria-pressed', String(on));
      pick.textContent = on ? 'Выбран' : 'Выбрать';
      fig.classList.toggle('is-picked', on);
    });
    layoutGallery();
  }

  function togglePick(i) {
    state.picked = state.picked === i ? null : i;
    renderGallery();
    renderChosen();
  }

  function renderChosen() {
    if (state.picked === null) {
      els.orderChosen.innerHTML = '<span class="order__chosen-empty">Отметьте понравившийся вариант выше — прораб возьмёт его за основу.</span>';
      return;
    }
    const im = state.images[state.picked];
    els.orderChosen.innerHTML = `<span class="thumb"><img src="${im.thumb || im.src}" alt="">${wmTag(im)}</span>
      <span><strong>Вариант ${state.picked + 1}. ${esc(im.label)}</strong>Прораб посмотрит его перед замером и посчитает стоимость.</span>`;
  }

  // ---------- Просмотр ----------
  const doneIndexes = () => state.images.map((im, i) => (im.status === 'done' ? i : -1)).filter((i) => i >= 0);

  function openViewer(i) {
    if (!state.images[i] || state.images[i].status !== 'done') return;
    state.viewing = i;
    renderViewer();
    if (!els.viewer.open) els.viewer.showModal();
  }
  function renderViewer() {
    const i = state.viewing;
    const im = state.images[i];
    els.viewerImg.src = im.src;
    els.viewerImg.alt = `Вариант ${i + 1}: ${im.label}`;
    els.viewerWm.hidden = Boolean(im.watermarked);
    els.viewerCaption.textContent = `Вариант ${i + 1}. ${im.label}`;
    els.viewerPick.textContent = state.picked === i ? 'Выбран — заказать замер' : 'Выбрать этот вариант';
    const many = doneIndexes().length > 1;
    $('#viewerPrev').hidden = !many;
    $('#viewerNext').hidden = !many;
  }
  function stepViewer(dir) {
    const list = doneIndexes();
    const pos = list.indexOf(state.viewing);
    state.viewing = list[(pos + dir + list.length) % list.length];
    renderViewer();
  }
  $('#viewerPrev').addEventListener('click', () => stepViewer(-1));
  $('#viewerNext').addEventListener('click', () => stepViewer(1));
  $('#viewerClose').addEventListener('click', () => els.viewer.close());
  els.viewerPick.addEventListener('click', () => {
    state.picked = state.viewing;
    renderGallery();
    renderChosen();
    els.viewer.close();
    els.order.hidden = false;
    scrollTo(els.order);
  });
  els.viewer.addEventListener('click', (e) => {
    if (e.target === els.viewer) els.viewer.close();
  });
  els.viewer.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft') stepViewer(-1);
    if (e.key === 'ArrowRight') stepViewer(1);
  });

  // ---------- Генерация ----------
  function showResultError(message) {
    els.resultError.textContent = message || '';
    els.resultError.hidden = !message;
  }

  function setBusy(on) {
    state.busy = on;
    els.nextBtn.disabled = on || (state.mode === 'live' && state.remaining === 0);
    els.results.setAttribute('aria-busy', String(on));
    if (state.step === STEPS.length - 1) els.nextBtn.textContent = on ? 'Рисуем…' : `Показать ${variantsText(state.count)}`;
  }

  // Отказ проверки: возвращаем клиента на шаг, где нужно поправить.
  function rejected(field, message) {
    els.results.hidden = true;
    if (field === 'photo') {
      goTo(0, true);
      showPhotoError(message);
    } else {
      goTo(STEPS.length - 1, true);
      showWishesError(message);
    }
  }

  async function runDemo(params) {
    await sleep(1400);
    loaderChecked();
    state.images.forEach((im) => (im.status = 'pending'));
    await Promise.all(
      state.images.map(async (im, i) => {
        await sleep(1600 + i * 900 + Math.random() * 700);
        const base = `img/photos/${params.style}-${(i % 5) + 1}`;
        im.src = `${base}.jpg`;
        im.thumb = `${base}-sm.jpg`;
        im.status = 'done';
        renderGallery();
        updateProgress();
      }),
    );
  }

  function applyJob(job) {
    state.jobId = job.id;
    if (job.status !== 'checking') loaderChecked();
    state.images = job.images.map((im) => ({
      label: im.label,
      status: im.status,
      watermarked: im.watermarked,
      src: im.url ? (/^https?:/.test(im.url) ? im.url : API + im.url) : null,
      thumb: im.url && /\/img\/photos\/.+\.jpg$/.test(im.url) ? API + im.url.replace(/\.jpg$/, '-sm.jpg') : null,
    }));
    renderGallery();
    updateProgress();
  }

  async function runServer(params, wishes) {
    const body = { params, wishes, photo: state.photo ? state.photo.dataUrl : undefined, photoSize: state.photo ? { w: state.photo.w, h: state.photo.h } : undefined, captcha: captchaToken() };
    let r;
    try {
      r = await fetchWithTimeout(`${API}/api/jobs`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }, 60000);
    } catch {
      throw new Error('Сервер не отвечает. Проверьте интернет и попробуйте ещё раз.');
    }
    const data = await r.json().catch(() => ({}));
    if (state.captchaWidget !== null && window.smartCaptcha) window.smartCaptcha.reset(state.captchaWidget);
    if (!r.ok) {
      if (data.field) return { rejected: true, field: data.field, error: data.error };
      if (r.status === 429) state.remaining = 0;
      throw new Error(data.error || 'Сервер вернул ошибку. Попробуйте ещё раз.');
    }
    if (typeof data.remaining === 'number') state.remaining = data.remaining;
    applyJob(data);

    const deadline = Date.now() + 12 * 60 * 1000;
    let failures = 0;
    let job = data;
    while (job.status === 'checking' || job.status === 'running') {
      if (Date.now() > deadline) throw new Error('Генерация идёт слишком долго. Попробуйте ещё раз чуть позже.');
      await sleep(3000);
      try {
        const res = await fetchWithTimeout(`${API}/api/jobs/${job.id}`, {}, 15000);
        const next = await res.json();
        if (!res.ok) throw new Error(next.error);
        job = next;
        failures = 0;
        applyJob(job);
      } catch {
        if (++failures >= 6) throw new Error('Связь с сервером прервалась. Обновите страницу и попробуйте ещё раз.');
      }
    }
    if (job.status === 'rejected') return { rejected: true, field: job.field, error: job.error };
    if (job.status === 'error') throw new Error(job.error || 'Не получилось сгенерировать варианты.');
    return {};
  }

  async function generate() {
    if (state.busy) return;
    const w = updateWishes();
    if (!w.ok) {
      els.wishes.focus();
      return;
    }
    const params = readParams();
    showResultError('');
    showPhotoError('');
    state.picked = null;
    state.jobId = null;
    state.images = Array.from({ length: state.count }, (_, i) => ({
      label: ['Точно по вашему выбору', 'Другая раскладка плитки', 'С акцентной стеной', 'Больше хранения', 'Вечерний свет'][i % 5],
      status: 'pending',
    }));
    els.gallery.innerHTML = '';
    els.gallery.dataset.cols = '';
    state.figs = [];
    els.results.hidden = false;
    els.resultsFoot.hidden = true;
    els.order.hidden = true;
    els.resultsSource.hidden = !state.photo;
    if (state.photo) $('#resultsSourceImg').src = state.photo.dataUrl;
    els.resultsSub.textContent =
      state.mode === 'live'
        ? 'Нажмите на картинку, чтобы рассмотреть. Отметьте ту, что нравится.'
        : 'Демо: показываем примеры в выбранном стиле. На рабочем сайте здесь будет ваша ванная после ремонта.';
    renderChosen();
    setBusy(true);
    startLoader(params);
    scrollTo(els.results);
    try {
      const out = state.mode === 'demo' ? await runDemo(params) : await runServer(params, w.text);
      if (out && out.rejected) {
        stopLoader();
        rejected(out.field, out.error);
        return;
      }
      els.resultsFoot.hidden = false;
      els.order.hidden = false;
    } catch (err) {
      showResultError(err.message);
      if (state.images.some((im) => im.status === 'done')) {
        els.resultsFoot.hidden = false;
        els.order.hidden = false;
      }
    } finally {
      stopLoader();
      setBusy(false);
      updateLimitNote();
    }
  }

  $('#againBtn').addEventListener('click', () => {
    goTo(1, true);
  });

  // ---------- Заказ замера ----------
  els.orderForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = els.orderForm.elements;
    const name = f.name.value.trim();
    const phone = f.phone.value.trim();
    const digits = phone.replace(/\D/g, '');
    f.name.setAttribute('aria-invalid', String(!name));
    f.phone.setAttribute('aria-invalid', String(digits.length < 10));
    let problem = '';
    if (!name) problem = 'Укажите имя.';
    else if (digits.length < 10) problem = 'Проверьте номер телефона: нужно не меньше 10 цифр.';
    else if (!f.consent.checked) problem = 'Отметьте согласие на обработку данных.';
    els.orderError.textContent = problem;
    els.orderError.hidden = !problem;
    if (problem) return;

    const fd = new FormData(els.orderForm);
    const payload = {
      name,
      phone,
      address: f.address.value.trim(),
      time: fd.get('time') || 'any',
      works: fd.getAll('works'),
      consent: true,
      jobId: state.jobId,
      imageIndex: state.picked,
    };
    els.orderBtn.disabled = true;
    els.orderBtn.textContent = 'Отправляем…';
    try {
      if (state.mode === 'demo') {
        await sleep(600);
      } else {
        const r = await fetchWithTimeout(`${API}/api/leads`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }, 20000);
        const data = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(data.error || 'Не удалось отправить заявку. Позвоните нам.');
      }
      $$('.order__fields > :not(.order__done)', els.orderForm).forEach((el) => (el.hidden = true));
      els.orderDone.textContent =
        state.mode === 'demo'
          ? 'Демо-режим: заявка не отправлена. На рабочем сайте она сразу придёт менеджеру в Telegram вместе с выбранным вариантом и фото помещения.'
          : `Заявка на замер принята. ${name}, позвоним в течение рабочего дня, чтобы согласовать время.`;
      els.orderDone.hidden = false;
    } catch (err) {
      els.orderError.textContent = err.message || 'Не удалось отправить заявку. Позвоните нам.';
      els.orderError.hidden = false;
    } finally {
      els.orderBtn.disabled = false;
      els.orderBtn.textContent = 'Заказать замер';
    }
  });

  // ---------- Старт ----------
  buildSteps();
  applyConstraints();
  goTo(0);
  updateWishes();
  detectMode();
})();
