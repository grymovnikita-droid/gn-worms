// ============================================================
// Типы и справочники игры «Золото и Порох»
// ============================================================

export const WORLD_W = 2800;
export const WORLD_H = 1000;
export const GRAVITY = 980;
export const TURN_TIME = 30;
export const BASE_MOVE = 170;
export const BOOTS_MOVE = 260;
export const JUMP_COST = 25;
export const BLINK_RADIUS = 240;
export const INCOME_PER_TURN = 75;
export const KILL_GOLD = 200;
export const CRATE_GOLD = 120;

export type Team = 0 | 1;
export type Screen = "menu" | "game" | "over";
export type Phase = "idle" | "aim" | "ai" | "flight" | "settle";
export type Difficulty = 0 | 1 | 2;
export type MapId = "canyon" | "frost" | "jungle" | "inferno";
export type BattleMode = 4 | 10;

export const MAPS: { id: MapId; name: string; desc: string }[] = [
  { id: "canyon", name: "Каньон Пороха", desc: "Зелёные холмы Рассвета против выжженной земли Легиона. Глубокое озеро посередине — переправа только на плоту." },
  { id: "frost", name: "Ледяная пещера", desc: "Морозный разлом со сталактитами и ледяной водой. Северное сияние в небе." },
  { id: "jungle", name: "Джунгли Амазонки", desc: "Непролазная чаща: пальмы, лианы, светлячки. Топкое болото в центре — не бултыхаться, утонешь!" },
  { id: "inferno", name: "Преисподняя", desc: "Адская пустошь: огненные столбы, шипы и Озеро Проклятых. Через него ходит лишь паром Харона." },
];

export const DIFFS: { name: string; desc: string }[] = [
  { name: "Новобранец", desc: "Боты мажут и медленно соображают" },
  { name: "Ветеран", desc: "Честная перестрелка с ИИ" },
  { name: "Легенда", desc: "Снайперская точность и богатые боты" },
];

export const TEAM_NAMES = ["Рассвет", "Багровый Легион"];

// ---------- Оружие ----------
export interface WeaponDef {
  id: string;
  name: string;
  kind: "boom" | "pellets" | "fuse" | "napalm" | "cluster" | "beam" | "melee" | "pierce" | "hook";
  damage: number;
  radius: number;
  pellets?: number;
  spread?: number;
  fuse?: number;
  bounce?: number;
  ammo: number; // -1 = вечно
  speedMul: number;
  gravMul: number;
  windMul: number;
  ice?: boolean;
  desc: string;
  sigFor?: string;
  fireDur?: number;
  clusters?: number;
  range?: number;
}

export const WEAPONS: WeaponDef[] = [
  { id: "cannon", name: "Ядро", kind: "boom", damage: 45, radius: 70, ammo: -1, speedMul: 1, gravMul: 1, windMul: 1, desc: "Верная пушка. Вечный заряд." },
  { id: "bat", name: "Бита", kind: "melee", damage: 30, range: 62, radius: 0, ammo: -1, speedMul: 1, gravMul: 1, windMul: 1, desc: "Размах от души. Отбрасывает врага." },
  { id: "shotgun", name: "Дробовик", kind: "pellets", damage: 12, radius: 10, pellets: 5, spread: 0.12, ammo: 4, speedMul: 1.05, gravMul: 1.1, windMul: 0.7, desc: "Веер дроби в упор и на средней." },
  { id: "dynamite", name: "Динамит", kind: "fuse", damage: 55, radius: 75, fuse: 3, bounce: 0.45, ammo: 3, speedMul: 0.8, gravMul: 1, windMul: 0.8, desc: "Скачет по склонам. Взрыв через 3 секунды." },
  { id: "napalm", name: "Напалм", kind: "napalm", damage: 26, radius: 55, fireDur: 4.5, ammo: 2, speedMul: 0.95, gravMul: 1.05, windMul: 1, desc: "Взрыв + горящая зона на 4.5 секунды." },
  { id: "cluster", name: "Шрапнель", kind: "cluster", damage: 20, radius: 42, clusters: 6, ammo: 3, speedMul: 1, gravMul: 1, windMul: 1, desc: "Рассыпается на 6 бомбочек в воздухе." },
  { id: "hook", name: "Мясной крюк", kind: "hook", damage: 22, radius: 0, ammo: 2, speedMul: 1.1, gravMul: 0.12, windMul: 0.35, desc: "Летит почти прямо. Вонзается во врага и притягивает его к тебе." },
  { id: "snipe", name: "Дальний выстрел", kind: "pierce", damage: 40, radius: 0, ammo: 3, speedMul: 2.6, gravMul: 0.3, windMul: 0.5, desc: "Почти прямой смертельный выстрел.", sigFor: "Снайпер" },
  { id: "frost", name: "Ледяная Нова", kind: "boom", damage: 34, radius: 58, ammo: 3, speedMul: 1, gravMul: 1, windMul: 1, ice: true, desc: "Морозный взрыв Кристал Мейден.", sigFor: "Кристал Мейден" },
  { id: "nova", name: "Кольцо Мороза", kind: "boom", damage: 42, radius: 66, ammo: 3, speedMul: 1, gravMul: 1, windMul: 1, ice: true, desc: "Тёмная стужа Лича.", sigFor: "Лич" },
  { id: "laguna", name: "Луч Лагуны", kind: "beam", damage: 46, radius: 26, ammo: 2, speedMul: 1, gravMul: 1, windMul: 1, desc: "Мгновенный луч, прожигающий землю.", sigFor: "Лина" },
  { id: "blade", name: "Омниклинок", kind: "melee", damage: 38, range: 72, radius: 0, ammo: -1, speedMul: 1, gravMul: 1, windMul: 1, desc: "Танец клинков Джаггернаута.", sigFor: "Джаггернаут" },
  { id: "axe", name: "Бросок топора", kind: "boom", damage: 40, radius: 46, ammo: 3, speedMul: 1.15, gravMul: 0.9, windMul: 0.8, desc: "Топор Акса по дуге.", sigFor: "Акс" },
  { id: "cleaver", name: "Тесак мясника", kind: "melee", damage: 36, range: 66, radius: 0, ammo: -1, speedMul: 1, gravMul: 1, windMul: 1, desc: "Тесак Пуджа в упор.", sigFor: "Пудж" },
  { id: "volley", name: "Залп стрел", kind: "pellets", damage: 9, radius: 6, pellets: 5, spread: 0.24, ammo: 3, speedMul: 1, gravMul: 1.8, windMul: 0.5, desc: "Дождь из стрел Дроу.", sigFor: "Дроу" },
];

