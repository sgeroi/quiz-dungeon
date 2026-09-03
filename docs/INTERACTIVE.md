# Интерактив: QR-вход + Экран (презентер)

## Роли в комнате
- **player** — обычный игрок (как сейчас). В интерактивной пати видеочат/микрофон выключены.
- **screen** — «большой экран» (ТВ/проектор). НЕ игрок: не в `state.players`, не отвечает, не влияет на «все готовы».
  Сокет экрана входит в socket.io-room комнаты и получает все `game-state` и mode-события, которые рассылаются `io.to(roomCode)`.

## GameState (shared/types.ts + client/src/types.ts)
```ts
interactive?: boolean;      // пати создана как интерактивная: без видео/микрофона, показываем QR
screenIds?: string[];       // socket.id подключённых экранов (может быть несколько)
```

## Socket-события
- `create-room(playerName, mode?, opts?: { interactive?: boolean })`
- `join-screen(roomCode)` → сервер: socket.join(roomCode), state.screenIds.push(socket.id), emit `screen-joined`(state); всем — `game-state`.
  Экран может подключиться в любой фазе (в т.ч. посреди игры). Отключение — убрать из screenIds.
- `set-interactive(on: boolean)` — хост, только в lobby.
- Все mode-события, адресованные лично игроку (`io.to(playerId)`), экран НЕ получает — презентер строится только на room-broadcast данных.
  Если для презентера нужны данные, которых нет в broadcast (например, правильный ответ после reveal, кто нажал buzz) —
  handler режима ДОПОЛНИТЕЛЬНО шлёт `io.to(roomCode).emit('presenter-<mode>', payload)` или расширяет уже рассылаемый snapshot.
  Правильный ответ до reveal на экран не отправлять.

## Клиентские маршруты (hash)
- `#/` — главная
- `#/admin` — конструктор
- `#/join/ABCD` — авто-вход: показываем ввод имени (если нет сохранённого) и сразу joinRoom(ABCD). Это ссылка в QR.
- `#/screen` — форма ввода кода → `#/screen/ABCD`
- `#/screen/ABCD` — режим экрана: join-screen(ABCD). Показывает ScreenView.

## QR
- Библиотека: `qrcode.react` (QRCodeSVG). Ссылка: `${location.origin}/#/join/${roomCode}`.
- В лобби интерактивной пати у хоста и на экране — большой QR + код крупно. У игроков — маленький QR «позвать друга».

## ScreenView (client/src/screens/ScreenView.tsx)
- lobby: логотип QP Home, QR (крупно), код, список подключившихся игроков, выбранная игра.
- игра: `PRESENTER_SCREENS[gameMode]` из `client/src/presenter/index.ts`; если нет — `DefaultPresenter` (название режима, этаж/раунд, табло игроков: имя, HP/очки, статус).
- victory/defeat: итоговое табло + QR «сыграть ещё».
- Экран никогда не показывает кнопки действий.

## Реестр презентеров (client/src/presenter/index.ts)
```ts
export const PRESENTER_SCREENS: Partial<Record<GameMode, React.ComponentType>> = {
  'classic': ClassicPresenter, 'millionaire': MillionairePresenter, ...
};
```
Каждый презентер — отдельный файл `client/src/presenter/<mode>/<Mode>Presenter.tsx`, читает `useStore().gameState` и mode-события
(подписка на socket так же, как это делает соответствующий client/src/modes/<mode>/*Screen.tsx, но БЕЗ personal-событий и без действий).
Вёрстка под ТВ: крупный текст (вопрос 40-56px), тёмно-фиолетовый фон, жёлтые акценты, таймер крупно, табло игроков внизу/сбоку.

## Телефон игрока в интерактивной пати
- App.tsx: если `gameState.interactive` — VideoChat не рендерится, кнопка 📹 не показывается.
- Остальное — как сейчас (полноценный экран игрока).
