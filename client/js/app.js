import { api } from './api.js';

const els = {
  brand: document.getElementById('brand'),
  addBtn: document.getElementById('add-btn'),
  banner: document.getElementById('banner'),
  filters: document.getElementById('filters'),
  search: document.getElementById('search'),
  genreFilter: document.getElementById('genre-filter'),
  listStatus: document.getElementById('list-status'),
  bookList: document.getElementById('book-list'),
  form: document.getElementById('book-form'),
  formTitle: document.getElementById('form-title'),
  title: document.getElementById('field-title'),
  author: document.getElementById('field-author'),
  year: document.getElementById('field-year'),
  genre: document.getElementById('field-genre'),
  description: document.getElementById('field-description'),
  cover: document.getElementById('field-cover'),
  preview: document.getElementById('cover-preview'),
  removeCoverWrap: document.getElementById('remove-cover-wrap'),
  removeCover: document.getElementById('field-remove-cover'),
  cancel: document.getElementById('form-cancel'),
  submit: document.getElementById('form-submit'),
  detail: document.getElementById('detail'),
  missingTitle: document.getElementById('missing-title'),
  missingText: document.getElementById('missing-text'),
  retry: document.getElementById('retry'),
  dialog: document.getElementById('confirm-dialog'),
  confirmText: document.getElementById('confirm-text'),
};

const views = {
  list: document.getElementById('view-list'),
  form: document.getElementById('view-form'),
  detail: document.getElementById('view-detail'),
  missing: document.getElementById('view-missing'),
};

let meta = null;
let flash = null;
let routeToken = 0;
let listAbort = null;
let listTimer = null;
let previewUrl = null;
let booted = false;

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[char]));
}

function initial(title) {
  const char = String(title || '').trim().charAt(0);
  return char ? char.toUpperCase() : '?';
}

function formatDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('ru-RU');
}

function errorText(error) {
  if (error.status) return `${error.status} — ${error.message}`;
  return error.message || 'Неизвестная ошибка';
}

function showBanner(kind, text) {
  els.banner.hidden = false;
  els.banner.className = `banner ${kind}`;
  els.banner.setAttribute('role', kind === 'error' ? 'alert' : 'status');
  els.banner.textContent = text;
}

function clearBanner() {
  els.banner.hidden = true;
  els.banner.className = 'banner';
  els.banner.textContent = '';
}

function show(name) {
  if (name !== 'list' && listAbort) {
    listAbort.abort();
    listAbort = null;
  }
  for (const [key, section] of Object.entries(views)) {
    section.hidden = key !== name;
  }
  if (name !== 'missing') els.retry.hidden = true;
}

function showMissing(title, text, withRetry = false) {
  show('missing');
  els.missingTitle.textContent = title;
  els.missingText.textContent = text;
  els.retry.hidden = !withRetry;
}

function parseRoute() {
  const raw = (location.hash || '#/').slice(1);
  const [path, queryString = ''] = raw.split('?');
  const params = new URLSearchParams(queryString);
  const q = params.get('q') || '';
  const genre = params.get('genre') || '';
  if (path === '' || path === '/') return { name: 'list', q, genre };
  if (path === '/new') return { name: 'create' };
  let match = path.match(/^\/book\/(\d+)\/edit$/);
  if (match) return { name: 'edit', id: Number(match[1]) };
  match = path.match(/^\/book\/(\d+)$/);
  if (match) return { name: 'detail', id: Number(match[1]) };
  return { name: 'missing' };
}

function writeListHash(q, genre) {
  const params = new URLSearchParams();
  if (q) params.set('q', q);
  if (genre) params.set('genre', genre);
  const next = params.toString() ? `#/?${params.toString()}` : '#/';
  const current = location.hash || '#/';
  if (current !== next) history.replaceState(null, '', next);
}

function fillGenres() {
  const genreOptions = meta.genres
    .map((genre) => `<option value="${escapeHtml(genre)}">${escapeHtml(genre)}</option>`)
    .join('');
  els.genre.innerHTML = `<option value="">Выберите жанр</option>${genreOptions}`;
  els.genreFilter.innerHTML = `<option value="">Все жанры</option>${genreOptions}`;
  els.year.min = String(meta.yearMin);
  els.year.max = String(meta.yearMax);
}

