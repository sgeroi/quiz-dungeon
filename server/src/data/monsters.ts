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
    { name: 'Гоблин-стражник', emoji: '👺', hp: 40, attack: 10, isBoss: false, difficulty: 'easy' },
    { name: 'Скелет-лучник', emoji: '💀', hp: 45, attack: 10, isBoss: false, difficulty: 'easy' },
    { name: 'Гигантская крыса', emoji: '🐀', hp: 30, attack: 8, isBoss: false, difficulty: 'easy' },
    { name: 'Слизь', emoji: '🟢', hp: 30, attack: 8, isBoss: false, difficulty: 'easy' },
  ],
  medium: [
    { name: 'Орк-берсерк', emoji: '👹', hp: 70, attack: 15, isBoss: false, difficulty: 'medium' },
    { name: 'Тёмный маг', emoji: '🧙‍♂️', hp: 60, attack: 20, isBoss: false, difficulty: 'medium' },
    { name: 'Каменный голем', emoji: '🗿', hp: 80, attack: 12, isBoss: false, difficulty: 'medium' },
  ],
  hard: [
    { name: 'Вампир', emoji: '🧛', hp: 90, attack: 20, isBoss: false, difficulty: 'hard' },
    { name: 'Ледяной элементаль', emoji: '🥶', hp: 100, attack: 22, isBoss: false, difficulty: 'hard' },
    { name: 'Тёмный рыцарь', emoji: '🖤', hp: 110, attack: 25, isBoss: false, difficulty: 'hard' },
  ],
  boss: [
    { name: 'Минотавр', emoji: '🐂', hp: 180, attack: 25, isBoss: true, difficulty: 'boss' },
    { name: 'Дракон Невежества', emoji: '🐉', hp: 300, attack: 35, isBoss: true, difficulty: 'boss' },
  ],
};
