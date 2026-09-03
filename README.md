# Башня Знаний — Квиз, плиз! Хоум

Платформа интерактивных интеллектуально-развлекательных игр для компании: играйте в одной комнате или с друзьями по сети.

**Прод:** https://178-105-27-2.nip.io/ · конструктор `#/admin` · экран для ТВ `#/screen/КОД` · вход по QR `#/join/КОД`

## Игры
RPG Квиз-данжен · Кто хочет стать миллионером · Своя игра · Сортировка · Квиз-мафия · Угадай фильм · Последний герой.
У каждой игры формат: **каждый сам за себя**, **команда на команду** (2–4 команды), **все в одной команде**.

## Стек
- `server/` — Node + Express + socket.io (TypeScript, `npx tsx src/index.ts`, порт 3340). Игровые режимы в `server/src/modes/<mode>/handler.ts`, контент-паки в `server/data/content.json` (REST `/api/content`).
- `client/` — React + Vite + Tailwind v4. Экраны игрока `client/src/modes/`, ТВ-презентеры `client/src/presenter/`, конструктор `client/src/admin/`.
- Типы дублируются: `shared/types.ts` ↔ `client/src/types.ts`, `shared/content.ts` ↔ `client/src/content.ts` — править парами.

## Запуск
```bash
cd client && npm i && npm run build      # статика → client/dist
cd ../server && npm i && npx tsx src/index.ts
```

Документация: `docs/INTERACTIVE.md` (QR-вход, экран, презентеры), `docs/TEAMS.md` (командные форматы).
