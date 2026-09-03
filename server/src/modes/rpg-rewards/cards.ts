// Reward cards definitions for RPG: Rewards mode.

export type RpgrCardId =
  | 'sharp-blade'
  | 'life-elixir'
  | 'shield'
  | 'speed'
  | 'luck'
  | 'fury'
  | 'revive'
  | 'wisdom';

export interface RpgrCardDef {
  id: RpgrCardId;
  name: string;
  emoji: string;
  description: string;
}

export const RPGR_CARDS: RpgrCardDef[] = [
  { id: 'sharp-blade',  name: 'Острый клинок', emoji: '🗡️', description: '+20 к урону всех твоих будущих ответов.' },
  { id: 'life-elixir',  name: 'Эликсир жизни', emoji: '💚', description: 'Восстановить HP до полного.' },
  { id: 'shield',       name: 'Щит',           emoji: '🛡️', description: 'Первый получаемый удар не нанесёт урон.' },
  { id: 'speed',        name: 'Скорость',      emoji: '⚡', description: 'Если твой правильный ответ был быстрым — +30% к урону.' },
  { id: 'luck',         name: 'Удача',         emoji: '🍀', description: '+10% к урону команды на следующий раунд.' },
  { id: 'fury',         name: 'Ярость',        emoji: '🔥', description: 'Следующий раунд: твой урон x2 при правильном ответе.' },
  { id: 'revive',       name: 'Возрождение',   emoji: '💀', description: 'Разово оживить умершего товарища (на 50 HP).' },
  { id: 'wisdom',       name: 'Мудрость',      emoji: '📖', description: 'Перед ответом убрать один неправильный вариант (50/50 lite).' },
];

export function getCardById(id: RpgrCardId | string): RpgrCardDef | undefined {
  return RPGR_CARDS.find((c) => c.id === id);
}

// Pick `count` distinct random cards from the deck.
export function pickRandomCards(count: number): RpgrCardDef[] {
  const shuffled = [...RPGR_CARDS].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}