function renderCards(books, { q, genre }) {
  if (!books.length) {
    els.bookList.innerHTML = '';
    els.listStatus.textContent = q || genre
      ? 'Ничего не найдено. Измените запрос или выберите другой жанр.'
      : 'В каталоге пока нет книг.';
    return;
  }

  els.listStatus.textContent = `Найдено: ${books.length}`;
  els.bookList.innerHTML = books.map((book) => {
    const cover = book.coverUrl
      ? `<img src="${escapeHtml(book.coverUrl)}" alt="" data-initial="${escapeHtml(initial(book.title))}">`
      : `<div class="cover-fallback">${escapeHtml(initial(book.title))}</div>`;
    return `
      <a class="card" href="#/book/${book.id}">
        <span class="cover">${cover}</span>
        <span>
          <h2>${escapeHtml(book.title)}</h2>
          <p class="author">${escapeHtml(book.author)}</p>
          <p class="meta"><span class="badge">${escapeHtml(book.genre)}</span> ${book.year}</p>
        </span>
      </a>
    `;
  }).join('');

  els.bookList.querySelectorAll('img').forEach((img) => {
    img.addEventListener('error', () => replaceWithFallback(img));
  });
}

function replaceWithFallback(img) {
  const fallback = document.createElement('div');
  fallback.className = 'cover-fallback';
  fallback.textContent = img.dataset.initial || '?';
  img.replaceWith(fallback);
}

async function fetchList(token) {
  if (listAbort) listAbort.abort();
  const controller = new AbortController();
  listAbort = controller;
  const q = els.search.value.trim();
  const genre = els.genreFilter.value;
  writeListHash(q, genre);
  els.listStatus.textContent = 'Загрузка…';

  try {
    const data = await api.list({ q, genre, signal: controller.signal });
    if (token && token !== routeToken) return;
    renderCards(data.books, { q, genre });
  } catch (error) {
    if (error.name === 'AbortError') return;
    if (token && token !== routeToken) return;
    els.listStatus.textContent = '';
    els.bookList.innerHTML = '';
    showBanner('error', errorText(error));
  }
}

function scheduleList() {
  clearTimeout(listTimer);
  listTimer = setTimeout(() => { void fetchList(); }, 250);
}

function clearFieldErrors() {
  document.querySelectorAll('.field-error').forEach((item) => {
    item.textContent = '';
  });
  document.querySelectorAll('[aria-invalid="true"]').forEach((item) => {
    item.removeAttribute('aria-invalid');
  });
}

function showFieldErrors(details) {
  for (const detail of details || []) {
    if (!detail || typeof detail.field !== 'string') continue;
    const message = document.querySelector(`[data-error-for="${CSS.escape(detail.field)}"]`);
    const field = document.getElementById(`field-${detail.field}`);
    if (message) message.textContent = detail.message;
    if (field) field.setAttribute('aria-invalid', 'true');
  }
}

function hidePreview() {
  if (previewUrl) {
    URL.revokeObjectURL(previewUrl);
    previewUrl = null;
  }
  els.preview.hidden = true;
  els.preview.removeAttribute('src');
}

function setPreview(url, isBlob) {
  hidePreview();
  if (isBlob) previewUrl = url;
  els.preview.src = url;
  els.preview.hidden = false;
}

function readPayload() {
  const rawYear = els.year.value.trim();
  return {
    title: els.title.value.trim(),
    author: els.author.value.trim(),
    year: /^-?\d+$/.test(rawYear) ? Number(rawYear) : rawYear,
    genre: els.genre.value,
    description: els.description.value.trim(),
  };
}

function validateForm(payload) {
  const details = [];
  if (!payload.title) details.push({ field: 'title', message: 'Укажите название' });
  else if (payload.title.length > 200) details.push({ field: 'title', message: 'Название не длиннее 200 символов' });

  if (!payload.author) details.push({ field: 'author', message: 'Укажите автора' });
  else if (payload.author.length > 200) details.push({ field: 'author', message: 'Имя автора не длиннее 200 символов' });

  if (typeof payload.year !== 'number') {
    details.push({ field: 'year', message: 'Укажите год издания целым числом' });
  } else if (payload.year < meta.yearMin || payload.year > meta.yearMax) {
    details.push({ field: 'year', message: `Год должен быть от ${meta.yearMin} до ${meta.yearMax}` });
  }

  if (!meta.genres.includes(payload.genre)) {
    details.push({ field: 'genre', message: 'Выберите жанр из списка' });
  }

  if (payload.description.length > 4000) {
    details.push({ field: 'description', message: 'Описание не длиннее 4000 символов' });
  }
  return details;
}

