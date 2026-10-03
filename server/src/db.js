import pg from 'pg';
import { GENRES, YEAR_MIN } from './validate.js';

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  console.error('Не задана переменная DATABASE_URL');
  process.exit(1);
}

export const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const SEED = [
  ['Мастер и Маргарита', 'Михаил Булгаков', 1967, 'Роман', 'Роман о визите Воланда в Москву и о судьбе Мастера.'],
  ['Преступление и наказание', 'Фёдор Достоевский', 1866, 'Роман', 'История Родиона Раскольникова и последствий его теории.'],
  ['1984', 'Джордж Оруэлл', 1949, 'Фантастика', 'Антиутопия о тотальном контроле над языком и памятью.'],
  ['Убийство в Восточном экспрессе', 'Агата Кристи', 1934, 'Детектив', 'Расследование Эркюля Пуаро в остановившемся поезде.'],
  ['Краткая история времени', 'Стивен Хокинг', 1988, 'Научная', 'Популярное введение в космологию и природу времени.'],
];

export async function waitForDb() {
  for (let attempt = 1; attempt <= 30; attempt += 1) {
    try {
      await pool.query('SELECT 1');
      return;
    } catch (error) {
      console.log(`База недоступна, попытка ${attempt}/30`);
      if (attempt === 30) throw error;
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }
}

export async function initDb() {
  const genreSql = GENRES.map((genre) => `'${genre.replaceAll("'", "''")}'`).join(', ');
  const schema = `
    CREATE TABLE IF NOT EXISTS books (
      id SERIAL PRIMARY KEY,
      title VARCHAR(200) NOT NULL,
      author VARCHAR(200) NOT NULL,
      year INTEGER NOT NULL,
      genre VARCHAR(100) NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      cover_filename VARCHAR(255),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT books_title_len CHECK (char_length(title) BETWEEN 1 AND 200),
      CONSTRAINT books_author_len CHECK (char_length(author) BETWEEN 1 AND 200),
      CONSTRAINT books_year_chk CHECK (year BETWEEN ${YEAR_MIN} AND 2100),
      CONSTRAINT books_genre_chk CHECK (genre IN (${genreSql})),
      CONSTRAINT books_description_len CHECK (char_length(description) <= 4000)
    )
  `;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(schema);
    const { rows } = await client.query('SELECT COUNT(*)::int AS count FROM books');
    if (rows[0].count === 0) {
      for (const row of SEED) {
        await client.query(
          `INSERT INTO books (title, author, year, genre, description)
           VALUES ($1, $2, $3, $4, $5)`,
          row,
        );
      }
    }
    await client.query('COMMIT');
    console.log('База данных готова');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
