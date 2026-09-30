/*
 * Сервер генератора «Ванная мечты». Нужен только Node.js 20+ — без npm install.
 *
 * Что делает:
 * - раздаёт сайт из папки public/;
 * - принимает параметры (и необязательное фото), ставит задачу на генерацию;
 * - генерирует варианты через gpt-image-2 (через российский посредник API);
 * - сохраняет картинки у себя в папке generated/;
 * - ограничивает число генераций, принимает заявки и шлёт их в Telegram.
 *
 * Без ключа API (или с MOCK=1) сервер работает в тестовом режиме:
 * вместо картинок рисует эскизы, деньги не тратятся.
 */
const fs = require('fs');
const path = require('path');
const http = require('http');
const crypto = require('crypto');

const ROOT = __dirname;
loadEnvFile(path.join(ROOT, '.env'));

const { sanitizeParams, buildPrompt, buildEditPrompt, variantLabel } = require('./lib/prompt');
const OPTIONS = require('./public/js/options');
const sketch = require('./public/js/sketch');

// ---------- Настройки (берутся из файла .env) ----------
const env = process.env;
const CFG = {
  port: Number(env.PORT) || 3000,
  host: env.HOST || '127.0.0.1',
  apiKey: env.OPENAI_API_KEY || '',
  baseURL: (env.OPENAI_BASE_URL || 'https://api.proxyapi.ru/openai/v1').replace(/\/$/, ''),
  model: env.IMAGE_MODEL || 'gpt-image-2',
  size: env.IMAGE_SIZE || '1536x1024',
  quality: env.IMAGE_QUALITY || 'medium',
  outputFormat: env.IMAGE_FORMAT || 'jpeg',
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
  const body = JSON.stringify(data);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(body);
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
      signal: AbortSignal.timeout(6 * 60 * 1000),
    });
    const text = await res.text();
    let data = null;
    try {
      data = JSON.parse(text);
    } catch {}
    if (res.ok && data) return data;
    const message = (data && data.error && data.error.message) || text.slice(0, 300);
    const retry = res.status === 429 || res.status >= 500;
    if (retry && attempt === 1) {
      await sleep(4000);
      continue;
    }
    throw Object.assign(new Error(message), { status: res.status });
  }
}

// ---------- Задачи ----------
const jobs = new Map();

function publicJob(job) {
  return {
    id: job.id,
    status: job.status,
    mock: job.mock,
    withPhoto: job.withPhoto,
    error: job.error || null,
    images: job.images.map((im) => ({ index: im.index, label: im.label, status: im.status, url: im.url || null })),
  };
}

async function generateOne(job, i, photo) {
  const dir = path.join(GENERATED_DIR, job.id);
  fs.mkdirSync(dir, { recursive: true });

  if (job.mock) {
    await sleep(2500 + Math.random() * 4000);
    const file = `${i + 1}.svg`;
    fs.writeFileSync(path.join(dir, file), sketch.render(job.params, i));
    return `/generated/${job.id}/${file}`;
  }

  const prompt = photo ? buildEditPrompt(job.params, i) : buildPrompt(job.params, i);
  const fields = {
    model: CFG.model,
    prompt,
    size: CFG.size,
    quality: CFG.quality,
    n: 1,
    output_format: CFG.outputFormat,
  };
  if (CFG.outputFormat !== 'png') fields.output_compression = 85;

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

  const ext = CFG.outputFormat === 'jpeg' ? 'jpg' : CFG.outputFormat;
  const file = `${i + 1}.${ext}`;
  fs.writeFileSync(path.join(dir, file), buffer);
  return `/generated/${job.id}/${file}`;
}

async function runJob(job, photo) {
  await Promise.all(
    job.images.map(async (im) => {
      try {
        im.url = await generateOne(job, im.index, photo);
        im.status = 'done';
      } catch (err) {
        im.status = 'error';
        console.error(`[${job.id}] вариант ${im.index + 1}: ${err.status || ''} ${err.message}`);
      }
    }),
  );
  const ok = job.images.filter((im) => im.status === 'done').length;
  job.status = ok > 0 ? 'done' : 'error';
  if (!ok) job.error = 'Не получилось сгенерировать картинки. Попробуйте ещё раз через минуту.';
  console.log(`[${job.id}] готово: ${ok} из ${job.images.length}`);
}

