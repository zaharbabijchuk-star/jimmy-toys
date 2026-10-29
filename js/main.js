/* =====================================================================
   Jimmy-Toys — інтерактивність сайту (практична робота № 4)
   ---------------------------------------------------------------------
   Код поділено на модулі-об'єкти. Кожен модуль відповідає за одну
   частину інтерфейсу й має метод init(), який спершу перевіряє, чи
   потрібні елементи є на поточній сторінці. Тому один файл можна
   підключати до всіх сторінок без помилок у консолі.

   Utils      — допоміжні функції (пошук елементів, ціни, відмінки)
   Store      — збереження даних у localStorage
   Toast      — спливаючі сповіщення
   Modal      — модальне вікно (компонент № 1)
   Nav        — навігація: бургер-меню, активний пункт, плавна прокрутка,
                кнопка «нагору», тінь хедера
   Cart       — кошик: додавання товарів, лічильник, вікно кошика,
                оформлення замовлення
   Favorites  — обране: збереження «сердечок», лічильник
   Catalog    — каталог моделізму: фільтри, сортування, пошук
   Accordion  — FAQ-акордеон на сторінці підтримки (компонент № 2)
   Slider     — слайдер на сторінці колекціонерів (компонент № 3)
   Validator  — правила перевірки полів форм
   SupportForm, Newsletter — форми з валідацією
   AiChat     — чат Jimmy AI: відповіді на запити й зміна добірки
   Stubs      — посилання-заглушки href="#"
   ===================================================================== */

'use strict';

/* ---------------------------- Utils ---------------------------- */
const Utils = {
  $(selector, root = document) { return root.querySelector(selector); },
  $$(selector, root = document) { return Array.from(root.querySelectorAll(selector)); },

  /** «1 250 ₴» → 1250 */
  parsePrice(text) { return Number(String(text).replace(/\D/g, '')) || 0; },

  /** 1250 → «1 250 ₴» */
  formatPrice(value) { return value.toLocaleString('uk-UA') + ' ₴'; },

  /** Українські відмінки: plural(3, 'товар', 'товари', 'товарів') → 'товари' */
  plural(n, one, few, many) {
    const mod10 = n % 10, mod100 = n % 100;
    if (mod10 === 1 && mod100 !== 11) return one;
    if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
    return many;
  },

  /** Створює елемент: el('div', {class: 'x'}, 'текст') */
  el(tag, attrs = {}, ...children) {
    const node = document.createElement(tag);
    Object.entries(attrs).forEach(([key, value]) => {
      if (key === 'class') node.className = value;
      else if (key === 'text') node.textContent = value;
      else node.setAttribute(key, value);
    });
    children.forEach(child => node.append(child));
    return node;
  },

  /** Назва товару → ідентифікатор */
  slug(text) { return text.toLowerCase().trim().replace(/[^a-zа-яіїєґ0-9]+/gi, '-'); },

  debounce(fn, ms) {
    let timer;
    return (...args) => { clearTimeout(timer); timer = setTimeout(() => fn(...args), ms); };
  },

  /** Ім'я файлу сторінки: '/site/modeling.html' → 'modeling.html' */
  pageName(path = location.pathname) { return path.split('/').pop() || 'index.html'; },

  reducedMotion() { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; },

  /** Дані товару з картки .p-card (назва, ціна, фото) */
  productFromCard(card) {
    const title = Utils.$('h3', card)?.textContent.trim() || 'Товар';
    const price = Utils.parsePrice(Utils.$('.price', card)?.textContent);
    const imgEl = Utils.$('.ph-img', card);
    const img = imgEl ? imgEl.style.backgroundImage : '';
    return { id: Utils.slug(title), title, price, img };
  }
};

/* ---------------------------- Store ---------------------------- */
const Store = {
  get(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) { return fallback; }
  },
  set(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* сховище недоступне */ }
  }
};

/* ---------------------------- Toast ---------------------------- */
const Toast = {
  box: null,
  init() {
    this.box = Utils.el('div', { class: 'toasts', 'aria-live': 'polite', role: 'status' });
    document.body.append(this.box);
  },
  /** type: 'ok' | 'info' | 'error' */
  show(message, type = 'ok') {
    const item = Utils.el('div', { class: `toast toast-${type}`, text: message });
    this.box.append(item);
    while (this.box.children.length > 3) this.box.firstElementChild.remove();
    requestAnimationFrame(() => item.classList.add('show'));
    setTimeout(() => {
      item.classList.remove('show');
      setTimeout(() => item.remove(), 300);
    }, 3200);
  }
};

/* ------------------------ Modal (компонент 1) ------------------------ */
const Modal = {
  root: null, titleEl: null, bodyEl: null, lastFocus: null, onClose: null,

  init() {
    this.root = Utils.el('div', { class: 'modal', hidden: '' });
    this.root.innerHTML = `
      <div class="modal-backdrop" data-close></div>
      <div class="modal-dialog" role="dialog" aria-modal="true" aria-labelledby="modal-title">
        <div class="modal-head">
          <h2 id="modal-title"></h2>
          <button type="button" class="modal-close" data-close aria-label="Закрити вікно">✕</button>
        </div>
        <div class="modal-body"></div>
      </div>`;
    document.body.append(this.root);
    this.titleEl = Utils.$('#modal-title', this.root);
    this.bodyEl = Utils.$('.modal-body', this.root);

    this.root.addEventListener('click', e => { if (e.target.closest('[data-close]')) this.close(); });
    document.addEventListener('keydown', e => {
      if (this.root.hidden) return;
      if (e.key === 'Escape') this.close();
      if (e.key === 'Tab') this.trapFocus(e);
    });
  },

  get isOpen() { return !this.root.hidden; },

  /** content — DOM-вузол; onClose — що зробити після закриття */
  open(title, content, onClose = null) {
    this.lastFocus = document.activeElement;
    this.onClose = onClose;
    this.setContent(title, content);
    this.root.hidden = false;
    document.body.classList.add('no-scroll');
    requestAnimationFrame(() => this.root.classList.add('is-open'));
    Utils.$('.modal-close', this.root).focus();
  },

  setContent(title, content) {
    this.titleEl.textContent = title;
    this.bodyEl.replaceChildren(content);
  },

  close() {
    if (!this.isOpen) return;
    this.root.classList.remove('is-open');
    document.body.classList.remove('no-scroll');
    setTimeout(() => { this.root.hidden = true; }, Utils.reducedMotion() ? 0 : 200);
    if (this.lastFocus) this.lastFocus.focus();
    if (this.onClose) this.onClose();
  },

  /** Фокус не виходить за межі відкритого вікна */
  trapFocus(e) {
    const items = Utils.$$('button, a[href], input, select, textarea', this.root)
      .filter(n => !n.disabled && n.offsetParent !== null);
    if (!items.length) return;
    const first = items[0], last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }
};

