# Quiz Dungeon MVP — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a playable cooperative dungeon-crawl quiz game where 2-8 players connect from phones/desktops, see shared game state in real-time, and cooperatively answer questions to defeat monsters floor by floor.

**Architecture:** Monorepo with React+TypeScript client and Node.js+Socket.IO server. Server is authoritative — all game logic runs server-side, clients render received state. Each game room is a Socket.IO room with per-player channels for secret data (traps, curses). Mobile-first responsive PWA.

**Tech Stack:** Vite + React 18 + TypeScript + TailwindCSS (client), Node.js + Express + Socket.IO (server), in-memory state (no DB for MVP).

**MVP Scope:** Lobby → Class Selection → 4 floors (3 regular + 1 mini-boss) with 3 room types (Classic Battle, Voting, Trap) → Win/Lose screen. 6 classes with abilities. Team + personal HP. ~80 hardcoded questions.

---

## File Structure

```
quiz-dungeon/
├── client/
│   ├── index.html
│   ├── package.json
│   ├── tsconfig.json
│   ├── vite.config.ts
│   ├── tailwind.config.js
│   ├── postcss.config.js
│   └── src/
│       ├── main.tsx
│       ├── App.tsx
│       ├── socket.ts                  # Socket.IO client singleton
│       ├── store.ts                   # Zustand store for game state
│       ├── types.ts                   # Shared types (mirrored from server)
│       ├── components/
│       │   ├── PlayerCard.tsx         # Player avatar, class, HP
│       │   ├── MonsterCard.tsx        # Monster with HP bar
│       │   ├── AnswerButton.tsx       # Answer option button
│       │   ├── Timer.tsx             # Countdown timer
│       │   ├── HealthBar.tsx         # HP bar (team or personal)
│       │   ├── AbilityButton.tsx     # Class ability button
│       │   ├── FloorIndicator.tsx    # Current floor progress
│       │   └── VoteResults.tsx       # Voting results display
│       ├── screens/
│       │   ├── HomeScreen.tsx        # Create/Join room
│       │   ├── LobbyScreen.tsx       # Waiting room + class selection
│       │   ├── GameScreen.tsx        # Main game screen (routes to room type)
│       │   ├── BattleRoom.tsx        # Classic battle UI
│       │   ├── VotingRoom.tsx        # Voting room UI
│       │   ├── TrapRoom.tsx          # Individual trap UI
│       │   ├── BossRoom.tsx          # Boss fight UI
│       │   ├── RewardScreen.tsx      # Between-floor rewards
│       │   └── ResultScreen.tsx      # Win/Lose final screen
│       └── styles/
│           └── index.css             # Tailwind + custom styles
├── server/
│   ├── package.json
│   ├── tsconfig.json
│   └── src/
│       ├── index.ts                  # Express + Socket.IO server entry
│       ├── types.ts                  # Shared game types
│       ├── game/
│       │   ├── GameRoom.ts           # Core game room class
│       │   ├── GameLoop.ts           # Floor progression, turn management
│       │   ├── Combat.ts             # Damage calculation, monster HP
│       │   ├── Abilities.ts          # Class ability effects
│       │   └── FloorGenerator.ts     # Generate floor sequence
│       ├── rooms/
│       │   ├── BattleHandler.ts      # Classic battle room logic
│       │   ├── VotingHandler.ts      # Voting room logic
│       │   ├── TrapHandler.ts        # Trap room logic
│       │   └── BossHandler.ts        # Boss fight logic
│       ├── data/
│       │   ├── questions.ts          # Question bank (80+ questions)
│       │   ├── monsters.ts           # Monster definitions
│       │   └── classes.ts            # Class definitions + abilities
│       └── utils/
│           ├── RoomManager.ts        # Create/join/destroy rooms
│           └── TimerManager.ts       # Server-side timers
└── shared/
    └── types.ts                      # Types shared between client & server
```

---

### Task 1: Project Scaffolding

**Files:**
- Create: `package.json` (root)
- Create: `server/package.json`, `server/tsconfig.json`, `server/src/index.ts`
- Create: `client/package.json`, `client/tsconfig.json`, `client/vite.config.ts`, `client/tailwind.config.js`, `client/postcss.config.js`, `client/index.html`, `client/src/main.tsx`, `client/src/App.tsx`, `client/src/styles/index.css`
- Create: `shared/types.ts`

- [ ] **Step 1: Initialize root package.json**

```bash
cd /home/agent/quiz-dungeon
cat > package.json << 'EOF'
{
  "name": "quiz-dungeon",
  "private": true,
  "workspaces": ["client", "server", "shared"]
}
EOF
```

- [ ] **Step 2: Set up server**

```bash
cd /home/agent/quiz-dungeon
mkdir -p server/src
cd server
cat > package.json << 'PKGEOF'
{
  "name": "quiz-dungeon-server",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc",
    "start": "node dist/index.js"
  },
  "dependencies": {
    "express": "^4.21.0",
    "socket.io": "^4.7.5",
    "cors": "^2.8.5",
    "nanoid": "^5.0.7"
  },
  "devDependencies": {
    "typescript": "^5.5.0",
    "tsx": "^4.16.0",
    "@types/express": "^4.17.21",
    "@types/cors": "^2.8.17",
    "@types/node": "^22.0.0",
    "vitest": "^2.0.0"
  }
}
PKGEOF
```

```json
// server/tsconfig.json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true,
    "paths": { "@shared/*": ["../shared/*"] }
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

Server entry point (`server/src/index.ts`):

```typescript
import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const httpServer = createServer(app);

app.use(cors());
app.use(express.json());

const io = new Server(httpServer, {
  cors: { origin: '*', methods: ['GET', 'POST'] }
});

app.use(express.static(path.join(__dirname, '../../client/dist')));

app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, '../../client/dist/index.html'));
});

io.on('connection', (socket) => {
  console.log(`Player connected: ${socket.id}`);
  socket.on('disconnect', () => {
    console.log(`Player disconnected: ${socket.id}`);
  });
});

const PORT = process.env.PORT || 3333;
httpServer.listen(PORT, () => {
  console.log(`Quiz Dungeon server running on port ${PORT}`);
});

export { io };
```

- [ ] **Step 3: Set up client**

```bash
cd /home/agent/quiz-dungeon
npm create vite@latest client -- --template react-ts
cd client
npm install zustand socket.io-client
npm install -D tailwindcss @tailwindcss/vite
```

Update `client/vite.config.ts`:
```typescript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: {
      '/socket.io': { target: 'http://localhost:3333', ws: true }
    }
  }
});
```

`client/src/styles/index.css`:
```css
@import "tailwindcss";

:root {
  --color-dungeon-bg: #1a1a2e;
  --color-dungeon-surface: #16213e;
  --color-dungeon-accent: #e94560;
  --color-dungeon-gold: #f5c518;
  --color-dungeon-heal: #4ade80;
  --color-dungeon-mana: #60a5fa;
}

body {
  background: var(--color-dungeon-bg);
  color: #e0e0e0;
  font-family: 'Inter', system-ui, sans-serif;
  margin: 0;
  min-height: 100dvh;
  overflow-x: hidden;
}
```

`client/src/main.tsx`:
```tsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles/index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
```

`client/src/App.tsx`:
```tsx
export default function App() {
  return (
    <div className="min-h-dvh flex items-center justify-center">
      <h1 className="text-4xl font-bold text-[var(--color-dungeon-gold)]">
        ⚔️ Quiz Dungeon
      </h1>
    </div>
  );
}
```

- [ ] **Step 4: Create shared types**

`shared/types.ts`:
```typescript
export type PlayerClass = 'warrior' | 'mage' | 'healer' | 'scout' | 'bard' | 'blacksmith';

export type RoomType = 'battle' | 'voting' | 'trap' | 'boss';

export type GamePhase =
  | 'lobby'
  | 'class-select'
  | 'floor-intro'
  | 'question'
  | 'answering'
  | 'results'
  | 'reward'
  | 'victory'
  | 'defeat';

export interface Player {
  id: string;
  name: string;
  playerClass: PlayerClass | null;
  personalHp: number;
  maxPersonalHp: number;
  abilityCooldown: number;
  bonusDamage: number;
  isAlive: boolean;
  isReady: boolean;
  currentAnswer: number | null;
  streak: number;
}

export interface Monster {
  name: string;
  emoji: string;
  maxHp: number;
  currentHp: number;
  attack: number;
  isBoss: boolean;
}

export interface Question {
  id: string;
  text: string;
  options: string[];
  correctIndex: number;
  category: string;
  difficulty: 'easy' | 'medium' | 'hard';
}

export interface Floor {
  number: number;
  type: RoomType;
  monster: Monster | null;
  question: Question | null;
  isCompleted: boolean;
}

export interface GameState {
  roomCode: string;
  phase: GamePhase;
  players: Record<string, Player>;
  teamHp: number;
  maxTeamHp: number;
  currentFloor: number;
  totalFloors: number;
  floors: Floor[];
  timer: number;
  maxTimer: number;
  currentQuestion: Omit<Question, 'correctIndex'> | null;
  lastResults: RoundResult | null;
}

export interface RoundResult {
  correctIndex: number;
  playerAnswers: Record<string, number | null>;
  damageDealt: number;
  damageTaken: number;
  monsterDefeated: boolean;
  playersHit: string[];
}

export interface ClassDefinition {
  id: PlayerClass;
  name: string;
  nameRu: string;
  emoji: string;
  description: string;
  abilityName: string;
  abilityCooldown: number;
}

// Socket events: Client -> Server
export interface ClientEvents {
  'create-room': (playerName: string) => void;
  'join-room': (roomCode: string, playerName: string) => void;
  'select-class': (playerClass: PlayerClass) => void;
  'player-ready': () => void;
  'submit-answer': (answerIndex: number) => void;
  'use-ability': () => void;
  'start-game': () => void;
  'select-reward': (rewardId: string) => void;
}