export const weaponById: Record<string, WeaponDef> = Object.fromEntries(WEAPONS.map((w) => [w.id, w]));
export const ARMORY_IDS = ["cannon", "bat", "shotgun", "dynamite", "napalm", "cluster", "hook"];

// ---------- Предметы ----------
export interface ItemDef {
  id: string; name: string; cost: number; desc: string; lore: string; passive: boolean; consumable?: boolean;
}
export const ITEMS: ItemDef[] = [
  { id: "blink", name: "Клинок Мерцания", cost: 225, desc: "Телепорт до 240px. Раз в ход, перезарядка 2 хода.", lore: "Миг — и ты уже за спиной врага.", passive: false },
  { id: "boots", name: "Сапоги Скорохода", cost: 150, desc: "+90 к дальности перехода каждый ход.", lore: "Лёгкие, как утренний туман.", passive: true },
  { id: "ring", name: "Кольцо Защиты", cost: 175, desc: "−28% входящего урона.", lore: "Старая броня кузниц Рассвета.", passive: true },
  { id: "aghs", name: "Скипетр Аганима", cost: 300, desc: "+45% урона и +25% радиуса всех атак.", lore: "Сила, достойная небожителей.", passive: true },
  { id: "mek", name: "Меканзм", cost: 150, desc: "Расходник: +45 здоровья герою.", lore: "Механическое сердце целителя.", passive: false, consumable: true },
];

// ---------- Герои ----------
export type HeroTypeDef = "sniper" | "cm" | "jugg" | "lina" | "pudge" | "axe" | "lich" | "drow";

export const ROSTERS: [ { type: HeroTypeDef; name: string; sig: string }[], { type: HeroTypeDef; name: string; sig: string }[] ] = [
  [
    { type: "sniper", name: "Снайпер", sig: "snipe" },
    { type: "cm", name: "Кристал Мейден", sig: "frost" },
    { type: "jugg", name: "Джаггернаут", sig: "blade" },
    { type: "lina", name: "Лина", sig: "laguna" },
  ],
  [
    { type: "pudge", name: "Пудж", sig: "cleaver" },
    { type: "axe", name: "Акс", sig: "axe" },
    { type: "lich", name: "Лич", sig: "nova" },
    { type: "drow", name: "Дроу", sig: "volley" },
  ],
];

export const ROSTERS_EXTRA: [ { type: HeroTypeDef; name: string; sig: string }[], { type: HeroTypeDef; name: string; sig: string }[] ] = [
  [
    { type: "sniper", name: "Сержант Кель", sig: "snipe" },
    { type: "cm", name: "Хранительница Иви", sig: "frost" },
    { type: "jugg", name: "Мастер клинка Ю", sig: "blade" },
    { type: "lina", name: "Пиромантка Зо", sig: "laguna" },
    { type: "drow", name: "Егерь Таль", sig: "volley" },
    { type: "cm", name: "Жрица Луны", sig: "nova" },
  ],
  [
    { type: "pudge", name: "Мясник Грот", sig: "cleaver" },
    { type: "axe", name: "Гроза Севера", sig: "axe" },
    { type: "lich", name: "Некромант Зу", sig: "nova" },
    { type: "drow", name: "Следопыт Шакс", sig: "volley" },
    { type: "axe", name: "Палач Дорг", sig: "hook" },
    { type: "pudge", name: "Душегуб Хряк", sig: "hook" },
  ],
];

// ---------- UI snapshot ----------
export interface UISnapshot {
  screen: Screen;
  phase: Phase;
  paused: boolean;
  muted: boolean;
  round: number;
  turnId: number;
  currentTeam: Team;
  isPlayerTurn: boolean;
  active: {
    name: string; type: HeroTypeDef; sig: string;
    hp: number; maxHp: number;
    items: string[]; mekCount: number; blinkCd: number; canBlink: boolean;
    moveLeft: number; moveMax: number;
    weapon: string; ammo: Record<string, number>;
  } | null;
  gold: [number, number];
  teams: [
    { name: string; type: HeroTypeDef; hp: number; maxHp: number; alive: boolean; current: boolean }[],
    { name: string; type: HeroTypeDef; hp: number; maxHp: number; alive: boolean; current: boolean }[]
  ];
  timer: number;
  timerMax: number;
  wind: number;
  blinkMode: boolean;
  winner: Team | null;
  difficulty: Difficulty;
  map: MapId;
  mode: BattleMode;
  stats: { kills: [number, number]; dmg: [number, number]; gold: [number, number] };
}