/* ------------------------------ Nav ------------------------------ */
const Nav = {
  header: null,

  init() {
    this.header = Utils.$('.header');
    if (!this.header) return;
    this.setupBurger();
    this.markActive();
    this.setupSmoothScroll();
    this.setupScrollEffects();
  },

  /** Бургер-меню: керування з клавіатури, aria-expanded, закриття */
  setupBurger() {
    const toggle = Utils.$('#menu');
    const burger = Utils.$('.burger', this.header);
    const nav = Utils.$('.nav', this.header);
    if (!toggle || !burger || !nav) return;

    nav.id = 'site-nav';
    burger.setAttribute('role', 'button');
    burger.setAttribute('tabindex', '0');
    burger.setAttribute('aria-controls', 'site-nav');

    const sync = () => {
      burger.setAttribute('aria-expanded', String(toggle.checked));
      burger.setAttribute('aria-label', toggle.checked ? 'Закрити меню' : 'Відкрити меню');
      this.header.classList.toggle('nav-open', toggle.checked);
    };
    const setOpen = open => { toggle.checked = open; sync(); };

    toggle.addEventListener('change', sync);
    burger.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpen(!toggle.checked); }
    });
    // Закриваємо меню: Escape, клік поза хедером, клік по пункту, ширший екран
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && toggle.checked) setOpen(false); });
    document.addEventListener('click', e => { if (toggle.checked && !this.header.contains(e.target)) setOpen(false); });
    nav.addEventListener('click', e => { if (e.target.closest('a')) setOpen(false); });
    window.matchMedia('(min-width: 821px)').addEventListener('change', e => { if (e.matches) setOpen(false); });
    sync();
  },

  /** Підсвічуємо пункт меню поточної сторінки */
  markActive() {
    const current = Utils.pageName();
    Utils.$$('.nav a').forEach(link => {
      const url = new URL(link.getAttribute('href'), location.href);
      const isActive = Utils.pageName(url.pathname) === current && !url.hash;
      link.classList.toggle('active', isActive);
      if (isActive) link.setAttribute('aria-current', 'page');
    });
  },

  /** Плавна прокрутка до якорів з урахуванням липкого хедера */
  setupSmoothScroll() {
    document.addEventListener('click', e => {
      const link = e.target.closest('a[href*="#"]');
      if (!link || link.getAttribute('href') === '#') return;
      const url = new URL(link.href);
      if (Utils.pageName(url.pathname) !== Utils.pageName() || !url.hash) return;
      const target = document.getElementById(decodeURIComponent(url.hash.slice(1)));
      if (!target) return;
      e.preventDefault();
      this.scrollTo(target);
      history.pushState(null, '', url.hash);
    });
    // Якщо сторінку відкрили одразу з якорем (support.html#faq)
    if (location.hash) {
      const target = document.getElementById(decodeURIComponent(location.hash.slice(1)));
      if (target) setTimeout(() => this.scrollTo(target, false), 50);
    }
  },

  scrollTo(target, focusField = true) {
    const top = target.getBoundingClientRect().top + window.scrollY - this.header.offsetHeight - 12;
    window.scrollTo({ top, behavior: Utils.reducedMotion() ? 'auto' : 'smooth' });
    // Якщо в цільовому блоці є форма — ставимо курсор у перше поле
    const field = focusField && Utils.$('form input:not([type=file]), form textarea', target);
    if (field) setTimeout(() => field.focus({ preventScroll: true }), 500);
  },

  /** Тінь хедера при прокрутці та кнопка «Нагору» */
  setupScrollEffects() {
    const upBtn = Utils.el('button', { type: 'button', class: 'to-top', 'aria-label': 'Повернутися нагору', text: '↑' });
    document.body.append(upBtn);
    upBtn.addEventListener('click', () => window.scrollTo({ top: 0, behavior: Utils.reducedMotion() ? 'auto' : 'smooth' }));

    const onScroll = () => {
      this.header.classList.toggle('scrolled', window.scrollY > 10);
      upBtn.classList.toggle('show', window.scrollY > 600);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  }
};

