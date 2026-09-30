/*
 * Сервер генератора «Ванная мечты». Нужен только Node.js 20+ — без npm install.
 *
 * Что делает:
 * - раздаёт сайт из папки public/;
 * - принимает фото клиента, конфигурацию и пожелания;
 * - проверяет, что это ванная и что пожелания только про ванную (lib/guard.js);
 * - генерирует 5 вариантов: промпт строится от фото и конфигурации (lib/prompt.js);
 * - проверяет каждый результат, ставит водяной знак, сохраняет в generated/;
 * - ограничивает число генераций, принимает заявки на замер и шлёт их в Telegram.
 *
 * Без ключа API (или с MOCK=1) сервер работает в тестовом режиме:
 * вместо генерации показывает примеры фото в выбранном стиле, деньги не тратятся.
 */
const fs = require('fs');
const path = require('path');
const http = require('http');
const crypto = require('crypto');
const { execFile, execFileSync } = require('child_process');

const ROOT = __dirname;
loadEnvFile(path.join(ROOT, '.env'));

const { sanitizeParams, buildPrompt, variantLabel } = require('./lib/prompt');
const { createGuard } = require('./lib/guard');
const OPTIONS = require('./public/js/options');
const rules = require('./public/js/guard-rules');

// ---------- Настройки (берутся из файла .env) ----------
const env = process.env;
const CFG = {
  port: Number(env.PORT) || 3000,
  host: env.HOST || '127.0.0.1',
  apiKey: env.OPENAI_API_KEY || '',
  baseURL: (env.OPENAI_BASE_URL || 'https://api.proxyapi.ru/openai/v1').replace(/\/$/, ''),
  model: env.IMAGE_MODEL || 'gpt-image-2',
  quality: env.IMAGE_QUALITY || 'high',
  size: env.IMAGE_SIZE || 'auto', // auto — по пропорциям фото клиента
  outputFormat: env.IMAGE_FORMAT || 'jpeg',
  inputFidelity: env.IMAGE_INPUT_FIDELITY || '', // high — если модель поддерживает (точнее сохраняет фото)
  guardModel: env.GUARD_MODEL || 'gpt-5.4-mini',
  guard: env.GUARD !== '0',
  verifyOutput: env.VERIFY_OUTPUT !== '0',
  watermark: env.WATERMARK !== '0',
  watermarkFile: path.resolve(ROOT, env.WATERMARK_FILE || 'public/img/watermark.png'),
  imagesPerJob: clamp(Number(env.IMAGES_PER_JOB) || 5, 1, 5),
  maxParallel: clamp(Number(env.MAX_PARALLEL) || 4, 1, 10),
  dailyLimitPerIp: Number(env.DAILY_LIMIT_PER_IP) || 3,
  globalDailyLimit: Number(env.GLOBAL_DAILY_LIMIT) || 200,
  keepDays: Number(env.KEEP_DAYS) || 14,
  publicUrl: (env.PUBLIC_URL || '').replace(/\/$/, ''),
  corsOrigins: (env.CORS_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean),
  tgToken: env.TELEGRAM_BOT_TOKEN || '',
  tgChat: env.TELEGRAM_CHAT_ID || '',
  captchaClientKey: env.SMARTCAPTCHA_CLIENT_KEY || '',
  captchaServerKey: env.SMARTCAPTCHA_SERVER_KEY || '',
};
CFG.mock = env.MOCK === '1' || !CFG.apiKey;

const PUBLIC_DIR = path.join(ROOT, 'public');
const GENERATED_DIR = path.join(ROOT, 'generated');
const DATA_DIR = path.join(ROOT, 'data');
fs.mkdirSync(GENERATED_DIR, { recursive: true });
fs.mkdirSync(DATA_DIR, { recursive: true });

const guard = createGuard({ apiKey: CFG.apiKey, baseURL: CFG.baseURL, model: CFG.guardModel, enabled: CFG.guard && !CFG.mock });
const IMAGEMAGICK = CFG.watermark && fs.existsSync(CFG.watermarkFile) ? detectImageMagick() : null;