// Socket events: Server -> Client
export interface ServerEvents {
  'room-created': (roomCode: string) => void;
  'room-joined': (state: GameState) => void;
  'game-state': (state: GameState) => void;
  'player-joined': (player: Player) => void;
  'player-left': (playerId: string) => void;
  'floor-start': (floor: Floor) => void;
  'question': (question: Omit<Question, 'correctIndex'>, timeLimit: number) => void;
  'timer-tick': (seconds: number) => void;
  'round-results': (results: RoundResult) => void;
  'ability-used': (playerId: string, ability: string, effect: string) => void;
  'game-over': (victory: boolean, stats: Record<string, unknown>) => void;
  'error': (message: string) => void;
  'personal-question': (question: Omit<Question, 'correctIndex'>, timeLimit: number) => void;
  'personal-result': (correct: boolean, hpLost: number) => void;
}
```

- [ ] **Step 5: Install dependencies and verify**

```bash
cd /home/agent/quiz-dungeon/server && npm install
cd /home/agent/quiz-dungeon/client && npm install
```

- [ ] **Step 6: Verify both start**

```bash
# Terminal 1:
cd /home/agent/quiz-dungeon/server && npm run dev
# Terminal 2:
cd /home/agent/quiz-dungeon/client && npm run dev
```

Expected: Server on :3333, Client on :5173, no errors.

- [ ] **Step 7: Commit**

```bash
cd /home/agent/quiz-dungeon
git init && git add -A && git commit -m "feat: project scaffolding — server + client + shared types"
```

---

### Task 2: Game Data — Questions, Monsters, Classes

**Files:**
- Create: `server/src/data/classes.ts`
- Create: `server/src/data/monsters.ts`
- Create: `server/src/data/questions.ts`

- [ ] **Step 1: Define classes**

`server/src/data/classes.ts`:
```typescript
import type { ClassDefinition } from '../../shared/types.ts';

export const CLASS_DEFINITIONS: ClassDefinition[] = [
  {
    id: 'warrior',
    name: 'Warrior',
    nameRu: 'Воин',
    emoji: '⚔️',
    description: 'Убирает 1 неправильный вариант у всей команды',
    abilityName: 'Удар правды',
    abilityCooldown: 3,
  },
  {
    id: 'mage',
    name: 'Mage',
    nameRu: 'Маг',
    emoji: '🧙',
    description: 'Останавливает таймер на 10 секунд',
    abilityName: 'Заморозка времени',
    abilityCooldown: 3,
  },
  {
    id: 'healer',
    name: 'Healer',
    nameRu: 'Лекарь',
    emoji: '💚',
    description: 'Восстанавливает 1 жизнь команде',
    abilityName: 'Исцеление',
    abilityCooldown: 4,
  },
  {
    id: 'scout',
    name: 'Scout',
    nameRu: 'Разведчик',
    emoji: '🔍',
    description: 'Подсматривает категорию следующего вопроса',
    abilityName: 'Разведка',
    abilityCooldown: 2,
  },
  {
    id: 'bard',
    name: 'Bard',
    nameRu: 'Бард',
    emoji: '🎵',
    description: 'Даёт +50% урон всей команде на 1 вопрос',
    abilityName: 'Боевой гимн',
    abilityCooldown: 3,
  },
  {
    id: 'blacksmith',
    name: 'Blacksmith',
    nameRu: 'Кузнец',
    emoji: '🔨',
    description: 'Перековывает провал в полуответ (половина урона)',
    abilityName: 'Перековка',
    abilityCooldown: 4,
  },
];
```

- [ ] **Step 2: Define monsters**

`server/src/data/monsters.ts`:
```typescript
export interface MonsterTemplate {
  name: string;
  emoji: string;
  hp: number;
  attack: number;
  isBoss: boolean;
  difficulty: 'easy' | 'medium' | 'hard' | 'boss';
}

export const MONSTERS: Record<string, MonsterTemplate[]> = {
  easy: [
    { name: 'Гоблин-стражник', emoji: '👺', hp: 3, attack: 1, isBoss: false, difficulty: 'easy' },
    { name: 'Скелет-лучник', emoji: '💀', hp: 3, attack: 1, isBoss: false, difficulty: 'easy' },
    { name: 'Гигантская крыса', emoji: '🐀', hp: 2, attack: 1, isBoss: false, difficulty: 'easy' },
    { name: 'Слизь', emoji: '🟢', hp: 2, attack: 1, isBoss: false, difficulty: 'easy' },
  ],
  medium: [
    { name: 'Орк-берсерк', emoji: '👹', hp: 5, attack: 1, isBoss: false, difficulty: 'medium' },
    { name: 'Тёмный маг', emoji: '🧙‍♂️', hp: 4, attack: 2, isBoss: false, difficulty: 'medium' },
    { name: 'Каменный голем', emoji: '🗿', hp: 6, attack: 1, isBoss: false, difficulty: 'medium' },
  ],
  hard: [
    { name: 'Вампир', emoji: '🧛', hp: 6, attack: 2, isBoss: false, difficulty: 'hard' },
    { name: 'Ледяной элементаль', emoji: '🥶', hp: 7, attack: 2, isBoss: false, difficulty: 'hard' },
    { name: 'Тёмный рыцарь', emoji: '🖤', hp: 8, attack: 2, isBoss: false, difficulty: 'hard' },
  ],
  boss: [
    { name: 'Минотавр', emoji: '🐂', hp: 12, attack: 2, isBoss: true, difficulty: 'boss' },
    { name: 'Дракон Невежества', emoji: '🐉', hp: 20, attack: 3, isBoss: true, difficulty: 'boss' },
  ],
};
```

- [ ] **Step 3: Create question bank (80 questions)**

`server/src/data/questions.ts`:
```typescript
import type { Question } from '../../shared/types.ts';
import { nanoid } from 'nanoid';

function q(text: string, options: string[], correctIndex: number, category: string, difficulty: Question['difficulty']): Question {
  return { id: nanoid(8), text, options, correctIndex, category, difficulty };
}

