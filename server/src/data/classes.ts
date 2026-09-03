import type { ClassDefinition } from '../../../shared/types.ts';

export const CLASS_DEFINITIONS: ClassDefinition[] = [
  { id: 'warrior', name: 'Warrior', nameRu: 'Воин', emoji: '⚔️', description: 'Убирает 1 неправильный вариант у всей команды', abilityName: 'Удар правды', abilityCooldown: 3 },
  { id: 'mage', name: 'Mage', nameRu: 'Маг', emoji: '🧙', description: 'Останавливает таймер на 10 секунд', abilityName: 'Заморозка времени', abilityCooldown: 3 },
  { id: 'healer', name: 'Healer', nameRu: 'Лекарь', emoji: '💚', description: 'Восстанавливает 1 жизнь команде', abilityName: 'Исцеление', abilityCooldown: 4 },
  { id: 'scout', name: 'Scout', nameRu: 'Разведчик', emoji: '🔍', description: 'Подсматривает категорию следующего вопроса', abilityName: 'Разведка', abilityCooldown: 2 },
  { id: 'bard', name: 'Bard', nameRu: 'Бард', emoji: '🎵', description: 'Даёт +50% урон всей команде на 1 вопрос', abilityName: 'Боевой гимн', abilityCooldown: 3 },
  { id: 'blacksmith', name: 'Blacksmith', nameRu: 'Кузнец', emoji: '🔨', description: 'Перековывает провал в полуответ (половина урона)', abilityName: 'Перековка', abilityCooldown: 4 },
];