// ---------- Мелкие помощники ----------
function loadEnvFile(file) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!m || line.trim().startsWith('#')) continue;
    let value = m[2].trim();
    if (/^(['"]).*\1$/.test(value)) value = value.slice(1, -1);
    if (process.env[m[1]] === undefined) process.env[m[1]] = value;
  }
}
function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const today = () => new Date().toISOString().slice(0, 10);

function detectImageMagick() {
  for (const bin of ['magick', 'convert']) {
    try {
      execFileSync(bin, ['-version'], { stdio: 'ignore' });
      return bin;
    } catch {}
  }
  return null;
}

function clientIp(req) {
  const remote = (req.socket.remoteAddress || '').replace(/^::ffff:/, '');
  // Заголовкам верим, только если запрос пришёл от Nginx на этом же сервере.
  if (remote === '127.0.0.1' || remote === '::1') {
    const real = req.headers['x-real-ip'] || String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
    if (real) return real;
  }
  return remote;
}

function sendJson(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(data));
}

function readJson(req, limitBytes) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > limitBytes) {
        reject(Object.assign(new Error('TOO_BIG'), { code: 'TOO_BIG' }));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => {
      try {
        resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {});
      } catch {
        reject(Object.assign(new Error('BAD_JSON'), { code: 'BAD_JSON' }));
      }
    });
    req.on('error', reject);
  });
}

function labelOf(group, id) {
  const it = OPTIONS.groups[group].items.find((x) => x.id === id);
  return it ? it.label : id;
}

// ---------- Лимиты ----------
const usage = { day: today(), perIp: new Map(), total: 0, leadsPerIp: new Map() };
function rollDay() {
  if (usage.day !== today()) {
    usage.day = today();
    usage.perIp.clear();
    usage.leadsPerIp.clear();
    usage.total = 0;
  }
}
function remainingFor(ip) {
  rollDay();
  return Math.max(0, CFG.dailyLimitPerIp - (usage.perIp.get(ip) || 0));
}
function refund(ip) {
  usage.perIp.set(ip, Math.max(0, (usage.perIp.get(ip) || 1) - 1));
  usage.total = Math.max(0, usage.total - 1);
}

// ---------- Очередь: не больше maxParallel запросов к API одновременно ----------
let active = 0;
const waiting = [];
async function withSlot(fn) {
  if (active >= CFG.maxParallel) await new Promise((r) => waiting.push(r));
  active++;
  try {
    return await fn();
  } finally {
    active--;
    const next = waiting.shift();
    if (next) next();
  }
}

// ---------- Запросы к API картинок (формат OpenAI) ----------
async function callImagesApi(endpoint, body, isForm) {
  const headers = { Authorization: `Bearer ${CFG.apiKey}` };
  if (!isForm) headers['Content-Type'] = 'application/json';
  for (let attempt = 1; attempt <= 2; attempt++) {
    const res = await fetch(`${CFG.baseURL}/${endpoint}`, {
      method: 'POST',
      headers,
      body: isForm ? body() : JSON.stringify(body),
      signal: AbortSignal.timeout(8 * 60 * 1000),
    });
    const text = await res.text();
    let data = null;
    try {
      data = JSON.parse(text);
    } catch {}
    if (res.ok && data) return data;
    const message = (data && data.error && data.error.message) || text.slice(0, 300);
    if ((res.status === 429 || res.status >= 500) && attempt === 1) {
      await sleep(4000);
      continue;
    }
    throw Object.assign(new Error(message), { status: res.status });
  }
}

// Размер картинки: по пропорциям фото клиента, без фото — вертикальный, как на Pinterest.
function sizeFor(photo) {
  if (CFG.size !== 'auto') return CFG.size;
  if (!photo || !photo.w || !photo.h) return '1024x1536';
  if (photo.h > photo.w * 1.1) return '1024x1536';
  if (photo.w > photo.h * 1.1) return '1536x1024';
  return '1024x1024';
}

function applyWatermark(file, width) {
  if (!IMAGEMAGICK) return Promise.resolve(false);
  const wmWidth = Math.round(width * 0.26);
  const margin = Math.round(width * 0.025);
  const args = [file, '(', CFG.watermarkFile, '-resize', `${wmWidth}x`, ')', '-gravity', 'southeast', '-geometry', `+${margin}+${margin}`, '-composite', '-quality', '88', file];
  return new Promise((resolve) => execFile(IMAGEMAGICK, args, (err) => resolve(!err)));
}

// ---------- Задачи ----------
const jobs = new Map();

