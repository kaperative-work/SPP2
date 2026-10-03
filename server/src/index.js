import express from 'express';
import { booksRouter } from './books.js';
import { initDb, pool, waitForDb } from './db.js';
import { wrap } from './errors.js';
import { ensureUploadDir, uploadDir } from './files.js';
import { GENRES, YEAR_MIN, yearMax } from './validate.js';

const app = express();
const port = Number(process.env.PORT) || 3000;
const maxCoverBytes = 5 * 1024 * 1024;

app.disable('x-powered-by');

app.use((req, res, next) => {
  const started = Date.now();
  res.on('finish', () => {
    console.log(`${req.method} ${req.originalUrl} ${res.statusCode} ${Date.now() - started}ms`);
  });
  next();
});

app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') {
    res.sendStatus(204);
    return;
  }
  next();
});

app.use(express.json({ limit: '100kb' }));

app.get('/api/health', wrap(async (req, res) => {
  await pool.query('SELECT 1');
  res.json({ ok: true });
}));

app.get('/api/meta', (req, res) => {
  res.json({
    genres: GENRES,
    yearMin: YEAR_MIN,
    yearMax: yearMax(),
    maxCoverBytes,
  });
});

app.use('/api/books', booksRouter);

app.use('/uploads', express.static(uploadDir, {
  index: false,
  fallthrough: true,
  dotfiles: 'deny',
}));

app.use('/uploads', (req, res) => {
  res.status(404).json({ error: 'Файл не найден', details: [] });
});

app.use('/api', (req, res) => {
  res.status(404).json({ error: 'Ресурс не найден', details: [] });
});

app.use((err, req, res, next) => {
  if (res.headersSent) {
    next(err);
    return;
  }

  if (err.name === 'MulterError') {
    const message = err.code === 'LIMIT_FILE_SIZE'
      ? 'Максимальный размер обложки — 5 МБ'
      : 'Не удалось принять файл обложки';
    res.status(400).json({
      error: 'Ошибка загрузки файла',
      details: [{ field: 'cover', message }],
    });
    return;
  }

  if (err.type === 'entity.parse.failed') {
    res.status(400).json({ error: 'Некорректный JSON', details: [] });
    return;
  }

  if (err.type === 'entity.too.large') {
    res.status(413).json({ error: 'Слишком большой запрос', details: [] });
    return;
  }

  if (err.code === '23514') {
    res.status(400).json({ error: 'Данные не прошли проверку', details: [] });
    return;
  }

  const status = Number(err.status) || 500;
  if (status >= 500) console.error(err);
  res.status(status).json({
    error: status >= 500 ? 'Внутренняя ошибка сервера' : err.message,
    details: Array.isArray(err.details) ? err.details : [],
  });
});

async function main() {
  await waitForDb();
  await initDb();
  await ensureUploadDir();
  const server = app.listen(port, () => {
    console.log(`API слушает порт ${port}`);
  });

  let stopping = false;
  const shutdown = async () => {
    if (stopping) return;
    stopping = true;
    server.close();
    await pool.end();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