export const QUESTIONS: Question[] = [
  // === EASY (30) ===
  // География
  q('Столица Франции?', ['Берлин', 'Мадрид', 'Париж', 'Рим'], 2, 'География', 'easy'),
  q('Какой океан самый большой?', ['Атлантический', 'Тихий', 'Индийский', 'Северный Ледовитый'], 1, 'География', 'easy'),
  q('В какой стране находится Великая Китайская стена?', ['Япония', 'Монголия', 'Китай', 'Корея'], 2, 'География', 'easy'),
  q('Какая река самая длинная в мире?', ['Амазонка', 'Нил', 'Миссисипи', 'Янцзы'], 1, 'География', 'easy'),
  q('Столица Японии?', ['Осака', 'Киото', 'Токио', 'Нагоя'], 2, 'География', 'easy'),
  // Наука
  q('Химический символ воды?', ['H2O', 'CO2', 'NaCl', 'O2'], 0, 'Наука', 'easy'),
  q('Сколько планет в Солнечной системе?', ['7', '8', '9', '10'], 1, 'Наука', 'easy'),
  q('Какой газ мы вдыхаем?', ['CO2', 'Азот', 'Кислород', 'Гелий'], 2, 'Наука', 'easy'),
  q('Скорость света примерно...', ['300 км/с', '300 000 км/с', '30 000 км/с', '3 000 000 км/с'], 1, 'Наука', 'easy'),
  q('Самая большая планета Солнечной системы?', ['Сатурн', 'Юпитер', 'Нептун', 'Уран'], 1, 'Наука', 'easy'),
  // История
  q('В каком году человек впервые полетел в космос?', ['1957', '1961', '1965', '1969'], 1, 'История', 'easy'),
  q('Кто написал "Войну и мир"?', ['Достоевский', 'Толстой', 'Чехов', 'Пушкин'], 1, 'История', 'easy'),
  q('В каком веке была Французская революция?', ['XVII', 'XVIII', 'XIX', 'XX'], 1, 'История', 'easy'),
  q('Первый президент США?', ['Линкольн', 'Вашингтон', 'Джефферсон', 'Адамс'], 1, 'История', 'easy'),
  q('Кто открыл Америку?', ['Магеллан', 'Колумб', 'Васко да Гама', 'Кук'], 1, 'История', 'easy'),
  // Культура
  q('Кто нарисовал "Мону Лизу"?', ['Рафаэль', 'Микеланджело', 'Леонардо да Винчи', 'Боттичелли'], 2, 'Культура', 'easy'),
  q('Сколько нот в музыкальной гамме?', ['5', '6', '7', '8'], 2, 'Культура', 'easy'),
  q('Какой музыкальный инструмент имеет 88 клавиш?', ['Орган', 'Пианино', 'Аккордеон', 'Синтезатор'], 1, 'Культура', 'easy'),
  q('Автор "Гарри Поттера"?', ['Стивен Кинг', 'Дж. Р. Р. Толкин', 'Дж. К. Роулинг', 'К. С. Льюис'], 2, 'Культура', 'easy'),
  q('В каком городе находится Колизей?', ['Афины', 'Рим', 'Стамбул', 'Барселона'], 1, 'Культура', 'easy'),
  // Спорт и разное
  q('Сколько игроков в футбольной команде на поле?', ['9', '10', '11', '12'], 2, 'Спорт', 'easy'),
  q('Какой цвет получится при смешении красного и жёлтого?', ['Зелёный', 'Оранжевый', 'Фиолетовый', 'Коричневый'], 1, 'Разное', 'easy'),
  q('Сколько сторон у куба?', ['4', '6', '8', '12'], 1, 'Разное', 'easy'),
  q('Какое животное самое быстрое?', ['Лев', 'Гепард', 'Антилопа', 'Страус'], 1, 'Природа', 'easy'),
  q('Какая кость самая длинная в теле человека?', ['Плечевая', 'Бедренная', 'Большая берцовая', 'Лучевая'], 1, 'Наука', 'easy'),
  q('Столица Австралии?', ['Сидней', 'Мельбурн', 'Канберра', 'Перт'], 2, 'География', 'easy'),
  q('Кто изобрёл лампочку?', ['Тесла', 'Эдисон', 'Белл', 'Ньютон'], 1, 'Наука', 'easy'),
  q('Какой металл жидкий при комнатной температуре?', ['Олово', 'Ртуть', 'Свинец', 'Цинк'], 1, 'Наука', 'easy'),
  q('Сколько континентов на Земле?', ['5', '6', '7', '8'], 2, 'География', 'easy'),
  q('Что означает "E" в E=mc²?', ['Электричество', 'Энергия', 'Электрон', 'Эфир'], 1, 'Наука', 'easy'),

  // === MEDIUM (30) ===
  q('Какой элемент имеет атомный номер 79?', ['Серебро', 'Золото', 'Платина', 'Медь'], 1, 'Наука', 'medium'),
  q('В каком году пала Берлинская стена?', ['1987', '1989', '1991', '1993'], 1, 'История', 'medium'),
  q('Какая страна имеет больше всего часовых поясов?', ['Россия', 'США', 'Франция', 'Китай'], 2, 'География', 'medium'),
  q('Кто написал "Преступление и наказание"?', ['Толстой', 'Достоевский', 'Гоголь', 'Тургенев'], 1, 'Культура', 'medium'),
  q('Какая планета вращается на боку?', ['Нептун', 'Уран', 'Сатурн', 'Венера'], 1, 'Наука', 'medium'),
  q('Столица Канады?', ['Торонто', 'Ванкувер', 'Оттава', 'Монреаль'], 2, 'География', 'medium'),
  q('В каком году началась Первая мировая война?', ['1912', '1914', '1916', '1918'], 1, 'История', 'medium'),
  q('Какой витамин вырабатывается от солнечного света?', ['A', 'B12', 'C', 'D'], 3, 'Наука', 'medium'),
  q('Кто написал "Маленького принца"?', ['Виктор Гюго', 'Антуан де Сент-Экзюпери', 'Жюль Верн', 'Александр Дюма'], 1, 'Культура', 'medium'),
  q('Какой язык программирования создал Гвидо ван Россум?', ['Java', 'Ruby', 'Python', 'PHP'], 2, 'Наука', 'medium'),
  q('Самая маленькая страна в мире?', ['Монако', 'Ватикан', 'Сан-Марино', 'Лихтенштейн'], 1, 'География', 'medium'),
  q('Какое море самое солёное?', ['Каспийское', 'Красное', 'Мёртвое', 'Средиземное'], 2, 'География', 'medium'),
  q('Кто придумал теорию относительности?', ['Ньютон', 'Бор', 'Эйнштейн', 'Хокинг'], 2, 'Наука', 'medium'),
  q('В каком году был основан Google?', ['1996', '1998', '2000', '2002'], 1, 'Наука', 'medium'),
  q('Какой композитор был глухим?', ['Моцарт', 'Бах', 'Бетховен', 'Шопен'], 2, 'Культура', 'medium'),
  q('Столица Бразилии?', ['Рио-де-Жанейро', 'Сан-Паулу', 'Бразилиа', 'Сальвадор'], 2, 'География', 'medium'),
  q('Какой орган в теле самый большой?', ['Печень', 'Кожа', 'Лёгкие', 'Мозг'], 1, 'Наука', 'medium'),
  q('Сколько зубов у взрослого человека?', ['28', '30', '32', '34'], 2, 'Наука', 'medium'),
  q('Кто написал "1984"?', ['Хаксли', 'Оруэлл', 'Брэдбери', 'Замятин'], 1, 'Культура', 'medium'),
  q('Какая валюта в Японии?', ['Юань', 'Вона', 'Иена', 'Рупия'], 2, 'Разное', 'medium'),
  q('В каком году человек высадился на Луну?', ['1967', '1969', '1971', '1973'], 1, 'История', 'medium'),
  q('Какой процент Земли покрыт водой?', ['51%', '61%', '71%', '81%'], 2, 'География', 'medium'),
  q('Кто изобрёл телефон?', ['Эдисон', 'Белл', 'Тесла', 'Маркони'], 1, 'История', 'medium'),
  q('Какой самый распространённый элемент во Вселенной?', ['Кислород', 'Углерод', 'Водород', 'Гелий'], 2, 'Наука', 'medium'),
  q('Столица Турции?', ['Стамбул', 'Анкара', 'Измир', 'Анталья'], 1, 'География', 'medium'),
  q('Сколько хромосом у человека?', ['44', '46', '48', '50'], 1, 'Наука', 'medium'),
  q('Кто написал "Мастера и Маргариту"?', ['Булгаков', 'Пастернак', 'Шолохов', 'Набоков'], 0, 'Культура', 'medium'),
  q('Какой газ составляет большую часть атмосферы?', ['Кислород', 'Углекислый газ', 'Азот', 'Аргон'], 2, 'Наука', 'medium'),
  q('В какой стране изобрели порох?', ['Индия', 'Китай', 'Арабский халифат', 'Византия'], 1, 'История', 'medium'),
  q('Какое озеро самое глубокое в мире?', ['Каспийское', 'Виктория', 'Байкал', 'Танганьика'], 2, 'География', 'medium'),

  // === HARD (20) ===
  q('Какой учёный получил Нобелевскую премию и по физике, и по химии?', ['Эйнштейн', 'Кюри', 'Бор', 'Полинг'], 1, 'Наука', 'hard'),
  q('В каком году Константинополь стал Стамбулом официально?', ['1453', '1923', '1930', '1935'], 2, 'История', 'hard'),
  q('Какое число следует: 1, 1, 2, 3, 5, 8, ...?', ['11', '12', '13', '14'], 2, 'Разное', 'hard'),
  q('Самая длинная река в Европе?', ['Дунай', 'Рейн', 'Волга', 'Днепр'], 2, 'География', 'hard'),
  q('Кто написал "Божественную комедию"?', ['Петрарка', 'Боккаччо', 'Данте', 'Вергилий'], 2, 'Культура', 'hard'),
  q('Какой металл самый твёрдый?', ['Титан', 'Вольфрам', 'Хром', 'Осмий'], 2, 'Наука', 'hard'),
  q('В каком году была Битва при Ватерлоо?', ['1812', '1815', '1818', '1821'], 1, 'История', 'hard'),
  q('Какая страна имеет наибольшее число островов?', ['Индонезия', 'Филиппины', 'Швеция', 'Финляндия'], 2, 'География', 'hard'),
  q('Кто открыл пенициллин?', ['Пастер', 'Кох', 'Флеминг', 'Дженнер'], 2, 'Наука', 'hard'),
  q('Какой элемент имеет символ W?', ['Ванадий', 'Вольфрам', 'Висмут', 'Вал'], 1, 'Наука', 'hard'),
  q('Столица Мьянмы?', ['Рангун', 'Нейпьидо', 'Мандалай', 'Моламьяйн'], 1, 'География', 'hard'),
  q('Какой философ написал "Критику чистого разума"?', ['Гегель', 'Кант', 'Ницше', 'Шопенгауэр'], 1, 'Культура', 'hard'),
  q('Температура поверхности Солнца?', ['~3 500°C', '~5 500°C', '~7 500°C', '~10 000°C'], 1, 'Наука', 'hard'),
  q('Какое государство первым дало женщинам право голоса?', ['Финляндия', 'Новая Зеландия', 'Австралия', 'Норвегия'], 1, 'История', 'hard'),
  q('Сколько костей в теле взрослого человека?', ['196', '206', '216', '226'], 1, 'Наука', 'hard'),
  q('Кто написал "Улисса"?', ['Джойс', 'Фолкнер', 'Вулф', 'Пруст'], 0, 'Культура', 'hard'),
  q('Какая гора — вторая по высоте в мире?', ['Канченджанга', 'К2', 'Лхоцзе', 'Макалу'], 1, 'География', 'hard'),
  q('В каком году был принят первый стандарт HTML?', ['1991', '1993', '1995', '1997'], 1, 'Наука', 'hard'),
  q('Какая единица измерения силы тока?', ['Вольт', 'Ватт', 'Ампер', 'Ом'], 2, 'Наука', 'hard'),
  q('Кто основал Монгольскую империю?', ['Кублай-хан', 'Чингисхан', 'Тамерлан', 'Батый'], 1, 'История', 'hard'),
];

export function getQuestionsByDifficulty(difficulty: Question['difficulty']): Question[] {
  return QUESTIONS.filter(q => q.difficulty === difficulty);
}

export function pickRandomQuestions(difficulty: Question['difficulty'], count: number): Question[] {
  const pool = getQuestionsByDifficulty(difficulty);
  const shuffled = [...pool].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}
```

- [ ] **Step 4: Commit**

```bash
cd /home/agent/quiz-dungeon
git add -A && git commit -m "feat: game data — classes, monsters, question bank (80 questions)"
```

---

### Task 3: Room Manager — Create & Join

**Files:**
- Create: `server/src/utils/RoomManager.ts`
- Modify: `server/src/index.ts`

- [ ] **Step 1: Create RoomManager**

`server/src/utils/RoomManager.ts`:
```typescript
import { nanoid } from 'nanoid';
import type { GameState, Player, PlayerClass } from '../../shared/types.ts';

const rooms = new Map<string, GameState>();
const playerRooms = new Map<string, string>();

function generateRoomCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 4; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return rooms.has(code) ? generateRoomCode() : code;
}

export function createRoom(hostSocketId: string, hostName: string): GameState {
  const roomCode = generateRoomCode();
  const player: Player = {
    id: hostSocketId,
    name: hostName,
    playerClass: null,
    personalHp: 3,
    maxPersonalHp: 3,
    abilityCooldown: 0,
    bonusDamage: 0,
    isAlive: true,
    isReady: false,
    currentAnswer: null,
    streak: 0,
  };

  const state: GameState = {
    roomCode,
    phase: 'lobby',
    players: { [hostSocketId]: player },
    teamHp: 5,
    maxTeamHp: 5,
    currentFloor: 0,
    totalFloors: 8,
    floors: [],
    timer: 0,
    maxTimer: 0,
    currentQuestion: null,
    lastResults: null,
  };

  rooms.set(roomCode, state);
  playerRooms.set(hostSocketId, roomCode);
  return state;
}

export function joinRoom(roomCode: string, socketId: string, playerName: string): GameState | null {
  const state = rooms.get(roomCode.toUpperCase());
  if (!state) return null;
  if (state.phase !== 'lobby') return null;
  if (Object.keys(state.players).length >= 8) return null;

  const player: Player = {
    id: socketId,
    name: playerName,
    playerClass: null,
    personalHp: 3,
    maxPersonalHp: 3,
    abilityCooldown: 0,
    bonusDamage: 0,
    isAlive: true,
    isReady: false,
    currentAnswer: null,
    streak: 0,
  };

  state.players[socketId] = player;
  playerRooms.set(socketId, roomCode.toUpperCase());
  return state;
}

export function getRoom(roomCode: string): GameState | undefined {
  return rooms.get(roomCode.toUpperCase());
}

export function getRoomByPlayer(socketId: string): GameState | undefined {
  const code = playerRooms.get(socketId);
  return code ? rooms.get(code) : undefined;
}

export function removePlayer(socketId: string): { room: GameState; isEmpty: boolean } | null {
  const code = playerRooms.get(socketId);
  if (!code) return null;
  const room = rooms.get(code);
  if (!room) return null;

  delete room.players[socketId];
  playerRooms.delete(socketId);

  const isEmpty = Object.keys(room.players).length === 0;
  if (isEmpty) {
    rooms.delete(code);
  }
  return { room, isEmpty };
}

