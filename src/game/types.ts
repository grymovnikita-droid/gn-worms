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

// ---------- Ульты (data-driven) ----------
// Каждая ульта — это механика из закрытого набора, обрабатываемого движком.
export type UltMechanic =
  | { k: "global_bolt"; dmg: number; radius: number }            // Зевс: молния по всем врагам
  | { k: "assassinate"; dmg: number }                           // Снайпер: клик по врагу, мгновенно
  | { k: "sunstrike"; dmg: number; radius: number; delay: number } // Инвокер: удар с неба в точку
  | { k: "turret"; count: number; shots: number; dmg: number }  // Витч/Шаман/Пророк: турели
  | { k: "mine"; count: number; dmg: number; radius: number }   // Техис: мины с подрывом
  | { k: "dot_zone"; dmg: number; dur: number; radius: number; kind: "fire" | "poison" | "arcane" } // Джакиро/Скайрат
  | { k: "self_aoe"; dmg: number; radius: number; kind: "frost" | "pulse" | "poison" } // КМ/Лешрак/Вено
  | { k: "stun"; dmg: number }                                  // Бэйн: оглушает, пропуск хода
  | { k: "buff"; mult: number }                                 // Гримстроук: усиление выстрела
  | { k: "shield" }                                             // Оракул: щит на ход
  | { k: "ice_blast"; dmg: number }                             // АА: глобальный снаряд, блок хила
  | { k: "beam"; dmg: number }                                  // Котёл: канал-луч
  | { k: "steal" };                                             // Рубик: копирует ульту

export interface UltDef { id: string; name: string; desc: string; cd: number; mechanic: UltMechanic; }

export const ULTS: UltDef[] = [
  { id: "wrath", name: "Гнев Богa Грома", desc: "Молния бьёт каждого врага на карте.", cd: 3, mechanic: { k: "global_bolt", dmg: 26, radius: 44 } },
  { id: "assassinate", name: "Ликвидация", desc: "Мгновенный выстрел по выбранному врагу.", cd: 2, mechanic: { k: "assassinate", dmg: 55 } },
  { id: "sunstrike", name: "Солнечный Удар", desc: "Удар с неба в любую точку через 1с.", cd: 3, mechanic: { k: "sunstrike", dmg: 60, radius: 66, delay: 1.0 } },
  { id: "deathward", name: "Смертельный Тотем", desc: "Тотем делает 3 выстрела в этом ходу.", cd: 3, mechanic: { k: "turret", count: 1, shots: 3, dmg: 20 } },
  { id: "serpents", name: "Змеиные Варды", desc: "3 змеиные башни по 2 выстрела.", cd: 3, mechanic: { k: "turret", count: 3, shots: 2, dmg: 12 } },
  { id: "treants", name: "Зов Природы", desc: "2 древа делают по 2 мощных выстрела.", cd: 3, mechanic: { k: "turret", count: 2, shots: 2, dmg: 24 } },
  { id: "mines", name: "Дистанционные Мины", desc: "Ставит 3 мины. Подрыв — кнопкой.", cd: 3, mechanic: { k: "mine", count: 3, dmg: 45, radius: 55 } },
  { id: "macropyre", name: "Макропайр", desc: "Огненная линия на земле на 5с.", cd: 3, mechanic: { k: "dot_zone", dmg: 8, dur: 5, radius: 70, kind: "fire" } },
  { id: "mystic", name: "Мистическая Вспышка", desc: "Магическая зона с уроном 4с.", cd: 3, mechanic: { k: "dot_zone", dmg: 9, dur: 4, radius: 55, kind: "arcane" } },
  { id: "illuminate", name: "Озарение", desc: "Канал-луч. Держи дольше — сильнее.", cd: 2, mechanic: { k: "beam", dmg: 48 } },
  { id: "pulse", name: "Пульс Нова", desc: "Взрывная волна вокруг героя.", cd: 2, mechanic: { k: "self_aoe", dmg: 34, radius: 95, kind: "pulse" } },
  { id: "poison", name: "Ядовитая Нова", desc: "Ядовитое облако вокруг героя.", cd: 3, mechanic: { k: "self_aoe", dmg: 28, radius: 105, kind: "poison" } },
  { id: "freeze", name: "Ледяное Поле", desc: "Морозное поле вокруг героя.", cd: 2, mechanic: { k: "self_aoe", dmg: 30, radius: 90, kind: "frost" } },
  { id: "grip", name: "Хватка Демона", desc: "Враг оглушён и пропускает ход.", cd: 3, mechanic: { k: "stun", dmg: 20 } },
  { id: "ink", name: "Чернильный Взрыв", desc: "Следующий выстрел +100% урона.", cd: 2, mechanic: { k: "buff", mult: 2 } },
  { id: "promise", name: "Ложное Обещание", desc: "Щит: не получает урон до след. хода.", cd: 3, mechanic: { k: "shield" } },
  { id: "iceblast", name: "Ледяной Взрыв", desc: "Глобальный снаряд. Блокирует хил 3 хода.", cd: 3, mechanic: { k: "ice_blast", dmg: 40 } },
  { id: "steal", name: "Кража Заклинания", desc: "Копирует ульту последнего убитого врага.", cd: 2, mechanic: { k: "steal" } },
];
export const ultById: Record<string, UltDef> = Object.fromEntries(ULTS.map((u) => [u.id, u]));