function validateFile(file) {
  const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
  if (file.type && !allowed.includes(file.type)) {
    return { field: 'cover', message: 'Допустимы только изображения JPEG, PNG, WEBP и GIF' };
  }
  if (file.size === 0) return { field: 'cover', message: 'Файл пустой' };
  if (file.size > meta.maxCoverBytes) {
    return { field: 'cover', message: 'Максимальный размер обложки — 5 МБ' };
  }
  return null;
}

function setBusy(busy) {
  els.submit.disabled = busy;
  els.cancel.disabled = busy;
  els.submit.textContent = busy
    ? 'Сохранение…'
    : (els.form.dataset.id ? 'Сохранить' : 'Добавить');
}

async function showList(route, token) {
  show('list');
  if (document.activeElement !== els.search) els.search.value = route.q;
  if (els.genreFilter.value !== route.genre) els.genreFilter.value = route.genre;
  await fetchList(token);
}

async function showForm(id, token) {
  show('form');
  clearFieldErrors();
  els.form.reset();
  hidePreview();
  els.form.dataset.id = id ? String(id) : '';
  els.formTitle.textContent = id ? 'Редактирование' : 'Новая книга';
  els.submit.textContent = id ? 'Сохранить' : 'Добавить';
  els.submit.disabled = false;
  els.cancel.disabled = false;
  els.removeCoverWrap.hidden = true;
  if (!id) {
    els.title.focus();
    return;
  }

  els.submit.disabled = true;
  try {
    const { book } = await api.get(id);
    if (token !== routeToken) return;
    els.title.value = book.title;
    els.author.value = book.author;
    els.year.value = String(book.year);
    els.genre.value = book.genre;
    els.description.value = book.description;
    if (book.coverUrl) {
      els.removeCoverWrap.hidden = false;
      setPreview(book.coverUrl, false);
    }
  } catch (error) {
    if (token !== routeToken) return;
    const notFound = error.status === 404;
    showMissing(
      notFound ? 'Книга не найдена' : 'Не удалось открыть форму',
      errorText(error),
    );
  } finally {
    if (token === routeToken) els.submit.disabled = false;
  }
}

function renderDetail(book) {
  const cover = book.coverUrl
    ? `<img class="detail-cover" src="${escapeHtml(book.coverUrl)}" alt="Обложка: ${escapeHtml(book.title)}" data-initial="${escapeHtml(initial(book.title))}">`
    : `<div class="cover-fallback detail-cover">${escapeHtml(initial(book.title))}</div>`;
  const description = book.description
    ? `<p class="description">${escapeHtml(book.description)}</p>`
    : '<p class="muted">Описание не указано</p>';

  els.detail.innerHTML = `
    <div class="detail-layout">
      <div>${cover}</div>
      <div>
        <p class="eyebrow">${escapeHtml(book.genre)} · ${book.year}</p>
        <h1>${escapeHtml(book.title)}</h1>
        <p class="author">${escapeHtml(book.author)}</p>
        ${description}
        <p class="muted">Обновлено: ${escapeHtml(formatDate(book.updatedAt))}</p>
        <div class="actions">
          <a class="button secondary" href="#/">К каталогу</a>
          <a class="button" href="#/book/${book.id}/edit">Изменить</a>
          <button class="button danger" id="delete-book" type="button">Удалить</button>
        </div>
      </div>
    </div>
  `;

  const image = els.detail.querySelector('img');
  if (image) {
    image.addEventListener('error', () => {
      const fallback = document.createElement('div');
      fallback.className = 'cover-fallback detail-cover';
      fallback.textContent = image.dataset.initial || '?';
      image.replaceWith(fallback);
    });
  }
  els.detail.querySelector('#delete-book').addEventListener('click', () => {
    void onDelete(book);
  });
}

async function showDetail(id, token) {
  show('detail');
  els.detail.innerHTML = '<p class="muted">Загрузка…</p>';
  try {
    const { book } = await api.get(id);
    if (token !== routeToken) return;
    renderDetail(book);
  } catch (error) {
    if (token !== routeToken) return;
    const notFound = error.status === 404;
    showMissing(
      notFound ? 'Книга не найдена' : 'Не удалось открыть книгу',
      errorText(error),
    );
  }
}

async function renderRoute() {
  const token = ++routeToken;
  const route = parseRoute();
  const message = flash;
  flash = null;
  clearFieldErrors();
  if (message) showBanner(message.kind, message.text);
  else clearBanner();

  if (route.name === 'list') await showList(route, token);
  else if (route.name === 'create') await showForm(null, token);
  else if (route.name === 'edit') await showForm(route.id, token);
  else if (route.name === 'detail') await showDetail(route.id, token);
  else showMissing('Страница не найдена', 'Такого адреса в приложении нет.');
}