export function selectClass(socketId: string, playerClass: PlayerClass): GameState | null {
  const room = getRoomByPlayer(socketId);
  if (!room) return null;
  const player = room.players[socketId];
  if (!player) return null;
  player.playerClass = playerClass;
  return room;
}

export function setPlayerReady(socketId: string): GameState | null {
  const room = getRoomByPlayer(socketId);
  if (!room) return null;
  const player = room.players[socketId];
  if (!player) return null;
  player.isReady = true;
  return room;
}

export function allPlayersReady(room: GameState): boolean {
  return Object.values(room.players).every(p => p.isReady && p.playerClass !== null);
}
```

- [ ] **Step 2: Wire up Socket.IO events in server/src/index.ts**

Replace the `io.on('connection')` block:

```typescript
import { createRoom, joinRoom, getRoomByPlayer, removePlayer, selectClass, setPlayerReady, allPlayersReady } from './utils/RoomManager.ts';

io.on('connection', (socket) => {
  console.log(`Player connected: ${socket.id}`);

  socket.on('create-room', (playerName: string) => {
    const state = createRoom(socket.id, playerName);
    socket.join(state.roomCode);
    socket.emit('room-created', state.roomCode);
    socket.emit('game-state', state);
  });

  socket.on('join-room', (roomCode: string, playerName: string) => {
    const state = joinRoom(roomCode, socket.id, playerName);
    if (!state) {
      socket.emit('error', 'Комната не найдена или игра уже началась');
      return;
    }
    socket.join(state.roomCode);
    socket.emit('room-joined', state);
    io.to(state.roomCode).emit('game-state', state);
  });

  socket.on('select-class', (playerClass) => {
    const state = selectClass(socket.id, playerClass);
    if (state) io.to(state.roomCode).emit('game-state', state);
  });

  socket.on('player-ready', () => {
    const state = setPlayerReady(socket.id);
    if (state) io.to(state.roomCode).emit('game-state', state);
  });

  socket.on('disconnect', () => {
    const result = removePlayer(socket.id);
    if (result && !result.isEmpty) {
      io.to(result.room.roomCode).emit('game-state', result.room);
      io.to(result.room.roomCode).emit('player-left', socket.id);
    }
  });
});
```

- [ ] **Step 3: Verify server starts**

```bash
cd /home/agent/quiz-dungeon/server && npx tsx src/index.ts
```
Expected: "Quiz Dungeon server running on port 3333"

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "feat: room manager — create/join rooms, class selection, ready state"
```

---

### Task 4: Client — Socket Connection + State Store

**Files:**
- Create: `client/src/socket.ts`
- Create: `client/src/store.ts`
- Create: `client/src/types.ts`

- [ ] **Step 1: Socket client singleton**

`client/src/socket.ts`:
```typescript
import { io, Socket } from 'socket.io-client';
import type { ClientEvents, ServerEvents } from './types';

const URL = import.meta.env.DEV ? 'http://localhost:3333' : window.location.origin;

export const socket: Socket<ServerEvents, ClientEvents> = io(URL, {
  autoConnect: false,
  transports: ['websocket', 'polling'],
});
```

- [ ] **Step 2: Copy shared types to client**

`client/src/types.ts` — copy the full contents of `shared/types.ts` (same file).

- [ ] **Step 3: Zustand store**

`client/src/store.ts`:
```typescript
import { create } from 'zustand';
import type { GameState, GamePhase } from './types';
import { socket } from './socket';

interface GameStore {
  connected: boolean;
  playerId: string | null;
  playerName: string;
  roomCode: string | null;
  gameState: GameState | null;
  error: string | null;

  setPlayerName: (name: string) => void;
  createRoom: () => void;
  joinRoom: (code: string) => void;
  selectClass: (cls: string) => void;
  setReady: () => void;
  submitAnswer: (index: number) => void;
  useAbility: () => void;
  startGame: () => void;
  clearError: () => void;
}

export const useGameStore = create<GameStore>((set, get) => ({
  connected: false,
  playerId: null,
  playerName: '',
  roomCode: null,
  gameState: null,
  error: null,

  setPlayerName: (name) => set({ playerName: name }),

  createRoom: () => {
    const { playerName } = get();
    if (!playerName.trim()) return;
    socket.connect();
    socket.emit('create-room', playerName.trim());
  },

  joinRoom: (code) => {
    const { playerName } = get();
    if (!playerName.trim() || !code.trim()) return;
    socket.connect();
    socket.emit('join-room', code.trim().toUpperCase(), playerName.trim());
  },

  selectClass: (cls) => {
    socket.emit('select-class', cls as any);
  },

  setReady: () => {
    socket.emit('player-ready');
  },

  submitAnswer: (index) => {
    socket.emit('submit-answer', index);
  },

  useAbility: () => {
    socket.emit('use-ability');
  },

  startGame: () => {
    socket.emit('start-game');
  },

  clearError: () => set({ error: null }),
}));

// Socket event listeners
socket.on('connect', () => {
  useGameStore.setState({ connected: true, playerId: socket.id ?? null });
});

socket.on('disconnect', () => {
  useGameStore.setState({ connected: false });
});

socket.on('room-created', (roomCode) => {
  useGameStore.setState({ roomCode });
});

socket.on('room-joined', (state) => {
  useGameStore.setState({ roomCode: state.roomCode, gameState: state });
});

socket.on('game-state', (state) => {
  useGameStore.setState({ gameState: state });
});

socket.on('error', (message) => {
  useGameStore.setState({ error: message });
});
```

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "feat: client socket connection + zustand game store"
```

---

### Task 5: Home Screen — Create / Join Room

**Files:**
- Create: `client/src/screens/HomeScreen.tsx`
- Modify: `client/src/App.tsx`

- [ ] **Step 1: HomeScreen**

`client/src/screens/HomeScreen.tsx`:
```tsx
import { useState } from 'react';
import { useGameStore } from '../store';