// ---------- Герои ----------
// Визуальных архетипов 8, героев 20 — каждый герой = архетип + своя палитра.
export type HeroTypeDef = "sniper" | "cm" | "jugg" | "lina" | "pudge" | "axe" | "lich" | "drow";
export type Archetype = HeroTypeDef;

export interface HeroDef {
  id: string;            // уникальный id для спрайтов мастерской
  name: string;
  archetype: Archetype;
  main: string; dark: string; accent: string; skin: string;
  sig: string;
  ult: string;
}

export const HEROES: HeroDef[] = [
  { id: "sniper", name: "Снайпер", archetype: "sniper", main: "#4a6b3a", dark: "#2e4425", accent: "#c9b458", skin: "#d8b48e", sig: "snipe", ult: "assassinate" },
  { id: "cm", name: "Кристал Мейден", archetype: "cm", main: "#4f7fb8", dark: "#33547d", accent: "#bfe8ff", skin: "#e8d4c0", sig: "frost", ult: "freeze" },
  { id: "jugg", name: "Джаггернаут", archetype: "jugg", main: "#8a4526", dark: "#5e2e19", accent: "#e8e4d8", skin: "#d8b48e", sig: "blade", ult: "pulse" },
  { id: "lina", name: "Лина", archetype: "lina", main: "#b8452f", dark: "#7d2d1e", accent: "#ff8c3b", skin: "#e8c8a8", sig: "laguna", ult: "illuminate" },
  { id: "pudge", name: "Пудж", archetype: "pudge", main: "#7a6a52", dark: "#554a38", accent: "#9aa2ac", skin: "#a3b18c", sig: "cleaver", ult: "grip" },
  { id: "axe", name: "Акс", archetype: "axe", main: "#8a3a2c", dark: "#59241a", accent: "#4e565f", skin: "#c8a080", sig: "axe", ult: "pulse" },
  { id: "lich", name: "Лич", archetype: "lich", main: "#2e5878", dark: "#1d3a52", accent: "#7fe8ff", skin: "#93a9ba", sig: "nova", ult: "iceblast" },
  { id: "drow", name: "Дроу", archetype: "drow", main: "#4a3b55", dark: "#302638", accent: "#c9c2d4", skin: "#cfc4da", sig: "volley", ult: "assassinate" },
  { id: "zeus", name: "Зевс", archetype: "lina", main: "#c8c23a", dark: "#8a8520", accent: "#ffe95c", skin: "#d8c8a0", sig: "nova", ult: "wrath" },
  { id: "invoker", name: "Инвокер", archetype: "lina", main: "#b89a5a", dark: "#7d6538", accent: "#ffd27b", skin: "#e0c8a8", sig: "frost", ult: "sunstrike" },
  { id: "witch", name: "Витч Доктор", archetype: "pudge", main: "#5a7a4a", dark: "#3a5230", accent: "#c8b060", skin: "#8a7a5a", sig: "volley", ult: "deathward" },
  { id: "shaman", name: "Шаман", archetype: "pudge", main: "#8a5a3a", dark: "#5e3a22", accent: "#d8a04a", skin: "#b0906a", sig: "axe", ult: "serpents" },
  { id: "techies", name: "Техис", archetype: "sniper", main: "#a08a4a", dark: "#6e5e30", accent: "#e0c060", skin: "#c8b088", sig: "dynamite", ult: "mines" },
  { id: "kotl", name: "Кипер Света", archetype: "cm", main: "#d8d0a0", dark: "#a09860", accent: "#fff2c0", skin: "#e8d8b0", sig: "frost", ult: "illuminate" },
  { id: "prophet", name: "Пророк Природы", archetype: "jugg", main: "#4a7a3a", dark: "#2e5222", accent: "#9ac060", skin: "#c8b090", sig: "volley", ult: "treants" },
  { id: "jakiro", name: "Джакиро", archetype: "lich", main: "#7a4a8a", dark: "#52305e", accent: "#ff8c3b", skin: "#b0a0c0", sig: "laguna", ult: "macropyre" },
  { id: "leshrac", name: "Лешрак", archetype: "axe", main: "#6a5a8a", dark: "#463a5e", accent: "#b09ae0", skin: "#b8a8c8", sig: "nova", ult: "pulse" },
  { id: "veno", name: "Веномансер", archetype: "drow", main: "#4a8a4a", dark: "#2e5e2e", accent: "#7ee08a", skin: "#a0c8a0", sig: "volley", ult: "poison" },
  { id: "bane", name: "Бэйн", archetype: "lich", main: "#5a3a6a", dark: "#3a2246", accent: "#b07ae0", skin: "#a898b8", sig: "frost", ult: "grip" },
  { id: "oracle", name: "Оракул", archetype: "cm", main: "#c8a8d8", dark: "#8a7098", accent: "#e8d0f0", skin: "#e0d0e0", sig: "frost", ult: "promise" },
  { id: "disruptor", name: "Дисраптор", archetype: "lich", main: "#4a5a8a", dark: "#303a5e", accent: "#7fc4e8", skin: "#b0a8c0", sig: "frost", ult: "grip" },
  { id: "grimstroke", name: "Гримстроук", archetype: "lina", main: "#3a3a4a", dark: "#22222e", accent: "#c0c0d0", skin: "#c8b8a0", sig: "laguna", ult: "ink" },
  { id: "aa", name: "Древний Аппарит", archetype: "lich", main: "#5a8ab8", dark: "#3a5e80", accent: "#bfe8ff", skin: "#a8c8e0", sig: "nova", ult: "iceblast" },
  { id: "rubick", name: "Рубик", archetype: "cm", main: "#4a8a5a", dark: "#2e5e3a", accent: "#7ee08a", skin: "#d0c8a0", sig: "frost", ult: "steal" },
  { id: "skywrath", name: "Скайрат Маг", archetype: "lina", main: "#8a7a3a", dark: "#5e5222", accent: "#ffe95c", skin: "#e0d0b0", sig: "laguna", ult: "mystic" },
];
export const heroById: Record<string, HeroDef> = Object.fromEntries(HEROES.map((h) => [h.id, h]));

