import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { nanoid } from 'nanoid';
import type { DungeonConfig } from '../../../shared/types.ts';
import { DEFAULT_ROUNDS } from './defaultRounds.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = path.resolve(__dirname, '../../data');
const DATA_FILE = path.join(DATA_DIR, 'dungeons.json');

function ensureDataDir(): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function readConfigs(): DungeonConfig[] {
  ensureDataDir();
  if (!fs.existsSync(DATA_FILE)) {
    const defaults = [getDefaultConfig()];
    fs.writeFileSync(DATA_FILE, JSON.stringify(defaults, null, 2), 'utf-8');
    return defaults;
  }
  const raw = fs.readFileSync(DATA_FILE, 'utf-8');
  return JSON.parse(raw) as DungeonConfig[];
}

function writeConfigs(configs: DungeonConfig[]): void {
  ensureDataDir();
  fs.writeFileSync(DATA_FILE, JSON.stringify(configs, null, 2), 'utf-8');
}

function getDefaultConfig(): DungeonConfig {
  const now = new Date().toISOString();
  return {
    id: 'default',
    name: 'Классическое подземелье',
    description: 'Стандартное подземелье из 8 этажей с нарастающей сложностью.',
    personalHp: 100,
    floors: DEFAULT_ROUNDS.map((params, i) => ({
      number: i + 1,
      params,
      difficulty: (i < 3 ? 'easy' : i < 7 ? 'medium' : 'hard') as 'easy' | 'medium' | 'hard',
      isBoss: i === 3 || i === 7,
      ...(i === 3 ? { monsterName: 'Минотавр', monsterEmoji: '🐂', monsterHp: 80, monsterAttack: 20 } : {}),
      ...(i === 7 ? { monsterName: 'Дракон Невежества', monsterEmoji: '🐉', monsterHp: 120, monsterAttack: 35 } : {}),
    })),
    createdAt: now,
    updatedAt: now,
  };
}

export function getAllConfigs(): DungeonConfig[] {
  return readConfigs();
}

export function getConfig(id: string): DungeonConfig | undefined {
  const configs = readConfigs();
  return configs.find((c) => c.id === id);
}

export function saveConfig(config: Partial<DungeonConfig> & { floors: DungeonConfig['floors'] }): DungeonConfig {
  const configs = readConfigs();
  const now = new Date().toISOString();

  if (config.id) {
    const idx = configs.findIndex((c) => c.id === config.id);
    if (idx >= 0) {
      const updated: DungeonConfig = {
        ...configs[idx],
        ...config,
        updatedAt: now,
      };
      configs[idx] = updated;
      writeConfigs(configs);
      return updated;
    }
  }

  const newConfig: DungeonConfig = {
    id: config.id || nanoid(10),
    name: config.name || 'Новое подземелье',
    description: config.description || '',
    floors: config.floors,
    personalHp: config.personalHp ?? 100,
    createdAt: now,
    updatedAt: now,
  };

  configs.push(newConfig);
  writeConfigs(configs);
  return newConfig;
}

export function deleteConfig(id: string): boolean {
  if (id === 'default') return false;
  const configs = readConfigs();
  const filtered = configs.filter((c) => c.id !== id);
  if (filtered.length === configs.length) return false;
  writeConfigs(filtered);
  return true;
}
