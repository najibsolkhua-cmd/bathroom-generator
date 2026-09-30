/*
 * Правила для свободного запроса клиента. Первая линия защиты «только ванные».
 * Работает и в браузере (подсказывает клиенту сразу), и на сервере (проверяет всегда).
 * Вторая линия — проверка нейросетью на сервере (lib/guard.js).
 */
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.BathGuard = api;
})(typeof self !== 'undefined' ? self : this, function () {
  const MAX = 300;

  // Что точно не про ремонт ванной. \b в JavaScript не работает с кириллицей,
  // поэтому границы слова заданы явно: B — начало слова, E — конец.
  const B = '(?<![а-яёa-z])';
  const E = '(?![а-яёa-z])';
  const rule = (parts, why) => ({ re: new RegExp('(' + parts.join('|') + ')', 'iu'), why });
  const RULES = [
    rule([`${B}человек`, `${B}люд(и|ей|ям|ьми)${E}`, `${B}девушк`, `${B}женщин`, `${B}мужчин`, `${B}ребён`, `${B}ребен`, `${B}дет(и|ей|ям|ьми)${E}`, `${B}малыш`, `${B}портрет`, `${B}лиц(о|а)${E}`, `${B}селфи`, `${B}(people|person|woman|man|girl|boy|child|kid)s?${E}`], 'людей'),
    rule([`${B}кошк`, `${B}котик`, `${B}кот(а|ы|у|ом)?${E}`, `${B}собак`, `${B}щен`, `${B}животн`, `${B}птиц`, `${B}попуга`, `${B}(cat|dog|animal|pet|bird)s?${E}`], 'животных'),
    rule([`${B}гол(ый|ая|ые|ых)${E}`, `${B}обнаж`, `${B}эрот`, `${B}секс`, `${B}купальник`, `${B}(nude|naked|sex|sexy|erotic|nsfw)${E}`], 'откровенное'),
    rule([`${B}оружи`, `${B}пистолет`, `${B}винтовк`, `${B}нож(и|ом|ей)?${E}`, `${B}кров(ь|и)${E}`, `${B}труп`, `${B}насили`, `${B}взрыв`, `${B}(weapon|gun|blood)s?${E}`], 'опасное'),
    rule([`${B}надпис`, `${B}текст(ом|а|ы)?${E}`, `${B}логотип`, `${B}слоган`, `${B}вывеск`, `${B}реклам`, `водян[а-яё]* знак`, `${B}(logo|slogan|text|watermark|caption)s?${E}`], 'надписи и логотипы'),
    rule([`${B}кухн`, `${B}спальн`, `${B}гостин(ая|ой|ую)${E}`, `${B}детск[а-яё]* комнат`, `${B}прихож`, `${B}коридор`, `${B}балкон`, `${B}лоджи`, `${B}кабинет`, `${B}офис`, `${B}улиц`, `${B}двор`, `${B}пляж`, `${B}бассейн`, `${B}саун`, `${B}бан(я|и|ю)${E}`, `${B}автомобил`, `${B}машин(а|ы|у|ой)${E}`, `${B}(kitchen|bedroom|living room|office|street|garden|car|pool)s?${E}`], 'другие помещения'),
    rule([`${B}игнорир`, `${B}забудь`, `${B}инструкци`, `${B}промпт`, `представь,? что ты`, `${B}ты теперь`, `${B}(prompt|ignore|system|instruction|roleplay)s?${E}`], 'команды для нейросети'),
    rule([`${B}аниме`, `${B}мульт(ик|фильм|яшн)`, `${B}комикс`, `${B}фэнтези`, `${B}космос`, `${B}инопланет`, `${B}дракон`, `${B}единорог`, `${B}(anime|cartoon|fantasy|alien|dragon)s?${E}`], 'фантастику и мультяшный стиль'),
  ];

  // Что разрешено, даже если похоже на запрещённое.
  const ALLOW = [/стиральн\S*\s+(и\s+сушильн\S*\s+)?машин\S*/gi, /сушильн\S*\s+машин\S*/gi, /машинк\S*/gi];

  function clean(text) {
    return String(text || '')
      .replace(/https?:\/\/\S+|www\.\S+/gi, ' ')
      .replace(/\S+@\S+\.\S+/g, ' ')
      .replace(/\+?\d[\d\s()-]{7,}\d/g, ' ')
      .replace(/[<>{}\[\]`$\\]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, MAX);
  }

  /**
   * @returns {{ ok: boolean, text: string, problem?: string }}
   */
  function checkWishes(raw) {
    const text = clean(raw);
    if (!text) return { ok: true, text: '' };
    let probe = text;
    ALLOW.forEach((re) => (probe = probe.replace(re, ' ')));
    for (const rule of RULES) {
      const m = probe.match(rule.re);
      if (m) {
        return {
          ok: false,
          text,
          problem: `Генератор рисует только ванные комнаты, поэтому не может добавить ${rule.why} («${m[0].trim()}»). Опишите отделку, сантехнику, мебель или свет.`,
        };
      }
    }
    return { ok: true, text };
  }

  return { checkWishes, clean, MAX };
});