/* ------------------------------ Cart ------------------------------ */
const Cart = {
  KEY: 'jt-cart',
  FREE_SHIPPING: 2000,
  items: [],
  badge: null,
  view: 'list', // 'list' | 'checkout'

  init() {
    this.items = Store.get(this.KEY, []);
    const icon = Utils.$('.header-actions a[aria-label="Кошик"]');
    if (icon) {
      this.badge = Utils.el('span', { class: 'badge', 'aria-hidden': 'true' });
      icon.append(this.badge);
      icon.addEventListener('click', e => { e.preventDefault(); this.openModal(); });
    }

    // Делегування подій: один обробник на всі кнопки «В кошик» на сторінці
    document.addEventListener('click', e => {
      const btn = e.target.closest('.p-card .cart-round, .p-card .p-foot .btn, .p-card .btn-block');
      if (!btn) return;
      e.preventDefault();
      const product = Utils.productFromCard(btn.closest('.p-card'));
      this.add(product);
      btn.classList.add('added');
      setTimeout(() => btn.classList.remove('added'), 600);
      Toast.show(`«${product.title}» додано в кошик`);
    });

    // Синхронізація між відкритими вкладками
    window.addEventListener('storage', e => {
      if (e.key === this.KEY) { this.items = Store.get(this.KEY, []); this.update(); }
    });
    this.update();
  },

  get count() { return this.items.reduce((sum, item) => sum + item.qty, 0); },
  get total() { return this.items.reduce((sum, item) => sum + item.price * item.qty, 0); },

  add(product) {
    const existing = this.items.find(item => item.id === product.id);
    if (existing) existing.qty += 1;
    else this.items.push({ ...product, qty: 1 });
    this.save();
  },

  changeQty(id, delta) {
    const item = this.items.find(i => i.id === id);
    if (!item) return;
    item.qty += delta;
    if (item.qty < 1) this.items = this.items.filter(i => i.id !== id);
    this.save();
  },

  remove(id) { this.items = this.items.filter(i => i.id !== id); this.save(); },
  clear() { this.items = []; this.save(); },

  save() { Store.set(this.KEY, this.items); this.update(); },

  /** Оновлює лічильник у хедері та вміст відкритого вікна кошика */
  update() {
    if (this.badge) {
      this.badge.textContent = this.count;
      this.badge.hidden = this.count === 0;
      this.badge.parentElement.setAttribute('aria-label', `Кошик: ${this.count} ${Utils.plural(this.count, 'товар', 'товари', 'товарів')}`);
    }
    if (Modal.isOpen && Modal.root.dataset.view === 'cart' && this.view === 'list') {
      Modal.setContent('Ваш кошик', this.renderList());
    }
  },

  openModal() {
    this.view = 'list';
    Modal.root.dataset.view = 'cart';
    Modal.open('Ваш кошик', this.renderList(), () => { Modal.root.dataset.view = ''; });
  },

  renderList() {
    const wrap = Utils.el('div', { class: 'cart' });
    if (!this.items.length) {
      wrap.innerHTML = `
        <div class="empty-state">
          <p class="empty-ico">🛒</p>
          <p><b>Кошик порожній</b></p>
          <p>Додайте модель із каталогу або попросіть Jimmy AI підібрати подарунок.</p>
          <div class="empty-actions">
            <a href="modeling.html" class="btn btn-blue btn-sm">До каталогу</a>
            <a href="ai.html" class="btn btn-white btn-sm">✨ Підібрати з Jimmy AI</a>
          </div>
        </div>`;
      return wrap;
    }

    const list = Utils.el('ul', { class: 'cart-list' });
    this.items.forEach(item => {
      const li = Utils.el('li', { class: 'cart-item' });
      li.innerHTML = `
        <span class="cart-thumb"></span>
        <div class="cart-info"><b></b><small></small></div>
        <div class="qty" role="group" aria-label="Кількість">
          <button type="button" data-act="minus" aria-label="Зменшити кількість">−</button>
          <output></output>
          <button type="button" data-act="plus" aria-label="Збільшити кількість">+</button>
        </div>
        <span class="cart-sum"></span>
        <button type="button" class="cart-remove" data-act="remove" aria-label="Видалити з кошика">✕</button>`;
      Utils.$('.cart-thumb', li).style.backgroundImage = item.img;
      Utils.$('.cart-info b', li).textContent = item.title;
      Utils.$('.cart-info small', li).textContent = Utils.formatPrice(item.price) + ' / шт.';
      Utils.$('output', li).textContent = item.qty;
      Utils.$('.cart-sum', li).textContent = Utils.formatPrice(item.price * item.qty);
      li.addEventListener('click', e => {
        const act = e.target.closest('[data-act]')?.dataset.act;
        if (act === 'plus') this.changeQty(item.id, 1);
        if (act === 'minus') this.changeQty(item.id, -1);
        if (act === 'remove') { this.remove(item.id); Toast.show(`«${item.title}» видалено з кошика`, 'info'); }
      });
      list.append(li);
    });

    const left = this.FREE_SHIPPING - this.total;
    const percent = Math.min(100, Math.round(this.total / this.FREE_SHIPPING * 100));
    const shipping = Utils.el('div', { class: 'ship' });
    shipping.innerHTML = `<p></p><div class="ship-bar"><span style="width:${percent}%"></span></div>`;
    Utils.$('p', shipping).textContent = left > 0
      ? `До безкоштовної доставки залишилось ${Utils.formatPrice(left)}`
      : 'Доставка безкоштовна 🎉';

    const foot = Utils.el('div', { class: 'cart-foot' });
    foot.innerHTML = `
      <div class="cart-total"><span>Разом</span><b></b></div>
      <div class="cart-btns">
        <button type="button" class="btn btn-white" data-close>Продовжити покупки</button>
        <button type="button" class="btn btn-blue" data-checkout>Оформити замовлення</button>
      </div>`;
    Utils.$('.cart-total b', foot).textContent = Utils.formatPrice(this.total);
    Utils.$('[data-checkout]', foot).addEventListener('click', () => this.showCheckout());

    wrap.append(list, shipping, foot);
    return wrap;
  },

  /** Крок оформлення: коротка форма з перевіркою полів */
  showCheckout() {
    this.view = 'checkout';
    const form = Utils.el('form', { class: 'checkout', novalidate: '' });
    form.innerHTML = `
      <p class="checkout-sum"></p>
      <div class="field"><label for="coName">Ім’я та прізвище</label><input id="coName" autocomplete="name" placeholder="Олена Коваль"></div>
      <div class="field"><label for="coPhone">Телефон</label><input id="coPhone" type="tel" autocomplete="tel" placeholder="+380 67 123 45 67"></div>
      <div class="cart-btns">
        <button type="button" class="btn btn-white" data-back>← До кошика</button>
        <button class="btn btn-blue">Підтвердити замовлення</button>
      </div>`;
    Utils.$('.checkout-sum', form).textContent =
      `${this.count} ${Utils.plural(this.count, 'товар', 'товари', 'товарів')} на суму ${Utils.formatPrice(this.total)}`;

    const fields = [
      { input: Utils.$('#coName', form), rules: ['required', 'name'] },
      { input: Utils.$('#coPhone', form), rules: ['required', 'phone'] }
    ];
    Validator.attachLive(fields);

    Utils.$('[data-back]', form).addEventListener('click', () => {
      this.view = 'list';
      Modal.setContent('Ваш кошик', this.renderList());
    });
    form.addEventListener('submit', e => {
      e.preventDefault();
      if (!Validator.validateAll(fields)) return;
      const orderNo = 'JT-' + Math.floor(1000 + Math.random() * 9000);
      const phone = fields[1].input.value.trim();
      this.clear();
      const done = Utils.el('div', { class: 'empty-state' });
      done.innerHTML = `<p class="empty-ico">✅</p><p><b></b></p><p></p>
        <div class="empty-actions"><button type="button" class="btn btn-blue btn-sm" data-close>Готово</button></div>`;
      Utils.$('b', done).textContent = `Замовлення ${orderNo} оформлено`;
      Utils.$$('p', done)[2].textContent = `Менеджер зателефонує на ${phone} протягом 15 хвилин, щоб підтвердити доставку.`;
      Modal.setContent('Дякуємо за замовлення!', done);
    });

    Modal.setContent('Оформлення замовлення', form);
    Utils.$('#coName', form).focus();
  }
};

