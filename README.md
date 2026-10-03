# Лабораторная работа №2. Каталог библиотеки

SPA на чистом JavaScript и REST API на Node.js. Данные книг хранятся в PostgreSQL. Обложки загружаются отдельным запросом `multipart/form-data`. Карточки меняются без перезагрузки страницы.

## Запуск

Нужны Docker и Docker Compose.

```powershell
docker compose up --build
```

- Клиент: http://localhost:8080
- API: http://localhost:3000

Остановка:

```powershell
docker compose down
```

Сброс базы и загруженных обложек:

```powershell
docker compose down -v
```

## Состав

| Контейнер | Роль |
| --- | --- |
| `spp-client` | nginx отдаёт SPA и проксирует `/api` и `/uploads` |
| `spp-api` | Express, проверка данных, файлы обложек |
| `spp-db` | PostgreSQL 16 |

## REST API

| Метод | Путь | Успех | Ошибки |
| --- | --- | --- | --- |
| GET | `/api/books` | 200 | 400 |
| GET | `/api/books/:id` | 200 | 400, 404 |
| POST | `/api/books` | 201 | 400, 415 |
| PUT | `/api/books/:id` | 200 | 400, 404, 415 |
| DELETE | `/api/books/:id` | 204 | 400, 404 |
| PUT | `/api/books/:id/cover` | 200 | 400, 404, 415 |
| DELETE | `/api/books/:id/cover` | 200 | 400, 404 |
| GET | `/api/meta` | 200 | |
| GET | `/api/health` | 200 | 500 |

Тело книги — JSON:

```json
{
  "title": "Название",
  "author": "Автор",
  "year": 2020,
  "genre": "Роман",
  "description": "Краткое описание"
}
```

Обложка — `PUT /api/books/:id/cover`, поле файла `cover`. Принимаются JPEG, PNG, WEBP и GIF до 5 МБ. Тип файла проверяется по сигнатуре, а не по расширению.

Ошибка валидации:

```json
{
  "error": "Проверьте введённые данные",
  "details": [{ "field": "title", "message": "Укажите название" }]
}
```

Пример в PowerShell:

```powershell
curl.exe http://localhost:3000/api/books
curl.exe -X POST http://localhost:3000/api/books -H "Content-Type: application/json" -d "{\"title\":\"Тестовая книга\",\"author\":\"Автор\",\"year\":2020,\"genre\":\"Роман\",\"description\":\"Проверка API\"}"
```
