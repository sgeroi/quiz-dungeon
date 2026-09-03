# Командные форматы (teamMode) и список игр

## Игры (видимый список, GAME_MODES в client/src/types.ts)
| id | Название | Форматы |
|---|---|---|
| classic | RPG Квиз-данжен | ffa, teams, coop |
| millionaire | Кто хочет стать миллионером | ffa, teams, coop |
| jeopardy | Своя игра | ffa, teams, coop |
| buckets | Сортировка | ffa, teams, coop |
| spy | Квиз-мафия | ffa, coop (teams недоступен) |
| petersburg | Угадай фильм | ffa, teams, coop |

Скрытые (в GameMode остаются, в списках не показываются, в конструкторе не показываются): topic-split, speed, rpg-rewards, jeopardy-comp, jeopardy-coop.
`GameMode` получает новое значение `'jeopardy'`. Старые `'jeopardy-comp'`/`'jeopardy-coop'` остаются в типе для совместимости, но handler/экраны для `'jeopardy'` — диспетчер: coop → jeopardy-coop, ffa/teams → jeopardy-comp.
Контент-паки: mode `'jeopardy'` (kind 'jeopardy'). При старте сервера contentStore мигрирует: `builtin-jeopardy-comp` → id `builtin-jeopardy`, mode 'jeopardy'; `builtin-jeopardy-coop` → обычный (не builtin) пак mode 'jeopardy' с именем «Набор: Босс». Паки со старыми mode в API не отдаются.

## Типы (shared/types.ts и client/src/types.ts — синхронно)
```ts
export type TeamMode = 'ffa' | 'teams' | 'coop';
export interface Team { id: string; name: string; emoji: string; color: string; }   // id 'A','B','C','D'
// GameState:
teamMode: TeamMode;          // default 'coop'
teams: Team[];               // в teams-режиме 2..4 команды; иначе []
// Player:
teamId?: string;             // только в teams-режиме
```
Дефолтные команды: A «Красные» 🔴 #FF4848, B «Синие» 🔵 #75BFFF, C «Зелёные» 🟢 #8DFF85, D «Жёлтые» 🟡 #FFDB10.

`TEAM_MODES_BY_GAME: Record<GameMode, TeamMode[]>` и `TEAM_MODE_INFO` (name, emoji, description) — в shared/types.ts и client/src/types.ts:
- ffa: «Каждый сам за себя» 🥇 «Личный зачёт, побеждает лучший»
- teams: «Команда на команду» ⚔️ «2–4 команды, игроки сами выбирают свою»
- coop: «Все в одной команде» 🤝 «Вся пати против игры»

## Socket-события (хост, только lobby, кроме join-team — любой игрок)
- `set-team-mode(mode: TeamMode)` — если недоступен для игры → без изменений. При переходе в 'teams' создаются 2 команды, игроки без команды; выход из 'teams' — teams=[] и teamId у всех сброшен. Сбрасывает isReady у всех.
- `set-team-count(n: 2|3|4)` — только в teams; лишние команды удаляются, их игроки теряют teamId.
- `join-team(teamId)` — игрок (в т.ч. хост) выбирает команду; бот при добавлении в teams-режиме попадает в самую малочисленную команду.
- `set-game-mode(mode)` — если текущий teamMode недоступен для новой игры → teamMode = первый доступный.
- Старт (`allPlayersReady` + проверка в start-game): в teams-режиме у всех должен быть teamId и минимум 2 непустые команды, иначе `error` «Распределитесь по командам».

## Хелперы (server/src/utils/teams.ts)
```ts
getTeamOf(state, playerId): Team | undefined
playersOfTeam(state, teamId): Player[]
teamsWithPlayers(state): Team[]           // только непустые
groupByTeam(state): Record<teamId, Player[]>
```

## Что должен делать каждый handler
Handler читает `state.teamMode`:
- **coop** — как сейчас.
- **ffa** — личный зачёт: у каждого игрока свой счёт/прогресс; выигрывает лучший.
- **teams** — счёт/прогресс на команду; ответ команды = большинство/первый/капитан команды (по смыслу режима).
Финал: `game-over(victory, stats)` — в stats обязательно:
```ts
stats.teamMode: TeamMode
stats.scores?: Record<playerId, number>        // ffa (и coop, если есть личные очки)
stats.teamScores?: Record<teamId, number>      // teams
stats.winnerPlayerId?: string                  // ffa
stats.winnerTeamId?: string                    // teams
```
Снапшоты режимов (gameState.<mode>) должны содержать `teamScores` в teams-режиме и `scores` (по игрокам) в ffa — их читают презентеры и ResultScreen.

## Клиент
- Лобби: под сеткой игр блок «Формат»: 3 плитки (недоступные — приглушены с подписью «недоступно в этой игре»). В teams: выбор числа команд (2/3/4, хост) и плитки команд (цвет, эмодзи, имя, участники) — игрок тапает, чтобы войти; у игроков в списке пати цветной бейдж команды. «Готов!» недоступен без команды в teams-режиме.
- ResultScreen (client/src/screens/ResultScreen.tsx): показывать stats.scores / teamScores как таблицу победителей с подсветкой winner.
- ScreenView/DefaultPresenter: табло по командам в teams (цвет команды, сумма), личное в ffa.
- Компонент `client/src/components/TeamBadge.tsx` (цветной кружок+имя) — переиспользовать в экранах и презентерах.