// Ростеры: id героев. По умолчанию 4v4 сбалансирован.
export const ROSTERS: [string[], string[]] = [
  ["sniper", "cm", "jugg", "lina"],
  ["pudge", "axe", "lich", "drow"],
];
export const ROSTERS_EXTRA: [string[], string[]] = [
  ["zeus", "invoker", "kotl", "prophet", "oracle", "techies"],
  ["witch", "shaman", "jakiro", "leshrac", "veno", "bane"],
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
    heroId: string;
    name: string; type: HeroTypeDef; sig: string;
    hp: number; maxHp: number;
    items: string[]; mekCount: number; blinkCd: number; canBlink: boolean;
    moveLeft: number; moveMax: number;
    weapon: string; ammo: Record<string, number>;
    ultId: string; ultName: string; ultDesc: string; ultCd: number; ultReady: boolean;
    shield: boolean; stunned: boolean; buffed: boolean;
    minesLeft: number;
    ultAim: string | null;
  } | null;
  gold: [number, number];
  teams: [
    { heroId: string; name: string; type: HeroTypeDef; hp: number; maxHp: number; alive: boolean; current: boolean }[],
    { heroId: string; name: string; type: HeroTypeDef; hp: number; maxHp: number; alive: boolean; current: boolean }[]
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
