// Проверяет, что варианты на сайте (public/js/options.js) и в промпте (lib/prompt.js) совпадают.
const OPTIONS = require('../public/js/options');
const { TEXT } = require('../lib/prompt');
let ok = true;
for (const [key, group] of Object.entries(OPTIONS.groups)) {
  if (group.prompt === false) continue;
  const site = group.items.map((x) => x.id).sort().join(',');
  const prompt = Object.keys(TEXT[key] || {}).sort().join(',');
  if (site !== prompt) {
    ok = false;
    console.error(`Не совпадает «${group.title}»: на сайте [${site}], в промпте [${prompt}]`);
  }
}
for (const step of OPTIONS.steps) for (const g of step.groups || []) if (!OPTIONS.groups[g]) { ok = false; console.error(`Шаг «${step.title}» ссылается на несуществующую группу ${g}`); }
console.log(ok ? 'Всё совпадает.' : 'Исправьте расхождения.');
process.exit(ok ? 0 : 1);