function decodePhoto(dataUrl) {
  if (!dataUrl) return null;
  const m = String(dataUrl).match(/^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/);
  if (!m) throw Object.assign(new Error('Загрузите фото в формате JPG, PNG или WebP.'), { code: 'BAD_PHOTO' });
  const buffer = Buffer.from(m[2], 'base64');
  if (buffer.length > 8 * 1024 * 1024) throw Object.assign(new Error('Фото слишком большое. Максимум 8 МБ.'), { code: 'BAD_PHOTO' });
  return { buffer, mime: `image/${m[1]}`, ext: m[1] === 'jpeg' ? 'jpg' : m[1] };
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

function labelOf(group, id) {
  const it = OPTIONS[group].items.find((x) => x.id === id);
  return it ? it.label : id;
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
  if (!(await captchaOk(body.captcha, ip))) return sendJson(res, 400, { error: 'Подтвердите, что вы не робот.' });
  if (remainingFor(ip) <= 0) {
    return sendJson(res, 429, {
      error: `На сегодня лимит исчерпан: ${CFG.dailyLimitPerIp} генерации в сутки. Приходите завтра или оставьте заявку.`,
    });
  }
  if (usage.total >= CFG.globalDailyLimit) {
    return sendJson(res, 429, { error: 'Сегодня генератор перегружен. Оставьте заявку, и мы пришлём варианты сами.' });
  }

  let photo;
  try {
    photo = decodePhoto(body.photo);
  } catch (e) {
    return sendJson(res, 400, { error: e.message });
  }
  const params = sanitizeParams(body.params);

  usage.perIp.set(ip, (usage.perIp.get(ip) || 0) + 1);
  usage.total++;

  const job = {
    id: crypto.randomUUID(),
    createdAt: Date.now(),
    params,
    mock: CFG.mock,
    withPhoto: Boolean(photo),
    status: 'running',
    images: Array.from({ length: CFG.imagesPerJob }, (_, i) => ({ index: i, label: variantLabel(i, Boolean(photo)), status: 'pending' })),
  };
  jobs.set(job.id, job);
  console.log(`[${job.id}] новая задача${photo ? ' (с фото)' : ''}: ${JSON.stringify(params)}`);
  runJob(job, photo).catch((e) => {
    job.status = 'error';
    job.error = 'Внутренняя ошибка сервера.';
    console.error(e);
  });
  sendJson(res, 202, { ...publicJob(job), remaining: remainingFor(ip) });
}

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

  const { name = '', phone = '', consent, jobId, imageIndex } = body;
  const cleanName = String(name).trim().slice(0, 80);
  const digits = String(phone).replace(/\D/g, '');
  if (!cleanName) return sendJson(res, 400, { error: 'Укажите имя.' });
  if (digits.length < 10 || digits.length > 15) return sendJson(res, 400, { error: 'Проверьте номер телефона.' });
  if (consent !== true) return sendJson(res, 400, { error: 'Нужно согласие на обработку данных.' });

  const job = jobId ? jobs.get(String(jobId)) : null;
  const image = job && Number.isInteger(imageIndex) ? job.images[imageIndex] : null;
  const imageUrl = image && image.url ? `${CFG.publicUrl}${image.url}` : null;

  const lead = {
    at: new Date().toISOString(),
    name: cleanName,
    phone: String(phone).trim().slice(0, 30),
    params: job ? job.params : null,
    withPhoto: job ? job.withPhoto : false,
    image: imageUrl,
  };
  fs.appendFileSync(path.join(DATA_DIR, 'leads.jsonl'), JSON.stringify(lead) + '\n');
  usage.leadsPerIp.set(ip, count + 1);

  const p = lead.params;
  const lines = ['🛁 Новая заявка с генератора ванной', `Имя: ${lead.name}`, `Телефон: ${lead.phone}`];
  if (p) {
    lines.push(
      `Помещение: ${labelOf('size', p.size)}`,
      `Стиль: ${labelOf('style', p.style)}, гамма: ${labelOf('palette', p.palette)}`,
      `Где мыться: ${labelOf('fixture', p.fixture)}`,
      `Отделка: ${labelOf('budget', p.budget)}`,
      `Ещё: ${p.extras.map((id) => labelOf('extras', id)).join(', ') || '—'}`,
      lead.withPhoto ? 'Клиент загрузил фото своей ванной' : 'Без фото помещения',
    );
  }
  if (imageUrl) lines.push(`Выбранный вариант: ${imageUrl}`);
  notifyTelegram(lines.join('\n'), imageUrl);

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
      if (fs.statSync(dir).mtimeMs < cutoff) fs.rmSync(dir, { recursive: true, force: true });
    } catch {}
  }
}, 3600 * 1000).unref();

server.listen(CFG.port, CFG.host, () => {
  console.log(`Сервер запущен: http://${CFG.host === '0.0.0.0' ? 'localhost' : CFG.host}:${CFG.port}`);
  console.log(
    CFG.mock
      ? 'Тестовый режим: вместо генерации рисуются эскизы, API не вызывается.'
      : `Генерация: ${CFG.model}, ${CFG.size}, качество ${CFG.quality}, через ${CFG.baseURL}`,
  );
});
