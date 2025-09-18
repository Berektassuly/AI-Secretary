# AI Meeting Secretary

> Mission-critical система для автоматизации протоколирования встреч: транскрибация через OpenAI Whisper, извлечение задач и их публикация в Jira.

## 🧭 Архитектурный обзор

Платформа построена по принципам zero-trust и микросервисной архитектуры. UI никогда напрямую не обращается к внешним API — все вызовы проходят через backend-for-frontend (Next.js API Routes).

```
[Браузер]
   ↓
[Next.js App Router]
   ├── POST /api/whisper  ──▶  OpenAI Whisper API
   ├── POST /api/extract-tasks ──▶  Python NLP Microservice
   └── POST /api/create-jira-tasks ──▶  Jira Cloud API

[Python FastAPI NLP Service]
   └── POST /extract-tasks
```

### Сервисы

| Сервис | Стек | Назначение |
| ------ | ---- | ---------- |
| `ai-secretary-app` | Next.js 14 (App Router), TypeScript, Tailwind CSS | UI, оркестрация процесса, безопасные вызовы внешних API |
| `nlp_service` | FastAPI, Transformers | CPU/GPU-bound анализ текста, извлечение actionable-задач |

## 🚀 Быстрый старт

### 1. Подготовка окружения

1. Установите Docker и Docker Compose.
2. Скопируйте `.env` файлы на основе примеров:
   - `cp ai-secretary-app/.env.local.example ai-secretary-app/.env.local`
   - `cp nlp_service/.env.example nlp_service/.env`
3. Заполните значения переменных окружения:
   - `OPENAI_API_KEY` — ключ к OpenAI Whisper API.
   - `NEXT_PUBLIC_JIRA_DEFAULT_BASE_URL` — дефолтный адрес вашей Jira (опционально).
   - При необходимости настройте `LOG_LEVEL`, пути к локальным NLI моделям и т. д.

### 2. Запуск всей платформы

```bash
docker compose build
docker compose up
```

После старта:
- Next.js приложение доступно на `http://localhost:3000`.
- NLP сервис — на `http://localhost:8000` (должен быть недоступен напрямую пользователю, в production спрячьте его за сетью сервисов).

### 3. Локальная разработка без Docker

- **Next.js**:
  ```bash
  cd ai-secretary-app
  npm install
  npm run dev
  ```
- **NLP Service**:
  ```bash
  cd nlp_service
  python -m venv .venv
  source .venv/bin/activate
  pip install -r requirements.txt
  uvicorn app.main:app --host 0.0.0.0 --port 8000
  ```

Убедитесь, что переменные окружения заданы (можно использовать `.env.local` и `.env`).

## ⚙️ Сервисы подробно

### Next.js (ai-secretary-app)

- **API Routes**
  - `POST /api/whisper` — принимает файл (FormData `file`), проверяет лимит 25 МБ, вызывает `openai.audio.transcriptions.create` с моделью `whisper-1`.
  - `POST /api/extract-tasks` — защищённый прокси к `nlp_service`. Обрабатывает таймауты и повторные попытки.
  - `POST /api/create-jira-tasks` — создаёт задачи в Jira. Накапливает результаты по каждой задаче.
- **UI/UX**
  - Проактивный прогресс бар (`WorkflowTracker`).
  - Дашборд результатов (`ResultsDashboard`) + возможность копирования задач.
  - Форма интеграции с Jira (`JiraIntegrationForm`).
  - Хук `useWorkflowManager` инкапсулирует весь оркестратор состояний.

### Python NLP Service

- Эндпоинт `POST /extract-tasks` получает текст и возвращает список задач.
- Логика в `logic.py` использует предобученные NLI модели (`ruBERT`, `BART-MNLI`).
- Модели загружаются один раз при старте (через `FastAPI lifespan`).
- Встроенный health-check `GET /health`.

## 🔐 Переменные окружения

### `ai-secretary-app`

| Переменная | Назначение |
| ---------- | ---------- |
| `OPENAI_API_KEY` | Ключ для Whisper API (обязательная). |
| `OPENAI_REQUEST_TIMEOUT_MS` | Таймаут вызова Whisper (по умолчанию 90 сек). |
| `NLP_SERVICE_URL` | URL Python сервиса (по умолчанию `http://nlp-service:8000`). |
| `NLP_SERVICE_REQUEST_TIMEOUT_MS` | Таймаут при обращении к NLP (45 сек). |
| `NLP_SERVICE_RETRY_COUNT` | Количество повторных попыток при ошибках NLP (2). |
| `JIRA_REQUEST_TIMEOUT_MS` | Таймаут запросов к Jira (45 сек). |
| `NEXT_PUBLIC_JIRA_DEFAULT_BASE_URL` | Базовый URL Jira, отображаемый в UI. |

### `nlp_service`

| Переменная | Назначение |
| ---------- | ---------- |
| `LOG_LEVEL` | Уровень логирования (по умолчанию `INFO`). |
| `RU_NLI_MODEL_DIR` / `RU_NLI_MODEL_NAME` | Кастомный путь/имя русской NLI модели. |
| `EN_NLI_MODEL_DIR` / `EN_NLI_MODEL_NAME` | Кастомный путь/имя английской NLI модели. |

## 📡 Контракты API

### `POST /api/whisper`
- Request: `multipart/form-data` с полем `file`.
- Response: `200 OK` → `{ "transcript": "..." }`.
- Ошибки: `400` (нет файла), `413` (лимит), `502` (ошибка OpenAI).

### `POST /api/extract-tasks`
- Request: `{ "transcript": "..." }`.
- Response: `{ "tasks": ["..."] }`.
- Ошибки: `400` (валидация), `502` (ошибка NLP сервиса), `500` (непредвиденная ошибка).

### `POST /api/create-jira-tasks`
- Request: `{ "tasks": ["..."], "config": { "baseUrl": "...", "email": "...", "token": "...", "projectKey": "...", "description"?: "..." } }`.
- Response: `{ "results": [{ "summary": "...", "success": true, "issueKey": "AI-123" }] }`.
- Ошибки: `400` (валидация), `502` (все задачи упали), поле `error` внутри `results` укажет причину.

### `POST /extract-tasks` (NLP сервис)
- Request: `{ "text": "..." }`.
- Response: `{ "tasks": ["..."] }`.
- Ошибки: `500` (ошибка извлечения).

## 🧪 Тестирование и качество

- TypeScript strict mode включён.
- ESLint (`npm run lint`) и `uvicorn`/`fastapi` конфигурации адаптированы для production.
- Docker образы многоступенчатые и запускают приложение от непривилегированных пользователей.

## 🔒 Безопасность

- Ключи OpenAI и Jira никогда не попадают на клиент — все вызовы идут через серверные роуты.
- NLP сервис изолирован, не хранит секреты и обслуживает только текстовый анализ.
- Встроены таймауты и повторные попытки, исключения логируются структурировано.

## 📄 Лицензия

Проект предоставляется «как есть» в рамках задания. Используйте и расширяйте его с учётом корпоративных стандартов безопасности.
