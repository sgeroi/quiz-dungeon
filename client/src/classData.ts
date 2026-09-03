import type { ClassDefinition, PlayerClass } from './types';

const SPRITES: Record<string, string> = {
  warrior: '/sprites/warrior.png',
  mage: '/sprites/mage.png',
  healer: '/sprites/healer.png',
  scout: '/sprites/scout.png',
  bard: '/sprites/bard.png',
  blacksmith: '/sprites/blacksmith.png',
};

export const CLASS_LIST: ClassDefinition[] = [
  {
    id: 'warrior',
    name: 'Warrior',
    nameRu: 'Воин',
    emoji: '⚔️',
    sprite: SPRITES.warrior,
    description: 'Наносит двойной урон при правильном ответе',
    abilityName: 'Мощный удар',
    abilityCooldown: 3,
  },
  {
    id: 'mage',
    name: 'Mage',
    nameRu: 'Маг',
    emoji: '🧙',
    sprite: SPRITES.mage,
    description: 'Убирает один неверный ответ',
    abilityName: 'Прозрение',
    abilityCooldown: 2,
  },
  {
    id: 'healer',
    name: 'Healer',
    nameRu: 'Целитель',
    emoji: '💚',
    sprite: SPRITES.healer,
    description: 'Восстанавливает здоровье команды',
    abilityName: 'Исцеление',
    abilityCooldown: 3,
  },
  {
    id: 'scout',
    name: 'Scout',
    nameRu: 'Разведчик',
    emoji: '🏹',
    sprite: SPRITES.scout,
    description: 'Показывает категорию следующего вопроса',
    abilityName: 'Разведка',
    abilityCooldown: 2,
  },
  {
    id: 'bard',
    name: 'Bard',
    nameRu: 'Бард',
    emoji: '🎵',
    sprite: SPRITES.bard,
    description: 'Даёт бонус всей команде при серии ответов',
    abilityName: 'Вдохновение',
    abilityCooldown: 3,
  },
  {
    id: 'blacksmith',
    name: 'Blacksmith',
    nameRu: 'Кузнец',
    emoji: '🔨',
    sprite: SPRITES.blacksmith,
    description: 'Укрепляет защиту, снижая урон монстров',
    abilityName: 'Ковка щита',
    abilityCooldown: 4,
  },
];

export const CLASS_DEFS: Record<PlayerClass, ClassDefinition> = Object.fromEntries(
  CLASS_LIST.map((c) => [c.id, c]),
) as Record<PlayerClass, ClassDefinition>;