/* ---------------------------- Favorites ---------------------------- */
const Favorites = {
  KEY: 'jt-favorites',
  items: [],
  badge: null,

  init() {
    this.items = Store.get(this.KEY, []);
    const icon = Utils.$('.header-actions a[aria-label="Обране"]');
    if (icon) {
      this.badge = Utils.el('span', { class: 'badge badge-red', 'aria-hidden': 'true' });
      icon.append(this.badge);
      icon.addEventListener('click', e => { e.preventDefault(); this.openModal(); });
    }

    // Відновлюємо стан «сердечок» після перезавантаження
    Utils.$$('.p-card .fav input').forEach(input => {
      const { id } = Utils.productFromCard(input.closest('.p-card'));
      input.checked = this.items.some(item => item.id === id);
    });

    document.addEventListener('change', e => {
      if (!e.target.matches('.p-card .fav input')) return;
      const product = Utils.productFromCard(e.target.closest('.p-card'));
      if (e.target.checked) {
        this.items.push(product);
        Toast.show(`«${product.title}» додано в обране ❤️`);
      } else {
        this.items = this.items.filter(item => item.id !== product.id);
        Toast.show(`«${product.title}» прибрано з обраного`, 'info');
      }
      this.save();
    });
    this.update();
  },

  save() { Store.set(this.KEY, this.items); this.update(); },

  update() {
    if (!this.badge) return;
    this.badge.textContent = this.items.length;
    this.badge.hidden = this.items.length === 0;
  },

  openModal() {
    const wrap = Utils.el('div', { class: 'cart' });
    if (!this.items.length) {
      wrap.innerHTML = `<div class="empty-state"><p class="empty-ico">🤍</p><p><b>В обраному поки порожньо</b></p>
        <p>Натисніть на сердечко на картці товару, щоб зберегти його тут.</p>
        <div class="empty-actions"><a href="modeling.html" class="btn btn-blue btn-sm">До каталогу</a></div></div>`;
    } else {
      const list = Utils.el('ul', { class: 'cart-list' });
      this.items.forEach(item => {
        const li = Utils.el('li', { class: 'cart-item fav-item' });
        li.innerHTML = `<span class="cart-thumb"></span><div class="cart-info"><b></b><small></small></div>
          <button type="button" class="btn btn-blue btn-sm">В кошик</button>`;
        Utils.$('.cart-thumb', li).style.backgroundImage = item.img;
        Utils.$('b', li).textContent = item.title;
        Utils.$('small', li).textContent = Utils.formatPrice(item.price);
        Utils.$('button', li).addEventListener('click', () => {
          Cart.add(item);
          Toast.show(`«${item.title}» додано в кошик`);
        });
        list.append(li);
      });
      wrap.append(list);
    }
    Modal.open('Обране', wrap);
  }
};