export default function HomeScreen() {
  const { playerName, setPlayerName, createRoom, joinRoom, error, clearError } = useGameStore();
  const [joinCode, setJoinCode] = useState('');
  const [mode, setMode] = useState<'menu' | 'join'>('menu');

  return (
    <div className="min-h-dvh flex flex-col items-center justify-center p-4 gap-6">
      <div className="text-center">
        <div className="text-6xl mb-2">⚔️</div>
        <h1 className="text-4xl font-bold text-[var(--color-dungeon-gold)] mb-1">
          Quiz Dungeon
        </h1>
        <p className="text-gray-400 text-sm">Кооперативный квиз-данжен</p>
      </div>

      {error && (
        <div className="bg-red-900/50 border border-red-500 text-red-200 px-4 py-2 rounded-lg text-sm max-w-sm text-center" onClick={clearError}>
          {error}
        </div>
      )}

      <div className="w-full max-w-sm space-y-3">
        <input
          type="text"
          placeholder="Твоё имя"
          value={playerName}
          onChange={(e) => setPlayerName(e.target.value)}
          maxLength={20}
          className="w-full px-4 py-3 bg-[var(--color-dungeon-surface)] border border-gray-600 rounded-lg text-white text-center text-lg focus:border-[var(--color-dungeon-gold)] focus:outline-none"
        />

        {mode === 'menu' ? (
          <div className="space-y-3">
            <button
              onClick={createRoom}
              disabled={!playerName.trim()}
              className="w-full py-3 bg-[var(--color-dungeon-accent)] hover:bg-red-600 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold rounded-lg text-lg transition-colors"
            >
              🏰 Создать комнату
            </button>
            <button
              onClick={() => setMode('join')}
              disabled={!playerName.trim()}
              className="w-full py-3 bg-[var(--color-dungeon-surface)] hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold rounded-lg text-lg border border-gray-600 transition-colors"
            >
              🚪 Войти по коду
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <input
              type="text"
              placeholder="Код комнаты"
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
              maxLength={4}
              className="w-full px-4 py-3 bg-[var(--color-dungeon-surface)] border border-gray-600 rounded-lg text-white text-center text-2xl tracking-[0.3em] font-mono focus:border-[var(--color-dungeon-gold)] focus:outline-none uppercase"
            />
            <div className="flex gap-3">
              <button
                onClick={() => setMode('menu')}
                className="flex-1 py-3 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors"
              >
                Назад
              </button>
              <button
                onClick={() => joinRoom(joinCode)}
                disabled={joinCode.length < 4}
                className="flex-1 py-3 bg-[var(--color-dungeon-gold)] hover:bg-yellow-500 disabled:opacity-40 disabled:cursor-not-allowed text-black font-bold rounded-lg transition-colors"
              >
                Войти
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Wire up App.tsx with screen routing**

`client/src/App.tsx`:
```tsx
import { useGameStore } from './store';
import HomeScreen from './screens/HomeScreen';
import LobbyScreen from './screens/LobbyScreen';

export default function App() {
  const { gameState } = useGameStore();

  if (!gameState) return <HomeScreen />;

  switch (gameState.phase) {
    case 'lobby':
    case 'class-select':
      return <LobbyScreen />;
    default:
      return <HomeScreen />;
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add -A && git commit -m "feat: home screen — create/join room UI"
```

---

### Task 6: Lobby Screen — Class Selection + Ready

**Files:**
- Create: `client/src/screens/LobbyScreen.tsx`
- Create: `client/src/components/PlayerCard.tsx`

- [ ] **Step 1: PlayerCard component**

`client/src/components/PlayerCard.tsx`:
```tsx
import type { Player } from '../types';

const CLASS_EMOJI: Record<string, string> = {
  warrior: '⚔️', mage: '🧙', healer: '💚', scout: '🔍', bard: '🎵', blacksmith: '🔨',
};

const CLASS_NAME_RU: Record<string, string> = {
  warrior: 'Воин', mage: 'Маг', healer: 'Лекарь', scout: 'Разведчик', bard: 'Бард', blacksmith: 'Кузнец',
};

export default function PlayerCard({ player, isMe }: { player: Player; isMe: boolean }) {
  return (
    <div className={`flex items-center gap-3 px-3 py-2 rounded-lg ${isMe ? 'bg-[var(--color-dungeon-accent)]/20 border border-[var(--color-dungeon-accent)]' : 'bg-[var(--color-dungeon-surface)]'}`}>
      <div className="text-2xl">
        {player.playerClass ? CLASS_EMOJI[player.playerClass] : '❓'}
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-bold truncate">{player.name} {isMe && <span className="text-xs text-gray-400">(ты)</span>}</div>
        <div className="text-xs text-gray-400">
          {player.playerClass ? CLASS_NAME_RU[player.playerClass] : 'Выбирает класс...'}
        </div>
      </div>
      {player.isReady && (
        <div className="text-green-400 text-sm font-bold">✓</div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: LobbyScreen**

`client/src/screens/LobbyScreen.tsx`:
```tsx
import { useGameStore } from '../store';
import PlayerCard from '../components/PlayerCard';

const CLASSES = [
  { id: 'warrior', emoji: '⚔️', name: 'Воин', desc: 'Убирает 1 неправильный вариант' },
  { id: 'mage', emoji: '🧙', name: 'Маг', desc: 'Останавливает таймер на 10 сек' },
  { id: 'healer', emoji: '💚', name: 'Лекарь', desc: 'Восстанавливает 1 жизнь команде' },
  { id: 'scout', emoji: '🔍', name: 'Разведчик', desc: 'Подсматривает категорию вопроса' },
  { id: 'bard', emoji: '🎵', name: 'Бард', desc: '+50% урон команде на 1 вопрос' },
  { id: 'blacksmith', emoji: '🔨', name: 'Кузнец', desc: 'Перековывает провал в полуответ' },
];

export default function LobbyScreen() {
  const { gameState, playerId, selectClass, setReady, startGame } = useGameStore();
  if (!gameState) return null;

  const me = playerId ? gameState.players[playerId] : null;
  const players = Object.values(gameState.players);
  const allReady = players.length >= 2 && players.every(p => p.isReady && p.playerClass);
  const isHost = players[0]?.id === playerId;

  return (
    <div className="min-h-dvh flex flex-col p-4 max-w-lg mx-auto">
      {/* Room code header */}
      <div className="text-center mb-4">
        <div className="text-sm text-gray-400">Код комнаты</div>
        <div className="text-3xl font-mono font-bold tracking-[0.3em] text-[var(--color-dungeon-gold)]">
          {gameState.roomCode}
        </div>
        <div className="text-xs text-gray-500 mt-1">{players.length}/8 игроков</div>
      </div>

      {/* Players list */}
      <div className="space-y-2 mb-4">
        {players.map(p => (
          <PlayerCard key={p.id} player={p} isMe={p.id === playerId} />
        ))}
      </div>

      {/* Class selection */}
      {!me?.isReady && (
        <div className="mb-4">
          <div className="text-sm text-gray-400 mb-2 text-center">Выбери класс</div>
          <div className="grid grid-cols-2 gap-2">
            {CLASSES.map(cls => (
              <button
                key={cls.id}
                onClick={() => selectClass(cls.id)}
                className={`p-3 rounded-lg border text-left transition-all ${
                  me?.playerClass === cls.id
                    ? 'border-[var(--color-dungeon-gold)] bg-[var(--color-dungeon-gold)]/10'
                    : 'border-gray-700 bg-[var(--color-dungeon-surface)] hover:border-gray-500'
                }`}
              >
                <div className="text-2xl mb-1">{cls.emoji}</div>
                <div className="font-bold text-sm">{cls.name}</div>
                <div className="text-xs text-gray-400">{cls.desc}</div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Ready / Start buttons */}
      <div className="mt-auto space-y-2">
        {!me?.isReady && me?.playerClass && (
          <button
            onClick={setReady}
            className="w-full py-3 bg-[var(--color-dungeon-heal)] hover:bg-green-500 text-black font-bold rounded-lg text-lg transition-colors"
          >
            ✓ Готов!
          </button>
        )}

        {me?.isReady && !allReady && (
          <div className="text-center text-gray-400 py-3">Ожидание остальных игроков...</div>
        )}

        {isHost && allReady && (
          <button
            onClick={startGame}
            className="w-full py-4 bg-[var(--color-dungeon-gold)] hover:bg-yellow-500 text-black font-bold rounded-lg text-xl transition-colors animate-pulse"
          >
            ⚔️ Начать поход!
          </button>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add -A && git commit -m "feat: lobby screen — class selection, ready state, room code display"
```

---

### Task 7: Game Loop — Floor Generation + Turn System

**Files:**
- Create: `server/src/game/FloorGenerator.ts`
- Create: `server/src/game/GameLoop.ts`
- Create: `server/src/utils/TimerManager.ts`
- Modify: `server/src/index.ts`

- [ ] **Step 1: Floor generator**

`server/src/game/FloorGenerator.ts`:
```typescript
import type { Floor, RoomType } from '../../shared/types.ts';
import { MONSTERS } from '../data/monsters.ts';

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function monsterFromTemplate(t: typeof MONSTERS.easy[0]) {
  return { name: t.name, emoji: t.emoji, maxHp: t.hp, currentHp: t.hp, attack: t.attack, isBoss: t.isBoss };
}

export function generateFloors(playerCount: number): Floor[] {
  const floors: Floor[] = [];
  const roomTypes: RoomType[] = ['battle', 'voting', 'trap'];

  // Floors 1-3: easy
  for (let i = 1; i <= 3; i++) {
    const type = roomTypes[(i - 1) % roomTypes.length];
    floors.push({
      number: i,
      type,
      monster: type === 'battle' ? monsterFromTemplate(pickRandom(MONSTERS.easy)) : null,
      question: null,
      isCompleted: false,
    });
  }

  // Floor 4: mini-boss
  floors.push({
    number: 4,
    type: 'boss',
    monster: monsterFromTemplate(MONSTERS.boss[0]),
    question: null,
    isCompleted: false,
  });

  // Floors 5-7: medium
  for (let i = 5; i <= 7; i++) {
    const type = roomTypes[(i - 1) % roomTypes.length];
    const monster = type === 'battle' ? monsterFromTemplate(pickRandom(MONSTERS.medium)) : null;
    if (monster) {
      monster.maxHp = Math.ceil(monster.maxHp * (1 + playerCount * 0.15));
      monster.currentHp = monster.maxHp;
    }
    floors.push({ number: i, type, monster, question: null, isCompleted: false });
  }

  // Floor 8: final boss
  const finalBoss = monsterFromTemplate(MONSTERS.boss[1]);
  finalBoss.maxHp = Math.ceil(finalBoss.maxHp * (1 + playerCount * 0.2));
  finalBoss.currentHp = finalBoss.maxHp;
  floors.push({
    number: 8,
    type: 'boss',
    monster: finalBoss,
    question: null,
    isCompleted: false,
  });

  return floors;
}
```

- [ ] **Step 2: Timer manager**

`server/src/utils/TimerManager.ts`:
```typescript
const timers = new Map<string, NodeJS.Timeout>();
const intervals = new Map<string, NodeJS.Timeout>();

export function startTimer(roomCode: string, seconds: number, onTick: (remaining: number) => void, onEnd: () => void): void {
  clearTimer(roomCode);
  let remaining = seconds;

  const interval = setInterval(() => {
    remaining--;
    onTick(remaining);
    if (remaining <= 0) {
      clearTimer(roomCode);
      onEnd();
    }
  }, 1000);

  intervals.set(roomCode, interval);
}

export function clearTimer(roomCode: string): void {
  const interval = intervals.get(roomCode);
  if (interval) {
    clearInterval(interval);
    intervals.delete(roomCode);
  }
  const timer = timers.get(roomCode);
  if (timer) {
    clearTimeout(timer);
    timers.delete(roomCode);
  }
}

export function addTime(roomCode: string, seconds: number): void {
  // This is handled by GameLoop tracking remaining time
}
```

- [ ] **Step 3: Game loop**

`server/src/game/GameLoop.ts`:
```typescript
import type { Server } from 'socket.io';
import type { GameState, RoundResult, Question } from '../../shared/types.ts';
import { generateFloors } from './FloorGenerator.ts';
import { pickRandomQuestions } from '../data/questions.ts';
import { startTimer, clearTimer } from '../utils/TimerManager.ts';
import { getRoom } from '../utils/RoomManager.ts';

const usedQuestionIds = new Map<string, Set<string>>();

function getNextQuestion(roomCode: string, difficulty: Question['difficulty']): Question {
  if (!usedQuestionIds.has(roomCode)) usedQuestionIds.set(roomCode, new Set());
  const used = usedQuestionIds.get(roomCode)!;
  const questions = pickRandomQuestions(difficulty, 10);
  const fresh = questions.find(q => !used.has(q.id)) ?? questions[0];
  used.add(fresh.id);
  return fresh;
}

function getDifficulty(floorNum: number): Question['difficulty'] {
  if (floorNum <= 3) return 'easy';
  if (floorNum <= 7) return 'medium';
  return 'hard';
}

function getTimeLimit(floorNum: number): number {
  if (floorNum <= 3) return 25;
  if (floorNum <= 7) return 20;
  return 15;
}

export function startGame(io: Server, roomCode: string): void {
  const state = getRoom(roomCode);
  if (!state) return;

  const playerCount = Object.keys(state.players).length;
  state.floors = generateFloors(playerCount);
  state.currentFloor = 0;
  state.teamHp = 5;
  state.maxTeamHp = 5;

  Object.values(state.players).forEach(p => {
    p.personalHp = 3;
    p.maxPersonalHp = 3;
    p.isAlive = true;
    p.currentAnswer = null;
    p.streak = 0;
    p.abilityCooldown = 0;
  });

  nextFloor(io, state);
}

function nextFloor(io: Server, state: GameState): void {
  state.currentFloor++;

  if (state.currentFloor > state.totalFloors) {
    state.phase = 'victory';
    io.to(state.roomCode).emit('game-state', state);
    io.to(state.roomCode).emit('game-over', true, buildStats(state));
    cleanup(state.roomCode);
    return;
  }

  const floor = state.floors[state.currentFloor - 1];
  state.phase = 'floor-intro';
  state.lastResults = null;

  Object.values(state.players).forEach(p => {
    p.currentAnswer = null;
  });

  io.to(state.roomCode).emit('game-state', state);
  io.to(state.roomCode).emit('floor-start', floor);

  setTimeout(() => {
    startFloorQuestion(io, state);
  }, 3000);
}

function startFloorQuestion(io: Server, state: GameState): void {
  const floor = state.floors[state.currentFloor - 1];
  const difficulty = getDifficulty(state.currentFloor);
  const question = getNextQuestion(state.roomCode, difficulty);
  const timeLimit = getTimeLimit(state.currentFloor);

  floor.question = question;
  state.phase = 'answering';
  state.currentQuestion = { id: question.id, text: question.text, options: question.options, category: question.category, difficulty: question.difficulty };
  state.timer = timeLimit;
  state.maxTimer = timeLimit;

  Object.values(state.players).forEach(p => { p.currentAnswer = null; });

  if (floor.type === 'trap') {
    // Each player gets their own question
    const alivePlayers = Object.values(state.players).filter(p => p.isAlive);
    alivePlayers.forEach(p => {
      const personalQ = getNextQuestion(state.roomCode, difficulty);
      const socket = io.sockets.sockets.get(p.id);
      if (socket) {
        socket.emit('personal-question', { id: personalQ.id, text: personalQ.text, options: personalQ.options, category: personalQ.category, difficulty: personalQ.difficulty }, timeLimit);
        (p as any)._personalQuestion = personalQ;
      }
    });
  }

  io.to(state.roomCode).emit('game-state', state);
  if (floor.type !== 'trap') {
    io.to(state.roomCode).emit('question', state.currentQuestion!, timeLimit);
  }

  startTimer(state.roomCode, timeLimit,
    (remaining) => {
      state.timer = remaining;
      io.to(state.roomCode).emit('timer-tick', remaining);
    },
    () => resolveRound(io, state)
  );
}

export function submitAnswer(io: Server, socketId: string, state: GameState, answerIndex: number): void {
  const player = state.players[socketId];
  if (!player || !player.isAlive || state.phase !== 'answering') return;
  if (player.currentAnswer !== null) return;

  player.currentAnswer = answerIndex;
  io.to(state.roomCode).emit('game-state', state);

  const alivePlayers = Object.values(state.players).filter(p => p.isAlive);
  const allAnswered = alivePlayers.every(p => p.currentAnswer !== null);
  if (allAnswered) {
    clearTimer(state.roomCode);
    resolveRound(io, state);
  }
}

function resolveRound(io: Server, state: GameState): void {
  const floor = state.floors[state.currentFloor - 1];
  if (!floor) return;
  if (state.phase === 'results') return;

  state.phase = 'results';

  if (floor.type === 'trap') {
    resolveTrap(io, state);
    return;
  }

  const question = floor.question;
  if (!question) return;

  const alivePlayers = Object.values(state.players).filter(p => p.isAlive);
  let correctCount = 0;
  const playerAnswers: Record<string, number | null> = {};

  alivePlayers.forEach(p => {
    playerAnswers[p.id] = p.currentAnswer;
    if (p.currentAnswer === question.correctIndex) {
      correctCount++;
      p.streak++;
    } else {
      p.streak = 0;
    }
  });

  let damageDealt = correctCount;
  let damageTaken = 0;
  let monsterDefeated = false;
  const playersHit: string[] = [];

  if (floor.type === 'battle' || floor.type === 'boss') {
    if (floor.monster) {
      floor.monster.currentHp = Math.max(0, floor.monster.currentHp - damageDealt);
      monsterDefeated = floor.monster.currentHp <= 0;

      if (!monsterDefeated) {
        damageTaken = floor.monster.attack;
        state.teamHp = Math.max(0, state.teamHp - damageTaken);
      }
    }
  } else if (floor.type === 'voting') {
    const votes: Record<number, number> = {};
    alivePlayers.forEach(p => {
      if (p.currentAnswer !== null) {
        votes[p.currentAnswer] = (votes[p.currentAnswer] || 0) + 1;
      }
    });
    const majorityVote = Object.entries(votes).sort((a, b) => b[1] - a[1])[0];
    if (majorityVote && parseInt(majorityVote[0]) === question.correctIndex) {
      damageDealt = 1;
      monsterDefeated = true;
    } else {
      state.teamHp = Math.max(0, state.teamHp - 1);
      damageTaken = 1;
    }
  }

  const result: RoundResult = { correctIndex: question.correctIndex, playerAnswers, damageDealt, damageTaken, monsterDefeated, playersHit };
  state.lastResults = result;

  io.to(state.roomCode).emit('round-results', result);
  io.to(state.roomCode).emit('game-state', state);

  if (state.teamHp <= 0) {
    setTimeout(() => {
      state.phase = 'defeat';
      io.to(state.roomCode).emit('game-state', state);
      io.to(state.roomCode).emit('game-over', false, buildStats(state));
      cleanup(state.roomCode);
    }, 4000);
    return;
  }

  if (floor.type === 'boss' && floor.monster && !monsterDefeated) {
    setTimeout(() => {
      startFloorQuestion(io, state);
    }, 4000);
    return;
  }

  setTimeout(() => {
    floor.isCompleted = true;
    // Reduce ability cooldowns
    Object.values(state.players).forEach(p => {
      if (p.abilityCooldown > 0) p.abilityCooldown--;
    });
    nextFloor(io, state);
  }, 4000);
}

function resolveTrap(io: Server, state: GameState): void {
  const alivePlayers = Object.values(state.players).filter(p => p.isAlive);
  const playersHit: string[] = [];

  alivePlayers.forEach(p => {
    const personalQ = (p as any)._personalQuestion as Question | undefined;
    if (!personalQ) return;

    const correct = p.currentAnswer === personalQ.correctIndex;
    if (!correct) {
      p.personalHp = Math.max(0, p.personalHp - 1);
      playersHit.push(p.id);
      if (p.personalHp <= 0) p.isAlive = false;
    } else {
      p.streak++;
    }

    const socket = io.sockets.sockets.get(p.id);
    if (socket) {
      socket.emit('personal-result', correct, correct ? 0 : 1);
    }

    delete (p as any)._personalQuestion;
  });

  const result: RoundResult = { correctIndex: -1, playerAnswers: {}, damageDealt: 0, damageTaken: playersHit.length, monsterDefeated: true, playersHit };
  state.lastResults = result;

  io.to(state.roomCode).emit('round-results', result);
  io.to(state.roomCode).emit('game-state', state);

  const anyAlive = Object.values(state.players).some(p => p.isAlive);
  if (!anyAlive) {
    setTimeout(() => {
      state.phase = 'defeat';
      io.to(state.roomCode).emit('game-state', state);
      io.to(state.roomCode).emit('game-over', false, buildStats(state));
      cleanup(state.roomCode);
    }, 4000);
    return;
  }

  setTimeout(() => {
    state.floors[state.currentFloor - 1].isCompleted = true;
    Object.values(state.players).forEach(p => {
      if (p.abilityCooldown > 0) p.abilityCooldown--;
    });
    nextFloor(io, state);
  }, 4000);
}

function buildStats(state: GameState): Record<string, unknown> {
  return {
    floorsCleared: state.floors.filter(f => f.isCompleted).length,
    totalFloors: state.totalFloors,
    teamHpRemaining: state.teamHp,
    players: Object.values(state.players).map(p => ({
      name: p.name,
      class: p.playerClass,
      alive: p.isAlive,
      personalHp: p.personalHp,
      streak: p.streak,
    })),
  };
}

function cleanup(roomCode: string): void {
  clearTimer(roomCode);
  usedQuestionIds.delete(roomCode);
}
```

- [ ] **Step 4: Wire start-game and submit-answer in server/src/index.ts**

Add to the connection handler:
```typescript
import { startGame, submitAnswer } from './game/GameLoop.ts';

// Inside io.on('connection', (socket) => { ... })

  socket.on('start-game', () => {
    const room = getRoomByPlayer(socket.id);
    if (!room) return;
    const players = Object.values(room.players);
    if (players.length < 2) { socket.emit('error', 'Нужно минимум 2 игрока'); return; }
    if (!players.every(p => p.isReady && p.playerClass)) { socket.emit('error', 'Не все игроки готовы'); return; }
    startGame(io, room.roomCode);
  });

  socket.on('submit-answer', (answerIndex: number) => {
    const room = getRoomByPlayer(socket.id);
    if (!room) return;
    submitAnswer(io, socket.id, room, answerIndex);
  });
```

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: game loop — floor generation, turn system, battle/voting/trap/boss resolution"
```

---

### Task 8: Game Screen — Battle Room UI

**Files:**
- Create: `client/src/screens/GameScreen.tsx`
- Create: `client/src/screens/BattleRoom.tsx`
- Create: `client/src/components/MonsterCard.tsx`
- Create: `client/src/components/AnswerButton.tsx`
- Create: `client/src/components/Timer.tsx`
- Create: `client/src/components/HealthBar.tsx`
- Create: `client/src/components/FloorIndicator.tsx`
- Modify: `client/src/App.tsx`

- [ ] **Step 1: HealthBar component**

`client/src/components/HealthBar.tsx`:
```tsx
export default function HealthBar({ current, max, color = 'red', label }: { current: number; max: number; color?: string; label?: string }) {
  const pct = Math.max(0, (current / max) * 100);
  const colors: Record<string, string> = {
    red: 'bg-red-500',
    green: 'bg-green-500',
    blue: 'bg-blue-500',
    gold: 'bg-yellow-500',
  };

  return (
    <div className="w-full">
      {label && <div className="text-xs text-gray-400 mb-0.5">{label}</div>}
      <div className="h-3 bg-gray-700 rounded-full overflow-hidden">
        <div
          className={`h-full ${colors[color] || colors.red} transition-all duration-500 rounded-full`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="text-xs text-gray-400 text-right">{current}/{max}</div>
    </div>
  );
}
```

- [ ] **Step 2: Timer component**

`client/src/components/Timer.tsx`:
```tsx
export default function Timer({ seconds, maxSeconds }: { seconds: number; maxSeconds: number }) {
  const pct = (seconds / maxSeconds) * 100;
  const isLow = seconds <= 5;

  return (
    <div className="text-center">
      <div className={`text-3xl font-mono font-bold ${isLow ? 'text-red-400 animate-pulse' : 'text-white'}`}>
        {seconds}
      </div>
      <div className="h-1.5 bg-gray-700 rounded-full mt-1 overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-1000 ${isLow ? 'bg-red-500' : 'bg-[var(--color-dungeon-mana)]'}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
```

- [ ] **Step 3: MonsterCard component**

`client/src/components/MonsterCard.tsx`:
```tsx
import type { Monster } from '../types';
import HealthBar from './HealthBar';

export default function MonsterCard({ monster }: { monster: Monster }) {
  const hurtAnimation = monster.currentHp < monster.maxHp ? 'animate-bounce' : '';

  return (
    <div className="text-center">
      <div className={`text-6xl mb-2 ${hurtAnimation}`}>
        {monster.emoji}
      </div>
      <div className="font-bold text-lg">{monster.name}</div>
      <div className="max-w-48 mx-auto mt-1">
        <HealthBar current={monster.currentHp} max={monster.maxHp} color="red" />
      </div>
      {monster.isBoss && (
        <div className="text-xs text-[var(--color-dungeon-accent)] font-bold mt-1">⚔️ БОСС</div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: AnswerButton component**

`client/src/components/AnswerButton.tsx`:
```tsx
interface Props {
  index: number;
  text: string;
  onClick: () => void;
  disabled: boolean;
  selected: boolean;
  correct?: boolean | null;
  showResult: boolean;
}

const LETTERS = ['A', 'B', 'C', 'D'];

export default function AnswerButton({ index, text, onClick, disabled, selected, correct, showResult }: Props) {
  let bg = 'bg-[var(--color-dungeon-surface)] border-gray-600 hover:border-gray-400';
  if (selected && !showResult) bg = 'bg-[var(--color-dungeon-mana)]/20 border-[var(--color-dungeon-mana)]';
  if (showResult && correct === true) bg = 'bg-green-900/50 border-green-500';
  if (showResult && selected && correct === false) bg = 'bg-red-900/50 border-red-500';

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`w-full p-3 rounded-lg border text-left transition-all ${bg} disabled:cursor-default`}
    >
      <span className="font-bold text-[var(--color-dungeon-gold)] mr-2">{LETTERS[index]}</span>
      <span>{text}</span>
    </button>
  );
}
```

- [ ] **Step 5: FloorIndicator component**

`client/src/components/FloorIndicator.tsx`:
```tsx
export default function FloorIndicator({ current, total }: { current: number; total: number }) {
  return (
    <div className="flex items-center gap-1 justify-center">
      {Array.from({ length: total }, (_, i) => {
        const floorNum = i + 1;
        const isCurrent = floorNum === current;
        const isPast = floorNum < current;
        const isBoss = floorNum === 4 || floorNum === total;

        return (
          <div
            key={i}
            className={`w-6 h-6 rounded text-xs flex items-center justify-center font-bold transition-all ${
              isCurrent ? 'bg-[var(--color-dungeon-gold)] text-black scale-125' :
              isPast ? 'bg-green-700 text-green-200' :
              'bg-gray-700 text-gray-500'
            }`}
          >
            {isBoss ? '💀' : floorNum}
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 6: BattleRoom screen**

`client/src/screens/BattleRoom.tsx`:
```tsx
import { useGameStore } from '../store';
import MonsterCard from '../components/MonsterCard';
import AnswerButton from '../components/AnswerButton';
import Timer from '../components/Timer';

export default function BattleRoom() {
  const { gameState, playerId, submitAnswer } = useGameStore();
  if (!gameState) return null;

  const floor = gameState.floors[gameState.currentFloor - 1];
  const question = gameState.currentQuestion;
  const me = playerId ? gameState.players[playerId] : null;
  const showResult = gameState.phase === 'results';
  const results = gameState.lastResults;

  return (
    <div className="flex flex-col gap-4 flex-1">
      {/* Monster */}
      {floor?.monster && <MonsterCard monster={floor.monster} />}

      {/* Timer */}
      {gameState.phase === 'answering' && (
        <Timer seconds={gameState.timer} maxSeconds={gameState.maxTimer} />
      )}

      {/* Question */}
      {question && (
        <div className="text-center">
          <div className="text-xs text-[var(--color-dungeon-mana)] mb-1">{question.category}</div>
          <div className="text-lg font-bold px-2">{question.text}</div>
        </div>
      )}

      {/* Answers */}
      {question && (
        <div className="space-y-2 px-2">
          {question.options.map((opt, i) => (
            <AnswerButton
              key={i}
              index={i}
              text={opt}
              onClick={() => submitAnswer(i)}
              disabled={me?.currentAnswer !== null || showResult || !me?.isAlive}
              selected={me?.currentAnswer === i}
              correct={showResult ? i === results?.correctIndex : null}
              showResult={showResult}
            />
          ))}
        </div>
      )}

      {/* Results summary */}
      {showResult && results && (
        <div className="text-center text-sm">
          {results.damageDealt > 0 && (
            <div className="text-green-400">⚔️ Нанесено урона: {results.damageDealt}</div>
          )}
          {results.damageTaken > 0 && (
            <div className="text-red-400">💔 Команда потеряла {results.damageTaken} HP</div>
          )}
          {results.monsterDefeated && (
            <div className="text-[var(--color-dungeon-gold)] font-bold text-lg mt-1">🎉 Монстр повержен!</div>
          )}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 7: GameScreen (main wrapper)**

`client/src/screens/GameScreen.tsx`:
```tsx
import { useGameStore } from '../store';
import BattleRoom from './BattleRoom';
import VotingRoom from './VotingRoom';
import TrapRoom from './TrapRoom';
import HealthBar from '../components/HealthBar';
import FloorIndicator from '../components/FloorIndicator';

export default function GameScreen() {
  const { gameState, playerId } = useGameStore();
  if (!gameState) return null;

  const floor = gameState.floors[gameState.currentFloor - 1];
  const me = playerId ? gameState.players[playerId] : null;
  const players = Object.values(gameState.players);

  const roomTypeLabel: Record<string, string> = {
    battle: '⚔️ Бой',
    voting: '🗳️ Голосование',
    trap: '🪤 Ловушка',
    boss: '💀 Босс',
  };

  return (
    <div className="min-h-dvh flex flex-col p-3 max-w-lg mx-auto">
      {/* Top bar: team HP + floor */}
      <div className="mb-3 space-y-2">
        <FloorIndicator current={gameState.currentFloor} total={gameState.totalFloors} />
        <HealthBar current={gameState.teamHp} max={gameState.maxTeamHp} color="red" label="❤️ Жизни команды" />
        {me && (
          <HealthBar current={me.personalHp} max={me.maxPersonalHp} color="blue" label="🛡️ Мои жизни" />
        )}
      </div>

      {/* Floor intro */}
      {gameState.phase === 'floor-intro' && floor && (
        <div className="flex-1 flex flex-col items-center justify-center text-center animate-pulse">
          <div className="text-5xl mb-3">{floor.monster?.emoji || '🚪'}</div>
          <div className="text-2xl font-bold text-[var(--color-dungeon-gold)]">
            Этаж {gameState.currentFloor}
          </div>
          <div className="text-gray-400">{roomTypeLabel[floor.type]}</div>
        </div>
      )}

      {/* Room content */}
      {(gameState.phase === 'answering' || gameState.phase === 'results') && floor && (
        <>
          {(floor.type === 'battle' || floor.type === 'boss') && <BattleRoom />}
          {floor.type === 'voting' && <VotingRoom />}
          {floor.type === 'trap' && <TrapRoom />}
        </>
      )}

      {/* Player strip at bottom */}
      <div className="mt-auto pt-3 flex gap-2 justify-center flex-wrap">
        {players.map(p => {
          const answered = p.currentAnswer !== null;
          return (
            <div
              key={p.id}
              className={`px-2 py-1 rounded text-xs ${!p.isAlive ? 'opacity-30' : answered ? 'bg-green-900/50 text-green-300' : 'bg-gray-800 text-gray-400'}`}
            >
              {p.name} {!p.isAlive ? '👻' : ''}
            </div>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 8: Create VotingRoom placeholder**

`client/src/screens/VotingRoom.tsx`:
```tsx
import BattleRoom from './BattleRoom';

export default function VotingRoom() {
  return (
    <div>
      <div className="text-center text-sm text-[var(--color-dungeon-mana)] mb-2">
        🗳️ Обсудите вопрос и проголосуйте — считается большинство!
      </div>
      <BattleRoom />
    </div>
  );
}
```

- [ ] **Step 9: Create TrapRoom**

`client/src/screens/TrapRoom.tsx`:
```tsx
import { useState, useEffect } from 'react';
import { useGameStore } from '../store';
import AnswerButton from '../components/AnswerButton';
import Timer from '../components/Timer';
import { socket } from '../socket';
import type { Question } from '../types';

export default function TrapRoom() {
  const { gameState, playerId, submitAnswer } = useGameStore();
  const [personalQuestion, setPersonalQuestion] = useState<Omit<Question, 'correctIndex'> | null>(null);
  const [personalResult, setPersonalResult] = useState<{ correct: boolean; hpLost: number } | null>(null);
  const me = playerId ? gameState?.players[playerId] : null;

  useEffect(() => {
    const onPersonalQ = (q: Omit<Question, 'correctIndex'>, _timeLimit: number) => {
      setPersonalQuestion(q);
      setPersonalResult(null);
    };
    const onPersonalR = (correct: boolean, hpLost: number) => {
      setPersonalResult({ correct, hpLost });
    };

    socket.on('personal-question', onPersonalQ);
    socket.on('personal-result', onPersonalR);
    return () => {
      socket.off('personal-question', onPersonalQ);
      socket.off('personal-result', onPersonalR);
    };
  }, []);

  if (!gameState) return null;
  const showResult = gameState.phase === 'results';
  const question = personalQuestion || gameState.currentQuestion;

  return (
    <div className="flex flex-col gap-4 flex-1">
      <div className="text-center">
        <div className="text-3xl mb-2">🪤</div>
        <div className="text-sm text-red-400 font-bold">Ловушка! Каждый отвечает сам!</div>
      </div>

      {gameState.phase === 'answering' && (
        <Timer seconds={gameState.timer} maxSeconds={gameState.maxTimer} />
      )}

      {question && (
        <>
          <div className="text-center">
            <div className="text-xs text-[var(--color-dungeon-mana)] mb-1">{question.category}</div>
            <div className="text-lg font-bold px-2">{question.text}</div>
          </div>

          <div className="space-y-2 px-2">
            {question.options.map((opt, i) => (
              <AnswerButton
                key={i}
                index={i}
                text={opt}
                onClick={() => submitAnswer(i)}
                disabled={me?.currentAnswer !== null || showResult || !me?.isAlive}
                selected={me?.currentAnswer === i}
                correct={null}
                showResult={showResult}
              />
            ))}
          </div>
        </>
      )}

      {showResult && personalResult && (
        <div className={`text-center text-lg font-bold ${personalResult.correct ? 'text-green-400' : 'text-red-400'}`}>
          {personalResult.correct ? '✅ Ты прошёл ловушку!' : `💔 Ловушка сработала! -${personalResult.hpLost} HP`}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 10: Update App.tsx routing**

`client/src/App.tsx`:
```tsx
import { useGameStore } from './store';
import HomeScreen from './screens/HomeScreen';
import LobbyScreen from './screens/LobbyScreen';
import GameScreen from './screens/GameScreen';
import ResultScreen from './screens/ResultScreen';

export default function App() {
  const { gameState } = useGameStore();

  if (!gameState) return <HomeScreen />;

  switch (gameState.phase) {
    case 'lobby':
    case 'class-select':
      return <LobbyScreen />;
    case 'victory':
    case 'defeat':
      return <ResultScreen />;
    default:
      return <GameScreen />;
  }
}
```

- [ ] **Step 11: Create ResultScreen**

`client/src/screens/ResultScreen.tsx`:
```tsx
import { useGameStore } from '../store';

export default function ResultScreen() {
  const { gameState } = useGameStore();
  if (!gameState) return null;

  const victory = gameState.phase === 'victory';
  const players = Object.values(gameState.players);
  const floorsCleared = gameState.floors.filter(f => f.isCompleted).length;

  return (
    <div className="min-h-dvh flex flex-col items-center justify-center p-4 text-center">
      <div className="text-7xl mb-4">{victory ? '🏆' : '💀'}</div>
      <h1 className={`text-3xl font-bold mb-2 ${victory ? 'text-[var(--color-dungeon-gold)]' : 'text-red-400'}`}>
        {victory ? 'ПОБЕДА!' : 'ПОРАЖЕНИЕ'}
      </h1>
      <p className="text-gray-400 mb-6">
        {victory ? 'Башня Знаний покорена!' : `Вы дошли до этажа ${gameState.currentFloor}`}
      </p>

      <div className="bg-[var(--color-dungeon-surface)] rounded-lg p-4 w-full max-w-sm mb-4">
        <div className="text-sm text-gray-400 mb-2">Статистика</div>
        <div className="text-lg">Этажей пройдено: <span className="font-bold text-white">{floorsCleared}/{gameState.totalFloors}</span></div>
        <div className="text-lg">Жизней осталось: <span className="font-bold text-red-400">❤️ {gameState.teamHp}</span></div>
      </div>

      <div className="bg-[var(--color-dungeon-surface)] rounded-lg p-4 w-full max-w-sm">
        <div className="text-sm text-gray-400 mb-2">Команда</div>
        {players.map(p => (
          <div key={p.id} className="flex items-center justify-between py-1">
            <span>{p.isAlive ? '🟢' : '👻'} {p.name}</span>
            <span className="text-xs text-gray-400">❤️ {p.personalHp}/{p.maxPersonalHp}</span>
          </div>
        ))}
      </div>

      <button
        onClick={() => window.location.reload()}
        className="mt-6 px-6 py-3 bg-[var(--color-dungeon-accent)] hover:bg-red-600 text-white font-bold rounded-lg text-lg"
      >
        🔄 Новая игра
      </button>
    </div>
  );
}
```

- [ ] **Step 12: Commit**

```bash
git add -A && git commit -m "feat: game UI — battle/voting/trap rooms, monster cards, timer, health bars, results screen"
```

---

### Task 9: Class Abilities

**Files:**
- Create: `server/src/game/Abilities.ts`
- Modify: `server/src/index.ts` (add use-ability handler)
- Create: `client/src/components/AbilityButton.tsx`
- Modify: `client/src/screens/GameScreen.tsx` (add ability button)

- [ ] **Step 1: Server ability logic**

`server/src/game/Abilities.ts`:
```typescript
import type { Server } from 'socket.io';
import type { GameState } from '../../shared/types.ts';
import { CLASS_DEFINITIONS } from '../data/classes.ts';

export function useAbility(io: Server, socketId: string, state: GameState): boolean {
  const player = state.players[socketId];
  if (!player || !player.isAlive || !player.playerClass) return false;
  if (player.abilityCooldown > 0) return false;
  if (state.phase !== 'answering') return false;

  const classDef = CLASS_DEFINITIONS.find(c => c.id === player.playerClass);
  if (!classDef) return false;

  let effectMessage = '';

  switch (player.playerClass) {
    case 'warrior': {
      // Remove 1 wrong option — handled client-side via event
      effectMessage = 'убрал 1 неправильный вариант!';
      io.to(state.roomCode).emit('ability-used', socketId, 'warrior', effectMessage);
      break;
    }
    case 'mage': {
      // Add 10 seconds to timer
      state.timer += 10;
      state.maxTimer += 10;
      effectMessage = 'заморозил время (+10 сек)!';
      io.to(state.roomCode).emit('ability-used', socketId, 'mage', effectMessage);
      break;
    }
    case 'healer': {
      state.teamHp = Math.min(state.maxTeamHp, state.teamHp + 1);
      effectMessage = 'исцелил команду (+1 HP)!';
      io.to(state.roomCode).emit('ability-used', socketId, 'healer', effectMessage);
      break;
    }
    case 'scout': {
      const nextFloor = state.floors[state.currentFloor];
      if (nextFloor?.question) {
        effectMessage = `разведал: следующий вопрос — ${nextFloor.question.category}`;
      } else {
        effectMessage = 'разведал путь вперёд';
      }
      io.to(state.roomCode).emit('ability-used', socketId, 'scout', effectMessage);
      break;
    }
    case 'bard': {
      Object.values(state.players).forEach(p => { p.bonusDamage += 0.5; });
      effectMessage = 'вдохновил команду (+50% урон)!';
      io.to(state.roomCode).emit('ability-used', socketId, 'bard', effectMessage);
      break;
    }
    case 'blacksmith': {
      effectMessage = 'подготовил перековку (провал = полуответ)';
      io.to(state.roomCode).emit('ability-used', socketId, 'blacksmith', effectMessage);
      break;
    }
  }

  player.abilityCooldown = classDef.abilityCooldown;
  io.to(state.roomCode).emit('game-state', state);
  return true;
}
```

- [ ] **Step 2: Wire ability in server/src/index.ts**

Add import and handler:
```typescript
import { useAbility } from './game/Abilities.ts';

// In connection handler:
  socket.on('use-ability', () => {
    const room = getRoomByPlayer(socket.id);
    if (!room) return;
    useAbility(io, socket.id, room);
  });
```

- [ ] **Step 3: AbilityButton client component**

`client/src/components/AbilityButton.tsx`:
```tsx
import { useGameStore } from '../store';

const ABILITY_NAMES: Record<string, string> = {
  warrior: '⚔️ Удар правды',
  mage: '❄️ Заморозка',
  healer: '💚 Исцеление',
  scout: '🔍 Разведка',
  bard: '🎵 Боевой гимн',
  blacksmith: '🔨 Перековка',
};

export default function AbilityButton() {
  const { gameState, playerId, useAbility } = useGameStore();
  if (!gameState) return null;

  const me = playerId ? gameState.players[playerId] : null;
  if (!me || !me.playerClass || !me.isAlive) return null;

  const onCooldown = me.abilityCooldown > 0;
  const canUse = gameState.phase === 'answering' && !onCooldown;

  return (
    <button
      onClick={useAbility}
      disabled={!canUse}
      className={`w-full py-2 rounded-lg text-sm font-bold transition-all ${
        canUse
          ? 'bg-purple-700 hover:bg-purple-600 text-white'
          : 'bg-gray-800 text-gray-500 cursor-not-allowed'
      }`}
    >
      {ABILITY_NAMES[me.playerClass] || 'Способность'}
      {onCooldown && <span className="ml-1 text-xs">({me.abilityCooldown} эт.)</span>}
    </button>
  );
}
```

- [ ] **Step 4: Add AbilityButton to GameScreen**

In `client/src/screens/GameScreen.tsx`, add above the player strip:
```tsx
import AbilityButton from '../components/AbilityButton';

// Before the player strip div:
      {(gameState.phase === 'answering') && (
        <div className="px-2 mt-2">
          <AbilityButton />
        </div>
      )}
```

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: class abilities — warrior/mage/healer/scout/bard/blacksmith"
```

---

### Task 10: Nginx, Systemd, Deploy

**Files:**
- Create: `/etc/nginx/sites-available/quiz-dungeon` (via bash)
- Create: `/etc/systemd/system/quiz-dungeon.service` (via bash)

- [ ] **Step 1: Build client**

```bash
cd /home/agent/quiz-dungeon/client && npm run build
```

- [ ] **Step 2: Create systemd service**

```bash
sudo tee /etc/systemd/system/quiz-dungeon.service << 'EOF'
[Unit]
Description=Quiz Dungeon Game Server
After=network.target

[Service]
Type=simple
User=agent
WorkingDirectory=/home/agent/quiz-dungeon/server
ExecStart=/home/agent/.local/share/nvm/versions/node/v22.15.0/bin/npx tsx src/index.ts
Restart=always
RestartSec=5
Environment=PORT=3333
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable quiz-dungeon
sudo systemctl start quiz-dungeon
```

- [ ] **Step 3: Create nginx config**

```bash
sudo tee /etc/nginx/sites-available/quiz-dungeon << 'EOF'
server {
    listen 80;
    server_name dungeon.quizplease.fun;

    root /home/agent/quiz-dungeon/client/dist;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    location /socket.io/ {
        proxy_pass http://127.0.0.1:3333;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 86400;
    }
}
EOF

sudo ln -sf /etc/nginx/sites-available/quiz-dungeon /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

- [ ] **Step 4: SSL with certbot**

```bash
sudo certbot --nginx -d dungeon.quizplease.fun --non-interactive --agree-tos
```

- [ ] **Step 5: Verify**

Open https://dungeon.quizplease.fun — should see Quiz Dungeon home screen.

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat: deployment — nginx, systemd, SSL"
```

---

## Summary

| Task | What | Est. |
|------|------|------|
| 1 | Project scaffolding | 10 min |
| 2 | Game data (classes, monsters, 80 questions) | 5 min |
| 3 | Room manager (create/join) | 10 min |
| 4 | Client socket + state store | 5 min |
| 5 | Home screen UI | 10 min |
| 6 | Lobby + class selection UI | 10 min |
| 7 | Game loop (floor gen, turns, combat) | 15 min |
| 8 | Game screen (battle/voting/trap/boss UI) | 15 min |
| 9 | Class abilities | 10 min |
| 10 | Nginx, systemd, deploy | 10 min |

**Total: ~100 min estimated**

After MVP: add remaining room types (sacrifice, chain, auction, traitor), rewards between floors, artifacts, sound effects, more questions.
