// 5 monsters in escalating difficulty for the RPG: Rewards mode.

export interface RpgrMonsterDef {
  name: string;
  emoji: string;
  hp: number;
}

export const RPGR_MONSTERS: RpgrMonsterDef[] = [
  { name: 'Гоблин',   emoji: '👺', hp: 100 },
  { name: 'Орк',      emoji: '🧌', hp: 200 },
  { name: 'Тролль',   emoji: '👹', hp: 300 },
  { name: 'Минотавр', emoji: '🐂', hp: 450 },
  { name: 'Дракон',   emoji: '🐲', hp: 700 },
];