/* ---------------------------- Catalog ---------------------------- */
const Catalog = {
  root: null, grid: null, cards: [], found: null, empty: null, resetBtn: null, query: '',

  init() {
    this.root = Utils.$('.catalog');
    if (!this.root) return;
    this.grid = Utils.$('.products', this.root);
    this.filters = Utils.$('.filters', this.root);
    this.sortSelect = Utils.$('.list-bar select', this.root);
    this.found = Utils.$('.found', this.root);
    this.pager = Utils.$('.pager', this.root);

    // Збираємо дані карток із розмітки
    const catNames = {};
    Utils.$$('.cat-chips label', this.root).forEach(l => { catNames[l.htmlFor.replace('c-', '')] = l.textContent.toLowerCase(); });
    this.cards = Utils.$$('.p-card', this.grid).map((card, index) => {
      const meta = Utils.$('.meta', card).textContent;
      const cat = ['avia', 'armor', 'fleet', 'tools'].find(c => card.classList.contains(c));
      return {
        card, index, cat,
        price: Utils.parsePrice(Utils.$('.price', card).textContent),
        scale: (meta.match(/1:\d+/) || [''])[0],
        brand: (meta.match(/Бренд:\s*([\w-]+)/) || ['', ''])[1],
        level: (Utils.$('.stars', card)?.textContent.match(/★/g) || []).length,
        text: (Utils.$('h3', card).textContent + ' ' + meta + ' ' + (catNames[cat] || '')).toLowerCase()
      };
    });

    // Лічильник і порожній стан
    this.foundText = Utils.el('span', { class: 'n-js', 'aria-live': 'polite' });
    this.found.replaceChildren(this.foundText);
    this.empty = Utils.el('div', { class: 'empty-state catalog-empty', hidden: '' });
    this.empty.innerHTML = `<p class="empty-ico">🔍</p><p><b>За цими параметрами товарів немає</b></p>
      <p>Змініть фільтри або скиньте їх, щоб побачити весь каталог.</p>
      <div class="empty-actions"><button type="button" class="btn btn-blue btn-sm" data-reset>Скинути фільтри</button></div>`;
    this.grid.after(this.empty);
    this.resetBtn = Utils.el('button', { type: 'button', class: 'btn btn-white btn-sm filters-reset', 'data-reset': '', hidden: '', text: '✕ Скинути' });
    this.filters.append(this.resetBtn);
    this.searchNote = Utils.el('p', { class: 'search-note', hidden: '' });
    this.found.parentElement.before(this.searchNote);

    // Пошук: значення з адреси (?q=...) та з поля в хедері
    this.query = (new URLSearchParams(location.search).get('q') || '').trim();
    const searchForm = Utils.$('.header .search');
    const searchInput = searchForm && Utils.$('input', searchForm);
    if (searchInput) {
      searchInput.value = this.query;
      searchInput.addEventListener('input', Utils.debounce(() => { this.query = searchInput.value.trim(); this.apply(); }, 200));
      searchForm.addEventListener('submit', e => {
        e.preventDefault();
        this.query = searchInput.value.trim();
        this.apply();
        Nav.scrollTo(this.found.parentElement, false);
      });
    }

    // Події: категорії, фільтри, сортування, скидання
    this.root.addEventListener('change', e => {
      if (e.target.matches('input[name=cat], .filters select, .list-bar select')) this.apply();
    });
    this.filters.addEventListener('submit', e => e.preventDefault());
    this.root.addEventListener('click', e => { if (e.target.closest('[data-reset]')) this.reset(); });
    this.apply();
  },

  /** Поточні значення фільтрів */
  state() {
    const get = name => Utils.$(`select[name=${name}]`, this.filters).value;
    return {
      cat: (Utils.$('input[name=cat]:checked', this.root)?.id || 'c-all').replace('c-', ''),
      scale: get('scale'), brand: get('brand'), level: get('level'), price: get('price'),
      sort: this.sortSelect.value, query: this.query.toLowerCase()
    };
  },

  matches(item, s) {
    if (s.cat !== 'all' && item.cat !== s.cat) return false;
    if (s.scale && item.scale !== s.scale) return false;
    if (s.brand && item.brand !== s.brand) return false;
    if (s.level.includes('Легко') && item.level > 2) return false;
    if (s.level.includes('Середньо') && item.level !== 3) return false;
    if (s.level.includes('Складно') && item.level < 4) return false;
    if (s.price.startsWith('До') && item.price >= 1000) return false;
    if (s.price.startsWith('1 000') && (item.price < 1000 || item.price > 2000)) return false;
    if (s.price.startsWith('Від') && item.price < 2000) return false;
    if (s.query && !s.query.split(/\s+/).every(word => item.text.includes(word))) return false;
    return true;
  },

  /** Показує/ховає картки, сортує, оновлює лічильник */
  apply() {
    const s = this.state();
    const visible = this.cards.filter(item => {
      const ok = this.matches(item, s);
      item.card.hidden = !ok;
      return ok;
    });

    const sorted = [...this.cards].sort((a, b) => {
      if (s.sort === 'Спочатку дешевші') return a.price - b.price;
      if (s.sort === 'Спочатку дорожчі') return b.price - a.price;
      return a.index - b.index;
    });
    sorted.forEach(item => this.grid.append(item.card));

    const n = visible.length;
    this.foundText.textContent = `ЗНАЙДЕНО: ${n} ${Utils.plural(n, 'товар', 'товари', 'товарів')}`;
    this.empty.hidden = n > 0;

    const filtered = s.cat !== 'all' || s.scale || s.brand || s.level || s.price || s.query;
    this.resetBtn.hidden = !filtered;
    this.pager.hidden = Boolean(filtered);
    Utils.$$('select', this.filters).forEach(sel => sel.classList.toggle('is-set', Boolean(sel.value)));

    this.searchNote.hidden = !s.query;
    this.searchNote.textContent = s.query ? `Результати пошуку за запитом «${this.query}»` : '';
  },

  reset() {
    Utils.$$('select', this.filters).forEach(sel => { sel.value = ''; });
    Utils.$('#c-all', this.root).checked = true;
    this.query = '';
    const searchInput = Utils.$('.header .search input');
    if (searchInput) searchInput.value = '';
    history.replaceState(null, '', location.pathname);
    this.apply();
    Toast.show('Фільтри скинуто', 'info');
  }
};

/* ----------------------- Пошук на інших сторінках ----------------------- */
const Search = {
  init() {
    const form = Utils.$('.header .search');
    if (!form || Utils.$('.catalog')) return; // на сторінці каталогу пошук веде Catalog
    form.addEventListener('submit', e => {
      const input = Utils.$('input', form);
      if (!input.value.trim()) {
        e.preventDefault();
        form.classList.add('shake');
        setTimeout(() => form.classList.remove('shake'), 400);
        Toast.show('Введіть назву товару, наприклад «танк» або «Tamiya»', 'error');
        input.focus();
      }
    });
  }
};

/* --------------------- Accordion (компонент 2) --------------------- */
const Accordion = {
  init() {
    const items = Utils.$$('.quick details');
    if (!items.length) return;
    // Подія toggle не спливає, тому обробник додаємо кожному елементу
    items.forEach(item => item.addEventListener('toggle', () => {
      if (!item.open) return;
      items.forEach(other => { if (other !== item) other.open = false; });
    }));
  }
};

/* ----------------------- Slider (компонент 3) ----------------------- */
const Slider = {
  init() { Utils.$$('[data-slider]').forEach(root => this.create(root)); },

  create(root) {
    const track = Utils.$('.slider-track', root);
    const slides = Utils.$$('.slide', track);
    const card = root.closest('section') || document;
    const titleEl = Utils.$('[data-slider-title]', card);
    const textEl = Utils.$('[data-slider-text]', card);
    let current = 0, timer = null;

    // Кнопки «назад/вперед» і точки
    const prev = Utils.el('button', { type: 'button', class: 'slider-btn prev', 'aria-label': 'Попередній слайд', text: '‹' });
    const next = Utils.el('button', { type: 'button', class: 'slider-btn next', 'aria-label': 'Наступний слайд', text: '›' });
    const dots = Utils.el('div', { class: 'slider-dots' });
    slides.forEach((_, i) => {
      const dot = Utils.el('button', { type: 'button', 'aria-label': `Слайд ${i + 1} з ${slides.length}` });
      dot.addEventListener('click', () => { go(i); restart(); });
      dots.append(dot);
    });
    root.append(prev, next, dots);

    const go = index => {
      current = (index + slides.length) % slides.length;
      track.style.transform = `translateX(-${current * 100}%)`;
      slides.forEach((s, i) => s.setAttribute('aria-hidden', String(i !== current)));
      Utils.$$('button', dots).forEach((d, i) => d.setAttribute('aria-current', String(i === current)));
      // Динамічна зміна підпису під слайдером
      if (titleEl) titleEl.textContent = slides[current].dataset.title;
      if (textEl) textEl.textContent = slides[current].dataset.text;
    };
    const start = () => { if (!Utils.reducedMotion()) timer = setInterval(() => go(current + 1), 5000); };
    const stop = () => clearInterval(timer);
    const restart = () => { stop(); start(); };

    prev.addEventListener('click', () => { go(current - 1); restart(); });
    next.addEventListener('click', () => { go(current + 1); restart(); });
    root.addEventListener('mouseenter', stop);
    root.addEventListener('mouseleave', start);
    root.addEventListener('focusin', stop);
    root.addEventListener('focusout', start);
    root.tabIndex = 0;
    root.addEventListener('keydown', e => {
      if (e.key === 'ArrowLeft') { go(current - 1); restart(); }
      if (e.key === 'ArrowRight') { go(current + 1); restart(); }
    });

    // Свайп на телефоні
    let startX = null;
    root.addEventListener('touchstart', e => { startX = e.touches[0].clientX; stop(); }, { passive: true });
    root.addEventListener('touchend', e => {
      if (startX === null) return;
      const dx = e.changedTouches[0].clientX - startX;
      if (Math.abs(dx) > 40) go(current + (dx < 0 ? 1 : -1));
      startX = null; start();
    });

    root.classList.add('is-ready');
    go(0);
    start();
  }
};

