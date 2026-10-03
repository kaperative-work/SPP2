import { Router } from 'express';
import multer from 'multer';
import { pool } from './db.js';
import { HttpError, wrap } from './errors.js';
import { removeImage, saveImage } from './files.js';
import { toLikePattern, validateBook, validateListQuery } from './validate.js';

export const booksRouter = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
});

function requireJson(req, res, next) {
  const type = String(req.headers['content-type'] || '').toLowerCase();
  if (!type.includes('application/json')) {
    res.status(415).json({
      error: 'Ожидается Content-Type: application/json',
      details: [],
    });
    return;
  }
  next();
}

function requireMultipart(req, res, next) {
  const type = String(req.headers['content-type'] || '').toLowerCase();
  if (!type.includes('multipart/form-data')) {
    res.status(415).json({
      error: 'Ожидается Content-Type: multipart/form-data',
      details: [],
    });
    return;
  }
  next();
}

function coverUpload(req, res, next) {
  upload.single('cover')(req, res, (error) => {
    if (error) next(error);
    else next();
  });
}

function parseId(value) {
  if (!/^\d+$/.test(String(value))) {
    throw new HttpError(400, 'Некорректный идентификатор');
  }
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id < 1) {
    throw new HttpError(400, 'Некорректный идентификатор');
  }
  return id;
}

function mapBook(row) {
  return {
    id: row.id,
    title: row.title,
    author: row.author,
    year: row.year,
    genre: row.genre,
    description: row.description,
    coverUrl: row.cover_filename ? `/uploads/${row.cover_filename}` : null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function findBook(id) {
  const { rows } = await pool.query('SELECT * FROM books WHERE id = $1', [id]);
  return rows[0] || null;
}

booksRouter.get('/', wrap(async (req, res) => {
  const { q, genre } = validateListQuery(req.query);
  const params = [];
  const where = [];

  if (q) {
    params.push(toLikePattern(q));
    const placeholder = `$${params.length}`;
    where.push(`(title ILIKE ${placeholder} ESCAPE '\\' OR author ILIKE ${placeholder} ESCAPE '\\')`);
  }
  if (genre) {
    params.push(genre);
    where.push(`genre = $${params.length}`);
  }

  const sql = `
    SELECT * FROM books
    ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
    ORDER BY title ASC, id ASC
    LIMIT 500
  `;
  const { rows } = await pool.query(sql, params);
  res.json({ books: rows.map(mapBook) });
}));

booksRouter.post('/', requireJson, wrap(async (req, res) => {
  const data = validateBook(req.body);
  const { rows } = await pool.query(
    `INSERT INTO books (title, author, year, genre, description)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [data.title, data.author, data.year, data.genre, data.description],
  );
  const book = mapBook(rows[0]);
  res.status(201).location(`/api/books/${book.id}`).json({ book });
}));

booksRouter.get('/:id', wrap(async (req, res) => {
  const book = await findBook(parseId(req.params.id));
  if (!book) throw new HttpError(404, 'Книга не найдена');
  res.json({ book: mapBook(book) });
}));

booksRouter.put('/:id', requireJson, wrap(async (req, res) => {
  const id = parseId(req.params.id);
  const data = validateBook(req.body);
  const { rows } = await pool.query(
    `UPDATE books
     SET title = $1, author = $2, year = $3, genre = $4, description = $5, updated_at = NOW()
     WHERE id = $6
     RETURNING *`,
    [data.title, data.author, data.year, data.genre, data.description, id],
  );
  if (!rows[0]) throw new HttpError(404, 'Книга не найдена');
  res.json({ book: mapBook(rows[0]) });
}));

booksRouter.delete('/:id', wrap(async (req, res) => {
  const id = parseId(req.params.id);
  const existing = await findBook(id);
  if (!existing) throw new HttpError(404, 'Книга не найдена');
  await pool.query('DELETE FROM books WHERE id = $1', [id]);
  await removeImage(existing.cover_filename);
  res.status(204).end();
}));

booksRouter.put('/:id/cover', requireMultipart, coverUpload, wrap(async (req, res) => {
  const id = parseId(req.params.id);
  const existing = await findBook(id);
  if (!existing) throw new HttpError(404, 'Книга не найдена');
  if (!req.file || req.file.size === 0) {
    throw new HttpError(400, 'Файл обложки не передан', [
      { field: 'cover', message: 'Выберите файл изображения' },
    ]);
  }

  const filename = await saveImage(req.file.buffer);
  try {
    const { rows } = await pool.query(
      `UPDATE books
       SET cover_filename = $1, updated_at = NOW()
       WHERE id = $2
       RETURNING *`,
      [filename, id],
    );
    await removeImage(existing.cover_filename);
    res.json({ book: mapBook(rows[0]) });
  } catch (error) {
    await removeImage(filename);
    throw error;
  }
}));

booksRouter.delete('/:id/cover', wrap(async (req, res) => {
  const id = parseId(req.params.id);
  const existing = await findBook(id);
  if (!existing) throw new HttpError(404, 'Книга не найдена');
  if (!existing.cover_filename) throw new HttpError(404, 'Обложка не найдена');
  const { rows } = await pool.query(
    `UPDATE books
     SET cover_filename = NULL, updated_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [id],
  );
  await removeImage(existing.cover_filename);
  res.json({ book: mapBook(rows[0]) });
}));