function askDelete(title) {
  els.confirmText.textContent = `Удалить книгу «${title}»? Это действие нельзя отменить.`;
  els.dialog.showModal();
  return new Promise((resolve) => {
    els.dialog.addEventListener('close', () => {
      resolve(els.dialog.returnValue === 'confirm');
    }, { once: true });
  });
}

async function onDelete(book) {
  const confirmed = await askDelete(book.title);
  if (!confirmed) return;
  try {
    await api.remove(book.id);
    flash = { kind: 'ok', text: 'Книга удалена' };
    location.hash = '#/';
  } catch (error) {
    showBanner('error', errorText(error));
  }
}

async function onSubmit(event) {
  event.preventDefault();
  clearFieldErrors();
  clearBanner();
  const payload = readPayload();
  const details = validateForm(payload);
  const file = els.cover.files[0];
  if (file) {
    const fileError = validateFile(file);
    if (fileError) details.push(fileError);
  }
  if (details.length) {
    showFieldErrors(details);
    showBanner('error', 'Проверьте введённые данные');
    return;
  }

  const editingId = els.form.dataset.id;
  setBusy(true);
  try {
    const saved = editingId
      ? await api.update(editingId, payload)
      : await api.create(payload);
    let book = saved.book;

    if (file) {
      try {
        book = (await api.uploadCover(book.id, file)).book;
      } catch (error) {
        flash = {
          kind: 'error',
          text: `Книга сохранена, но обложку загрузить не удалось. ${errorText(error)}`,
        };
        location.hash = `#/book/${book.id}`;
        return;
      }
    } else if (editingId && els.removeCover.checked) {
      book = (await api.removeCover(book.id)).book;
    }

    flash = { kind: 'ok', text: editingId ? 'Изменения сохранены' : 'Книга добавлена' };
    location.hash = `#/book/${book.id}`;
  } catch (error) {
    showBanner('error', errorText(error));
    showFieldErrors(error.details);
  } finally {
    setBusy(false);
  }
}

function bind() {
  els.addBtn.addEventListener('click', () => {
    if (location.hash === '#/new') void renderRoute();
    else location.hash = '#/new';
  });

  els.brand.addEventListener('click', (event) => {
    if ((location.hash || '#/') === '#/') {
      event.preventDefault();
      els.search.value = '';
      els.genreFilter.value = '';
      clearBanner();
      void fetchList();
    }
  });

  els.filters.addEventListener('submit', (event) => {
    event.preventDefault();
    clearBanner();
    void fetchList();
  });
  els.search.addEventListener('input', () => {
    clearBanner();
    scheduleList();
  });
  els.genreFilter.addEventListener('change', () => {
    clearBanner();
    void fetchList();
  });

  els.form.addEventListener('submit', (event) => { void onSubmit(event); });
  els.cancel.addEventListener('click', () => {
    const id = els.form.dataset.id;
    location.hash = id ? `#/book/${id}` : '#/';
  });
  els.cover.addEventListener('change', () => {
    const file = els.cover.files[0];
    const message = document.querySelector('[data-error-for="cover"]');
    if (message) message.textContent = '';
    els.cover.removeAttribute('aria-invalid');
    if (!file) return;
    const fileError = validateFile(file);
    if (fileError) {
      showFieldErrors([fileError]);
      els.cover.value = '';
      return;
    }
    els.removeCover.checked = false;
    setPreview(URL.createObjectURL(file), true);
  });

  for (const id of ['field-title', 'field-author', 'field-year', 'field-genre', 'field-description']) {
    const field = document.getElementById(id);
    const eventName = field.tagName === 'SELECT' ? 'change' : 'input';
    field.addEventListener(eventName, () => {
      field.removeAttribute('aria-invalid');
      const message = document.querySelector(`[data-error-for="${id.replace('field-', '')}"]`);
      if (message) message.textContent = '';
    });
  }

  els.retry.addEventListener('click', () => { void boot(); });
  window.addEventListener('hashchange', () => { void renderRoute(); });
}

async function boot() {
  try {
    meta = await api.meta();
    fillGenres();
    if (!booted) {
      booted = true;
      bind();
    }
    if (!location.hash) location.hash = '#/';
    else await renderRoute();
  } catch (error) {
    showMissing('Сервер недоступен', errorText(error), true);
  }
}

void boot();