/* ---------------------------- Validator ---------------------------- */
const Validator = {
  /** Кожне правило повертає текст помилки або '' */
  rules: {
    required: v => v.trim() ? '' : 'Це поле обов’язкове',
    name: v => {
      const value = v.trim();
      if (value.length < 2) return 'Ім’я має містити щонайменше 2 літери';
      if (!/^[A-Za-zА-Яа-яІіЇїЄєҐґ'’ -]+$/.test(value)) return 'Ім’я може містити лише літери, пробіл, апостроф і дефіс';
      return '';
    },
    phone: v => /^(\+?38)?0\d{9}$/.test(v.replace(/[\s()-]/g, ''))
      ? '' : 'Вкажіть номер у форматі +380 67 123 45 67',
    email: v => /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(v.trim())
      ? '' : 'Email має вигляд name@example.com',
    contact: v => v.includes('@') ? Validator.rules.email(v) : (
      /[a-zа-я]/i.test(v) ? 'Вкажіть телефон (+380…) або email (name@example.com)' : Validator.rules.phone(v)),
    orderNo: v => !v.trim() || /^JT-\d{4,6}$/i.test(v.trim())
      ? '' : 'Номер замовлення має вигляд JT-1234 (є в листі-підтвердженні)',
    message: v => v.trim().length >= 10
      ? '' : `Напишіть хоча б 10 символів (зараз ${v.trim().length})`,
    image: (v, input) => {
      const file = input.files && input.files[0];
      if (!file) return '';
      if (!file.type.startsWith('image/')) return 'Можна прикріпити лише зображення (JPG, PNG, WEBP)';
      if (file.size > 5 * 1024 * 1024) return 'Фото завелике: максимум 5 МБ';
      return '';
    }
  },

  /** Знаходить або створює елемент для тексту помилки */
  errorEl(input) {
    const box = input.closest('.field, .attach, .nl-wrap') || input.parentElement;
    let err = Utils.$('.err', box);
    if (!err) {
      err = Utils.el('span', { class: 'err' });
      box.append(err);
    }
    if (!err.id) err.id = (input.id || input.name || 'f') + '-err';
    return { box, err };
  },

  check(input, ruleNames) {
    let message = '';
    for (const name of ruleNames) {
      if (name !== 'required' && !input.value.trim() && input.type !== 'file') continue;
      message = this.rules[name](input.value, input);
      if (message) break;
    }
    const { box, err } = this.errorEl(input);
    box.classList.toggle('has-error', Boolean(message));
    input.setAttribute('aria-invalid', String(Boolean(message)));
    err.textContent = message;
    if (message) input.setAttribute('aria-describedby', err.id);
    return !message;
  },

  /** fields: [{input, rules}] → true, якщо все правильно */
  validateAll(fields) {
    const results = fields.map(f => this.check(f.input, typeof f.rules === 'function' ? f.rules() : f.rules));
    const firstBad = fields.find((f, i) => !results[i]);
    if (firstBad) firstBad.input.focus();
    return !firstBad;
  },

  /** Перевірка «наживо»: при виході з поля та при виправленні помилки */
  attachLive(fields) {
    fields.forEach(f => {
      const rules = () => (typeof f.rules === 'function' ? f.rules() : f.rules);
      f.input.addEventListener('blur', e => {
        // Якщо фокус іде на кнопку відправлення — перевірку зробить submit.
        // Інакше повідомлення зсуне кнопку і клік «промахнеться».
        if (e.relatedTarget && e.relatedTarget.type === 'submit') return;
        if (f.input.value) this.check(f.input, rules());
      });
      f.input.addEventListener(f.input.type === 'file' ? 'change' : 'input', () => {
        if (f.input.type === 'file' || f.input.closest('.has-error')) this.check(f.input, rules());
      });
    });
  }
};

/* --------------------------- SupportForm --------------------------- */
const SupportForm = {
  init() {
    const form = Utils.$('.write form');
    if (!form) return;
    form.noValidate = true; // вимикаємо стандартні підказки браузера — перевіряє JS

    const $ = id => Utils.$('#' + id, form);
    const topic = $('fTopic');
    const orderLabel = Utils.$('label[for=fOrder]', form);
    const needsOrder = () => ['Статус замовлення', 'Повернення / обмін'].includes(topic.value);

    const fields = [
      { input: $('fName'), rules: ['required', 'name'] },
      { input: $('fContact'), rules: ['required', 'contact'] },
      { input: $('fOrder'), rules: () => needsOrder() ? ['required', 'orderNo'] : ['orderNo'] },
      { input: $('fMsg'), rules: ['required', 'message'] },
      { input: $('fFile'), rules: ['image'] }
    ];
    Validator.attachLive(fields);

    // Динамічна зміна: номер замовлення обов'язковий лише для деяких тем
    const updateOrderLabel = () => {
      orderLabel.textContent = needsOrder() ? 'Номер замовлення *' : 'Номер замовлення (необов’язково)';
      if ($('fOrder').closest('.has-error')) Validator.check($('fOrder'), fields[2].rules());
    };
    topic.addEventListener('change', updateOrderLabel);
    updateOrderLabel();

    // Лічильник символів у повідомленні
    const msg = $('fMsg');
    msg.maxLength = 1000;
    const counter = Utils.el('small', { class: 'counter' });
    msg.after(counter);
    const updateCounter = () => {
      const len = msg.value.length;
      counter.textContent = `${len} / 1000`;
      counter.classList.toggle('ok', msg.value.trim().length >= 10);
    };
    msg.addEventListener('input', updateCounter);
    updateCounter();

    // Назва вибраного файлу
    const file = $('fFile');
    file.addEventListener('change', () => {
      Utils.$('label[for=fFile]', form).textContent = file.files[0] ? `📷 ${file.files[0].name}` : 'Прикріпити фото';
    });

    const summary = Utils.el('p', { class: 'form-summary', role: 'alert', hidden: '' });
    Utils.$('.form-foot', form).before(summary);

    form.addEventListener('submit', e => {
      e.preventDefault();
      const ok = Validator.validateAll(fields);
      const bad = Utils.$$('.has-error', form).length;
      summary.hidden = ok;
      summary.textContent = ok ? '' :
        `Перевірте ${bad} ${Utils.plural(bad, 'поле', 'поля', 'полів')}, позначені червоним.`;
      if (ok) this.showSuccess(form, $('fName').value.trim(), $('fContact').value.trim());
    });
  },

  showSuccess(form, name, contact) {
    const ticket = 'JH-' + Math.floor(10000 + Math.random() * 90000);
    const done = Utils.el('div', { class: 'panel form-done', tabindex: '-1' });
    done.innerHTML = `<p class="empty-ico">💌</p><h3></h3><p></p>
      <button type="button" class="btn btn-white btn-sm">Надіслати ще одне звернення</button>`;
    Utils.$('h3', done).textContent = `Дякуємо, ${name}! Звернення ${ticket} прийнято.`;
    Utils.$('p:not(.empty-ico)', done).textContent = `Відповімо на ${contact} протягом робочого дня (щодня 09:00–21:00).`;
    form.hidden = true;
    form.after(done);
    done.focus();
    Toast.show('Звернення надіслано');
    Utils.$('button', done).addEventListener('click', () => {
      form.reset();
      Utils.$$('.has-error', form).forEach(n => n.classList.remove('has-error'));
      Utils.$$('[aria-invalid]', form).forEach(n => n.removeAttribute('aria-invalid'));
      Utils.$('.form-summary', form.parentElement).hidden = true;
      Utils.$('label[for=fFile]', form).textContent = 'Прикріпити фото';
      Utils.$('#fMsg', form).dispatchEvent(new Event('input'));
      Utils.$('#fTopic', form).dispatchEvent(new Event('change'));
      done.remove();
      form.hidden = false;
      Utils.$('#fName', form).focus();
    });
  }
};

/* --------------------------- Newsletter --------------------------- */
const Newsletter = {
  init() {
    const form = Utils.$('.nl-form');
    if (!form) return;
    form.noValidate = true;
    const input = Utils.$('input', form);
    const wrap = Utils.el('div', { class: 'nl-wrap' });
    form.before(wrap);
    wrap.append(form);
    const fields = [{ input, rules: ['required', 'email'] }];
    Validator.attachLive(fields);

    form.addEventListener('submit', e => {
      e.preventDefault();
      if (!Validator.validateAll(fields)) return;
      const ok = Utils.el('p', { class: 'nl-done', role: 'status' });
      ok.textContent = `Готово! Перший лист прийде на ${input.value.trim()} у понеділок.`;
      form.replaceWith(ok);
    });
  }
};

/* ------------------------------ AiChat ------------------------------ */
const AiChat = {
  /** Сценарії: ключові слова запиту → номер добірки й відповідь бота */
  scenarios: [
    { id: 1, words: ['4 рок', 'малюк', 'дитині 3', '3 рок', 'магніт', 'м’як', 'м\'як', 'слон'], reply: 'Для наймолодших раджу магнітний конструктор, м’які іграшки й першу настільну гру. Добірка нижче 👇' },
    { id: 2, words: ['1:350', 'корабл', 'флот', 'авіанос', 'фарб', 'модел'], reply: 'Для моделістів підібрав кораблі й фарби до них. Подивіться добірку нижче 👇' },
    { id: 3, words: ['настільн', 'компан', 'друз', 'вечір', 'гра'], reply: 'Для компанії — «Острів скарбів» на 2–6 гравців і ще дві ідеї для спільного вечора 👇' },
    { id: 4, words: ['конструктор', 'lego', 'лего', 'збира', '1500', '1 500'], reply: 'Знайшов набори для збирання в бюджеті до 1 500 ₴ 👇' },
    { id: 5, words: ['пазл', '10 рок', 'головолом'], reply: 'Дерев’яні 3D пазли — ідеально для 10+. Збирати 2–4 вечори 👇' },
    { id: 0, words: ['хлопц', 'син', 'космос', 'колекц', 'фігурк', 'подарун'], reply: 'Ось універсальна добірка: моделі й пазли, які люблять і діти, і дорослі 👇' }
  ],
  interestMap: { 'Моделізм': 2, 'Конструктори': 4, 'Настільні ігри': 3, '3D пазли': 5, 'Колекційне': 0 },

  init() {
    this.page = Utils.$('.ai-page');
    if (!this.page) return;
    this.body = Utils.$('.chat-body', this.page);
    this.form = Utils.$('.chat-input', this.page);
    this.input = Utils.$('input', this.form);
    this.notes = new Map(Utils.$$('.rec .rec-note', this.page).map(n => [n, n.textContent]));

    this.error = Utils.el('p', { class: 'chat-error', role: 'alert', hidden: '' });
    this.form.after(this.error);

    this.form.addEventListener('submit', e => { e.preventDefault(); this.ask(this.input.value.trim()); });
    this.input.addEventListener('input', () => { this.error.hidden = true; this.form.classList.remove('invalid'); });

    // Швидкі кнопки (radio) — повертаємо «заготовлений» діалог
    Utils.$$('input[name=scn]', this.page).forEach(r => r.addEventListener('change', () => this.reset()));
    Utils.$('label[for=s0].link-blue', this.page)?.addEventListener('click', () => {
      this.reset();
      Toast.show('Розпочато новий діалог', 'info');
    });

    // Фільтри зліва впливають на добірку та бюджет
    Utils.$$('aside select', this.page).forEach(sel => sel.addEventListener('change', () => this.fromFilters()));

    Utils.$('.rec-actions .btn-blue', this.page)?.addEventListener('click', e => {
      e.preventDefault();
      this.botSay('Щоб добірка була точнішою, напишіть вік, захоплення й бюджет. Наприклад: «Доньці 6, любить малювати, до 1 000 ₴».');
      this.input.focus();
    });

    // Запит, переданий з іншої сторінки: ai.html?q=...
    const q = new URLSearchParams(location.search).get('q');
    if (q) this.ask(q);
  },

  /** Обробка текстового запиту користувача */
  ask(text) {
    if (text.length < 3) {
      this.error.textContent = 'Напишіть запит, наприклад: «Подарунок дівчинці 6 років»';
      this.error.hidden = false;
      this.form.classList.add('invalid');
      this.input.focus();
      return;
    }
    this.body.classList.add('custom'); // ховаємо заготовлений діалог
    this.addMessage(text, true);
    this.input.value = '';

    const lower = text.toLowerCase();
    const found = this.scenarios.find(s => s.words.some(w => lower.includes(w)));
    this.typing(() => {
      if (!found) {
        this.botSay('Поки не зрозумів запит 🤔 Спробуйте вказати вік або захоплення: «конструктор для 8 років», «настільна гра для компанії».');
        return;
      }
      this.botSay(found.reply);
      this.showSet(found.id, `Добірка за запитом: ${text}`);
    });
  },

  /** Зміна фільтрів «Вік / Інтереси / Бюджет» */
  fromFilters() {
    const age = Utils.$('#age', this.page).value;
    const interest = Utils.$('#interest', this.page).value;
    const budgetText = Utils.$('#budget', this.page).value;
    const budget = Utils.parsePrice(budgetText);
    let id = this.interestMap[interest] ?? 0;
    if (interest === 'Конструктори' && age === '0–3 роки') id = 1;

    this.body.classList.add('custom');
    this.addMessage(`${interest}, ${age}, ${budgetText.toLowerCase()}`, true);
    this.typing(() => {
      this.showSet(id, `Добірка за фільтрами: ${interest.toLowerCase()}, ${age}, ${budgetText.toLowerCase()}`);
      const over = this.markBudget(id, budget);
      this.botSay(over
        ? `Оновив добірку. ${over} ${Utils.plural(over, 'товар трохи дорожчий', 'товари трохи дорожчі', 'товарів трохи дорожчі')} за бюджет — я їх позначив.`
        : 'Оновив добірку — усе вкладається в бюджет 👍');
    });
  },

  /** Показуємо потрібну добірку: вмикаємо відповідний radio (його читає CSS) */
  showSet(id, note) {
    Utils.$('#s' + id, this.page).checked = true;
    const noteEl = Utils.$(`.rec .scn-${id} .rec-note`, this.page);
    if (noteEl && note) noteEl.textContent = note;
    Utils.$$('.rec .p-card.over-budget', this.page).forEach(c => c.classList.remove('over-budget'));
  },

  /** Позначає картки, дорожчі за бюджет; повертає їх кількість */
  markBudget(id, budget) {
    let count = 0;
    Utils.$$(`.rec .scn-${id} .p-card`, this.page).forEach(card => {
      const over = Utils.parsePrice(Utils.$('.price', card).textContent) > budget;
      card.classList.toggle('over-budget', over);
      if (over) count++;
    });
    return count;
  },

  addMessage(text, fromUser = false) {
    const msg = Utils.el('div', { class: 'msg dyn' + (fromUser ? ' me' : '') });
    msg.append(Utils.el('div', { class: 'av', text: fromUser ? 'Ви' : '✦' }), Utils.el('div', { class: 'bubble', text }));
    this.body.append(msg);
    this.body.scrollTop = this.body.scrollHeight;
    return msg;
  },

  botSay(text) { this.addMessage(text); },

  /** Індикатор «Jimmy друкує…» перед відповіддю */
  typing(done) {
    const dots = Utils.el('div', { class: 'msg dyn typing', 'aria-label': 'Jimmy друкує' });
    dots.innerHTML = '<div class="av">✦</div><div class="bubble"><i></i><i></i><i></i></div>';
    this.body.append(dots);
    this.body.scrollTop = this.body.scrollHeight;
    setTimeout(() => { dots.remove(); done(); }, Utils.reducedMotion() ? 0 : 700);
  },

  reset() {
    Utils.$$('.msg.dyn', this.body).forEach(m => m.remove());
    this.body.classList.remove('custom');
    this.notes.forEach((text, el) => { el.textContent = text; });
    Utils.$$('.rec .p-card.over-budget', this.page).forEach(c => c.classList.remove('over-budget'));
    this.error.hidden = true;
  }
};

/* ------------------------------ Stubs ------------------------------ */
const Stubs = {
  init() {
    // Посилання href="#" ведуть у розділи, яких ще немає. Не даємо сторінці
    // стрибати нагору й пояснюємо користувачу, що сталося.
    document.addEventListener('click', e => {
      const link = e.target.closest('a[href="#"]');
      if (!link || e.defaultPrevented) return;
      e.preventDefault();
      if (link.classList.contains('pager-btn')) {
        Toast.show('У демоверсії каталогу доступна лише перша сторінка', 'info');
      } else {
        Toast.show(`Розділ «${link.textContent.trim()}» з’явиться незабаром`, 'info');
      }
    });
  }
};

/* ------------------------------ App ------------------------------ */
const App = {
  modules: [Toast, Modal, Nav, Cart, Favorites, Catalog, Search, Accordion, Slider, SupportForm, Newsletter, AiChat, Stubs],
  init() {
    document.documentElement.classList.add('js');
    this.modules.forEach(module => {
      try { module.init(); }
      catch (error) { console.error('Помилка ініціалізації модуля:', error); }
    });
  }
};

document.addEventListener('DOMContentLoaded', () => App.init());