function publicJob(job) {
  return {
    id: job.id,
    status: job.status, // checking → running → done | error | rejected
    mock: job.mock,
    withPhoto: job.withPhoto,
    error: job.error || null,
    field: job.field || null,
    images: job.images.map((im) => ({ index: im.index, label: im.label, status: im.status, url: im.url || null, watermarked: Boolean(im.watermarked) })),
  };
}

async function generateOne(job, i, photo, ctx) {
  if (job.mock) {
    await sleep(2500 + Math.random() * 3500);
    return { url: `/img/photos/${job.params.style}-${(i % 5) + 1}.jpg`, watermarked: false };
  }

  const dir = path.join(GENERATED_DIR, job.id);
  const size = sizeFor(photo);
  const fields = {
    model: CFG.model,
    prompt: buildPrompt(job.params, i, ctx),
    size,
    quality: CFG.quality,
    n: 1,
    output_format: CFG.outputFormat,
  };
  if (CFG.outputFormat !== 'png') fields.output_compression = 90;
  if (photo && CFG.inputFidelity) fields.input_fidelity = CFG.inputFidelity;

  for (let attempt = 1; attempt <= 2; attempt++) {
    const data = await withSlot(() => {
      if (!photo) return callImagesApi('images/generations', fields, false);
      return callImagesApi('images/edits', () => {
        const form = new FormData();
        for (const [k, v] of Object.entries(fields)) form.append(k, String(v));
        form.append('image', new Blob([photo.buffer], { type: photo.mime }), `room.${photo.ext}`);
        return form;
      }, true);
    });

    const item = data && data.data && data.data[0];
    let buffer;
    if (item && item.b64_json) buffer = Buffer.from(item.b64_json, 'base64');
    else if (item && item.url) buffer = Buffer.from(await (await fetch(item.url)).arrayBuffer());
    else throw new Error('API вернул пустой ответ');

    const mime = CFG.outputFormat === 'png' ? 'image/png' : `image/${CFG.outputFormat}`;
    if (CFG.verifyOutput && !(await guard.checkOutput(buffer, mime))) {
      console.warn(`[${job.id}] вариант ${i + 1}: не прошёл проверку (попытка ${attempt})`);
      if (attempt === 1) continue;
      throw new Error('Результат не прошёл проверку');
    }

    const ext = CFG.outputFormat === 'jpeg' ? 'jpg' : CFG.outputFormat;
    const file = path.join(dir, `${i + 1}.${ext}`);
    fs.writeFileSync(file, buffer);
    const watermarked = await applyWatermark(file, Number(size.split('x')[0]) || 1024);
    return { url: `/generated/${job.id}/${i + 1}.${ext}`, watermarked };
  }
}

async function runJob(job, photo, wishes, ip) {
  // 1. Проверка «только ванные» и анализ помещения
  const check = await guard.checkInput({ photoDataUrl: photo ? photo.dataUrl : null, wishes, size: job.params.size });
  if (!check.ok) {
    job.status = 'rejected';
    job.error = check.problem;
    job.field = check.field;
    refund(ip);
    console.log(`[${job.id}] отклонено (${check.field}): ${check.problem}`);
    return;
  }
  job.status = 'running';
  const ctx = { withPhoto: Boolean(photo), room: check.room, wishes: check.wishes };

  // 2. Сохраняем фото клиента — оно пригодится прорабу перед замером
  if (photo) {
    fs.mkdirSync(path.join(GENERATED_DIR, job.id), { recursive: true });
    fs.writeFileSync(path.join(GENERATED_DIR, job.id, `source.${photo.ext}`), photo.buffer);
    job.sourceUrl = `/generated/${job.id}/source.${photo.ext}`;
  } else if (!job.mock) {
    fs.mkdirSync(path.join(GENERATED_DIR, job.id), { recursive: true });
  }

  // 3. Генерация пяти вариантов
  await Promise.all(
    job.images.map(async (im) => {
      try {
        const r = await generateOne(job, im.index, photo, ctx);
        im.url = r.url;
        im.watermarked = r.watermarked;
        im.status = 'done';
      } catch (err) {
        im.status = 'error';
        console.error(`[${job.id}] вариант ${im.index + 1}: ${err.status || ''} ${err.message}`);
      }
    }),
  );
  const ok = job.images.filter((im) => im.status === 'done').length;
  job.status = ok > 0 ? 'done' : 'error';
  if (!ok) {
    job.error = 'Не получилось сгенерировать варианты. Попробуйте ещё раз через минуту.';
    refund(ip);
  }
  console.log(`[${job.id}] готово: ${ok} из ${job.images.length}`);
}

