// Mirror of server-side card definitions for client rendering.
// Keep in sync with server/src/modes/rpg-rewards/cards.ts.

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
  { id: 'speed',        name: 'Скорость',      emoji: '⚡', description: 'Если твой правильный ответ быстрый — +30% к урону.' },
  { id: 'luck',         name: 'Удача',         emoji: '🍀', description: '+10% к урону команды на следующий раунд.' },
  { id: 'fury',         name: 'Ярость',        emoji: '🔥', description: 'Следующий раунд: твой урон x2 при правильном.' },
  { id: 'revive',       name: 'Возрождение',   emoji: '💀', description: 'Разово оживить умершего товарища.' },
  { id: 'wisdom',       name: 'Мудрость',      emoji: '📖', description: 'Перед ответом убрать один неправильный вариант.' },
];

export function getCardById(id: string): RpgrCardDef | undefined {
  return RPGR_CARDS.find((c) => c.id === id);
}
