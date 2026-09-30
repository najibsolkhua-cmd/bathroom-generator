/* Конструктор ванной: форма, загрузка, галерея, заявка. */
(function () {
  'use strict';

  const CFG = Object.assign({ companyName: '', phone: '', apiBase: '' }, window.APP_CONFIG || {});
  const OPTIONS = window.BATH_OPTIONS;
  const ORDER = ['size', 'style', 'palette', 'fixture', 'extras', 'budget'];
  const query = new URLSearchParams(location.search);
  const API = (query.get('api') || CFG.apiBase || '').replace(/\/$/, '');
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

  const els = {
    form: $('#configurator'),
    steps: $('#steps'),
    photoInput: $('#photoInput'),
    photoPreview: $('#photoPreview'),
    photoRemove: $('#photoRemove'),
    photoError: $('#photoError'),
    dropzone: $('#dropzone'),
    generateBtn: $('#generateBtn'),
    limitNote: $('#limitNote'),
    captchaBox: $('#captchaBox'),
    result: $('#result'),
    empty: $('#emptyState'),
    loader: $('#loader'),
    loaderWall: $('#loaderWall'),
    loaderStatus: $('#loaderStatus'),
    loaderDone: $('#loaderDone'),
    loaderTime: $('#loaderTime'),
    gallery: $('#gallery'),
    grid: $('#galleryGrid'),
    againBtn: $('#againBtn'),
    error: $('#resultError'),
    leadForm: $('#leadForm'),
    leadChosen: $('#leadChosen'),
    leadError: $('#leadError'),
    leadBtn: $('#leadBtn'),
    leadDone: $('#leadDone'),
    viewer: $('#viewer'),
    viewerImg: $('#viewerImg'),
    viewerCaption: $('#viewerCaption'),
    viewerPick: $('#viewerPick'),
    demoNote: $('#demoNote'),
  };

  const state = {
    mode: 'demo', // demo — без сервера, mock — сервер без ключа, live — настоящая генерация
    count: 5,
    remaining: null,
    photo: null,
    busy: false,
    jobId: null,
    images: [],
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

  function fetchWithTimeout(url, options, ms) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), ms);
    return fetch(url, Object.assign({}, options, { signal: ctrl.signal })).finally(() => clearTimeout(t));
  }

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  function scrollToResult() {
    if (window.matchMedia('(min-width: 1000px)').matches) return;
    els.result.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
  }

  // ---------- Шапка ----------
  $$('[data-company]').forEach((el) => (el.textContent = CFG.companyName));
  $$('[data-phone]').forEach((el) => {
    el.textContent = CFG.phone;
    el.href = 'tel:' + CFG.phone.replace(/[^\d+]/g, '');
  });

  // ---------- Шаги формы ----------
  function buildSteps() {
    let num = 0;
    const html = ORDER.map((key) => {
      const group = OPTIONS[key];
      num++;
      const multi = group.type === 'multi';
      const hasSwatch = key === 'style' || key === 'palette';
      const items = group.items
        .map((it) => {
          const checked = multi ? group.default.includes(it.id) : group.default === it.id;
          let swatch = '';
          if (key === 'style') swatch = `<span class="swatch swatch--${it.pattern}" aria-hidden="true"></span>`;
          if (key === 'palette') {
            const [a, b, c] = it.colors;
            swatch = `<span class="swatch" aria-hidden="true" style="background:linear-gradient(90deg, ${a} 0 50%, ${b} 50% 80%, ${c} 80%)"></span>`;
          }
          return `<label class="choice">
            <input type="${multi ? 'checkbox' : 'radio'}" name="${key}" value="${it.id}"${checked ? ' checked' : ''}>
            <span class="choice__body">${swatch}<span class="choice__label">${it.label}</span>${it.note ? `<span class="choice__note">${it.note}</span>` : ''}</span>
          </label>`;
        })
        .join('');
      const cls = multi ? 'choices choices--multi' : hasSwatch ? 'choices choices--swatch' : 'choices';
      return `<fieldset class="step">
        <legend><span class="step__num">${num}</span>${group.title}</legend>
        ${group.hint ? `<p class="step__hint">${group.hint}</p>` : ''}
        <div class="${cls}">${items}</div>
      </fieldset>`;
    }).join('');
    els.steps.innerHTML = html;
    $('#photoStep [data-num]').textContent = String(num + 1);
  }

  function readParams() {
    const fd = new FormData(els.form);
    return {
      size: fd.get('size'),
      style: fd.get('style'),
      palette: fd.get('palette'),
      fixture: fd.get('fixture'),
      budget: fd.get('budget'),
      extras: fd.getAll('extras'),
    };
  }

  // ---------- Фото ----------
  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('Не удалось открыть фото. Попробуйте другое.'));
      img.src = src;
    });
  }

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
      return canvas.toDataURL('image/jpeg', 0.86);
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  function setPhoto(dataUrl) {
    state.photo = dataUrl;
    $('.dropzone__empty', els.dropzone).hidden = Boolean(dataUrl);
    $('.dropzone__preview', els.dropzone).hidden = !dataUrl;
    if (dataUrl) els.photoPreview.src = dataUrl;
    else els.photoPreview.removeAttribute('src');
  }

  async function handleFile(file) {
    els.photoError.hidden = true;
    if (!file) return;
    try {
      setPhoto(await preparePhoto(file));
    } catch (e) {
      setPhoto(null);
      els.photoError.textContent = e.message;
      els.photoError.hidden = false;
    }
    els.photoInput.value = '';
  }

  els.photoInput.addEventListener('change', () => handleFile(els.photoInput.files[0]));
  els.photoRemove.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    setPhoto(null);
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

  // ---------- Режим работы ----------
  function applyCount() {
    $$('[data-variants]').forEach((el) => (el.textContent = variantsText(state.count)));
    els.generateBtn.textContent = (state.busy ? 'Рисуем ' : 'Показать ') + variantsText(state.count);
  }

  function updateLimitNote() {
    if (state.mode !== 'live' || state.remaining === null) {
      els.limitNote.textContent = state.mode === 'demo' ? 'В демо-режиме эскизы появятся за несколько секунд.' : 'Обычно это занимает 1–2 минуты.';
      return;
    }
    if (state.remaining <= 0) {
      els.limitNote.textContent = 'На сегодня генерации закончились. Оставьте телефон — пришлём варианты сами.';
      els.generateBtn.disabled = true;
      showLeadForm();
    } else {
      els.limitNote.textContent = `Осталось генераций сегодня: ${state.remaining}. Обычно это занимает 1–2 минуты.`;
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
        els.demoNote.firstElementChild.textContent =
          'Тестовый режим сервера: ключ API не задан, поэтому вместо фотореалистичных картинок рисуются эскизы. Заявки сохраняются.';
      }
    }
    applyCount();
    updateLimitNote();
  }

  // ---------- Анимация: укладываем плитку ----------
  const STATUSES = [
    'Замеряем помещение',
    'Укладываем плитку',
    'Ставим сантехнику',
    'Вешаем зеркало',
    'Настраиваем свет',
    'Проверяем, что всё можно смонтировать',
  ];
  const COLS = 8;
  const ROWS = 5;
  const loaderState = { timer: null, clock: null, started: 0, round: 0, colors: [] };

  function buildWall() {
    els.loaderWall.innerHTML = '';
    for (let i = 0; i < COLS * ROWS; i++) {
      const t = document.createElement('span');
      t.className = 'tile';
      els.loaderWall.appendChild(t);
    }
  }

  // Плиточники кладут снизу вверх, ряд за рядом.
  function layOrder() {
    const order = [];
    for (let r = ROWS - 1; r >= 0; r--) for (let c = 0; c < COLS; c++) order.push(r * COLS + c);
    return order;
  }

  function startLoader(params) {
    const palette = OPTIONS.palette.items.find((p) => p.id === params.palette) || OPTIONS.palette.items[0];
    loaderState.colors = palette.colors;
    loaderState.round = 0;
    loaderState.started = Date.now();
    buildWall();
    els.loader.classList.remove('loader--compact');
    els.loader.hidden = false;
    els.loaderStatus.textContent = STATUSES[0];
    const tiles = $$('.tile', els.loaderWall);
    const order = layOrder();
    let step = 0;

    function paintRound() {
      const [base, accent, third] = loaderState.colors;
      // акцентная полоса на высоте раковины, как у настоящих раскладок
      tiles.forEach((t, i) => {
        const row = Math.floor(i / COLS);
        const color = row === 2 ? accent : (i + loaderState.round) % 11 === 0 ? third : base;
        t.style.setProperty('--tile-color', color);
      });
    }

    function tick() {
      if (step === 0) paintRound();
      if (step < order.length) {
        tiles[order[step]].classList.add('is-laid');
        step++;
        loaderState.timer = setTimeout(tick, reduceMotion ? 0 : 95);
      } else {
        loaderState.timer = setTimeout(() => {
          tiles.forEach((t) => t.classList.remove('is-laid'));
          step = 0;
          loaderState.round++;
          els.loaderStatus.textContent = STATUSES[loaderState.round % STATUSES.length];
          tick();
        }, reduceMotion ? 4000 : 900);
      }
    }
    tick();

    const updateClock = () => {
      const s = Math.floor((Date.now() - loaderState.started) / 1000);
      els.loaderTime.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
    };
    updateClock();
    loaderState.clock = setInterval(updateClock, 1000);
  }

  function stopLoader() {
    clearTimeout(loaderState.timer);
    clearInterval(loaderState.clock);
    els.loader.hidden = true;
  }

  function updateProgress() {
    const done = state.images.filter((im) => im.status !== 'pending').length;
    els.loaderDone.textContent = `Готово ${done} из ${state.images.length}`;
    if (state.images.some((im) => im.status === 'done')) els.loader.classList.add('loader--compact');
  }

  // ---------- Галерея ----------
  function renderGallery() {
    // Галерею показываем, когда готова хотя бы одна картинка; до этого — только анимация.
    els.gallery.hidden = !state.images.some((im) => im.status !== 'pending');
    const needed = state.images.length;
    while (els.grid.children.length > needed) els.grid.lastElementChild.remove();
    state.images.forEach((im, i) => {
      let fig = els.grid.children[i];
      if (!fig) {
        fig = document.createElement('figure');
        fig.className = 'shot';
        fig.innerHTML = `<button type="button" class="shot__frame"></button>
          <figcaption><span class="shot__label"></span><button type="button" class="pick" aria-pressed="false">Нравится</button></figcaption>`;
        $('.shot__frame', fig).addEventListener('click', () => openViewer(i));
        $('.pick', fig).addEventListener('click', () => togglePick(i));
        els.grid.appendChild(fig);
      }
      const frame = $('.shot__frame', fig);
      const pick = $('.pick', fig);
      $('.shot__label', fig).textContent = `${i + 1}. ${im.label}`;
      if (frame.dataset.status !== im.status) {
        frame.dataset.status = im.status;
        frame.classList.toggle('is-pending', im.status === 'pending');
        frame.classList.toggle('is-failed', im.status === 'error');
        frame.disabled = im.status !== 'done';
        if (im.status === 'done') {
          frame.innerHTML = `<img src="${im.src}" alt="Вариант ${i + 1}: ${im.label}" loading="lazy">`;
          frame.classList.add('is-new');
          frame.setAttribute('aria-label', `Открыть вариант ${i + 1}`);
        } else if (im.status === 'pending') {
          frame.textContent = 'Рисуем…';
        } else {
          frame.textContent = 'Этот вариант не получился';
        }
      }
      pick.hidden = im.status !== 'done';
      const on = state.picked === i;
      pick.setAttribute('aria-pressed', String(on));
      pick.textContent = on ? 'Выбран' : 'Нравится';
      fig.classList.toggle('is-picked', on);
    });
  }

  function togglePick(i) {
    state.picked = state.picked === i ? null : i;
    renderGallery();
    renderChosen();
    if (!els.viewer.open && state.picked !== null) showLeadForm();
  }

  function renderChosen() {
    if (state.picked === null) {
      els.leadChosen.textContent = 'Отметьте понравившийся вариант или просто оставьте телефон — обсудим по звонку.';
      return;
    }
    const im = state.images[state.picked];
    els.leadChosen.innerHTML = '';
    const img = document.createElement('img');
    img.src = im.src;
    img.alt = '';
    els.leadChosen.append(img, `Вы выбрали вариант ${state.picked + 1}. Прораб посмотрит его и назовёт цену.`);
  }

  // ---------- Просмотр ----------
  const doneIndexes = () => state.images.map((im, i) => (im.status === 'done' ? i : -1)).filter((i) => i >= 0);

  function openViewer(i) {
    if (state.images[i].status !== 'done') return;
    state.viewing = i;
    renderViewer();
    if (!els.viewer.open) els.viewer.showModal();
  }

  function renderViewer() {
    const i = state.viewing;
    const im = state.images[i];
    els.viewerImg.src = im.src;
    els.viewerImg.alt = `Вариант ${i + 1}: ${im.label}`;
    els.viewerCaption.textContent = `${i + 1}. ${im.label}`;
    const on = state.picked === i;
    els.viewerPick.textContent = on ? 'Выбран — оставить заявку' : 'Выбрать этот вариант';
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
    if (state.picked !== state.viewing) {
      state.picked = state.viewing;
      renderGallery();
      renderChosen();
    }
    els.viewer.close();
    showLeadForm(true);
  });
  els.viewer.addEventListener('click', (e) => {
    if (e.target === els.viewer) els.viewer.close();
  });
  els.viewer.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft') stepViewer(-1);
    if (e.key === 'ArrowRight') stepViewer(1);
  });

  // ---------- Генерация ----------
  function showError(message) {
    els.error.textContent = message;
    els.error.hidden = false;
  }

  function resetResult() {
    els.error.hidden = true;
    els.empty.hidden = true;
    els.gallery.hidden = true;
    els.grid.innerHTML = '';
    state.images = [];
    state.picked = null;
    state.jobId = null;
    renderChosen();
  }

  function setBusy(on) {
    state.busy = on;
    els.generateBtn.disabled = on || (state.mode === 'live' && state.remaining === 0);
    els.result.setAttribute('aria-busy', String(on));
    applyCount();
  }

  async function runDemo(params) {
    state.images = Array.from({ length: state.count }, (_, i) => ({
      label: ['Общий вид от двери', 'Зона раковины', 'Зона купания', 'Акцентная стена', 'Вечерний свет'][i],
      status: 'pending',
    }));
    renderGallery();
    updateProgress();
    await Promise.all(
      state.images.map(async (im, i) => {
        await sleep(1800 + i * 900 + Math.random() * 900);
        im.src = window.BathSketch.toDataUrl(window.BathSketch.render(params, i));
        im.status = 'done';
        renderGallery();
        updateProgress();
      }),
    );
  }

  function applyJob(job) {
    state.jobId = job.id;
    state.images = job.images.map((im) => ({
      label: im.label,
      status: im.status,
      src: im.url ? (/^https?:/.test(im.url) ? im.url : API + im.url) : null,
    }));
    renderGallery();
    updateProgress();
  }

  async function runServer(params) {
    const body = { params, photo: state.photo || undefined, captcha: captchaToken() };
    let r;
    try {
      r = await fetchWithTimeout(`${API}/api/jobs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }, 60000);
    } catch {
      throw new Error('Сервер не отвечает. Проверьте интернет и попробуйте ещё раз.');
    }
    const data = await r.json().catch(() => ({}));
    if (state.captchaWidget !== null && window.smartCaptcha) window.smartCaptcha.reset(state.captchaWidget);
    if (!r.ok) {
      if (r.status === 429) {
        state.remaining = 0;
        updateLimitNote();
      }
      throw new Error(data.error || 'Сервер вернул ошибку. Попробуйте ещё раз.');
    }
    if (typeof data.remaining === 'number') state.remaining = data.remaining;
    applyJob(data);

    const deadline = Date.now() + 10 * 60 * 1000;
    let failures = 0;
    let job = data;
    while (job.status === 'running') {
      if (Date.now() > deadline) throw new Error('Генерация идёт слишком долго. Попробуйте ещё раз чуть позже.');
      await sleep(3000);
      try {
        const res = await fetchWithTimeout(`${API}/api/jobs/${job.id}`, {}, 15000);
        const next = await res.json();
        if (!res.ok) throw new Error(next.error);
        job = next;
        failures = 0;
        applyJob(job);
      } catch (e) {
        if (++failures >= 6) throw new Error('Связь с сервером прервалась. Обновите страницу и попробуйте ещё раз.');
      }
    }
    if (job.status === 'error') throw new Error(job.error || 'Не получилось сгенерировать картинки.');
  }

  els.form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (state.busy) return;
    const params = readParams();
    resetResult();
    setBusy(true);
    startLoader(params);
    scrollToResult();
    try {
      if (state.mode === 'demo') await runDemo(params);
      else await runServer(params);
      showLeadForm();
    } catch (err) {
      showError(err.message);
      if (!state.images.some((im) => im.status === 'done')) {
        els.gallery.hidden = true;
        els.empty.hidden = false;
      }
    } finally {
      stopLoader();
      setBusy(false);
      updateLimitNote();
    }
  });

  els.againBtn.addEventListener('click', () => {
    els.form.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
    const first = $('input', els.steps);
    if (first) first.focus({ preventScroll: true });
  });

  // ---------- Заявка ----------
  function showLeadForm(focus) {
    els.leadForm.hidden = false;
    if (focus) {
      els.leadForm.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'center' });
      const name = els.leadForm.elements.name;
      if (name && !name.value) name.focus({ preventScroll: true });
    }
  }

  els.leadForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = els.leadForm.elements;
    const name = f.name.value.trim();
    const phone = f.phone.value.trim();
    const digits = phone.replace(/\D/g, '');
    f.name.setAttribute('aria-invalid', String(!name));
    f.phone.setAttribute('aria-invalid', String(digits.length < 10));
    let problem = '';
    if (!name) problem = 'Укажите имя.';
    else if (digits.length < 10) problem = 'Проверьте номер телефона: нужно не меньше 10 цифр.';
    else if (!f.consent.checked) problem = 'Отметьте согласие на обработку данных.';
    if (problem) {
      els.leadError.textContent = problem;
      els.leadError.hidden = false;
      return;
    }
    els.leadError.hidden = true;
    els.leadBtn.disabled = true;
    els.leadBtn.textContent = 'Отправляем…';
    try {
      if (state.mode === 'demo') {
        await sleep(600);
      } else {
        const r = await fetchWithTimeout(`${API}/api/leads`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, phone, consent: true, jobId: state.jobId, imageIndex: state.picked }),
        }, 20000);
        const data = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(data.error || 'Не удалось отправить заявку. Позвоните нам.');
      }
      $$('.lead__fields, .consent, #leadBtn', els.leadForm).forEach((el) => (el.hidden = true));
      els.leadDone.textContent =
        state.mode === 'demo'
          ? `Демо-режим: заявка не отправлена. На рабочем сайте она сразу придёт менеджеру в Telegram.`
          : `Заявка отправлена. ${name}, перезвоним в течение рабочего дня.`;
      els.leadDone.hidden = false;
    } catch (err) {
      els.leadError.textContent = err.message || 'Не удалось отправить заявку. Позвоните нам.';
      els.leadError.hidden = false;
    } finally {
      els.leadBtn.disabled = false;
      els.leadBtn.textContent = 'Отправить заявку';
    }
  });

  // ---------- Старт ----------
  buildSteps();
  applyCount();
  detectMode();
})();
