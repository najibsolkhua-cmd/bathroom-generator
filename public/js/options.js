/*
 * Шаги и варианты конструктора: что видит клиент.
 * Файл читают и сайт (в браузере), и сервер (Node.js).
 * id вариантов должны совпадать с TEXT в lib/prompt.js — проверка: node scripts/check-options.js
 * Группы с prompt: false в нейросеть не уходят (например, работы для сметы).
 * minSize — вариант доступен только начиная с этой площади.
 */
(function (root, factory) {
  const data = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = data;
  else root.BATH_OPTIONS = data;
})(typeof self !== 'undefined' ? self : this, function () {
  const SIZE_ORDER = ['xs', 's', 'm', 'l'];

  const groups = {
    roomType: {
      title: 'Что ремонтируем',
      summary: 'Помещение',
      type: 'single',
      default: 'combined',
      items: [
        { id: 'bath', label: 'Ванная комната', note: 'отдельно от туалета' },
        { id: 'combined', label: 'Совмещённый санузел', note: 'ванная и туалет вместе' },
        { id: 'wc', label: 'Туалет', note: 'отдельный санузел' },
      ],
    },
    size: {
      title: 'Площадь',
      hint: 'Примерно. От площади зависит, что поместится.',
      type: 'single',
      default: 's',
      items: [
        { id: 'xs', label: 'до 3 м²' },
        { id: 's', label: '3–5 м²' },
        { id: 'm', label: '5–8 м²' },
        { id: 'l', label: 'больше 8 м²' },
      ],
    },
    style: {
      title: 'Стиль',
      type: 'single',
      default: 'minimal',
      view: 'photo',
      items: [
        { id: 'minimal', label: 'Минимализм', note: 'чистые линии, ничего лишнего', img: 'img/photos/minimal-1' },
        { id: 'scandi', label: 'Сканди', note: 'белая плитка и светлое дерево', img: 'img/photos/scandi-1' },
        { id: 'japandi', label: 'Джапанди', note: 'дерево и камень, как в спа', img: 'img/photos/japandi-1' },
        { id: 'loft', label: 'Лофт', note: 'бетон, кирпич, чёрный металл', img: 'img/photos/loft-1' },
        { id: 'neoclassic', label: 'Неоклассика', note: 'мрамор, латунь, глубокие цвета', img: 'img/photos/neoclassic-1' },
        { id: 'hotel', label: 'Как в отеле', note: 'крупный камень и подсветка', img: 'img/photos/hotel-1' },
      ],
    },
    palette: {
      title: 'Цветовая гамма',
      summary: 'Цвет',
      type: 'single',
      default: 'light',
      view: 'swatch',
      items: [
        { id: 'light', label: 'Светлая', colors: ['#F4F4F1', '#DEE0DC', '#BFC3BE'] },
        { id: 'warm', label: 'Тёплая бежевая', colors: ['#F0E6D8', '#D9C3A5', '#A9885F'] },
        { id: 'greige', label: 'Серо-бежевая', colors: ['#E4E0D9', '#BDB6AB', '#8C857B'] },
        { id: 'dark', label: 'Тёмная', colors: ['#4A4E52', '#2E3134', '#8A8F93'] },
        { id: 'contrast', label: 'Чёрно-белая', colors: ['#F4F4F1', '#1F2224', '#8A8F93'] },
        { id: 'green', label: 'Зелёная', colors: ['#DFE6DC', '#7C9582', '#41594A'] },
      ],
    },
    walls: {
      title: 'Отделка стен',
      summary: 'Стены',
      type: 'single',
      default: 'auto',
      items: [
        { id: 'auto', label: 'Под стиль', note: 'подберём сами' },
        { id: 'large', label: 'Крупный керамогранит', note: '60×120, минимум швов' },
        { id: 'marble', label: 'Под мрамор' },
        { id: 'stone', label: 'Под бетон или камень' },
        { id: 'wood', label: 'Одна стена под дерево' },
        { id: 'metro', label: 'Плитка «кабанчик»' },
        { id: 'paint', label: 'Плитка и краска', note: 'влагостойкая краска выше' },
      ],
    },
    metal: {
      title: 'Цвет смесителей и фурнитуры',
      summary: 'Металл',
      type: 'single',
      default: 'auto',
      view: 'metal',
      items: [
        { id: 'auto', label: 'Под стиль', color: 'linear-gradient(135deg,#D8DCDF 0 50%,#1F2224 50%)' },
        { id: 'chrome', label: 'Хром', color: 'linear-gradient(135deg,#F2F4F5,#AEB5BA 55%,#E6E9EB)' },
        { id: 'black', label: 'Чёрный матовый', color: '#232527' },
        { id: 'brass', label: 'Латунь', color: 'linear-gradient(135deg,#E3C58E,#B48A4A 60%,#D7B679)' },
        { id: 'gunmetal', label: 'Графит', color: 'linear-gradient(135deg,#6C7176,#43474B)' },
      ],
    },
    bathing: {
      title: 'Где мыться',
      type: 'single',
      default: 'bathshower',
      items: [
        { id: 'bath', label: 'Ванна', note: 'встроенная, с экраном' },
        { id: 'bathshower', label: 'Ванна и душ', note: 'со стеклянной шторкой' },
        { id: 'walkin', label: 'Душ без поддона', note: 'трап в полу и стекло' },
        { id: 'tray', label: 'Душевой поддон', note: 'низкий поддон и двери' },
        { id: 'freestanding', label: 'Отдельностоящая ванна', note: 'для площади от 5 м²', minSize: 'm' },
        { id: 'none', label: 'Без ванны и душа', note: 'для туалета' },
      ],
    },
    extras: {
      title: 'Что должно быть',
      summary: 'Нужно',
      hint: 'Выберите всё нужное.',
      type: 'multi',
      default: ['installation', 'hygienic', 'vanity', 'towel', 'hatch'],
      items: [
        { id: 'installation', label: 'Подвесной унитаз' },
        { id: 'hygienic', label: 'Гигиенический душ' },
        { id: 'vanity', label: 'Подвесная тумба с раковиной' },
        { id: 'countertop', label: 'Раковина на столешнице' },
        { id: 'ledmirror', label: 'Зеркало с подсветкой' },
        { id: 'mirrorcab', label: 'Зеркальный шкаф' },
        { id: 'towel', label: 'Полотенцесушитель' },
        { id: 'washer', label: 'Стиральная машина под столешницей' },
        { id: 'washtower', label: 'Стиральная и сушильная в шкафу', minSize: 'm' },
        { id: 'niche', label: 'Ниша в душе с подсветкой' },
        { id: 'hatch', label: 'Скрытый люк для счётчиков' },
        { id: 'storage', label: 'Шкаф-пенал для хранения' },
        { id: 'bench', label: 'Скамья в душе', minSize: 's' },
      ],
    },
    light: {
      title: 'Свет',
      type: 'multi',
      default: ['spots', 'mirrorlight'],
      items: [
        { id: 'spots', label: 'Точечные светильники' },
        { id: 'linear', label: 'Световая линия на потолке' },
        { id: 'mirrorlight', label: 'Подсветка зеркала и ниш' },
        { id: 'sconces', label: 'Бра у зеркала' },
      ],
    },
    budget: {
      title: 'Уровень отделки',
      summary: 'Уровень',
      type: 'single',
      default: 'comfort',
      items: [
        { id: 'economy', label: 'Эконом', note: 'керамика, акрил, хром' },
        { id: 'comfort', label: 'Комфорт', note: 'керамогранит, инсталляция, подсветка' },
        { id: 'business', label: 'Бизнес', note: 'крупный формат, скрытые смесители' },
        { id: 'premium', label: 'Премиум', note: 'слэбы, камень, дизайнерская сантехника' },
      ],
    },
    works: {
      title: 'Что ещё нужно сделать',
      hint: 'На картинке не видно, но важно для сметы.',
      type: 'multi',
      prompt: false,
      default: [],
      items: [
        { id: 'demolition', label: 'Демонтаж старой отделки' },
        { id: 'pipes', label: 'Замена труб' },
        { id: 'meters', label: 'Перенос счётчиков' },
        { id: 'warmfloor', label: 'Тёплый пол' },
        { id: 'vent', label: 'Вентиляция' },
        { id: 'door', label: 'Новая дверь' },
      ],
    },
  };

  const steps = [
    { id: 'photo', title: 'Фото помещения', short: 'Фото' },
    { id: 'room', title: 'Помещение и стиль', short: 'Стиль', groups: ['roomType', 'size', 'style'] },
    { id: 'finish', title: 'Цвет и отделка', short: 'Отделка', groups: ['palette', 'walls', 'metal'] },
    { id: 'fixtures', title: 'Сантехника и свет', short: 'Сантехника', groups: ['bathing', 'extras', 'light'] },
    { id: 'wishes', title: 'Уровень и пожелания', short: 'Пожелания', groups: ['budget'], wishes: true },
  ];

  const wishHints = [
    'Больше закрытого хранения',
    'Тёплое дерево на одной стене',
    'Стекло душа без рамок',
    'Спрятать трубы в короб',
    'Нишу над инсталляцией',
    'Как в дорогом отеле',
  ];

  function sizeAllows(minSize, size) {
    if (!minSize) return true;
    return SIZE_ORDER.indexOf(size) >= SIZE_ORDER.indexOf(minSize);
  }

  return { groups, steps, wishHints, sizeAllows, WISHES_MAX: 300 };
});