function decodePhoto(dataUrl, size) {
  if (!dataUrl) return null;
  const m = String(dataUrl).match(/^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/);
  if (!m) throw new Error('Загрузите фото в формате JPG, PNG или WebP.');
  const buffer = Buffer.from(m[2], 'base64');
  if (buffer.length > 8 * 1024 * 1024) throw new Error('Фото слишком большое. Максимум 8 МБ.');
  const w = Number(size && size.w) || 0;
  const h = Number(size && size.h) || 0;
  return { buffer, dataUrl, mime: `image/${m[1]}`, ext: m[1] === 'jpeg' ? 'jpg' : m[1], w, h };
}

// ---------- Капча (Яндекс SmartCaptcha), если ключи заданы ----------
async function captchaOk(token, ip) {
  if (!CFG.captchaServerKey) return true;
  if (!token) return false;
  try {
    const body = new URLSearchParams({ secret: CFG.captchaServerKey, token: String(token), ip });
    const r = await fetch('https://smartcaptcha.yandexcloud.net/validate', { method: 'POST', body, signal: AbortSignal.timeout(5000) });
    const j = await r.json();
    return j.status === 'ok';
  } catch (e) {
    console.error('SmartCaptcha недоступна:', e.message);
    return true; // не блокируем клиентов, если сервис капчи не отвечает
  }
}

