import type { Floor, Monster, DungeonConfig, GameMode } from '../../../shared/types.ts';
import { MONSTERS, type MonsterTemplate } from '../data/monsters.ts';
import { getRoundsForMode } from '../data/modeRounds.ts';

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function toMonster(template: MonsterTemplate, hpScale: number = 1): Monster {
  return {
    name: template.name,
    emoji: template.emoji,
    maxHp: Math.round(template.hp * hpScale),
    currentHp: Math.round(template.hp * hpScale),
    attack: template.attack,
    isBoss: template.isBoss,
  };
}

export function generateFloors(playerCount: number, config?: DungeonConfig, mode: GameMode = 'classic'): Floor[] {
  if (config) {
    return generateFromConfig(playerCount, config);
  }
  return generateDefault(playerCount, mode);
}

function generateFromConfig(playerCount: number, config: DungeonConfig): Floor[] {
  const hpScale = 1 + playerCount * 0.15;

  return config.floors.map((fc) => {
    let monster: Monster | null = null;

    if (fc.monsterName && fc.monsterHp) {
      const scale = fc.isBoss ? (1 + playerCount * 0.2) : hpScale;
      monster = {
        name: fc.monsterName,
        emoji: fc.monsterEmoji || '👹',
        maxHp: Math.round(fc.monsterHp * scale),
        currentHp: Math.round(fc.monsterHp * scale),
        attack: fc.monsterAttack || 10,
        isBoss: fc.isBoss || false,
      };
    } else {
      const pool = MONSTERS[fc.difficulty] || MONSTERS.easy;
      monster = toMonster(pickRandom(pool), hpScale);
    }

    return {
      number: fc.number,
      params: fc.params,
      monster,
      question: null,
      isCompleted: false,
      isBoss: fc.isBoss,
      difficulty: fc.difficulty,
    };
  });
}

function getDifficulty(floorNum: number): 'easy' | 'medium' | 'hard' {
  if (floorNum <= 3) return 'easy';
  if (floorNum <= 7) return 'medium';
  return 'hard';
}

function generateDefault(playerCount: number, mode: GameMode = 'classic'): Floor[] {
  const floors: Floor[] = [];
  const hpScale = 1 + playerCount * 0.15;
  const bossScale = 1 + playerCount * 0.2;
  const rounds = getRoundsForMode(mode);

  for (let i = 0; i < 8; i++) {
    const num = i + 1;
    const diff = getDifficulty(num);
    const params = rounds[i];
    const isBoss = num === 4 || num === 8;

    let monster: Monster;
    if (num === 4) {
      const minotaur = MONSTERS.boss.find(m => m.name === 'Минотавр')!;
      monster = toMonster(minotaur, bossScale);
    } else if (num === 8) {
      const dragon = MONSTERS.boss.find(m => m.name === 'Дракон Невежества')!;
      monster = toMonster(dragon, bossScale * 1.5);
    } else {
      const pool = MONSTERS[diff] || MONSTERS.easy;
      monster = toMonster(pickRandom(pool), hpScale);
    }

    floors.push({
      number: num,
      params,
      monster,
      question: null,
      isCompleted: false,
      isBoss,
      difficulty: diff,
    });
  }

  return floors;
}
