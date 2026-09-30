// Проверяет, что варианты на сайте (public/js/options.js) и в промпте (lib/prompt.js) совпадают.
const OPTIONS = require('../public/js/options');
const { TEXT } = require('../lib/prompt');
let ok = true;
for (const group of Object.keys(OPTIONS)) {
  const site = OPTIONS[group].items.map((x) => x.id).sort().join(',');
  const prompt = Object.keys(TEXT[group] || {}).sort().join(',');
  if (site !== prompt) {
    ok = false;
    console.error(`Не совпадает «${OPTIONS[group].title}»: на сайте [${site}], в промпте [${prompt}]`);
  }
}
console.log(ok ? 'Всё совпадает.' : 'Исправьте расхождения.');
process.exit(ok ? 0 : 1);
