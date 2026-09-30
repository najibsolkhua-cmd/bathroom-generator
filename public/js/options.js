/*
 * Параметры конфигуратора: что видит клиент.
 * Один и тот же файл читают и сайт (в браузере), и сервер (Node.js),
 * поэтому id здесь и в lib/prompt.js должны совпадать.
 * Хотите убрать вариант, который бригада не делает, — удалите его здесь
 * и в lib/prompt.js.
 */
(function (root, factory) {
  const options = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = options;
  else root.BATH_OPTIONS = options;
})(typeof self !== 'undefined' ? self : this, function () {
  return {
    size: {
      title: 'Размер помещения',
      hint: 'От площади зависит, что реально поместится.',
      type: 'single',
      default: 'medium',
      items: [
        { id: 'small', label: 'Совмещённый санузел', note: 'до 4 м²' },
        { id: 'medium', label: 'Ванная комната', note: '4–6 м²' },
        { id: 'large', label: 'Просторная ванная', note: 'от 6 м²' },
      ],
    },
    style: {
      title: 'Стиль',
      type: 'single',
      default: 'minimal',
      items: [
        { id: 'minimal', label: 'Минимализм', pattern: 'large' },
        { id: 'scandi', label: 'Сканди', pattern: 'metro' },
        { id: 'loft', label: 'Лофт', pattern: 'brick' },
        { id: 'classic', label: 'Классика', pattern: 'diamond' },
        { id: 'eco', label: 'Эко', pattern: 'slats' },
      ],
    },
    palette: {
      title: 'Цветовая гамма',
      type: 'single',
      default: 'light',
      items: [
        { id: 'light', label: 'Светлая', colors: ['#F4F4F1', '#DADCD8', '#B9BDB8'] },
        { id: 'beige', label: 'Бежевая', colors: ['#EFE4D4', '#D8C3A5', '#A88B67'] },
        { id: 'dark', label: 'Тёмная', colors: ['#3B3F42', '#2A2D30', '#6E7377'] },
        { id: 'contrast', label: 'Контраст', colors: ['#F2F2EF', '#1F2224', '#8A8F93'] },
        { id: 'green', label: 'Зелёная', colors: ['#DDE5DC', '#6F8B75', '#3F5A48'] },
      ],
    },
    fixture: {
      title: 'Где мыться',
      type: 'single',
      default: 'bath',
      items: [
        { id: 'bath', label: 'Ванна', note: 'встроенная, с экраном' },
        { id: 'enclosure', label: 'Душевой уголок', note: 'с поддоном и дверями' },
        { id: 'walkin', label: 'Душ без поддона', note: 'трап в полу, стекло' },
      ],
    },
    extras: {
      title: 'Что ещё нужно',
      hint: 'Можно выбрать несколько.',
      type: 'multi',
      default: ['vanity', 'towel'],
      items: [
        { id: 'vanity', label: 'Тумба с раковиной' },
        { id: 'installation', label: 'Подвесной унитаз (инсталляция)' },
        { id: 'towel', label: 'Полотенцесушитель' },
        { id: 'washer', label: 'Место для стиральной машины' },
        { id: 'ledmirror', label: 'Зеркало с подсветкой' },
        { id: 'niche', label: 'Ниша в душевой зоне' },
      ],
    },
    budget: {
      title: 'Уровень отделки',
      type: 'single',
      default: 'comfort',
      items: [
        { id: 'economy', label: 'Эконом', note: 'керамика, акриловая ванна, хром' },
        { id: 'comfort', label: 'Комфорт', note: 'керамогранит, инсталляция, подсветка' },
        { id: 'premium', label: 'Премиум', note: 'крупный формат, скрытый монтаж' },
      ],
    },
  };
});
