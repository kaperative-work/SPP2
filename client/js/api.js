async function request(method, url, { body, signal } = {}) {
  const options = { method, signal, cache: 'no-store' };
  if (body instanceof FormData) {
    options.body = body;
  } else if (body !== undefined) {
    options.headers = { 'Content-Type': 'application/json' };
    options.body = JSON.stringify(body);
  }

  let response;
  try {
    response = await fetch(url, options);
  } catch (error) {
    if (error.name === 'AbortError') throw error;
    const failure = new Error('Нет соединения с сервером. Проверьте, что контейнеры запущены.');
    failure.details = [];
    throw failure;
  }

  if (response.status === 204) return null;

  const text = await response.text();
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = null;
    }
  }

  if (!response.ok) {
    const failure = new Error(data?.error || `Ошибка сервера (${response.status})`);
    failure.status = response.status;
    failure.details = Array.isArray(data?.details) ? data.details : [];
    throw failure;
  }

  return data;
}

export const api = {
  meta() {
    return request('GET', '/api/meta');
  },
  list({ q, genre, signal }) {
    const params = new URLSearchParams();
    if (q) params.set('q', q);
    if (genre) params.set('genre', genre);
    const query = params.toString();
    return request('GET', `/api/books${query ? `?${query}` : ''}`, { signal });
  },
  get(id) {
    return request('GET', `/api/books/${id}`);
  },
  create(body) {
    return request('POST', '/api/books', { body });
  },
  update(id, body) {
    return request('PUT', `/api/books/${id}`, { body });
  },
  remove(id) {
    return request('DELETE', `/api/books/${id}`);
  },
  uploadCover(id, file) {
    const body = new FormData();
    body.append('cover', file);
    return request('PUT', `/api/books/${id}/cover`, { body });
  },
  removeCover(id) {
    return request('DELETE', `/api/books/${id}/cover`);
  },
};