// ---------- Telegram ----------
async function notifyTelegram(text, photoUrl) {
  if (!CFG.tgToken || !CFG.tgChat) return;
  const base = `https://api.telegram.org/bot${CFG.tgToken}`;
  const post = (method, payload) =>
    fetch(`${base}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10000),
    });
  try {
    if (photoUrl && /^https:\/\/.+\.(jpe?g|png|webp)$/i.test(photoUrl)) {
      const r = await post('sendPhoto', { chat_id: CFG.tgChat, photo: photoUrl, caption: text.slice(0, 1000) });
      if (r.ok) return;
    }
    await post('sendMessage', { chat_id: CFG.tgChat, text });
  } catch (e) {
    console.error('Telegram недоступен:', e.message);
  }
}

// ---------- Обработчики API ----------
async function handleCreateJob(req, res, ip) {
  let body;
  try {
    body = await readJson(req, 12 * 1024 * 1024);
  } catch (e) {
    return sendJson(res, 400, { error: e.code === 'TOO_BIG' ? 'Фото слишком большое. Максимум 8 МБ.' : 'Некорректный запрос.' });
  }
  rollDay();

  // Быстрая проверка текста — до капчи и лимитов, чтобы клиент сразу увидел, что поправить.
  const wishes = rules.checkWishes(body.wishes);
  if (!wishes.ok) return sendJson(res, 400, { error: wishes.problem, field: 'wishes' });

  if (!(await captchaOk(body.captcha, ip))) return sendJson(res, 400, { error: 'Подтвердите, что вы не робот.' });
  if (remainingFor(ip) <= 0) {
    return sendJson(res, 429, {
      error: `На сегодня лимит исчерпан: ${CFG.dailyLimitPerIp} генерации в сутки. Оставьте заявку на замер — подберём варианты вместе.`,
    });
  }
  if (usage.total >= CFG.globalDailyLimit) {
    return sendJson(res, 429, { error: 'Сегодня генератор перегружен. Оставьте заявку на замер, и мы пришлём варианты сами.' });
  }

  let photo;
  try {
    photo = decodePhoto(body.photo, body.photoSize);
  } catch (e) {
    return sendJson(res, 400, { error: e.message, field: 'photo' });
  }
  const params = sanitizeParams(body.params);

  usage.perIp.set(ip, (usage.perIp.get(ip) || 0) + 1);
  usage.total++;

  const job = {
    id: crypto.randomUUID(),
    createdAt: Date.now(),
    params,
    wishes: wishes.text,
    mock: CFG.mock,
    withPhoto: Boolean(photo),
    status: 'checking',
    images: Array.from({ length: CFG.imagesPerJob }, (_, i) => ({ index: i, label: variantLabel(i), status: 'pending' })),
  };
  jobs.set(job.id, job);
  console.log(`[${job.id}] новая задача${photo ? ' (с фото)' : ''}: ${JSON.stringify(params)}${wishes.text ? ` пожелания: ${wishes.text}` : ''}`);
  runJob(job, photo, wishes.text, ip).catch((e) => {
    job.status = 'error';
    job.error = 'Внутренняя ошибка сервера.';
    console.error(e);
  });
  sendJson(res, 202, { ...publicJob(job), remaining: remainingFor(ip) });
}

const TIMES = { weekday: 'будни днём', evening: 'будни вечером', weekend: 'выходные', any: 'в любое время' };

async function handleLead(req, res, ip) {
  let body;
  try {
    body = await readJson(req, 20 * 1024);
  } catch {
    return sendJson(res, 400, { error: 'Некорректный запрос.' });
  }
  rollDay();
  const count = usage.leadsPerIp.get(ip) || 0;
  if (count >= 10) return sendJson(res, 429, { error: 'Слишком много заявок с этого устройства. Позвоните нам.' });

  const { name = '', phone = '', address = '', time = '', works = [], consent, jobId, imageIndex } = body;
  const cleanName = String(name).trim().slice(0, 80);
  const digits = String(phone).replace(/\D/g, '');
  if (!cleanName) return sendJson(res, 400, { error: 'Укажите имя.' });
  if (digits.length < 10 || digits.length > 15) return sendJson(res, 400, { error: 'Проверьте номер телефона.' });
  if (consent !== true) return sendJson(res, 400, { error: 'Нужно согласие на обработку данных.' });

  const job = jobId ? jobs.get(String(jobId)) : null;
  const image = job && Number.isInteger(imageIndex) ? job.images[imageIndex] : null;
  const abs = (u) => (u ? (/^https?:/.test(u) ? u : `${CFG.publicUrl}${u}`) : null);
  const workIds = (Array.isArray(works) ? works : []).map(String).filter((id) => OPTIONS.groups.works.items.some((x) => x.id === id));

  const lead = {
    at: new Date().toISOString(),
    name: cleanName,
    phone: String(phone).trim().slice(0, 30),
    address: String(address).trim().slice(0, 160),
    time: TIMES[time] ? time : '',
    works: workIds,
    params: job ? job.params : null,
    wishes: job ? job.wishes : '',
    source: job ? abs(job.sourceUrl) : null,
    image: image && image.url ? abs(image.url) : null,
    variant: image ? image.label : null,
  };
  fs.appendFileSync(path.join(DATA_DIR, 'leads.jsonl'), JSON.stringify(lead) + '\n');
  usage.leadsPerIp.set(ip, count + 1);

  const p = lead.params;
  const lines = ['📐 Заявка на замер с конструктора ванной', `Имя: ${lead.name}`, `Телефон: ${lead.phone}`];
  if (lead.address) lines.push(`Адрес: ${lead.address}`);
  if (lead.time) lines.push(`Когда удобно: ${TIMES[lead.time]}`);
  if (p) {
    lines.push(
      '',
      `Помещение: ${labelOf('roomType', p.roomType)}, ${labelOf('size', p.size)}`,
      `Стиль: ${labelOf('style', p.style)}, гамма: ${labelOf('palette', p.palette)}`,
      `Стены: ${labelOf('walls', p.walls)}, металл: ${labelOf('metal', p.metal)}`,
      `Где мыться: ${labelOf('bathing', p.bathing)}`,
      `Нужно: ${p.extras.map((id) => labelOf('extras', id)).join(', ') || '—'}`,
      `Свет: ${p.light.map((id) => labelOf('light', id)).join(', ') || '—'}`,
      `Уровень: ${labelOf('budget', p.budget)}`,
    );
  }
  if (lead.wishes) lines.push(`Пожелания: ${lead.wishes}`);
  if (lead.works.length) lines.push(`Ещё сделать: ${lead.works.map((id) => labelOf('works', id)).join(', ')}`);
  if (lead.variant) lines.push('', `Выбранный вариант: ${lead.variant}`);
  if (lead.image) lines.push(lead.image);
  if (lead.source) lines.push(`Фото помещения клиента: ${lead.source}`);
  notifyTelegram(lines.join('\n'), lead.image);

  sendJson(res, 200, { ok: true });
}

// ---------- Раздача файлов сайта и картинок ----------
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.woff2': 'font/woff2',
};

function serveFile(res, baseDir, urlPath, cache) {
  let rel;
  try {
    rel = decodeURIComponent(urlPath);
  } catch {
    return sendJson(res, 400, { error: 'Некорректный адрес.' });
  }
  if (rel.endsWith('/')) rel += 'index.html';
  const file = path.normalize(path.join(baseDir, rel));
  if (!file.startsWith(baseDir + path.sep)) return sendJson(res, 403, { error: 'Нет доступа.' });
  let target = file;
  if (!fs.existsSync(target) && !path.extname(target) && fs.existsSync(target + '.html')) target += '.html';
  fs.stat(target, (err, st) => {
    if (err || !st.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('Страница не найдена');
    }
    res.writeHead(200, {
      'Content-Type': TYPES[path.extname(target).toLowerCase()] || 'application/octet-stream',
      'Content-Length': st.size,
      'Cache-Control': cache,
      'X-Content-Type-Options': 'nosniff',
    });
    fs.createReadStream(target).pipe(res);
  });
}

// ---------- Сервер ----------
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const ip = clientIp(req);

  const origin = req.headers.origin;
  if (origin && CFG.corsOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  }
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    return res.end();
  }

  try {
    if (url.pathname === '/api/config' && req.method === 'GET') {
      return sendJson(res, 200, {
        mock: CFG.mock,
        imagesPerJob: CFG.imagesPerJob,
        dailyLimit: CFG.dailyLimitPerIp,
        remaining: remainingFor(ip),
        captchaClientKey: CFG.captchaClientKey || null,
      });
    }
    if (url.pathname === '/api/jobs' && req.method === 'POST') return await handleCreateJob(req, res, ip);
    const jobMatch = url.pathname.match(/^\/api\/jobs\/([0-9a-f-]{36})$/);
    if (jobMatch && req.method === 'GET') {
      const job = jobs.get(jobMatch[1]);
      if (!job) return sendJson(res, 404, { error: 'Задача не найдена. Запустите генерацию заново.' });
      return sendJson(res, 200, publicJob(job));
    }
    if (url.pathname === '/api/leads' && req.method === 'POST') return await handleLead(req, res, ip);
    if (url.pathname.startsWith('/api/')) return sendJson(res, 404, { error: 'Неизвестный адрес API.' });

    if (req.method !== 'GET' && req.method !== 'HEAD') return sendJson(res, 405, { error: 'Метод не поддерживается.' });
    if (url.pathname.startsWith('/generated/')) {
      return serveFile(res, GENERATED_DIR, url.pathname.slice('/generated'.length), 'public, max-age=604800, immutable');
    }
    return serveFile(res, PUBLIC_DIR, url.pathname, 'public, max-age=300');
  } catch (e) {
    console.error(e);
    if (!res.headersSent) sendJson(res, 500, { error: 'Внутренняя ошибка сервера.' });
  }
});

// ---------- Уборка: старые задачи из памяти и старые картинки с диска ----------
setInterval(() => {
  const dayAgo = Date.now() - 24 * 3600 * 1000;
  for (const [id, job] of jobs) if (job.createdAt < dayAgo) jobs.delete(id);
  const cutoff = Date.now() - CFG.keepDays * 24 * 3600 * 1000;
  for (const name of fs.readdirSync(GENERATED_DIR)) {
    const dir = path.join(GENERATED_DIR, name);
    try {
      if (fs.statSync(dir).isDirectory() && fs.statSync(dir).mtimeMs < cutoff) fs.rmSync(dir, { recursive: true, force: true });
    } catch {}
  }
}, 3600 * 1000).unref();

server.listen(CFG.port, CFG.host, () => {
  console.log(`Сервер запущен: http://${CFG.host === '0.0.0.0' ? 'localhost' : CFG.host}:${CFG.port}`);
  if (CFG.mock) {
    console.log('Тестовый режим: вместо генерации показываются примеры фото, API не вызывается.');
  } else {
    console.log(`Генерация: ${CFG.model}, качество ${CFG.quality}, через ${CFG.baseURL}`);
    console.log(`Проверка «только ванные»: ${CFG.guard ? CFG.guardModel : 'выключена'}; проверка результата: ${CFG.verifyOutput ? 'да' : 'нет'}`);
  }
  console.log(`Водяной знак на сервере: ${IMAGEMAGICK ? 'да (ImageMagick)' : 'нет — только на сайте поверх картинки'}`);
});
