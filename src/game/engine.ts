// ============================================================
// Игровой движок «Золото и Порох» (полная версия)
// Разрушаемый ландшафт, озеро с плотом, лава, арсенал, ИИ, предметы
// ============================================================
import {
  WORLD_W, WORLD_H, GRAVITY, TURN_TIME, BASE_MOVE, BOOTS_MOVE, JUMP_COST,
  BLINK_RADIUS, INCOME_PER_TURN, KILL_GOLD, CRATE_GOLD, ROSTERS, ROSTERS_EXTRA,
  ITEMS, ARMORY_IDS, weaponById,
} from "./types";
import type { Team, Screen, Phase, Difficulty, UISnapshot, WeaponDef, MapId, BattleMode, HeroTypeDef } from "./types";
import { sfx } from "./audio";
import { loadWorkshop, saveWorkshop } from "./workshop";
import type { WorkshopData, SpriteConfig } from "./workshop";

// ---------- внутренние типы ----------
interface Hero {
  team: Team;
  type: HeroTypeDef;
  name: string;
  sig: string;
  x: number; y: number; vy: number;
  hp: number; maxHp: number;
  alive: boolean;
  onGround: boolean;
  wet: boolean;
  items: Set<string>;
  mek: number;
  blinkCd: number;
  usedBlink: boolean;
  flashT: number;
  walkPhase: number;
  swingT: number;
  weapon: string;
  ammo: Record<string, number>;
}
interface Proj {
  x: number; y: number; vx: number; vy: number;
  def: WeaponDef; team: Team;
  fuseT: number; lastFuseSec: number;
  bounces: number; spin: number; mini: boolean;
  ox: number; oy: number;
  shooter: Hero | null;
  wet?: boolean;
  pierce?: number;
}
interface Crate { x: number; y: number; vy: number; landed: boolean; kind: "gold" | "heal"; }
interface Particle {
  x: number; y: number; vx: number; vy: number;
  life: number; max: number; size: number; color: string;
  grav: number; kind: "spark" | "smoke" | "glow" | "coin" | "chunk" | "heal" | "ring" | "tele";
}
interface DmgNum { x: number; y: number; life: number; text: string; color: string; size: number; }
interface AiState { stage: "think" | "move" | "aim" | "done"; t: number; dur: number; dir: number; angle: number; speed: number; beam?: boolean; }
interface Ember { x: number; y: number; vy: number; drift: number; size: number; phase: number; }
interface Fire { x: number; y: number; r: number; t: number; dur: number; next: number; team: Team; }
interface Beam { x1: number; y1: number; x2: number; y2: number; t: number; }
interface Tree { x: number; baseY: number; side: Team; s: number; seed: number; alive: boolean; }
interface Pull { h: Hero; fromX: number; fromY: number; toX: number; t: number; }
interface Decal { x: number; y: number; r: number; life: number; max: number; }
interface Spike { x: number; w: number; len: number; lean: number; }

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const rand = (a: number, b: number) => a + Math.random() * (b - a);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export const LAVA_TOP = WORLD_H - 36;
export const HS = 1.45;            // масштаб героев
export const HERO_CY = 18 * HS;    // высота центра тела
const SHOT_MIN = 300, SHOT_SPAN = 900, AI_SHOT_SPEED = 1250;
const LAKE_HALF = 340;

function spawnFracs(count: number): [number[], number[]] {
  const t0: number[] = [], t1: number[] = [];
  for (let i = 0; i < count; i++) {
    t0.push(0.05 + (i * 0.31) / Math.max(1, count - 1));
    t1.push(0.64 + (i * 0.31) / Math.max(1, count - 1));
  }
  return [t0, t1];
}

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const AI_ERR = [0.105, 0.055, 0.024];
const AI_INCOME = [1, 1, 1.4];

export class Engine {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private onUI: (s: UISnapshot) => void;
  onShopClose: (() => void) | null = null;

  // мир
  private heights = new Float32Array(WORLD_W);
  private terrainCanvas: HTMLCanvasElement;
  private terrainDirty = true;
  private stars: { x: number; y: number; s: number; tw: number }[] = [];
  private brightStars: { x: number; y: number; s: number; tw: number }[] = [];
  private nebulae: { x: number; y: number; r: number; color: string }[] = [];
  private embers: Ember[] = [];
  private trees: Tree[] = [];
  private stalactites: Spike[] = [];
  private stalagmites: Spike[] = [];
  private waterY = 668;
  private map: MapId = "canyon";
  private dripT = 0;
  private vines: { x: number; len: number; ph: number }[] = [];
  private firePillars: number[] = [];
  private hellSpikes: Spike[] = [];
  private fireflies: { x: number; y: number; ph: number }[] = [];
  private pillarT = 0;

  // плот
  private raft = { x: WORLD_W / 2, dir: 1, dx: 0, half: 36 };

  // мастерская: пользовательские спрайты (герои, ящик, фон)
  private spriteCfg: WorkshopData = {};
  private sprites = new Map<string, HTMLImageElement>();
  // непрерывная область озера (вода растекается от центра): [lakeL, lakeR]
  private lakeL = 0;
  private lakeR = 0;
  private hasLake = false;

  // состояние игры
  screen: Screen = "menu";
  private phase: Phase = "idle";
  private paused = false;
  private difficulty: Difficulty = 1;
  private mode: BattleMode = 4;
  private heroes: Hero[] = [];
  private order: Hero[] = [];
  private turnCount = -1;
  private curIdx = 0;
  private teamGold: [number, number] = [300, 300];
  private wind = 0;
  private timer = TURN_TIME;
  private lastTickSec = TURN_TIME;
  private projs: Proj[] = [];
  private crates: Crate[] = [];
  private particles: Particle[] = [];
  private dmgNums: DmgNum[] = [];
  private fires: Fire[] = [];
  private beams: Beam[] = [];
  private pulls: Pull[] = [];
  private decals: Decal[] = [];
  private winner: Team | null = null;
  private stats = { kills: [0, 0] as [number, number], dmg: [0, 0] as [number, number], gold: [0, 0] as [number, number] };

  // ввод / прицел
  private moveInput = 0;
  private moveLeft = 0;
  private moveMax = BASE_MOVE;
  private aimAngle = -Math.PI / 4;
  private charging = false;
  private power = 0;
  private blinkMode = false;
  private shopOpen = false;

  // эффекты
  private shake = 0;
  private redFlash = 0;
  private whiteFlash = 0;
  private time = 0;
  private uiAcc = 0;
  private settleT = 0;
  private ai: AiState = { stage: "done", t: 0, dur: 0, dir: 0, angle: 0, speed: 0 };

  // камера
  private cw = 0; private ch = 0; private scale = 1; private oy = 0; private dpr = 1;
  private camX = WORLD_W / 2;
  private camY = WORLD_H / 2;
  private zoom = 1.6;
  private zoomMin = 1;
  private panning: { x: number; y: number } | null = null;

  private raf = 0;
  private lastT = 0;
  private destroyed = false;

  constructor(canvas: HTMLCanvasElement, onUI: (s: UISnapshot) => void) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d")!;
    this.onUI = onUI;
    this.terrainCanvas = document.createElement("canvas");
    this.terrainCanvas.width = WORLD_W;
    this.terrainCanvas.height = WORLD_H;

    const sr = mulberry32(777);
    for (let i = 0; i < 240; i++) {
      this.stars.push({ x: sr() * WORLD_W * 1.2 - WORLD_W * 0.1, y: sr() * 900 - 560, s: 0.5 + sr() * 1.5, tw: sr() * Math.PI * 2 });
    }
    for (let i = 0; i < 9; i++) {
      this.brightStars.push({ x: sr() * WORLD_W, y: -260 + sr() * 560, s: 1.6 + sr() * 1.4, tw: sr() * Math.PI * 2 });
    }
    const nebCols = ["rgba(120,80,200,0.05)", "rgba(60,140,190,0.05)", "rgba(190,90,60,0.045)"];
    for (let i = 0; i < 3; i++) {
      this.nebulae.push({ x: 200 + sr() * (WORLD_W - 400), y: -160 + sr() * 400, r: 150 + sr() * 160, color: nebCols[i] });
    }
    for (let i = 0; i < 40; i++) {
      this.embers.push({ x: sr() * WORLD_W, y: sr() * WORLD_H, vy: 12 + sr() * 26, drift: sr() * 30 - 15, size: 1 + sr() * 2.2, phase: sr() * 10 });
    }

    // мастерская: загружаем сохранённые пользовательские спрайты
    this.spriteCfg = loadWorkshop();
    for (const [k, cfg] of Object.entries(this.spriteCfg)) this.loadSpriteImg(k, cfg.dataUrl);

    this.genTerrain(42);
    this.bind();
    this.resize();
    this.lastT = performance.now();
    const loop = (t: number) => {
      if (this.destroyed) return;
      const dt = clamp((t - this.lastT) / 1000, 0, 0.033);
      this.lastT = t;
      this.time += dt;
      if (!this.paused) this.update(dt);
      this.render();
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
    this.emit();
  }

  // ================= ВВОД =================
  private onKeyDown = (e: KeyboardEvent) => {
    if (this.screen !== "game") return;
    const k = e.code;
    if (k === "Escape" || k === "KeyP") { this.togglePause(); e.preventDefault(); return; }
    if (this.paused) return;
    if (k === "KeyA" || k === "ArrowLeft") this.moveInput = -1;
    else if (k === "KeyD" || k === "ArrowRight") this.moveInput = 1;
    else if (k === "KeyW" || k === "Space" || k === "ArrowUp") { this.jump(); e.preventDefault(); }
    else if (/^Digit[1-8]$/.test(k)) {
      const h = this.cur();
      if (h && h.team === 0 && this.phase === "aim") {
        const slots = [h.sig, ...ARMORY_IDS];
        const idx = parseInt(k.slice(5), 10) - 1;
        if (slots[idx]) this.setWeapon(slots[idx]);
      }
    }
  };
  private onKeyUp = (e: KeyboardEvent) => {
    const k = e.code;
    if ((k === "KeyA" || k === "ArrowLeft") && this.moveInput === -1) this.moveInput = 0;
    if ((k === "KeyD" || k === "ArrowRight") && this.moveInput === 1) this.moveInput = 0;
  };
  private onResize = () => this.resize();
  private onContextMenu = (e: Event) => e.preventDefault();

  private toLogical(clientX: number, clientY: number) {
    const r = this.canvas.getBoundingClientRect();
    const S = this.scale * this.zoom;
    return { x: (clientX - r.left - this.cw / 2) / S + this.camX, y: (clientY - r.top - this.ch / 2) / S + this.camY };
  }

  private onPointerDown = (e: PointerEvent) => {
    if (this.screen !== "game" || this.paused || this.shopOpen) return;
    if (e.button === 2) { this.panning = { x: e.clientX, y: e.clientY }; this.canvas.setPointerCapture(e.pointerId); return; }
    if (this.phase !== "aim" || this.cur().team !== 0) return;
    sfx.ensure();
    const p = this.toLogical(e.clientX, e.clientY);
    if (this.blinkMode) { this.tryBlink(p.x, p.y); return; }
    this.updateAim(p.x, p.y);
    const def = weaponById[this.cur().weapon];
    if (def.kind === "melee" || def.kind === "beam") { this.fire(); return; }
    this.charging = true;
    this.power = 0;
    this.canvas.setPointerCapture(e.pointerId);
  };
  private onPointerMove = (e: PointerEvent) => {
    if (this.screen !== "game") return;
    if (this.panning) {
      const S = this.scale * this.zoom;
      this.camX -= (e.clientX - this.panning.x) / S;
      this.camY -= (e.clientY - this.panning.y) / S;
      this.panning.x = e.clientX;
      this.panning.y = e.clientY;
      this.camClamp();
      return;
    }
    const p = this.toLogical(e.clientX, e.clientY);
    this.updateAim(p.x, p.y);
  };
  private onPointerUp = () => {
    if (this.panning) { this.panning = null; return; }
    if (this.charging) {
      this.charging = false;
      if (this.power > 0.06) this.fire();
      else this.power = 0;
    }
  };
  private onWheel = (e: WheelEvent) => {
    if (this.screen !== "game") return;
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.13 : 0.885;
    this.zoom = clamp(this.zoom * factor, this.zoomMin, Math.max(3.2, this.zoomMin));
    this.camClamp();
  };

  private bind() {
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    window.addEventListener("resize", this.onResize);
    this.canvas.addEventListener("pointerdown", this.onPointerDown);
    this.canvas.addEventListener("pointermove", this.onPointerMove);
    this.canvas.addEventListener("pointerup", this.onPointerUp);
    this.canvas.addEventListener("pointercancel", this.onPointerUp);
    this.canvas.addEventListener("contextmenu", this.onContextMenu);
    this.canvas.addEventListener("wheel", this.onWheel, { passive: false });
  }

  destroy() {
    this.destroyed = true;
    cancelAnimationFrame(this.raf);
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    window.removeEventListener("resize", this.onResize);
    this.canvas.removeEventListener("pointerdown", this.onPointerDown);
    this.canvas.removeEventListener("pointermove", this.onPointerMove);
    this.canvas.removeEventListener("pointerup", this.onPointerUp);
    this.canvas.removeEventListener("pointercancel", this.onPointerUp);
    this.canvas.removeEventListener("contextmenu", this.onContextMenu);
    this.canvas.removeEventListener("wheel", this.onWheel);
  }

  private resize() {
    const parent = this.canvas.parentElement!;
    const w = parent.clientWidth || window.innerWidth;
    const h = parent.clientHeight || window.innerHeight;
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.round(w * this.dpr);
    this.canvas.height = Math.round(h * this.dpr);
    this.canvas.style.width = w + "px";
    this.canvas.style.height = h + "px";
    this.cw = w; this.ch = h;
    this.scale = Math.min(w / WORLD_W, h / WORLD_H);
    // минимальный зум = 1: вся карта целиком на экране; сверху небо, снизу жерло
    this.zoomMin = 1;
    this.zoom = clamp(this.zoom, 1, 3.2);
    this.oy = (h - WORLD_H * this.scale) / 2;
    this.camClamp();
  }

  private camClamp() {
    if (!this.scale) return;
    const S = this.scale * this.zoom;
    const viewW = this.cw / S;
    const viewH = this.ch / S;
    if (viewW >= WORLD_W) this.camX = WORLD_W / 2;
    else this.camX = clamp(this.camX, viewW / 2, WORLD_W - viewW / 2);
    if (viewH >= WORLD_H) this.camY = WORLD_H / 2;
    else this.camY = clamp(this.camY, viewH / 2, WORLD_H - viewH / 2);
  }

  // ================= ПУБЛИЧНОЕ API =================
  startGame(diff: Difficulty, map: MapId = "canyon", mode: BattleMode = 4) {
    sfx.ensure();
    sfx.startMusic();
    this.difficulty = diff;
    this.map = map;
    this.mode = mode;
    this.screen = "game";
    this.paused = false;
    this.winner = null;
    this.teamGold = [300, 300];
    this.stats = { kills: [0, 0], dmg: [0, 0], gold: [0, 0] };
    this.projs = [];
    this.crates = [];
    this.particles = [];
    this.dmgNums = [];
    this.fires = [];
    this.beams = [];
    this.pulls = [];
    this.decals = [];
    this.blinkMode = false;
    this.charging = false;
    this.shake = 0;
    this.redFlash = 0;
    this.whiteFlash = 0;
    this.turnCount = -1;
    this.genTerrain(Math.floor(rand(1, 99999)));
    this.raft.x = WORLD_W / 2;
    this.raft.dir = 1;
    this.spawnHeroes();
    this.spawnCrate();
    this.camX = this.heroes[0].x;
    this.camY = WORLD_H / 2;
    this.zoom = 1.6;
    this.camClamp();
    this.nextTurn();
  }

  toMenu() {
    this.screen = "menu";
    this.heroes = [];
    this.order = [];
    this.projs = [];
    this.crates = [];
    this.dmgNums = [];
    this.fires = [];
    this.beams = [];
    this.blinkMode = false;
    this.paused = false;
    this.genTerrain(Math.floor(rand(1, 99999)));
    sfx.click();
    this.emit();
  }

  togglePause() {
    if (this.screen !== "game" || this.winner !== null) return;
    if (this.shopOpen) {
      this.shopOpen = false;
      this.onShopClose?.();
      sfx.click();
      this.emit();
      return;
    }
    this.paused = !this.paused;
    if (this.paused) { this.charging = false; this.moveInput = 0; }
    sfx.click();
    this.emit();
  }

  toggleMute() {
    sfx.ensure();
    sfx.setMuted(!sfx.muted);
    this.emit();
  }

  setShopOpen(open: boolean) {
    this.shopOpen = open;
    if (open) { this.charging = false; this.blinkMode = false; }
    this.emit();
  }

  // ================= МАСТЕРСКАЯ =================
  getWorkshopData(): WorkshopData {
    return this.spriteCfg;
  }

  /** Установить/обновить спрайт слота (key — id героя, "crate" или "bg") */
  applySprite(key: string, cfg: SpriteConfig | null): boolean {
    if (cfg) {
      this.spriteCfg[key] = cfg;
      this.loadSpriteImg(key, cfg.dataUrl);
    } else {
      delete this.spriteCfg[key];
      this.sprites.delete(key);
    }
    const ok = saveWorkshop(this.spriteCfg);
    this.emit();
    return ok;
  }

  private loadSpriteImg(key: string, dataUrl: string) {
    const img = new Image();
    img.onload = () => {
      this.sprites.set(key, img);
      this.emit();
    };
    img.src = dataUrl;
  }

  private spriteOf(key: string): { img: HTMLImageElement; cfg: SpriteConfig } | null {
    const cfg = this.spriteCfg[key];
    const img = this.sprites.get(key);
    if (!cfg || !img || !img.complete || img.naturalWidth === 0) return null;
    return { img, cfg };
  }

  setMove(dir: -1 | 0 | 1) {
    if (this.screen === "game" && this.phase === "aim" && this.cur().team === 0) this.moveInput = dir;
  }

  setWeapon(id: string) {
    if (this.screen !== "game") return;
    const h = this.cur();
    if (this.phase !== "aim" || h.team !== 0) return;
    const slots = [h.sig, ...ARMORY_IDS];
    if (!slots.includes(id)) return;
    const def = weaponById[id];
    if (def.ammo !== -1 && (h.ammo[id] ?? 0) <= 0) { sfx.click(); return; }
    if (h.weapon === id) return;
    h.weapon = id;
    this.charging = false;
    this.power = 0;
    sfx.click();
    this.emit();
  }

  jump() {
    if (this.screen !== "game" || this.phase !== "aim") return;
    const h = this.cur();
    if (h.team !== 0) return;
    if (!h.onGround || this.moveLeft < JUMP_COST) return;
    h.vy = -430;
    h.onGround = false;
    this.moveLeft -= JUMP_COST;
    sfx.jump();
    this.emit();
  }

  endTurn() {
    if (this.screen !== "game" || this.paused) return;
    if (this.phase !== "aim" || this.cur().team !== 0) return;
    this.charging = false;
    this.blinkMode = false;
    this.moveInput = 0;
    this.phase = "settle";
    this.settleT = 0.35;
    sfx.click();
    this.emit();
  }

  toggleBlink() {
    const h = this.cur();
    if (this.phase !== "aim" || h.team !== 0 || !this.canBlink(h)) return;
    this.blinkMode = !this.blinkMode;
    sfx.click();
    this.emit();
  }

  useMek() {
    const h = this.cur();
    if (this.phase !== "aim" || h.team !== 0 || h.mek <= 0 || h.hp >= h.maxHp) return;
    h.mek--;
    h.hp = Math.min(h.maxHp, h.hp + 45);
    sfx.heal();
    this.dmgNums.push({ x: h.x, y: h.y - 88, life: 1.2, text: "+45", color: "#7ee08a", size: 17 });
    for (let i = 0; i < 12; i++) {
      this.particles.push({ x: h.x + rand(-10, 10), y: h.y - rand(0, 30), vx: rand(-25, 25), vy: rand(-70, -25), life: 0.8, max: 0.8, size: 2.5, color: "#7ee08a", grav: -30, kind: "heal" });
    }
    this.emit();
  }

  buyItem(id: string): boolean {
    if (this.phase !== "aim" || this.cur().team !== 0) return false;
    const def = ITEMS.find((i) => i.id === id);
    const h = this.cur();
    if (!def) return false;
    if (this.teamGold[0] < def.cost) return false;
    if (!def.consumable && h.items.has(id)) return false;
    this.teamGold[0] -= def.cost;
    if (def.consumable) h.mek++;
    else h.items.add(id);
    sfx.buy();
    this.dmgNums.push({ x: h.x, y: h.y - 88, life: 1.2, text: def.name, color: "#f5d67b", size: 13 });
    this.emit();
    return true;
  }

  // ================= ЛАНДШАФТ =================
  private genTerrain(seed: number) {
    const rng = mulberry32(seed);
    const oct = (step: number) => {
      const n = Math.ceil(WORLD_W / step) + 2;
      const anch: number[] = [];
      for (let i = 0; i < n; i++) anch.push(rng());
      return (x: number) => {
        const f = x / step;
        const i = Math.floor(f);
        const t = (1 - Math.cos((f - i) * Math.PI)) / 2;
        return lerp(anch[i], anch[i + 1], t);
      };
    };
    const o1 = oct(190), o2 = oct(62), o3 = oct(24);
    const frost = this.map === "frost";
    const jungle = this.map === "jungle";
    const inferno = this.map === "inferno";
    const amp1 = frost ? 300 : inferno ? 320 : jungle ? 200 : 250;
    const amp2 = frost ? 120 : inferno ? 140 : jungle ? 66 : 90;
    const amp3 = frost ? 30 : inferno ? 40 : jungle ? 10 : 16;
    for (let x = 0; x < WORLD_W; x++) {
      let h = 455 + (o1(x) - 0.5) * amp1 + (o2(x) - 0.5) * amp2 + (o3(x) - 0.5) * amp3;
      this.heights[x] = clamp(h, 260, 820);
    }
    const passes = frost || inferno ? 1 : jungle ? 3 : 2;
    for (let p = 0; p < passes; p++) {
      for (let x = 2; x < WORLD_W - 2; x++) {
        this.heights[x] = (this.heights[x - 2] + this.heights[x] * 2 + this.heights[x + 2]) / 4;
      }
    }
    if (frost || inferno) {
      const n = inferno ? 32 : 26;
      for (let i = 0; i < n; i++) {
        const cx = rng() * WORLD_W;
        const w = 12 + rng() * (inferno ? 40 : 30);
        const amp = (rng() < 0.55 ? -1 : 1) * (18 + rng() * (inferno ? 60 : 42));
        for (let x = Math.max(2, Math.floor(cx - w)); x <= Math.min(WORLD_W - 3, Math.ceil(cx + w)); x++) {
          const t = 1 - Math.abs(x - cx) / w;
          this.heights[x] = clamp(this.heights[x] + amp * t * t, 260, 820);
        }
      }
    }
    // площадки под спауны
    const fracs = spawnFracs(this.mode);
    for (const team of [0, 1] as Team[]) {
      for (const fr of fracs[team]) {
        const sx = Math.round(fr * WORLD_W);
        const base = this.heights[clamp(sx, 0, WORLD_W - 1)];
        for (let x = sx - 44; x <= sx + 44; x++) {
          if (x < 4 || x > WORLD_W - 5) continue;
          const t = 1 - Math.abs(x - sx) / 44;
          this.heights[x] = Math.min(620, lerp(this.heights[x], base, t * 0.9));
        }
      }
    }
    // ===== глубокое центральное озеро, разделяющее команды =====
    const cx = WORLD_W / 2;
    for (let x = cx - LAKE_HALF; x <= cx + LAKE_HALF; x++) {
      if (x < 2 || x > WORLD_W - 3) continue;
      const d = Math.abs(x - cx);
      let target: number;
      if (d <= 130) {
        target = 776 + Math.sin(x * 0.11) * 2.4; // глубокое каменистое дно
      } else {
        const t = (d - 130) / (LAKE_HALF - 130);
        const s = t * t * (3 - 2 * t);
        target = lerp(776, this.heights[x], s) + (o2(x) - 0.5) * 30 * s;
      }
      this.heights[x] = clamp(target, 260, 820);
    }
    this.waterY = 668;

    // деревья по сторонам (подальше от озера)
    this.trees = [];
    for (const side of [0, 1] as Team[]) {
      for (let i = 0; i < 8; i++) {
        const x = side === 0 ? rand(90, WORLD_W / 2 - 430) : rand(WORLD_W / 2 + 430, WORLD_W - 90);
        this.trees.push({ x, baseY: this.surface(x), side, s: rand(1.3, 2.1), seed: rng() * 100, alive: true });
      }
    }

    // сталактиты и сталагмиты (ледяная карта)
    this.stalactites = [];
    this.stalagmites = [];
    if (frost) {
      for (let i = 0; i < 22; i++) {
        this.stalactites.push({ x: rng() * WORLD_W, w: 10 + rng() * 22, len: 40 + rng() * 120, lean: (rng() - 0.5) * 0.25 });
      }
      for (let i = 0; i < 16; i++) {
        const x = 60 + rng() * (WORLD_W - 120);
        const sy = this.surface(x);
        if (sy < WORLD_H - 60 && Math.abs(x - WORLD_W / 2) > LAKE_HALF + 40) {
          this.stalagmites.push({ x, w: 8 + rng() * 14, len: 22 + rng() * 46, lean: (rng() - 0.5) * 0.3 });
        }
      }
    }

    // лианы (джунгли)
    this.vines = [];
    if (this.map === "jungle") {
      for (let i = 0; i < 14; i++) {
        this.vines.push({ x: rng() * WORLD_W, len: 130 + rng() * 220, ph: rng() * 10 });
      }
    }

    // огненные столбы и адские шипы (Преисподняя)
    this.firePillars = [];
    this.hellSpikes = [];
    if (this.map === "inferno") {
      for (let i = 0; i < 6; i++) {
        const x = 120 + rng() * (WORLD_W - 240);
        if (Math.abs(x - WORLD_W / 2) > LAKE_HALF + 60) this.firePillars.push(x);
      }
      for (let i = 0; i < 18; i++) {
        const x = 60 + rng() * (WORLD_W - 120);
        const sy = this.surface(x);
        if (sy < WORLD_H - 60 && Math.abs(x - WORLD_W / 2) > LAKE_HALF + 40) {
          this.hellSpikes.push({ x, w: 7 + rng() * 12, len: 26 + rng() * 52, lean: (rng() - 0.5) * 0.3 });
        }
      }
    }

    // светлячки (джунгли)
    this.fireflies = [];
    if (this.map === "jungle") {
      for (let i = 0; i < 26; i++) {
        const x = rng() * WORLD_W;
        this.fireflies.push({ x, y: this.surface(x) - 40 - rng() * 120, ph: rng() * 10 });
      }
    }
    this.terrainDirty = true;
  }

  private surface(x: number) {
    return this.heights[clamp(Math.round(x), 0, WORLD_W - 1)];
  }

  // разрушение декораций в точке (x, y) радиусом r: деревья, шипы, сталактиты, лианы
  private smashDecor(x: number, y: number, r: number) {
    for (const t of this.trees) {
      if (t.alive && Math.hypot(t.x - x, t.baseY - 40 - y) < r + 34) {
        t.alive = false;
        for (let k = 0; k < 14; k++) {
          this.particles.push({ x: t.x + rand(-18, 18), y: t.baseY - rand(8, 80), vx: rand(-110, 110), vy: rand(-220, -30), life: rand(0.5, 1.1), max: 1.1, size: rand(2, 5), color: this.map === "jungle" ? "#2e7a3a" : this.map === "inferno" ? "#2a1a16" : t.side === 0 ? "#3f8a42" : "#4a2a24", grav: 520, kind: "chunk" });
        }
      }
    }
    const smashSpikes = (arr: Spike[]) => {
      for (let i = arr.length - 1; i >= 0; i--) {
        const s = arr[i];
        const sy = this.surface(s.x);
        if (Math.hypot(s.x - x, sy - s.len / 2 - y) < r + 12) {
          for (let k = 0; k < 6; k++) {
            this.particles.push({ x: s.x + rand(-6, 6), y: sy - rand(0, s.len), vx: rand(-140, 140), vy: rand(-260, -40), life: rand(0.4, 0.8), max: 0.8, size: rand(1.6, 3.2), color: "#c8ccd4", grav: 600, kind: "chunk" });
          }
          arr.splice(i, 1);
        }
      }
    };
    smashSpikes(this.stalagmites);
    smashSpikes(this.hellSpikes);
    for (let i = this.stalactites.length - 1; i >= 0; i--) {
      const s = this.stalactites[i];
      if (Math.hypot(s.x - x, s.len / 2 - y) < r + 12) {
        for (let k = 0; k < 6; k++) {
          this.particles.push({ x: s.x + rand(-6, 6), y: rand(4, s.len), vx: rand(-120, 120), vy: rand(40, 240), life: rand(0.4, 0.8), max: 0.8, size: rand(1.6, 3.2), color: "#cfe8f6", grav: 600, kind: "chunk" });
        }
        this.stalactites.splice(i, 1);
      }
    }
    for (let i = this.vines.length - 1; i >= 0; i--) {
      const v = this.vines[i];
      if (Math.abs(v.x - x) < r + 10 && y < v.len + 10) this.vines.splice(i, 1);
    }
  }

  // пересчёт непрерывной области озера (вода растекается от центра, кратеры затапливаются)
  private updateLakeBounds() {
    const level = this.waterY;
    const cx = Math.round(WORLD_W / 2);
    if (this.heights[cx] <= level) { this.hasLake = false; return; }
    let sa = cx, sb = cx;
    while (sa > 1 && this.heights[sa - 1] > level) sa--;
    while (sb < WORLD_W - 2 && this.heights[sb + 1] > level) sb++;
    this.lakeL = sa;
    this.lakeR = sb;
    this.hasLake = true;
  }

  private waterLevelAt(x: number): number | null {
    if (!this.hasLake) return null;
    const xi = Math.round(x);
    if (xi < this.lakeL || xi > this.lakeR) return null;
    const sy = this.surface(xi);
    return sy > this.waterY ? this.waterY : null;
  }

  private carve(cx: number, cy: number, r: number) {
    const x0 = Math.max(0, Math.floor(cx - r));
    const x1 = Math.min(WORLD_W - 1, Math.ceil(cx + r));
    for (let x = x0; x <= x1; x++) {
      const dx = x - cx;
      const s = Math.sqrt(Math.max(0, r * r - dx * dx));
      const top = cy - s, bot = cy + s;
      if (this.heights[x] > top && this.heights[x] < bot) {
        this.heights[x] = Math.min(WORLD_H + 1400, bot);
      }
    }
    this.terrainDirty = true;
  }

  // сглаживание краёв кратера — воронка становится чашей, а не колодцем с отвесными стенами
  private smoothCrater(a: number, b: number) {
    const x0 = clamp(Math.floor(a), 2, WORLD_W - 3);
    const x1 = clamp(Math.ceil(b), 2, WORLD_W - 3);
    if (x1 <= x0) return;
    for (let pass = 0; pass < 2; pass++) {
      for (let x = x0; x <= x1; x++) {
        if (this.heights[x] > WORLD_H) continue; // дыры до лавы не трогаем
        const prev = this.heights[x - 2] > WORLD_H ? this.heights[x] : this.heights[x - 2];
        const next = this.heights[x + 2] > WORLD_H ? this.heights[x] : this.heights[x + 2];
        this.heights[x] = (prev + this.heights[x] * 2 + next) / 4;
      }
    }
    this.terrainDirty = true;
  }

  private renderTerrainImage() {
    const c = this.terrainCanvas.getContext("2d")!;
    const H = WORLD_H, half = WORLD_W / 2;
    const frost = this.map === "frost";
    const jungle = this.map === "jungle";
    const inferno = this.map === "inferno";
    c.clearRect(0, 0, WORLD_W, H);
    const biomes = frost
      ? [
          { dirtTop: "#a8d4e8", dirtMid: "#4a86b0", dirtDeep: "#122b46", grass: "#e8f4fb", grassHi: "#ffffff", edge: "#9fc8e0", tufts: ["#f0f8fd", "#cfe4f2", "#e0eef8"] },
          { dirtTop: "#9fc4e0", dirtMid: "#3f74a0", dirtDeep: "#101f38", grass: "#e0eefb", grassHi: "#f6fbff", edge: "#8fb4d4", tufts: ["#e8f2fb", "#c4d8ee", "#d8e8f6"] },
        ]
      : jungle
      ? [
          { dirtTop: "#5a4a26", dirtMid: "#40331a", dirtDeep: "#20180c", grass: "#3fae4e", grassHi: "#7ed957", edge: "#2c8a3a", tufts: ["#5fcf6a", "#2f9440", "#4cb85a"] },
          { dirtTop: "#4a3d20", dirtMid: "#352b12", dirtDeep: "#1a140a", grass: "#359446", grassHi: "#6bc24e", edge: "#268034", tufts: ["#4cb85a", "#27823a", "#3fae4e"] },
        ]
      : inferno
      ? [
          { dirtTop: "#4a2a22", dirtMid: "#301812", dirtDeep: "#140906", grass: "#8a3a24", grassHi: "#c2502e", edge: "#6a2a18", tufts: ["#a04a2c", "#7c3a20", "#b0562f"] },
          { dirtTop: "#3c241e", dirtMid: "#281410", dirtDeep: "#100705", grass: "#7c3420", grassHi: "#b04828", edge: "#5c2416", tufts: ["#944426", "#70321c", "#a04e2a"] },
        ]
      : [
          { dirtTop: "#6b532f", dirtMid: "#4a3520", dirtDeep: "#241708", grass: "#7fae45", grassHi: "#a8d468", edge: "#5d8432", tufts: ["#93c255", "#6b9a3a", "#86b84c"] },
          { dirtTop: "#57382e", dirtMid: "#3a251d", dirtDeep: "#180d09", grass: "#a34a2e", grassHi: "#c96a40", edge: "#7c3a24", tufts: ["#c05f3a", "#8a4026", "#a8512f"] },
        ];
    for (const side of [0, 1] as const) {
      const xa = side === 0 ? 0 : half;
      const xb = side === 0 ? half : WORLD_W;
      const b = biomes[side];
      const segs: [number, number][] = [];
      let s = -1;
      for (let x = xa; x <= xb; x++) {
        const y = x < WORLD_W ? this.heights[x] : H + 99;
        if (y < H - 0.5) { if (s < 0) s = x; }
        else if (s >= 0) { segs.push([s, x - 1]); s = -1; }
      }
      if (s >= 0) segs.push([s, xb - 1]);
      if (!segs.length) continue;

      const buildPath = () => {
        c.beginPath();
        for (const [a, e] of segs) {
          c.moveTo(a, H + 4);
          for (let x = a; x <= e; x += 2) c.lineTo(x, this.heights[x]);
          c.lineTo(e, H + 4);
          c.closePath();
        }
      };

      // почва
      const g = c.createLinearGradient(0, 240, 0, H);
      g.addColorStop(0, b.dirtTop);
      g.addColorStop(0.32, b.dirtMid);
      g.addColorStop(1, b.dirtDeep);
      buildPath();
      c.fillStyle = g;
      c.fill();

      // внутренности под клипом
      c.save();
      buildPath();
      c.clip();
      // волнистые слои
      for (let y = 300; y < H; y += 34) {
        c.fillStyle = "rgba(0,0,0,0.10)";
        c.beginPath();
        c.moveTo(xa, y + 5);
        for (let x = xa; x <= xb; x += 26) c.lineTo(x, y + Math.sin(x * 0.05 + y) * 2.4);
        for (let x = xb; x >= xa; x -= 26) c.lineTo(x, y + 5 + Math.sin(x * 0.05 + y) * 2.4);
        c.closePath();
        c.fill();
      }
      const rng = mulberry32(1234 + side * 991);
      for (let i = 0; i < 340; i++) {
        const x = xa + rng() * (xb - xa);
        const y0 = this.heights[clamp(Math.round(x), 0, WORLD_W - 1)];
        const y = y0 + 10 + rng() * (H - y0);
        if (y > H - 3 || y0 >= H) continue;
        c.fillStyle = rng() > 0.5 ? "rgba(0,0,0,0.24)" : "rgba(255,214,150,0.05)";
        c.fillRect(x, y, 2, 2);
      }
      for (let i = 0; i < 11; i++) {
        const x = xa + rng() * (xb - xa);
        const y0 = this.heights[clamp(Math.round(x), 0, WORLD_W - 1)];
        const y = y0 + 26 + rng() * Math.max(10, H - y0 - 50);
        if (y > H - 8 || y0 >= H) continue;
        const r = 3 + rng() * 6;
        c.fillStyle = "rgba(0,0,0,0.28)";
        c.beginPath(); c.ellipse(x, y, r, r * 0.72, 0, 0, Math.PI * 2); c.fill();
        c.fillStyle = "rgba(255,220,170,0.08)";
        c.beginPath(); c.ellipse(x - r * 0.25, y - r * 0.3, r * 0.5, r * 0.34, 0, 0, Math.PI * 2); c.fill();
      }
      // корни у поверхности
      c.strokeStyle = "rgba(40,26,12,0.4)";
      c.lineWidth = 1.4;
      for (let i = 0; i < 8; i++) {
        const x = xa + rng() * (xb - xa);
        const y0 = this.heights[clamp(Math.round(x), 0, WORLD_W - 1)];
        if (y0 >= H) continue;
        c.beginPath();
        c.moveTo(x, y0 + 2);
        c.quadraticCurveTo(x + 6, y0 + 10, x + 3, y0 + 18);
        c.stroke();
      }
      if (side === 1 && !frost) {
        c.strokeStyle = "rgba(224,80,56,0.15)";
        c.lineWidth = 1.5;
        for (let i = 0; i < 10; i++) {
          let x = xa + rng() * (xb - xa);
          let y = this.heights[clamp(Math.round(x), 0, WORLD_W - 1)] + 8;
          c.beginPath(); c.moveTo(x, y);
          for (let k = 0; k < 5; k++) { x += (rng() - 0.5) * 22; y += 14 + rng() * 22; c.lineTo(x, y); }
          c.stroke();
        }
      }
      c.restore();

      // кромка: тень + трава
      c.lineWidth = 7;
      c.strokeStyle = "rgba(0,0,0,0.35)";
      for (const [a, e] of segs) {
        c.beginPath();
        c.moveTo(a, this.heights[a] + 3);
        for (let x = a; x <= e; x += 4) c.lineTo(x, this.heights[x] + 3);
        c.stroke();
      }
      c.lineWidth = 4;
      c.strokeStyle = b.grass;
      for (const [a, e] of segs) {
        c.beginPath();
        c.moveTo(a, this.heights[a]);
        for (let x = a; x <= e; x += 4) c.lineTo(x, this.heights[x]);
        c.stroke();
      }
      c.lineWidth = 1.6;
      c.strokeStyle = b.grassHi;
      for (const [a, e] of segs) {
        c.beginPath();
        c.moveTo(a, this.heights[a] - 1);
        for (let x = a; x <= e; x += 4) c.lineTo(x, this.heights[x] - 1);
        c.stroke();
      }

      // декор кромки
      if (frost) {
        for (let x = xa + 4; x < Math.min(xb, WORLD_W); x += 16) {
          const y0 = this.heights[x];
          if (y0 >= H) continue;
          const r2 = mulberry32(x * 17 + side * 31);
          c.fillStyle = r2() > 0.4 ? b.tufts[0] : b.tufts[1];
          c.beginPath();
          c.ellipse(x, y0 - 1.2, 7 + r2() * 5, 3.2 + r2() * 2, 0, Math.PI, 0);
          c.fill();
        }
        c.fillStyle = "rgba(255,255,255,0.75)";
        for (let x = xa + 8; x < Math.min(xb, WORLD_W); x += 23) {
          const y0 = this.heights[x];
          if (y0 >= H) continue;
          const r2 = mulberry32(x * 29 + side * 3);
          c.fillRect(x + r2() * 6, y0 - 3 - r2() * 2, 1.6, 1.6);
        }
      } else {
        for (let x = xa + 5; x < Math.min(xb, WORLD_W); x += 7) {
          const y0 = this.heights[x];
          if (y0 >= H) continue;
          const r2 = mulberry32(x * 13 + side * 7);
          const n = 2 + Math.floor(r2() * 2);
          for (let k = 0; k < n; k++) {
            c.strokeStyle = b.tufts[k % 3];
            c.lineWidth = 1.2;
            const bx = x + (k - n / 2) * 2.6 + (r2() - 0.5) * 2;
            const hgt = 3 + r2() * 5.5;
            c.beginPath();
            c.moveTo(bx, y0);
            c.quadraticCurveTo(bx + (r2() - 0.5) * 2.5, y0 - hgt * 0.6, bx + (r2() - 0.5) * 4.5, y0 - hgt);
            c.stroke();
          }
          const det = r2();
          if (det > 0.86) {
            if (jungle) {
              // папоротник / крупный лист
              c.strokeStyle = det > 0.93 ? "#5fcf6a" : "#2f9440";
              c.lineWidth = 1.4;
              const fx = x + 2, fy = y0;
              c.beginPath();
              c.moveTo(fx, fy);
              c.quadraticCurveTo(fx + (det > 0.93 ? 8 : -8), fy - 9, fx + (det > 0.93 ? 15 : -15), fy - 6);
              c.stroke();
            } else if (inferno) {
              // тлеющий уголёк / кость
              c.fillStyle = det > 0.93 ? "rgba(255,120,50,0.6)" : "rgba(220,210,190,0.5)";
              if (det > 0.93) { c.beginPath(); c.ellipse(x - 2, y0 - 1, 2, 1.2, 0, 0, Math.PI * 2); c.fill(); }
              else { c.fillRect(x - 4, y0 - 2.4, 8, 1.8); }
            } else {
              c.fillStyle = side === 0 ? (det > 0.93 ? "#ffe9a0" : "#f2f0e4") : "rgba(90,80,74,0.7)";
              if (side === 0) { c.beginPath(); c.arc(x + 2, y0 - 7 - det * 3, 1.4, 0, Math.PI * 2); c.fill(); }
              else { c.beginPath(); c.ellipse(x - 2, y0 - 0.7, 1.8, 1.1, 0, 0, Math.PI * 2); c.fill(); }
            }
          }
        }
        // светящиеся трещины Преисподней
        if (inferno) {
          c.strokeStyle = "rgba(255,120,40,0.4)";
          c.lineWidth = 1.6;
          for (let x = xa + 20; x < Math.min(xb, WORLD_W) - 20; x += 47) {
            const y0 = this.heights[x];
            if (y0 >= H) continue;
            const r2 = mulberry32(x * 41 + side * 13);
            c.beginPath();
            c.moveTo(x, y0 + 2);
            c.lineTo(x + 5, y0 + 8);
            c.lineTo(x + 2, y0 + 14);
            c.stroke();
            if (r2() > 0.6) {
              c.fillStyle = `rgba(255,150,60,${0.25 + r2() * 0.2})`;
              c.beginPath(); c.arc(x + 3, y0 + 8, 1.6, 0, Math.PI * 2); c.fill();
            }
          }
        }
      }
    }
    this.terrainDirty = false;
  }

  // ================= ГЕРОИ / ХОДЫ =================
  private spawnHeroes() {
    this.heroes = [];
    const fracs = spawnFracs(this.mode);
    ([0, 1] as Team[]).forEach((team) => {
      const roster = this.mode === 10 ? [...ROSTERS[team], ...ROSTERS_EXTRA[team]] : ROSTERS[team];
      roster.forEach((def, i) => {
        const x = clamp(fracs[team][i] * WORLD_W + rand(-20, 20), 30, WORLD_W - 30);
        const ammo: Record<string, number> = {};
        for (const w of Object.values(weaponById)) {
          if (w.ammo !== -1 && (ARMORY_IDS.includes(w.id) || w.id === def.sig)) ammo[w.id] = w.ammo;
        }
        this.heroes.push({
          team, type: def.type, name: def.name, sig: def.sig,
          x, y: this.surface(x), vy: 0,
          hp: 100, maxHp: 100, alive: true, onGround: true, wet: false,
          items: new Set(), mek: 0, blinkCd: 0, usedBlink: false,
          flashT: 0, walkPhase: 0, swingT: 0,
          weapon: def.sig, ammo,
        });
      });
    });
    this.order = [];
    for (let i = 0; i < this.mode; i++) {
      this.order.push(this.heroes[i], this.heroes[this.mode + i]);
    }
  }

  private cur(): Hero { return this.order[this.curIdx]; }

  private canBlink(h: Hero) { return h.items.has("blink") && !h.usedBlink && h.blinkCd <= 0; }

  private nextTurn() {
    if (this.winner !== null) return;
    for (let step = 0; step < this.order.length; step++) {
      this.turnCount++;
      const idx = this.turnCount % this.order.length;
      if (this.order[idx].alive) { this.curIdx = idx; this.beginTurn(); return; }
    }
  }

  private beginTurn() {
    const h = this.cur();
    const crateCap = this.mode === 10 ? 3 : 2;
    if (this.turnCount % this.order.length === 0 && this.turnCount > 0 && this.crates.length < crateCap) {
      this.spawnCrate();
    }
    const income = Math.round(INCOME_PER_TURN * (h.team === 1 ? AI_INCOME[this.difficulty] : 1));
    this.teamGold[h.team] += income;
    this.stats.gold[h.team] += income;
    if (h.team === 0) sfx.coin();
    if (h.blinkCd > 0) h.blinkCd--;
    h.usedBlink = false;
    this.moveMax = h.items.has("boots") ? BOOTS_MOVE : BASE_MOVE;
    this.moveLeft = this.moveMax;
    this.wind = Math.round(rand(-70, 70));
    this.timer = TURN_TIME;
    this.lastTickSec = TURN_TIME;
    this.charging = false;
    this.blinkMode = false;
    this.moveInput = 0;
    this.power = 0;

    if (h.team === 1) {
      this.phase = "ai";
      this.aiShop(h);
      this.aiPlan(h);
    } else {
      this.phase = "aim";
      sfx.banner();
    }
    this.emit();
  }

  private aiShop(h: Hero) {
    const g = this.teamGold[1];
    if (g < 150 || Math.random() > 0.45) return;
    if (h.hp < 55 && g >= 150) { h.mek++; this.teamGold[1] -= 150; return; }
    const perms = ["blink", "boots", "ring", "aghs"].filter((id) => !h.items.has(id));
    const affordable = perms.filter((id) => ITEMS.find((i) => i.id === id)!.cost <= g);
    if (affordable.length && Math.random() < 0.5) {
      const id = affordable[Math.floor(Math.random() * affordable.length)];
      h.items.add(id);
      this.teamGold[1] -= ITEMS.find((i) => i.id === id)!.cost;
    }
  }

  private aiPlan(h: Hero) {
    const enemies = this.heroes.filter((e) => e.team === 0 && e.alive);
    if (!enemies.length) return;
    let tx: number, ty: number;
    if (this.crates.length && Math.random() < 0.2) {
      tx = this.crates[0].x; ty = this.crates[0].y;
    } else {
      const sorted = [...enemies].sort((a, b) => a.hp - b.hp);
      const target = Math.random() < 0.6 ? sorted[0] : enemies[Math.floor(Math.random() * enemies.length)];
      tx = target.x + rand(-10, 10);
      ty = target.y - 12;
    }
    const sigDef = weaponById[h.sig];
    const hasAmmo = (id: string) => { const d = weaponById[id]; return d.ammo === -1 || (h.ammo[id] ?? 0) > 0; };
    let wid = "cannon";
    if (sigDef.kind !== "melee" && sigDef.kind !== "beam" && hasAmmo(h.sig) && Math.random() < 0.5) wid = h.sig;
    else if (hasAmmo("cluster") && Math.random() < 0.18) wid = "cluster";
    else if (hasAmmo("napalm") && Math.random() < 0.14) wid = "napalm";
    else if (hasAmmo("dynamite") && Math.random() < 0.1) wid = "dynamite";
    h.weapon = wid;
    const def = weaponById[wid];

    const y0 = h.y - HERO_CY;
    const err = AI_ERR[this.difficulty] * rand(-1, 1);
    const useBeam = sigDef.kind === "beam" && hasAmmo(h.sig) && Math.random() < 0.45;
    let angle: number, speed: number;
    if (useBeam) {
      // луч бьёт по прямой
      angle = Math.atan2(ty - y0, tx - h.x);
      speed = 0;
    } else if (def.gravMul < 0.5) {
      angle = Math.atan2(ty - y0, tx - h.x);
      speed = AI_SHOT_SPEED * def.speedMul * 0.96;
    } else {
      const shot = this.solveBallistic(h.x, y0, tx, ty, GRAVITY * def.gravMul, AI_SHOT_SPEED * def.speedMul);
      angle = shot.angle;
      speed = shot.speed;
    }
    angle += err * (useBeam ? 0.3 : 1);
    speed *= 1 + rand(-0.04, 0.04);

    this.ai = {
      stage: "think", t: 0, dur: 0.7,
      dir: Math.random() < 0.45 ? (Math.random() < 0.5 ? -1 : 1) : 0,
      angle, speed, beam: useBeam,
    };
    if (h.mek > 0 && h.hp < h.maxHp - 40) {
      h.mek--; h.hp = Math.min(h.maxHp, h.hp + 45);
      this.dmgNums.push({ x: h.x, y: h.y - 88, life: 1.2, text: "+45", color: "#7ee08a", size: 15 });
    }
  }

  private solveBallistic(x0: number, y0: number, tx: number, ty: number, g: number, vmax: number) {
    const dx = tx - x0, dy = ty - y0;
    const adx = Math.max(40, Math.abs(dx));
    let v = clamp(26 * Math.sqrt(adx) + 240, 340, vmax);
    for (let tries = 0; tries < 9; tries++) {
      const a = (g * adx * adx) / (2 * v * v);
      const disc = adx * adx - 4 * a * (a - dy);
      if (disc >= 0) {
        const T = (adx - Math.sqrt(disc)) / (2 * a);
        const base = Math.atan(T);
        return { angle: dx > 0 ? -base : Math.PI + base, speed: v };
      }
      v += 110;
      if (v > vmax) break;
    }
    return { angle: dx > 0 ? -1.15 : Math.PI + 1.15, speed: vmax };
  }

  private aiUpdate(dt: number) {
    const h = this.cur();
    if (!h.alive) { this.phase = "settle"; this.settleT = 0.3; return; }
    this.ai.t += dt;
    if (this.ai.stage === "think" && this.ai.t >= this.ai.dur) {
      if (this.ai.dir !== 0 && this.moveLeft > 20) {
        this.ai.stage = "move"; this.ai.t = 0;
        this.ai.dur = Math.min(0.65, this.moveLeft / 150);
        this.moveInput = this.ai.dir as -1 | 1;
      } else { this.ai.stage = "aim"; this.ai.t = 0; this.ai.dur = 0.55; }
    } else if (this.ai.stage === "move" && this.ai.t >= this.ai.dur) {
      this.moveInput = 0;
      this.ai.stage = "aim"; this.ai.t = 0; this.ai.dur = 0.55;
    } else if (this.ai.stage === "aim") {
      this.aimAngle = this.ai.angle;
      if (this.ai.t >= this.ai.dur) {
        this.ai.stage = "done";
        if (this.ai.beam) {
          h.weapon = h.sig;
          const sd = weaponById[h.sig];
          if (sd.ammo !== -1) h.ammo[h.sig] = (h.ammo[h.sig] ?? 0) - 1;
          this.doBeam(h, sd);
        } else {
          this.launchProjectile(h, this.ai.angle, this.ai.speed);
        }
      }
    }
  }

  // ================= СТРЕЛЬБА =================
  private updateAim(mx: number, my: number) {
    if (this.screen !== "game" || this.phase !== "aim") return;
    const h = this.cur();
    if (h.team !== 0) return;
    this.aimAngle = Math.atan2(my - (h.y - HERO_CY), mx - h.x);
  }

  private fire() {
    const h = this.cur();
    if (this.paused || this.phase !== "aim" || h.team !== 0) return;
    const def = weaponById[h.weapon];
    if (def.ammo !== -1) {
      const av = h.ammo[def.id] ?? 0;
      if (av <= 0) {
        this.dmgNums.push({ x: h.x, y: h.y - 90, life: 1, text: "Заряды кончились!", color: "#c9c2ae", size: 13 });
        sfx.click();
        return;
      }
      h.ammo[def.id] = av - 1;
    }
    this.moveInput = 0;
    const pw = this.power;
    this.charging = false;
    this.power = 0;

    if (def.kind === "melee") { this.doMelee(h, def); return; }
    if (def.kind === "beam") { this.doBeam(h, def); return; }
    this.launchProjectile(h, this.aimAngle, (SHOT_MIN + pw * SHOT_SPAN) * def.speedMul);
  }

  private mkProj(x: number, y: number, angle: number, speed: number, def: WeaponDef, team: Team, mini = false, shooter: Hero | null = null): Proj {
    return {
      x, y,
      vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
      def, team,
      fuseT: def.fuse ?? -1, lastFuseSec: 99,
      bounces: 0, spin: rand(0, 6), mini,
      ox: x, oy: y, shooter,
    };
  }

  private launchProjectile(h: Hero, angle: number, speed: number) {
    const def = weaponById[h.weapon];
    const mx = h.x + Math.cos(angle) * 22 * HS;
    const my = h.y - HERO_CY + Math.sin(angle) * 22 * HS;
    if (def.kind === "pellets") {
      const n = def.pellets ?? 5;
      for (let i = 0; i < n; i++) {
        const t = n === 1 ? 0.5 : i / (n - 1);
        const ang = angle + (t - 0.5) * 2 * (def.spread ?? 0.1) + rand(-0.015, 0.015);
        this.projs.push(this.mkProj(mx, my, ang, speed * rand(0.9, 1.08), def, h.team));
      }
    } else {
      this.projs.push(this.mkProj(mx, my, angle, speed, def, h.team, false, def.kind === "hook" ? h : null));
    }
    this.phase = "flight";
    this.muzzleFx(mx, my, angle, def.kind === "pellets" ? 12 : 8);
    if (def.kind === "fuse") sfx.whoosh();
    if (def.kind === "hook") sfx.hookThrow();
    else sfx.shoot();
    this.emit();
  }

  private muzzleFx(x: number, y: number, a: number, n = 8) {
    for (let i = 0; i < n; i++) {
      const d = a + rand(-0.4, 0.4);
      const s = rand(60, 200);
      this.particles.push({ x: x + Math.cos(a) * 6, y: y + Math.sin(a) * 6, vx: Math.cos(d) * s, vy: Math.sin(d) * s, life: 0.25, max: 0.25, size: 2.2, color: "#ffd27b", grav: 100, kind: "spark" });
    }
  }

  private doMelee(h: Hero, def: WeaponDef) {
    sfx.whoosh();
    h.swingT = 0.3;
    const dx = Math.cos(this.aimAngle), dy = Math.sin(this.aimAngle);
    const mul = h.items.has("aghs") ? 1.45 : 1;
    let hit = false;
    for (const t of this.heroes) {
      if (!t.alive || t === h) continue;
      const ddx = t.x - h.x, ddy = t.y - h.y;
      const d = Math.max(1, Math.hypot(ddx, ddy));
      if (d < (def.range ?? 60) + 14 && ((ddx * dx + ddy * dy) / d > 0.25 || d < 40)) {
        hit = true;
        this.damageHero(t, Math.round(def.damage * mul), h.team);
        t.vy = -280;
        t.onGround = false;
        t.wet = false;
        t.x = clamp(t.x + (ddx >= 0 ? 30 : -30), 18, WORLD_W - 18);
      }
    }
    const sx = h.x + dx * (def.range ?? 60) * 0.6;
    this.carve(sx, this.surface(sx) + 2, 13);
    this.smashDecor(sx, this.surface(sx), 22);
    if (hit) sfx.hurt();
    this.phase = "settle";
    this.settleT = 0.05;
    this.emit();
  }

  private segDist(px: number, py: number, x1: number, y1: number, x2: number, y2: number) {
    const dx = x2 - x1, dy = y2 - y1;
    const L2 = dx * dx + dy * dy;
    let t = L2 ? ((px - x1) * dx + (py - y1) * dy) / L2 : 0;
    t = clamp(t, 0, 1);
    return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
  }

  private doBeam(h: Hero, def: WeaponDef) {
    const a = this.aimAngle;
    const dx = Math.cos(a), dy = Math.sin(a);
    const x0 = h.x + dx * 24 * HS, y0 = h.y - HERO_CY + dy * 24 * HS;
    let dist = 0, x1 = x0, y1 = y0;
    while (dist < 1600) {
      dist += 6;
      x1 = x0 + dx * dist; y1 = y0 + dy * dist;
      if (x1 < 0 || x1 > WORLD_W - 1) break;
      if (y1 >= this.surface(x1) + 2) break;
    }
    for (let s2 = 0; s2 <= dist; s2 += 9) this.carve(x0 + dx * s2, y0 + dy * s2, 8);
    for (let s2 = 0; s2 <= dist; s2 += 60) this.smashDecor(x0 + dx * s2, y0 + dy * s2, 16);
    this.smoothCrater(Math.min(x0, x1) - 16, Math.max(x0, x1) + 16);
    const mul = h.items.has("aghs") ? 1.45 : 1;
    for (const t of this.heroes) {
      if (!t.alive) continue;
      if (this.segDist(t.x, t.y - HERO_CY, x0, y0, x1, y1) < 26) {
        this.damageHero(t, Math.round(def.damage * mul), h.team);
        t.vy = -200;
        t.onGround = false;
      }
    }
    this.beams.push({ x1: x0, y1: y0, x2: x1, y2: y1, t: 0.4 });
    sfx.zap();
    this.shake = Math.min(26, this.shake + 9);
    this.phase = "settle";
    this.settleT = 0;
    this.emit();
  }

  private hookHit(p: Proj, target: Hero) {
    const shooter = p.shooter;
    this.damageHero(target, p.def.damage, p.team);
    sfx.hookHit();
    sfx.chainDrag();
    for (let i = 0; i < 10; i++) {
      const a = rand(0, Math.PI * 2), s = rand(40, 160);
      this.particles.push({ x: target.x, y: target.y - 18, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.35, max: 0.35, size: 2, color: "#c8ccd4", grav: 300, kind: "spark" });
    }
    if (shooter && target.alive) {
      const stopX = clamp(shooter.x + (target.x < shooter.x ? -34 : 34), 18, WORLD_W - 18);
      this.pulls.push({ h: target, fromX: target.x, fromY: target.y - 14, toX: stopX, t: 0 });
      target.onGround = false;
      target.wet = false;
    }
  }

  private updateProjectiles(dt: number) {
    for (let i = this.projs.length - 1; i >= 0; i--) {
      const p = this.projs[i];
      const def = p.def;
      const px0 = p.x, py0 = p.y;
      p.vy += GRAVITY * def.gravMul * dt;
      p.vx += this.wind * def.windMul * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.spin += dt * (def.kind === "fuse" ? 7 : def.id === "axe" ? 13 : 4);

      if (def.kind !== "pellets" || Math.random() < 0.4) {
        const trail = def.ice ? "rgba(150,220,255,0.7)" : def.id === "napalm" ? "rgba(255,140,59,0.75)" : "rgba(255,150,60,0.6)";
        this.particles.push({ x: p.x + rand(-1.5, 1.5), y: p.y + rand(-1.5, 1.5), vx: rand(-12, 12), vy: rand(-12, 12), life: 0.28, max: 0.28, size: def.kind === "pellets" ? 1.6 : 2.4, color: trail, grav: 0, kind: "smoke" });
      }

      if (def.kind === "fuse") {
        p.fuseT -= dt;
        const s = Math.ceil(p.fuseT);
        if (s !== p.lastFuseSec && s <= 3 && s > 0) { sfx.tick(); p.lastFuseSec = s; }
        if (p.fuseT <= 0) { this.explodeProj(i); continue; }
      }

      // герои
      let hitHero: Hero | null = null;
      for (const t of this.heroes) {
        if (!t.alive) continue;
        if (Math.hypot(t.x - p.x, t.y - HERO_CY - p.y) < 17 * HS) { hitHero = t; break; }
      }
      if (hitHero) {
        if (def.kind === "hook") { this.hookHit(p, hitHero); this.projs.splice(i, 1); continue; }
        this.explodeProj(i); continue;
      }
      let boom = false;
      for (const cr of this.crates) {
        if (Math.hypot(cr.x - p.x, cr.y - p.y) < 22) { boom = true; break; }
      }
      if (boom) { this.explodeProj(i); continue; }

      // ландшафт
      const sy = this.surface(p.x);
      if (p.y >= sy && sy < WORLD_H) {
        if (def.kind === "fuse" && p.bounces < 3 && p.vy > 150) {
          p.y = sy - 2;
          p.vy *= -def.bounce!;
          p.vx *= 0.62;
          p.bounces++;
          sfx.land();
        } else if (def.kind === "hook") {
          for (let k = 0; k < 6; k++) {
            this.particles.push({ x: p.x, y: sy - 4, vx: rand(-60, 60), vy: -rand(20, 120), life: 0.3, max: 0.3, size: 1.8, color: "#c8ccd4", grav: 400, kind: "spark" });
          }
          sfx.land();
          this.projs.splice(i, 1); continue;
        } else if (def.kind === "pierce") {
          // пробивает грунт, оставляя канал вдоль траектории
          p.pierce = (p.pierce ?? 0) + 1;
          const dist = Math.hypot(p.x - px0, p.y - py0);
          const steps = Math.max(1, Math.ceil(dist / 13));
          for (let k = 0; k <= steps; k++) {
            const t = k / steps;
            this.carve(px0 + (p.x - px0) * t, py0 + (p.y - py0) * t, 10);
          }
          this.smashDecor(p.x, p.y, 14);
          for (let k = 0; k < 5; k++) {
            this.particles.push({ x: p.x, y: sy - 3, vx: rand(-90, 90), vy: -rand(30, 160), life: 0.35, max: 0.35, size: rand(1.5, 2.6), color: "#d8b48e", grav: 500, kind: "spark" });
          }
          p.vx *= 0.7; p.vy *= 0.7;
          if ((p.pierce ?? 0) > 6 || Math.hypot(p.vx, p.vy) < 240) { this.projs.splice(i, 1); continue; }
        } else { this.explodeProj(i); continue; }
      }

      // лава
      if (p.y > LAVA_TOP) {
        this.lavaSplash(p.x);
        if (def.kind === "fuse") { this.explodeProj(i); }
        else this.projs.splice(i, 1);
        continue;
      }

      // вода гасит снаряд (динамит взрывается под водой)
      const wl = this.waterLevelAt(p.x);
      if (wl !== null && p.y > wl && p.y < this.surface(p.x)) {
        this.waterSplash(p.x);
        if (def.kind === "fuse") { this.explodeProj(i); }
        else this.projs.splice(i, 1);
        continue;
      }

      if (p.x < -80 || p.x > WORLD_W + 80 || p.y > WORLD_H + 300) {
        this.projs.splice(i, 1);
      }
    }
    if (this.projs.length === 0 && this.phase === "flight") {
      this.phase = "settle";
      this.settleT = 0.2;
    }
  }

  private explodeProj(i: number) {
    const p = this.projs[i];
    this.projs.splice(i, 1);
    const def = p.def;
    const shooter = this.heroes.find((h) => h.team === p.team && h.alive);
    const aghs = shooter ? shooter.items.has("aghs") : false;
    const mul = aghs ? 1.45 : 1;
    const rmul = aghs ? 1.25 : 1;

    if (def.kind === "cluster" && !p.mini) {
      this.explode(p.x, p.y, 15 * rmul, 8 * mul, p.team, def, { endTurn: false, quiet: true });
      for (let k = 0; k < (def.clusters ?? 6); k++) {
        this.projs.push(this.mkProj(p.x + rand(-8, 8), p.y + rand(-8, 8), 0, 0, def, p.team, true));
        const m = this.projs[this.projs.length - 1];
        m.vx = rand(-300, 300);
        m.vy = -rand(280, 640);
      }
      return;
    }
    this.explode(p.x, p.y, def.radius * rmul, def.damage * mul, p.team, def, {});
  }

  private explode(
    x: number, y: number, r: number, baseDmg: number, team: Team,
    def?: WeaponDef,
    opts?: { endTurn?: boolean; quiet?: boolean }
  ) {
    this.carve(x, y, r);
    // если снаряд закопался глубоко — вскрыть поверхность широким кратером,
    // чтобы не оставалось узких «вертикальных колодцев»
    const sy0 = this.surface(clamp(x, 0, WORLD_W - 1));
    if (r > 12 && sy0 < WORLD_H && y > sy0 + r * 0.2) {
      this.carve(x, sy0 + r * 0.32, r * 0.96);
    }
    this.smoothCrater(x - r - 10, x + r + 10);
    this.shake = Math.min(26, this.shake + r * 0.18);
    sfx.explode(r > 90);
    if (r > 55) this.whiteFlash = Math.min(1, this.whiteFlash + 0.5);
    this.decals.push({ x, y: this.surface(clamp(x, 0, WORLD_W - 1)), r, life: 26, max: 26 });
    if (this.decals.length > 40) this.decals.shift();

    this.smashDecor(x, y, r);

    const frost = this.map === "frost" && def?.kind !== "napalm";
    const icy = def?.ice || frost;

    this.particles.push({ x, y, vx: 0, vy: 0, life: 0.14, max: 0.14, size: r * 1.25, color: icy ? "#dff4ff" : "#fff2cf", grav: 0, kind: "glow" });
    this.particles.push({ x, y, vx: 0, vy: 0, life: 0.4, max: 0.4, size: r * 1.6, color: icy ? "#9fdcff" : "#f5d67b", grav: 0, kind: "ring" });
    this.particles.push({ x, y, vx: 0, vy: 0, life: 0.6, max: 0.6, size: r * 2.1, color: icy ? "#bfe8ff" : "#ffb054", grav: 0, kind: "ring" });
    const n = Math.round(r * 0.32);
    for (let i = 0; i < n; i++) {
      const a = rand(0, Math.PI * 2), s = rand(60, 330);
      const col = icy
        ? ["#9fdcff", "#cfeeff", "#dff4ff"][Math.floor(rand(0, 3))]
        : (Math.random() < 0.5 ? "#ffb054" : "#ff7a3b");
      this.particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 60, life: rand(0.35, 0.8), max: 0.8, size: rand(1.5, 3.4), color: col, grav: 420, kind: "spark" });
    }
    const gy = this.surface(clamp(x, 0, WORLD_W - 1));
    for (let i = 0; i < 12; i++) {
      const side = i % 2 === 0 ? 1 : -1;
      this.particles.push({ x: x + side * rand(4, r * 0.9), y: gy - 2, vx: side * rand(60, 220), vy: -rand(20, 90), life: rand(0.5, 1), max: 1, size: rand(4, 8), color: frost ? "rgba(210,230,245,0.5)" : "rgba(70,62,52,0.5)", grav: -10, kind: "smoke" });
    }
    for (let i = 0; i < 10; i++) {
      const a = rand(-Math.PI, 0), s = rand(30, 120);
      this.particles.push({ x: x + rand(-r / 2, r / 2), y: y + rand(-6, 6), vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: rand(0.7, 1.3), max: 1.3, size: rand(5, 10), color: frost ? "rgba(150,170,190,0.4)" : "rgba(70,62,52,0.5)", grav: -26, kind: "smoke" });
    }
    for (let i = 0; i < 8; i++) {
      const a = rand(-Math.PI * 0.9, -Math.PI * 0.1), s = rand(120, 300);
      this.particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: rand(0.5, 1), max: 1, size: rand(2, 4), color: frost ? "#5a7a94" : "#5a4028", grav: 700, kind: "chunk" });
    }
    if (icy) {
      for (let i = 0; i < 14; i++) {
        const a = rand(0, Math.PI * 2), s = rand(90, 320);
        this.particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 120, life: rand(0.5, 1), max: 1, size: rand(1.6, 3), color: "#dff4ff", grav: 500, kind: "spark" });
      }
    }
    if (def?.kind === "napalm") {
      for (let i = 0; i < 16; i++) {
        this.particles.push({ x: x + rand(-14, 14), y, vx: rand(-30, 30), vy: -rand(180, 420), life: rand(0.4, 0.9), max: 0.9, size: rand(3, 6), color: ["#ffd66b", "#ff8c2a", "#ff5a1e"][Math.floor(rand(0, 3))], grav: -120, kind: "spark" });
      }
    }

    for (const t of this.heroes) {
      if (!t.alive) continue;
      const d = Math.hypot(t.x - x, t.y - HERO_CY - y);
      if (d < r + 16) {
        let dmg = baseDmg * clamp(1 - d / (r + 18), 0.18, 1);
        if (t.items.has("ring")) dmg *= 0.72;
        this.damageHero(t, Math.round(dmg), team);
        const kick = (1 - d / (r + 18)) * 250;
        if (kick > 40) { t.vy -= kick; t.onGround = false; t.wet = false; }
      }
    }
    for (let i = this.crates.length - 1; i >= 0; i--) {
      const cr = this.crates[i];
      if (Math.hypot(cr.x - x, cr.y - y) < r + 30) this.openCrate(i, team);
    }

    if (def?.kind === "napalm") {
      this.fires.push({ x, y: Math.min(this.surface(clamp(x, 0, WORLD_W - 1)), y + 26), r: 62, t: 0, dur: def.fireDur ?? 4.5, next: 0.3, team });
    }

    if (!opts?.quiet && this.winner === null && opts?.endTurn !== false) {
      this.phase = "settle";
      this.settleT = 0;
    }
    this.emit();
  }

  private damageHero(h: Hero, dmg: number, srcTeam: Team) {
    if (!h.alive || dmg <= 0) return;
    h.hp -= dmg;
    h.flashT = 0.18;
    this.stats.dmg[srcTeam] += dmg;
    this.dmgNums.push({ x: h.x + rand(-6, 6), y: h.y - 95, life: 1.1, text: "−" + dmg, color: h.team === 0 ? "#ff6a4d" : "#ffd27b", size: 16 });
    if (h.team === 0) {
      this.redFlash = Math.min(1, this.redFlash + 0.5);
      sfx.gasp();
    } else {
      sfx.cheer();
      if (Math.random() < 0.6) sfx.crowd();
    }
    sfx.hurt();
    if (h.hp <= 0) {
      h.hp = 0;
      h.alive = false;
      this.stats.kills[srcTeam]++;
      if (srcTeam === 0) sfx.ovation();
      this.dmgNums.push({ x: h.x, y: h.y - 102, life: 1.5, text: "УБИТ", color: "#ff4433", size: 15 });
      for (let i = 0; i < 22; i++) {
        const a = rand(0, Math.PI * 2), s = rand(40, 220);
        this.particles.push({ x: h.x, y: h.y - 20, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 80, life: rand(0.5, 1.1), max: 1.1, size: rand(2, 4), color: h.team === 0 ? "#9fd45a" : "#e05038", grav: 500, kind: "spark" });
      }
      if (srcTeam !== h.team) {
        this.teamGold[srcTeam] += KILL_GOLD;
        this.stats.gold[srcTeam] += KILL_GOLD;
        this.dmgNums.push({ x: h.x, y: h.y - 118, life: 1.5, text: "+" + KILL_GOLD + " зол.", color: "#f5d67b", size: 14 });
        sfx.coin();
      }
      this.checkWin();
    }
  }

  private lavaKill(h: Hero) {
    if (!h.alive) return;
    h.hp = 0;
    h.alive = false;
    sfx.splash();
    sfx.explode(false);
    this.shake = Math.min(26, this.shake + 10);
    for (let i = 0; i < 26; i++) {
      const a = rand(-Math.PI, 0), s = rand(60, 380);
      this.particles.push({ x: h.x, y: LAVA_TOP, vx: Math.cos(a) * s * 0.6, vy: Math.sin(a) * s, life: rand(0.5, 1.1), max: 1.1, size: rand(2, 4.6), color: Math.random() < 0.5 ? "#ffd66b" : "#ff7a2a", grav: 420, kind: "spark" });
    }
    this.particles.push({ x: h.x, y: LAVA_TOP, vx: 0, vy: 0, life: 0.3, max: 0.3, size: 70, color: "#ffd66b", grav: 0, kind: "glow" });
    this.dmgNums.push({ x: h.x, y: LAVA_TOP - 34, life: 1.5, text: "ЛАВА!", color: "#ff8c2a", size: 19 });
    const other = (1 - h.team) as Team;
    if (this.heroes.some((e) => e.team === other && e.alive)) {
      this.stats.kills[other]++;
      this.teamGold[other] += KILL_GOLD;
      this.stats.gold[other] += KILL_GOLD;
      this.dmgNums.push({ x: h.x, y: LAVA_TOP - 58, life: 1.5, text: "+" + KILL_GOLD + " зол.", color: "#f5d67b", size: 14 });
      sfx.coin();
      if (other === 0) sfx.ovation();
    }
    h.y = WORLD_H + 600;
    this.checkWin();
  }

  // мгновенное утопление: пузыри, всплеск, тело идёт ко дну
  private drownKill(h: Hero) {
    if (!h.alive) return;
    h.hp = 0;
    h.alive = false;
    h.wet = false;
    sfx.splash();
    sfx.gasp();
    this.shake = Math.min(26, this.shake + 7);
    // всплеск
    for (let i = 0; i < 14; i++) {
      const a = rand(-Math.PI, 0), s = rand(50, 260);
      this.particles.push({ x: h.x, y: this.waterY, vx: Math.cos(a) * s * 0.5, vy: Math.sin(a) * s, life: rand(0.4, 0.7), max: 0.7, size: rand(1.6, 3.2), color: "rgba(170,220,250,0.9)", grav: 480, kind: "spark" });
    }
    // пузыри со дна
    for (let i = 0; i < 12; i++) {
      this.particles.push({ x: h.x + rand(-10, 10), y: this.waterY + rand(6, 20), vx: rand(-14, 14), vy: -rand(26, 80), life: rand(0.5, 1.1), max: 1.1, size: rand(1.4, 3.4), color: "rgba(210,240,255,0.75)", grav: -40, kind: "heal" });
    }
    const lbl = this.map === "inferno" ? "ПРОКЛЯТ!" : this.map === "jungle" ? "УТЯНУЛИ ПИЯВКИ!" : "УТОНУЛ!";
    const col = this.map === "inferno" ? "#ff7a3b" : "#7fc4e8";
    this.dmgNums.push({ x: h.x, y: this.waterY - 24, life: 1.5, text: lbl, color: col, size: 18 });
    const other = (1 - h.team) as Team;
    if (this.heroes.some((e) => e.team === other && e.alive)) {
      this.stats.kills[other]++;
      this.teamGold[other] += KILL_GOLD;
      this.stats.gold[other] += KILL_GOLD;
      this.dmgNums.push({ x: h.x, y: this.waterY - 50, life: 1.5, text: "+" + KILL_GOLD + " зол.", color: "#f5d67b", size: 14 });
      sfx.coin();
      if (other === 0) sfx.ovation();
    }
    h.y = this.waterY + 90; // тело уходит ко дну
    this.checkWin();
  }

  private waterSplash(x: number) {
    sfx.splash();
    for (let i = 0; i < 10; i++) {
      const a = rand(-Math.PI, 0), s = rand(40, 220);
      this.particles.push({ x, y: this.waterY, vx: Math.cos(a) * s * 0.5, vy: Math.sin(a) * s, life: rand(0.35, 0.6), max: 0.6, size: rand(1.4, 3), color: "rgba(170,220,250,0.9)", grav: 480, kind: "spark" });
    }
  }

  private lavaSplash(x: number) {
    sfx.splash();
    for (let i = 0; i < 12; i++) {
      const a = rand(-Math.PI, 0), s = rand(50, 260);
      this.particles.push({ x, y: LAVA_TOP, vx: Math.cos(a) * s * 0.5, vy: Math.sin(a) * s, life: rand(0.4, 0.8), max: 0.8, size: rand(1.6, 3.4), color: Math.random() < 0.5 ? "#ffd66b" : "#ff7a2a", grav: 420, kind: "spark" });
    }
  }

  private checkWin() {
    const a0 = this.heroes.some((h) => h.team === 0 && h.alive);
    const a1 = this.heroes.some((h) => h.team === 1 && h.alive);
    if (!a0 || !a1) {
      this.winner = !a1 ? 0 : 1;
      this.screen = "over";
      this.phase = "idle";
      this.moveInput = 0;
      this.charging = false;
      this.blinkMode = false;
      if (this.winner === 0) sfx.win(); else sfx.lose();
      this.emit();
    }
  }

  // ================= ЯЩИКИ =================
  private spawnCrate() {
    const x = rand(140, WORLD_W - 140);
    this.crates.push({ x, y: -50, vy: 0, landed: false, kind: Math.random() < 0.25 ? "heal" : "gold" });
  }

  private openCrate(i: number, team: Team) {
    const c = this.crates[i];
    this.crates.splice(i, 1);
    sfx.crate();
    if (c.kind === "gold") {
      this.teamGold[team] += CRATE_GOLD;
      this.stats.gold[team] += CRATE_GOLD;
      this.dmgNums.push({ x: c.x, y: c.y - 26, life: 1.4, text: "+" + CRATE_GOLD + " зол.", color: "#f5d67b", size: 15 });
      for (let k = 0; k < 14; k++) {
        this.particles.push({ x: c.x, y: c.y, vx: rand(-120, 120), vy: rand(-260, -80), life: rand(0.5, 1), max: 1, size: 3, color: "#f5d67b", grav: 560, kind: "coin" });
      }
    } else {
      this.dmgNums.push({ x: c.x, y: c.y - 26, life: 1.4, text: "Лазарет +35", color: "#7ee08a", size: 14 });
      for (const h of this.heroes) {
        if (h.team === team && h.alive) h.hp = Math.min(h.maxHp, h.hp + 35);
      }
      for (let k = 0; k < 12; k++) {
        this.particles.push({ x: c.x, y: c.y, vx: rand(-80, 80), vy: rand(-200, -60), life: rand(0.5, 1), max: 1, size: 3, color: "#7ee08a", grav: 200, kind: "heal" });
      }
    }
  }

  // ================= ПРЕДМЕТЫ =================
  private raftDeckY() { return this.waterY - 9 + Math.sin(this.time * 1.8) * 1.4; }

  private tryBlink(tx: number, ty: number) {
    const h = this.cur();
    if (!this.canBlink(h) || this.phase !== "aim" || h.team !== 0) return;
    let dx = tx - h.x, dy = ty - (h.y - 20);
    const d = Math.hypot(dx, dy);
    if (d > BLINK_RADIUS) { dx = (dx / d) * BLINK_RADIUS; }
    const nx = clamp(h.x + dx, 18, WORLD_W - 18);
    const ny = this.surface(nx);
    if (ny > WORLD_H - 60) {
      this.dmgNums.push({ x: nx, y: Math.min(ny, WORLD_H - 60), life: 1, text: "Там лава!", color: "#ff8c2a", size: 13 });
      return;
    }
    for (let i = 0; i < 14; i++) {
      const a = rand(0, Math.PI * 2), s = rand(30, 140);
      this.particles.push({ x: h.x, y: h.y - 20, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.4, max: 0.4, size: 2.5, color: "#f5d67b", grav: 0, kind: "tele" });
      this.particles.push({ x: nx, y: (ny > this.waterY ? this.waterY : ny) - 20, vx: Math.cos(a) * s * 0.6, vy: Math.sin(a) * s * 0.6, life: 0.5, max: 0.5, size: 2.5, color: "#bfe8ff", grav: 0, kind: "tele" });
    }
    h.x = nx;
    h.vy = 0;
    if (this.hasLake && nx >= this.lakeL && nx <= this.lakeR && ny > this.waterY + 8) {
      // телепорт в озеро: только на плот, иначе вода убьёт
      if (Math.abs(nx - this.raft.x) <= this.raft.half + 10) {
        h.y = this.raftDeckY();
        h.onGround = true;
        h.wet = false;
      } else {
        this.dmgNums.push({ x: nx, y: this.waterY - 30, life: 1, text: "Там вода — утонешь!", color: "#7fc4e8", size: 13 });
        return;
      }
    } else {
      h.y = ny;
      h.onGround = true;
      h.wet = false;
    }
    h.usedBlink = true;
    h.blinkCd = 2;
    this.blinkMode = false;
    sfx.tele();
    this.emit();
  }

  // ================= UPDATE =================
  private update(dt: number) {
    this.updateLakeBounds(); // вода всегда следует за рельефом (кратеры, взрывы)
    for (const e of this.embers) {
      e.y -= e.vy * dt;
      e.x += Math.sin(this.time * 0.7 + e.phase) * e.drift * dt;
      if (e.y < -20) { e.y = WORLD_H + 10; e.x = rand(0, WORLD_W); }
    }
    // светлячки дрейфуют (джунгли)
    for (const ff of this.fireflies) {
      ff.x += Math.sin(this.time * 0.6 + ff.ph) * 12 * dt;
      ff.y += Math.cos(this.time * 0.5 + ff.ph * 1.3) * 9 * dt;
    }
    // огненные столбы периодически выбрасывают искры (Преисподняя)
    if (this.map === "inferno") {
      this.pillarT -= dt;
      if (this.pillarT <= 0 && this.firePillars.length) {
        this.pillarT = rand(0.5, 1.6);
        const px = this.firePillars[Math.floor(Math.random() * this.firePillars.length)];
        const gy = this.surface(px);
        for (let k = 0; k < 8; k++) {
          this.particles.push({ x: px + rand(-8, 8), y: gy - rand(0, 60), vx: rand(-25, 25), vy: -rand(120, 320), life: rand(0.4, 0.9), max: 0.9, size: rand(1.8, 3.4), color: Math.random() < 0.5 ? "#ffd66b" : "#ff7a2a", grav: -60, kind: "spark" });
        }
      }
    }

    if (this.screen !== "game") return;

    this.updateParticles(dt);
    this.shake *= Math.exp(-6.5 * dt);
    this.redFlash *= Math.exp(-3.2 * dt);
    this.whiteFlash *= Math.exp(-4.5 * dt);
    for (let i = this.beams.length - 1; i >= 0; i--) {
      this.beams[i].t -= dt;
      if (this.beams[i].t <= 0) this.beams.splice(i, 1);
    }
    for (let i = this.decals.length - 1; i >= 0; i--) {
      this.decals[i].life -= dt;
      if (this.decals[i].life <= 0) this.decals.splice(i, 1);
    }
    for (const t of this.trees) {
      if (t.alive && this.surface(t.x) > t.baseY + 26) {
        t.alive = false;
        sfx.land();
        for (let k = 0; k < 10; k++) {
          this.particles.push({ x: t.x + rand(-16, 16), y: t.baseY - rand(10, 60), vx: rand(-70, 70), vy: rand(-140, -20), life: rand(0.5, 1), max: 1, size: rand(2, 4), color: t.side === 0 ? "#3f8a42" : "#4a2a24", grav: 500, kind: "chunk" });
        }
      }
    }

    // плот курсирует по озеру
    const raftPrev = this.raft.x;
    this.raft.x += this.raft.dir * 62 * dt;
    const cx = WORLD_W / 2;
    if (this.raft.x > cx + 268) { this.raft.x = cx + 268; this.raft.dir = -1; }
    if (this.raft.x < cx - 268) { this.raft.x = cx - 268; this.raft.dir = 1; }
    this.raft.dx = this.raft.x - raftPrev;
    if (Math.random() < dt * 6) {
      this.particles.push({ x: this.raft.x - this.raft.dir * 40, y: this.waterY + 1, vx: -this.raft.dir * rand(10, 40), vy: rand(-8, 4), life: 0.6, max: 0.6, size: rand(2, 4), color: "rgba(200,232,250,0.5)", grav: 0, kind: "smoke" });
    }

    // гейзеры лавы
    if (this.winner !== null) return;

    // очаги напалма
    for (let i = this.fires.length - 1; i >= 0; i--) {
      const f = this.fires[i];
      f.t += dt;
      const k = 1 - f.t / f.dur;
      this.particles.push({ x: f.x + rand(-f.r * 0.55, f.r * 0.55), y: f.y - 2, vx: rand(-18, 18), vy: -rand(70, 190), life: rand(0.3, 0.65), max: 0.65, size: rand(2, 4.4) * k + 1, color: ["#ffd66b", "#ffb054", "#ff6a2a"][Math.floor(rand(0, 3))], grav: -140, kind: "spark" });
      f.next -= dt;
      if (f.next <= 0) {
        f.next = 0.5;
        for (const h of this.heroes) {
          if (h.alive && Math.abs(h.x - f.x) < f.r * 0.72 && h.y > f.y - 80 && h.y < f.y + 26) {
            this.damageHero(h, 7, f.team);
          }
        }
        for (let ci = this.crates.length - 1; ci >= 0; ci--) {
          const cr = this.crates[ci];
          if (Math.abs(cr.x - f.x) < f.r * 0.7 && Math.abs(cr.y - f.y) < 40) this.openCrate(ci, f.team);
        }
      }
      if (f.t >= f.dur) this.fires.splice(i, 1);
    }

    // притяжение крюком
    for (let i = this.pulls.length - 1; i >= 0; i--) {
      const pu = this.pulls[i];
      if (!pu.h.alive) { this.pulls.splice(i, 1); continue; }
      pu.t += dt / 0.55;
      if (pu.t >= 1) {
        pu.h.x = pu.toX;
        pu.h.onGround = true;
        pu.h.vy = 0;
        this.pulls.splice(i, 1);
        sfx.land();
        continue;
      }
      const t = pu.t * pu.t * (3 - 2 * pu.t);
      pu.h.x = lerp(pu.fromX, pu.toX, t);
      const sy = this.surface(pu.h.x);
      pu.h.y = Math.min(lerp(pu.fromY, sy, t), Math.max(pu.fromY, sy)) - Math.sin(pu.t * Math.PI) * 40;
      if (Math.random() < dt * 26) {
        this.particles.push({ x: pu.h.x, y: pu.h.y + 6, vx: rand(-20, 20), vy: rand(-20, 20), life: 0.3, max: 0.3, size: 2, color: "#c8ccd4", grav: 300, kind: "spark" });
      }
    }

    // герои
    const deckY = this.raftDeckY();
    for (const h of this.heroes) {
      if (this.pulls.some((pu) => pu.h === h)) continue;
      if (!h.alive) { if (h.y < WORLD_H + 500) h.y = Math.min(this.surface(h.x), WORLD_H + 500); continue; }
      h.flashT = Math.max(0, h.flashT - dt);
      h.swingT = Math.max(0, h.swingT - dt);
      const sy = this.surface(h.x);
      const isActive = h === this.cur() && (this.phase === "aim" || this.phase === "ai");
      const inLake = this.hasLake && h.x >= this.lakeL && h.x <= this.lakeR && sy > this.waterY + 8;

      if (inLake && Math.abs(h.x - this.raft.x) <= this.raft.half + 7 && !h.onGround && h.vy > 0 && h.y >= deckY - 12) {
        // приземление на плот
        h.y = deckY; h.vy = 0; h.onGround = true; h.wet = false;
        sfx.creak();
      }

      if (inLake && h.onGround && Math.abs(h.x - this.raft.x) <= this.raft.half + 7 && Math.abs(h.y - deckY) < 10) {
        // едет на плоту
        h.x = clamp(h.x + this.raft.dx, 18, WORLD_W - 18);
        h.y = deckY;
        if (isActive && this.moveInput !== 0 && this.moveLeft > 0) {
          const step = Math.min(150 * dt, this.moveLeft);
          h.x = clamp(h.x + this.moveInput * step, 18, WORLD_W - 18);
          this.moveLeft -= step;
          h.walkPhase += dt * 11;
        }
      } else if (inLake) {
        // вода смертельна: коснулся — утонул
        if (h.y >= this.waterY - 4) { this.drownKill(h); continue; }
        h.onGround = false;
        h.vy += GRAVITY * 0.92 * dt;
        h.y += h.vy * dt;
      } else {
        h.wet = false;
        // обычная физика
        if (!h.onGround || h.y < sy - 0.5) {
          h.onGround = false;
          h.vy += GRAVITY * 0.92 * dt;
          h.y += h.vy * dt;
          if (h.y >= sy && sy < WORLD_H) {
            const impact = h.vy;
            h.y = sy; h.vy = 0; h.onGround = true;
            sfx.land();
            if (impact > 640) {
              const fdmg = Math.round((impact - 640) * 0.055);
              if (fdmg > 0) {
                this.dmgNums.push({ x: h.x, y: h.y - 95, life: 1, text: "−" + fdmg, color: "#c9b8ff", size: 13 });
                h.hp -= fdmg; h.flashT = 0.15;
                if (h.hp <= 0) {
                  h.hp = 0; h.alive = false;
                  this.dmgNums.push({ x: h.x, y: h.y - 98, life: 1.5, text: "РАЗБИЛСЯ", color: "#ff4433", size: 14 });
                  this.checkWin();
                }
              }
            }
          }
        } else {
          h.y = sy;
          if (isActive && this.moveInput !== 0 && this.moveLeft > 0) {
            const step = Math.min(150 * dt, this.moveLeft);
            h.x = clamp(h.x + this.moveInput * step, 18, WORLD_W - 18);
            h.y = this.surface(h.x);
            this.moveLeft -= step;
            h.walkPhase += dt * 11;
            if (Math.random() < dt * 8) {
              this.particles.push({ x: h.x - this.moveInput * 6, y: h.y, vx: rand(-14, 14), vy: rand(-26, -6), life: 0.4, max: 0.4, size: 2, color: "rgba(120,105,80,0.5)", grav: 60, kind: "smoke" });
            }
          }
        }
      }
      if (h.alive && h.y > LAVA_TOP) { this.lavaKill(h); continue; }
    }

    // ящики
    for (let i = this.crates.length - 1; i >= 0; i--) {
      const c = this.crates[i];
      if (!c.landed) {
        c.vy = Math.min(c.vy + 160 * dt, 120);
        c.y += c.vy * dt;
        const sy = this.surface(c.x);
        if (c.y >= sy - 10 && sy < WORLD_H) { c.y = sy - 10; c.landed = true; }
        const cwl = this.waterLevelAt(c.x);
        if (cwl !== null && c.y > cwl) { this.waterSplash(c.x); this.crates.splice(i, 1); continue; }
        if (c.y > LAVA_TOP) { this.lavaSplash(c.x); this.crates.splice(i, 1); }
      } else {
        // если землю под ящиком выбили — он падает снова
        const sy = this.surface(c.x);
        if (sy >= WORLD_H || sy - 10 > c.y + 14) { c.landed = false; c.vy = 0; }
      }
    }

    if (this.projs.length) this.updateProjectiles(dt);

    // фазы
    if (this.phase === "aim" || this.phase === "ai") {
      if (!this.cur().alive) { this.phase = "settle"; this.settleT = 0.35; }
    }
    if (this.phase === "aim") {
      const h = this.cur();
      if (h.team === 0 && !this.shopOpen) {
        this.timer -= dt;
        const s = Math.ceil(this.timer);
        if (s <= 5 && s !== this.lastTickSec && s > 0) { sfx.tick(); this.lastTickSec = s; }
        if (this.timer <= 0) { this.timer = 0; this.endTurn(); return; }
      }
      if (this.charging) this.power = Math.min(1, this.power + dt / 1.15);
    } else if (this.phase === "ai") {
      this.aiUpdate(dt);
    } else if (this.phase === "settle") {
      const settled = this.heroes.every((h) => !h.alive || h.onGround);
      this.settleT += dt;
      const hurry = !this.cur().alive;
      if ((settled && this.settleT > 0.55) || (hurry && this.settleT > 0.25)) this.nextTurn();
    }

    // капли со сталактитов
    if (this.map === "frost" && this.stalactites.length) {
      this.dripT -= dt;
      if (this.dripT <= 0) {
        this.dripT = rand(0.8, 2.2);
        const st = this.stalactites[Math.floor(Math.random() * this.stalactites.length)];
        this.particles.push({ x: st.x + st.lean * st.len, y: st.len, vx: 0, vy: 30, life: 2.5, max: 2.5, size: 1.6, color: "rgba(180,225,250,0.85)", grav: 500, kind: "spark" });
      }
    }

    // камера
    const target = this.projs.length ? this.projs[this.projs.length - 1] : (this.order.length ? this.cur() : null);
    if (target) {
      const tx2 = "x" in target ? target.x : WORLD_W / 2;
      const ty2 = "y" in target ? target.y : WORLD_H / 2;
      this.camX += (tx2 - this.camX) * Math.min(1, dt * 3.2);
      this.camY += (clamp(ty2, 200, 800) - this.camY) * Math.min(1, dt * 2.4);
    }
    this.camClamp();

    this.uiAcc += dt;
    if (this.uiAcc > 0.1) { this.uiAcc = 0; this.emit(); }
  }

  private updateParticles(dt: number) {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;
      if (p.life <= 0) { this.particles.splice(i, 1); continue; }
      p.vy += p.grav * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
    if (this.particles.length > 620) this.particles.splice(0, this.particles.length - 620);
    for (let i = this.dmgNums.length - 1; i >= 0; i--) {
      const d = this.dmgNums[i];
      d.life -= dt;
      d.y -= 34 * dt;
      if (d.life <= 0) this.dmgNums.splice(i, 1);
    }
  }

  // ================= RENDER =================
  private render() {
    const c = this.ctx;
    c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    const { cw, ch } = this;
    const frost = this.map === "frost";
    const jungle = this.map === "jungle";
    const inferno = this.map === "inferno";

    const sky = c.createLinearGradient(0, 0, 0, ch);
    if (frost) {
      sky.addColorStop(0, "#050a18");
      sky.addColorStop(0.45, "#0d1c30");
      sky.addColorStop(0.78, "#16304a");
      sky.addColorStop(1, "#1d3a55");
    } else if (jungle) {
      sky.addColorStop(0, "#04140c");
      sky.addColorStop(0.45, "#0a2418");
      sky.addColorStop(0.78, "#143826");
      sky.addColorStop(1, "#2a5436");
    } else if (inferno) {
      sky.addColorStop(0, "#100302");
      sky.addColorStop(0.4, "#240705");
      sky.addColorStop(0.75, "#4a0e06");
      sky.addColorStop(1, "#7c1e08");
    } else {
      sky.addColorStop(0, "#070b16");
      sky.addColorStop(0.45, "#122036");
      sky.addColorStop(0.78, "#2c2a33");
      sky.addColorStop(1, "#4a2c1c");
    }
    c.fillStyle = sky;
    c.fillRect(0, 0, cw, ch);

    // свой задний фон из мастерской (растягивается на весь экран, cover)
    const customBg = this.spriteOf("bg");
    if (customBg) {
      const img = customBg.img;
      const ir = img.naturalWidth / img.naturalHeight;
      const scr = cw / ch;
      let dw = cw, dh = ch, dx = 0, dy = 0;
      if (ir > scr) { dw = ch * ir; dx = (cw - dw) / 2; } else { dh = cw / ir; dy = (ch - dh) / 2; }
      c.drawImage(img, dx, dy, dw, dh);
    }

    const shk = this.paused ? 0 : this.shake;
    const shx = (Math.random() - 0.5) * shk;
    const shy = (Math.random() - 0.5) * shk;
    const S = this.scale * this.zoom;
    c.save();
    c.translate(cw / 2 - this.camX * S + shx * S, ch / 2 - this.camY * S + shy * S);
    c.scale(S, S);

    const xMin = this.camX - cw / (2 * S) - 80;
    const xMax = this.camX + cw / (2 * S) + 80;

    if (!inferno && !customBg) {
      // туманности
      for (const nb of this.nebulae) {
        const g = c.createRadialGradient(nb.x, nb.y, 10, nb.x, nb.y, nb.r);
        g.addColorStop(0, nb.color);
        g.addColorStop(1, "rgba(0,0,0,0)");
        c.fillStyle = g;
        c.beginPath(); c.arc(nb.x, nb.y, nb.r, 0, Math.PI * 2); c.fill();
      }
      // звёзды
      for (const s of this.stars) {
        const tw = 0.4 + 0.6 * Math.abs(Math.sin(this.time * 1.4 + s.tw));
        c.fillStyle = `rgba(235,240,255,${0.5 * tw})`;
        c.fillRect(s.x, s.y, s.s, s.s);
      }
      for (const s of this.brightStars) {
        const tw = 0.5 + 0.5 * Math.sin(this.time * 2 + s.tw);
        c.fillStyle = `rgba(240,248,255,${0.75 + 0.25 * tw})`;
        c.beginPath(); c.arc(s.x, s.y, s.s * 0.8, 0, Math.PI * 2); c.fill();
        c.strokeStyle = `rgba(220,235,255,${0.35 * tw})`;
        c.lineWidth = 1;
        const L = s.s * (3 + tw * 3);
        c.beginPath();
        c.moveTo(s.x - L, s.y); c.lineTo(s.x + L, s.y);
        c.moveTo(s.x, s.y - L); c.lineTo(s.x, s.y + L);
        c.stroke();
      }
    } else {
      // Преисподняя: падающий пепел
      for (let i = 0; i < 60; i++) {
        const ax = ((i * 197.3 + this.time * 14) % (xMax - xMin)) + xMin;
        const ay = ((i * 131.7 + this.time * (24 + (i % 5) * 8)) % (WORLD_H * 0.9));
        c.fillStyle = `rgba(120,100,90,${0.14 + (i % 4) * 0.05})`;
        c.fillRect(ax, ay - 260, 1.8, 1.8);
      }
    }
    // северное сияние
    if (frost && !customBg) {
      c.save();
      c.globalCompositeOperation = "lighter";
      for (let band = 0; band < 2; band++) {
        const baseY = -40 + band * 80;
        const grad = c.createLinearGradient(0, baseY - 60, 0, baseY + 130);
        grad.addColorStop(0, "rgba(80,255,170,0)");
        grad.addColorStop(0.4, band === 0 ? "rgba(80,255,170,0.10)" : "rgba(120,140,255,0.08)");
        grad.addColorStop(1, "rgba(80,255,170,0)");
        c.fillStyle = grad;
        c.beginPath();
        c.moveTo(xMin, baseY);
        for (let x = xMin; x <= xMax; x += 24) {
          c.lineTo(x, baseY + Math.sin(x * 0.004 + this.time * (0.5 + band * 0.3)) * 34 + Math.sin(x * 0.011 - this.time * 0.8) * 12);
        }
        for (let x = xMax; x >= xMin; x -= 24) {
          c.lineTo(x, baseY + 130 + Math.sin(x * 0.004 + this.time * (0.5 + band * 0.3)) * 34);
        }
        c.closePath();
        c.fill();
      }
      c.restore();
    }
    // луна / багровое солнце Преисподней
    const MOON_X = WORLD_W * 0.73;
    const mg = 1 + Math.sin(this.time * 0.8) * 0.05;
    if (!customBg) if (inferno) {
      const sun = c.createRadialGradient(MOON_X, 120, 10, MOON_X, 120, 190 * mg);
      sun.addColorStop(0, "rgba(255,110,40,0.95)");
      sun.addColorStop(0.22, "rgba(220,60,20,0.7)");
      sun.addColorStop(0.4, "rgba(160,30,10,0.25)");
      sun.addColorStop(1, "rgba(120,20,5,0)");
      c.fillStyle = sun;
      c.beginPath(); c.arc(MOON_X, 120, 190 * mg, 0, Math.PI * 2); c.fill();
      c.fillStyle = "#3a0d05";
      c.beginPath(); c.arc(MOON_X, 120, 40, 0, Math.PI * 2); c.fill();
      c.strokeStyle = "rgba(255,120,50,0.55)";
      c.lineWidth = 2.5;
      c.beginPath(); c.arc(MOON_X, 120, 40, 0, Math.PI * 2); c.stroke();
    } else {
      const moon = c.createRadialGradient(MOON_X, 108, 8, MOON_X, 108, 170 * mg);
      const tint = jungle ? "rgba(210,240,210," : "rgba(250,236,200,";
      moon.addColorStop(0, tint + "0.98)");
      moon.addColorStop(0.17, tint + "0.8)");
      moon.addColorStop(0.3, tint + "0.2)");
      moon.addColorStop(1, tint + "0)");
      c.fillStyle = moon;
      c.beginPath(); c.arc(MOON_X, 108, 170 * mg, 0, Math.PI * 2); c.fill();
      c.fillStyle = jungle ? "#dcefdd" : "#f6ead0";
      c.beginPath(); c.arc(MOON_X, 108, 32, 0, Math.PI * 2); c.fill();
      c.fillStyle = "rgba(190,170,130,0.35)";
      c.beginPath(); c.arc(MOON_X - 10, 100, 6, 0, Math.PI * 2); c.arc(MOON_X + 10, 118, 4, 0, Math.PI * 2); c.arc(MOON_X + 2, 96, 3, 0, Math.PI * 2); c.fill();
    }

    // свечение у горизонта
    const hor = c.createLinearGradient(0, 250, 0, 430);
    const horCol = frost ? "rgba(90,160,220,0.08)" : jungle ? "rgba(120,220,120,0.10)" : inferno ? "rgba(255,110,40,0.16)" : "rgba(217,164,65,0.09)";
    hor.addColorStop(0, "rgba(0,0,0,0)");
    hor.addColorStop(1, horCol);
    if (!customBg) {
      c.fillStyle = hor;
      c.fillRect(xMin, 250, xMax - xMin, 180);
    }

    // световые лучи сквозь листву (джунгли)
    if (jungle) {
      c.save();
      c.globalCompositeOperation = "lighter";
      for (let i = 0; i < 4; i++) {
        const rx = 300 + i * 620 + Math.sin(this.time * 0.3 + i) * 40;
        const rg = c.createLinearGradient(rx, -40, rx + 120, 420);
        rg.addColorStop(0, "rgba(190,255,180,0.10)");
        rg.addColorStop(1, "rgba(190,255,180,0)");
        c.fillStyle = rg;
        c.beginPath();
        c.moveTo(rx, -40);
        c.lineTo(rx + 60, -40);
        c.lineTo(rx + 200, 420);
        c.lineTo(rx + 90, 420);
        c.closePath();
        c.fill();
      }
      c.restore();
    }

    // горы
    const m1 = frost ? "#0d1a2e" : jungle ? "#0a2015" : inferno ? "#260906" : "#101a2c";
    const m2 = frost ? "#0a1424" : jungle ? "#071810" : inferno ? "#1a0604" : "#0d1421";
    this.drawMountains(c, xMin, xMax, 0.35, 300, 150, m1);
    this.drawMountains(c, xMin, xMax, 0.6, 380, 120, m2);

    // сталактиты с потолка
    if (frost) {
      for (const st of this.stalactites) {
        if (st.x < xMin - 40 || st.x > xMax + 40) continue;
        const g = c.createLinearGradient(st.x, 0, st.x, st.len);
        g.addColorStop(0, "#1c3a56");
        g.addColorStop(1, "#9fdcff");
        c.fillStyle = g;
        for (const [ox, wmul, lmul] of [[-st.w * 0.5, 0.6, 0.6], [0, 1, 1], [st.w * 0.5, 0.55, 0.5]] as const) {
          c.beginPath();
          c.moveTo(st.x + ox - st.w * 0.5 * wmul, -2);
          c.quadraticCurveTo(st.x + ox - st.w * 0.14 * wmul + st.lean * st.len * lmul * 0.4, st.len * lmul * 0.55, st.x + ox + st.lean * st.len * lmul, st.len * lmul);
          c.quadraticCurveTo(st.x + ox + st.w * 0.2 * wmul, st.len * lmul * 0.5, st.x + ox + st.w * 0.5 * wmul, -2);
          c.closePath();
          c.fill();
        }
      }
    }

    // пещерный фон (виден сквозь воронки)
    this.drawCave(c, xMin, xMax);

    // башни команд
    this.drawTower(c, WORLD_W * 0.145, 0);
    this.drawTower(c, WORLD_W * 0.855, 1);

    // деревья
    for (const t of this.trees) if (t.alive) this.drawTree(c, t);

    // лава на дне
    this.drawLava(c, xMin, xMax);

    // ландшафт
    if (this.terrainDirty) this.renderTerrainImage();
    const yBotView = this.camY + ch / (2 * S);
    if (xMin < 0) this.drawSideWall(c, 0, xMin, 0, yBotView);
    if (xMax > WORLD_W) this.drawSideWall(c, 1, WORLD_W, xMax, yBotView);
    c.drawImage(this.terrainCanvas, 0, 0);

    // озеро
    this.drawWater(c);

    // подпалины
    for (const d of this.decals) {
      const a = clamp(d.life / d.max, 0, 1) * 0.5;
      const g = c.createRadialGradient(d.x, d.y + 4, 2, d.x, d.y + 4, d.r * 1.15);
      g.addColorStop(0, `rgba(8,6,4,${a})`);
      g.addColorStop(1, "rgba(8,6,4,0)");
      c.fillStyle = g;
      c.beginPath(); c.ellipse(d.x, d.y + 4, d.r * 1.15, d.r * 0.42, 0, 0, Math.PI * 2); c.fill();
    }

    // сталагмиты
    if (frost) {
      for (const st of this.stalagmites) {
        if (st.x < xMin - 40 || st.x > xMax + 40) continue;
        const baseY = this.surface(st.x);
        if (baseY >= WORLD_H) continue;
        const g = c.createLinearGradient(st.x, baseY, st.x, baseY - st.len);
        g.addColorStop(0, "#2a4d6e");
        g.addColorStop(1, "#9fdcff");
        c.fillStyle = g;
        for (const [ox, wmul, lmul, lean] of [[-st.w * 0.55, 0.6, 0.62, -0.25], [0, 1, 1, st.lean], [st.w * 0.55, 0.55, 0.5, 0.3]] as const) {
          c.beginPath();
          c.moveTo(st.x + ox - st.w * 0.5 * wmul, baseY + 2);
          c.quadraticCurveTo(st.x + ox - st.w * 0.16 * wmul, baseY - st.len * lmul * 0.55, st.x + ox + lean * st.len * 0.2, baseY - st.len * lmul);
          c.quadraticCurveTo(st.x + ox + st.w * 0.2 * wmul, baseY - st.len * lmul * 0.5, st.x + ox + st.w * 0.5 * wmul, baseY + 2);
          c.closePath();
          c.fill();
        }
      }
    }

    // адские шипы (Преисподняя)
    if (inferno) {
      for (const st of this.hellSpikes) {
        if (st.x < xMin - 40 || st.x > xMax + 40) continue;
        const baseY = this.surface(st.x);
        if (baseY >= WORLD_H) continue;
        const g = c.createLinearGradient(st.x, baseY, st.x, baseY - st.len);
        g.addColorStop(0, "#1c0b08");
        g.addColorStop(0.75, "#3a150e");
        g.addColorStop(1, "#8a3a20");
        c.fillStyle = g;
        c.beginPath();
        c.moveTo(st.x - st.w / 2, baseY + 2);
        c.quadraticCurveTo(st.x - st.w * 0.14, baseY - st.len * 0.6, st.x + st.lean * st.len * 0.2, baseY - st.len);
        c.quadraticCurveTo(st.x + st.w * 0.18, baseY - st.len * 0.55, st.x + st.w / 2, baseY + 2);
        c.closePath();
        c.fill();
        c.fillStyle = "rgba(255,130,50,0.7)";
        c.beginPath(); c.arc(st.x + st.lean * st.len * 0.2, baseY - st.len, 1.7, 0, Math.PI * 2); c.fill();
      }
    }

    // угольки
    for (const e of this.embers) {
      const a = 0.35 + 0.3 * Math.sin(this.time * 2 + e.phase);
      c.fillStyle = `rgba(240,160,70,${Math.max(0, a)})`;
      c.beginPath(); c.arc(e.x, e.y, e.size, 0, Math.PI * 2); c.fill();
    }

    // очаги напалма
    for (const f of this.fires) {
      const k = Math.max(0, 1 - f.t / f.dur);
      const g = c.createRadialGradient(f.x, f.y - 6, 4, f.x, f.y - 6, f.r * 1.1);
      g.addColorStop(0, `rgba(255,140,50,${0.32 * k})`);
      g.addColorStop(1, "rgba(255,120,40,0)");
      c.fillStyle = g;
      c.beginPath(); c.arc(f.x, f.y - 6, f.r * 1.1, 0, Math.PI * 2); c.fill();
      c.fillStyle = `rgba(255,140,42,${0.4 * k})`;
      c.beginPath(); c.ellipse(f.x, f.y, f.r * 0.68, 5.5, 0, 0, Math.PI * 2); c.fill();
    }

    // огненные столбы (Преисподняя)
    if (inferno) {
      for (const px of this.firePillars) {
        if (px < xMin - 60 || px > xMax + 60) continue;
        const baseY = this.surface(px);
        if (baseY >= WORLD_H) continue;
        const flick = Math.sin(this.time * 11 + px) * 0.5 + Math.sin(this.time * 5.3 + px * 2) * 0.5;
        const hgt = 60 + flick * 16;
        const g = c.createRadialGradient(px, baseY - hgt * 0.4, 4, px, baseY - hgt * 0.4, hgt);
        g.addColorStop(0, "rgba(255,200,90,0.4)");
        g.addColorStop(1, "rgba(255,90,20,0)");
        c.fillStyle = g;
        c.beginPath(); c.arc(px, baseY - hgt * 0.4, hgt, 0, Math.PI * 2); c.fill();
        for (const [w2, h2, col] of [[11, hgt, "rgba(255,120,30,0.55)"], [7, hgt * 0.82, "rgba(255,170,60,0.7)"], [3.6, hgt * 0.6, "rgba(255,230,140,0.9)"]] as const) {
          c.fillStyle = col;
          c.beginPath();
          c.moveTo(px - w2, baseY);
          c.quadraticCurveTo(px - w2 * 0.8, baseY - h2 * 0.55, px + Math.sin(this.time * 9 + px) * 3, baseY - h2);
          c.quadraticCurveTo(px + w2 * 0.8, baseY - h2 * 0.55, px + w2, baseY);
          c.closePath();
          c.fill();
        }
      }
    }

    // плот
    this.drawRaft(c);

    // ящики
    for (const cr of this.crates) this.drawCrate(c, cr);

    // могилы и герои (под водой могил не ставим — тело ушло ко дну)
    for (const h of this.heroes) {
      if (!h.alive && h.y < WORLD_H + 500) {
        const gw = this.waterLevelAt(h.x);
        if (gw === null || this.surface(h.x) <= gw) this.drawGrave(c, h);
      }
    }
    const active = this.screen === "game" && this.order.length ? this.cur() : null;
    for (const h of this.heroes) if (h.alive) this.drawHero(c, h, h === active);

    // лианы (джунгли, передний план)
    if (jungle) {
      for (const v of this.vines) {
        if (v.x < xMin - 40 || v.x > xMax + 40) continue;
        const sway = Math.sin(this.time * 0.9 + v.ph) * 14;
        c.strokeStyle = "rgba(50,110,40,0.85)";
        c.lineWidth = 3;
        c.beginPath();
        c.moveTo(v.x, -10);
        c.quadraticCurveTo(v.x + sway * 0.4, v.len * 0.5, v.x + sway, v.len);
        c.stroke();
        c.lineWidth = 1.4;
        c.strokeStyle = "rgba(70,140,50,0.9)";
        for (let ly = 26; ly < v.len; ly += 26) {
          const t = ly / v.len;
          const lx = v.x + sway * t * t;
          c.beginPath();
          c.ellipse(lx + (ly % 52 === 0 ? 5 : -5), ly, 5.5, 2.4, ly % 52 === 0 ? 0.5 : -0.5, 0, Math.PI * 2);
          c.stroke();
        }
      }
    }

    // светлячки (джунгли)
    if (jungle) {
      for (const ff of this.fireflies) {
        const fx = ff.x + Math.sin(this.time * 0.6 + ff.ph) * 26;
        const fy = ff.y + Math.cos(this.time * 0.45 + ff.ph) * 18;
        const tw = 0.5 + 0.5 * Math.sin(this.time * 3 + ff.ph * 2);
        const g = c.createRadialGradient(fx, fy, 0.5, fx, fy, 7);
        g.addColorStop(0, `rgba(220,255,150,${0.7 * tw})`);
        g.addColorStop(1, "rgba(220,255,150,0)");
        c.fillStyle = g;
        c.beginPath(); c.arc(fx, fy, 7, 0, Math.PI * 2); c.fill();
        c.fillStyle = `rgba(250,255,200,${0.9 * tw})`;
        c.beginPath(); c.arc(fx, fy, 1.6, 0, Math.PI * 2); c.fill();
      }
    }

    // снаряды
    for (const p of this.projs) this.drawProjectile(c, p);

    // лучи
    for (const b of this.beams) {
      const a = clamp(b.t / 0.4, 0, 1);
      c.globalAlpha = a;
      c.strokeStyle = "rgba(255,110,40,0.35)";
      c.lineWidth = 13;
      c.beginPath(); c.moveTo(b.x1, b.y1); c.lineTo(b.x2, b.y2); c.stroke();
      c.strokeStyle = "#ffd27b";
      c.lineWidth = 4.5;
      c.beginPath(); c.moveTo(b.x1, b.y1); c.lineTo(b.x2, b.y2); c.stroke();
      c.strokeStyle = "#fff6dc";
      c.lineWidth = 1.6;
      c.beginPath(); c.moveTo(b.x1, b.y1); c.lineTo(b.x2, b.y2); c.stroke();
      c.globalAlpha = 1;
    }

    // прицел игрока
    if (this.screen === "game" && active && active.team === 0 && active.alive) {
      if (this.phase === "aim" && !this.blinkMode) this.drawAim(c, active);
      if (this.blinkMode) this.drawBlink(c, active);
    }

    this.drawParticles(c);

    // числа урона
    for (const d of this.dmgNums) {
      c.globalAlpha = clamp(d.life, 0, 1);
      c.font = `800 ${d.size}px "Rubik", sans-serif`;
      c.textAlign = "center";
      c.lineWidth = 3;
      c.strokeStyle = "rgba(10,8,4,0.85)";
      c.strokeText(d.text, d.x, d.y);
      c.fillStyle = d.color;
      c.fillText(d.text, d.x, d.y);
      c.globalAlpha = 1;
    }

    c.restore();

    // жерло под картой (видно при отдалении)
    const yBot = ch / 2 + (WORLD_H - this.camY) * S;
    if (yBot < ch - 1) {
      const bg = c.createLinearGradient(0, yBot, 0, ch);
      bg.addColorStop(0, frost ? "rgba(16,36,60,0.96)" : "rgba(70,18,6,0.95)");
      bg.addColorStop(0.5, frost ? "#0c1830" : "#1c0904");
      bg.addColorStop(1, "#070a12");
      c.fillStyle = bg;
      c.fillRect(0, yBot, cw, ch - yBot);
      const gg = c.createLinearGradient(0, yBot, 0, yBot + 46);
      gg.addColorStop(0, `rgba(255,120,30,${0.3 + 0.08 * Math.sin(this.time * 2.2)})`);
      gg.addColorStop(1, "rgba(255,120,30,0)");
      c.fillStyle = gg;
      c.fillRect(0, yBot, cw, 46);
      // лавовые трещины
      for (let i = 0; i < 3; i++) {
        const cxp = cw * (0.2 + 0.3 * i) + Math.sin(i * 7) * 60;
        const pulse = 0.3 + 0.25 * Math.sin(this.time * 2.6 + i * 2.1);
        c.strokeStyle = `rgba(255,140,40,${pulse})`;
        c.lineWidth = 2.4;
        c.beginPath();
        let px = cxp;
        let py = yBot + 10;
        c.moveTo(px, py);
        for (let k = 0; k < 4; k++) {
          px += Math.sin(i * 3 + k * 5) * 34;
          py += 16;
          c.lineTo(px, py);
        }
        c.stroke();
      }
    }

    // виньетка
    const v = c.createRadialGradient(cw / 2, ch / 2, Math.min(cw, ch) * 0.42, cw / 2, ch / 2, Math.max(cw, ch) * 0.75);
    v.addColorStop(0, "rgba(0,0,0,0)");
    v.addColorStop(1, "rgba(0,0,0,0.5)");
    c.fillStyle = v;
    c.fillRect(0, 0, cw, ch);

    if (this.redFlash > 0.02) {
      const rf = c.createRadialGradient(cw / 2, ch / 2, Math.min(cw, ch) * 0.3, cw / 2, ch / 2, Math.max(cw, ch) * 0.72);
      rf.addColorStop(0, "rgba(255,40,20,0)");
      rf.addColorStop(1, `rgba(255,40,20,${0.4 * this.redFlash})`);
      c.fillStyle = rf;
      c.fillRect(0, 0, cw, ch);
    }
    if (this.whiteFlash > 0.02) {
      c.fillStyle = `rgba(255,244,214,${0.3 * this.whiteFlash})`;
      c.fillRect(0, 0, cw, ch);
    }
  }

  private drawMountains(c: CanvasRenderingContext2D, xMin: number, xMax: number, seedF: number, baseY: number, amp: number, color: string) {
    c.fillStyle = color;
    c.beginPath();
    c.moveTo(xMin, WORLD_H + 40);
    const step = 46;
    for (let x = Math.floor(xMin / step) * step; x <= xMax; x += step) {
      const n = Math.sin(x * 0.006 + seedF * 90) * 0.6 + Math.sin(x * 0.017 + seedF * 40) * 0.4;
      c.lineTo(x, baseY - (n * 0.5 + 0.5) * amp);
    }
    c.lineTo(xMax, WORLD_H + 40);
    c.closePath();
    c.fill();
  }

  private drawCave(c: CanvasRenderingContext2D, xMin: number, xMax: number) {
    const frost = this.map === "frost";
    const xa = Math.max(-40, xMin), xb = Math.min(WORLD_W + 40, xMax);
    const g = c.createLinearGradient(0, 300, 0, WORLD_H);
    if (frost) {
      g.addColorStop(0, "#15283e");
      g.addColorStop(0.5, "#0e1d30");
      g.addColorStop(1, "#081120");
    } else if (this.map === "jungle") {
      g.addColorStop(0, "#1e3018");
      g.addColorStop(0.5, "#131f0e");
      g.addColorStop(1, "#0a1207");
    } else if (this.map === "inferno") {
      g.addColorStop(0, "#3a1508");
      g.addColorStop(0.5, "#260c04");
      g.addColorStop(1, "#140602");
    } else {
      g.addColorStop(0, "#332312");
      g.addColorStop(0.5, "#211608");
      g.addColorStop(1, "#120c05");
    }
    c.fillStyle = g;
    c.fillRect(xa, 240, xb - xa, WORLD_H - 240 + 40);
    // пласты
    c.fillStyle = frost ? "rgba(120,180,220,0.05)" : "rgba(255,190,110,0.04)";
    for (let y = 320; y < WORLD_H; y += 64) {
      c.beginPath();
      c.moveTo(xa, y);
      for (let x = xa; x <= xb; x += 40) c.lineTo(x, y + Math.sin(x * 0.02 + y * 0.7) * 7);
      c.lineTo(xb, y + 10);
      for (let x = xb; x >= xa; x -= 40) c.lineTo(x, y + 10 + Math.sin(x * 0.02 + y * 0.7) * 7);
      c.closePath();
      c.fill();
    }
    // трещины, мерцающие у лавы
    const cr = frost ? "rgba(130,210,250," : "rgba(255,130,40,";
    for (let i = 0; i < 12; i++) {
      const x0 = xa + ((i * 431.7) % (xb - xa));
      const y0 = 560 + ((i * 173.3) % (WORLD_H - 600));
      const pulse = 0.1 + 0.14 * Math.abs(Math.sin(this.time * 1.8 + i * 1.7));
      c.strokeStyle = cr + pulse + ")";
      c.lineWidth = 1.6;
      c.beginPath();
      c.moveTo(x0, y0);
      c.lineTo(x0 + 14, y0 + 20);
      c.lineTo(x0 + 6, y0 + 42);
      c.stroke();
    }
    // свечение от лавы
    const gl = c.createLinearGradient(0, LAVA_TOP - 240, 0, LAVA_TOP);
    gl.addColorStop(0, "rgba(255,110,30,0)");
    gl.addColorStop(1, `rgba(255,110,30,${0.16 + 0.05 * Math.sin(this.time * 2.4)})`);
    c.fillStyle = gl;
    c.fillRect(xa, LAVA_TOP - 240, xb - xa, 240);
  }

  private drawSideWall(c: CanvasRenderingContext2D, side: Team, xa: number, xb: number, yBot: number) {
    const frost = this.map === "frost";
    const cols = frost
      ? (side === 0 ? ["#2c4d6e", "#1d3a56", "#12253c"] : ["#28455f", "#1a3350", "#101f34"])
      : this.map === "jungle"
        ? (side === 0 ? ["#3a5a26", "#27401a", "#16280e"] : ["#4d3a20", "#362812", "#20170a"])
        : this.map === "inferno"
          ? (side === 0 ? ["#4a2517", "#331a0e", "#1e0f07"] : ["#3d1d14", "#2a130c", "#180a06"])
          : (side === 0 ? ["#54401f", "#3a2b14", "#221808"] : ["#4d3128", "#34211b", "#1e120d"]);
    const g = c.createLinearGradient(0, 240, 0, WORLD_H);
    g.addColorStop(0, cols[0]);
    g.addColorStop(0.5, cols[1]);
    g.addColorStop(1, cols[2]);
    c.fillStyle = g;
    c.fillRect(xa, 200, xb - xa, Math.max(yBot, WORLD_H) - 200 + 60);
    // пласты
    c.fillStyle = "rgba(0,0,0,0.14)";
    for (let y = 260; y < Math.max(yBot, WORLD_H); y += 54) {
      c.beginPath();
      c.moveTo(xa, y);
      for (let x = xa; x <= xb; x += 30) c.lineTo(x, y + Math.sin(x * 0.03 + y) * 6);
      c.lineTo(xb, y + 9);
      for (let x = xb; x >= xa; x -= 30) c.lineTo(x, y + 9 + Math.sin(x * 0.03 + y) * 6);
      c.closePath();
      c.fill();
    }
    // трещины
    const rng = mulberry32(side * 977 + 31);
    c.strokeStyle = "rgba(0,0,0,0.3)";
    c.lineWidth = 1.6;
    for (let i = 0; i < 8; i++) {
      let x = xa + rng() * (xb - xa);
      let y = 300 + rng() * (WORLD_H - 400);
      c.beginPath();
      c.moveTo(x, y);
      for (let k = 0; k < 4; k++) { x += (rng() - 0.5) * 26; y += 16 + rng() * 22; c.lineTo(x, y); }
      c.stroke();
    }
    // тень у стыка с картой
    const sh = c.createLinearGradient(side === 0 ? xb : xa, 0, side === 0 ? xb - 40 : xa + 40, 0);
    sh.addColorStop(0, "rgba(0,0,0,0.5)");
    sh.addColorStop(1, "rgba(0,0,0,0)");
    c.fillStyle = sh;
    c.fillRect(Math.min(xa, xb - 40), 200, 40, WORLD_H - 160);
  }

  private drawLava(c: CanvasRenderingContext2D, xMin: number, xMax: number) {
    const T = LAVA_TOP;
    const glow = c.createLinearGradient(0, T - 110, 0, T + 4);
    glow.addColorStop(0, "rgba(255,90,20,0)");
    glow.addColorStop(1, "rgba(255,120,30,0.25)");
    c.fillStyle = glow;
    c.fillRect(xMin, T - 110, xMax - xMin, 114);

    const g = c.createLinearGradient(0, T, 0, WORLD_H + 40);
    g.addColorStop(0, "#ffd66b");
    g.addColorStop(0.18, "#ff8c2a");
    g.addColorStop(0.55, "#d63c14");
    g.addColorStop(1, "#4a0e04");
    c.fillStyle = g;
    c.beginPath();
    c.moveTo(xMin, WORLD_H + 40);
    for (let x = xMin; x <= xMax; x += 8) {
      c.lineTo(x, T + Math.sin(x * 0.021 + this.time * 2.1) * 3 + Math.sin(x * 0.047 - this.time * 1.4) * 2);
    }
    c.lineTo(xMax, WORLD_H + 40);
    c.closePath();
    c.fill();

    const span = Math.max(1, xMax - xMin);
    for (let i = 0; i < 14; i++) {
      const bx = xMin + ((i * 173.3 + this.time * 16) % span);
      const by = T + 8 + ((i * 53) % 24) + Math.sin(this.time * 3 + i) * 3;
      const br = 2 + (i % 3) + Math.sin(this.time * 4 + i * 2) * 1.2;
      c.fillStyle = "rgba(255,224,130,0.5)";
      c.beginPath(); c.arc(bx, by, Math.max(0.6, br), 0, Math.PI * 2); c.fill();
    }
    c.strokeStyle = "rgba(255,232,150,0.85)";
    c.lineWidth = 2;
    c.beginPath();
    let started = false;
    for (let x = xMin; x <= xMax; x += 8) {
      const y = T + Math.sin(x * 0.021 + this.time * 2.1) * 3 + Math.sin(x * 0.047 - this.time * 1.4) * 2;
      if (!started) { c.moveTo(x, y); started = true; } else c.lineTo(x, y);
    }
    c.stroke();
  }

  // вода: одно большое озеро в центре
  // Вода с физикой: заполняет только непрерывную область озера (растекается от центра)
  // и повторяет рельеф дна, затапливая выбитые кратеры. Отдельные "висящие" лужи не рисуются.
  private drawWater(c: CanvasRenderingContext2D) {
    if (!this.hasLake) return;
    const frozen = this.map === "frost";
    const level = this.waterY;
    const sa = this.lakeL, sb = this.lakeR;
    // глубина воды ограничена лавой, чтобы не красить столб до самого низа мира
    const cap = LAVA_TOP + 24;
    const bot = (x: number) => Math.min(this.heights[clamp(Math.round(x), 0, WORLD_W - 1)], cap);
    const wave = (x: number) => level + Math.sin(x * 0.06 + this.time * 1.6) * 1.3 + Math.sin(x * 0.023 - this.time * 1.1) * 0.8;

    // тело воды: верх — волнистая поверхность, низ — рельеф дна (кратеры затапливаются)
    const g = c.createLinearGradient(0, level, 0, level + 120);
    if (frozen) {
      g.addColorStop(0, "rgba(200,235,252,0.92)");
      g.addColorStop(0.35, "rgba(130,190,228,0.75)");
      g.addColorStop(1, "rgba(40,90,145,0.6)");
    } else if (this.map === "jungle") {
      g.addColorStop(0, "rgba(120,195,115,0.85)");
      g.addColorStop(0.4, "rgba(40,110,70,0.8)");
      g.addColorStop(1, "rgba(8,45,35,0.8)");
    } else if (this.map === "inferno") {
      g.addColorStop(0, "rgba(230,90,40,0.9)");
      g.addColorStop(0.4, "rgba(150,30,20,0.85)");
      g.addColorStop(1, "rgba(50,5,8,0.85)");
    } else {
      g.addColorStop(0, "rgba(95,185,240,0.9)");
      g.addColorStop(0.4, "rgba(45,120,190,0.8)");
      g.addColorStop(1, "rgba(12,45,100,0.78)");
    }
    c.fillStyle = g;
    c.beginPath();
    c.moveTo(sa, bot(sa));
    for (let x = sa; x <= sb; x += 3) c.lineTo(x, frozen ? level : wave(x));
    c.lineTo(sb, frozen ? level : wave(sb));
    c.lineTo(sb, bot(sb));
    for (let x = sb; x >= sa; x -= 3) c.lineTo(x, bot(x));
    c.closePath();
    c.fill();

    // линия поверхности
    const infernoW = this.map === "inferno";
    c.strokeStyle = frozen ? "rgba(255,255,255,0.92)" : infernoW ? "rgba(255,180,90,0.9)" : this.map === "jungle" ? "rgba(200,255,210,0.85)" : "rgba(190,232,255,0.9)";
    c.lineWidth = frozen ? 2.6 : 1.8;
    c.beginPath();
    for (let x = sa, first = true; x <= sb; x += 3) {
      const y = frozen ? level : wave(x);
      if (first) { c.moveTo(x, y); first = false; } else c.lineTo(x, y);
    }
    c.stroke();

    // береговая пена на краях воды
    c.fillStyle = frozen ? "rgba(240,252,255,0.85)" : "rgba(215,240,255,0.8)";
    for (const edge of [sa, sb]) {
      const ey = this.heights[clamp(edge, 0, WORLD_W - 1)];
      if (Math.abs(ey - level) < 34) {
        for (let i = 0; i < 3; i++) {
          const bx = edge + (edge === sa ? -1 : 1) * (2 + i * 3.4) + Math.sin(this.time * 2.6 + i) * 1.6;
          c.beginPath(); c.arc(bx, Math.min(ey, level + 3), 2.6 - i * 0.6, 0, Math.PI * 2); c.fill();
        }
      }
    }

    if (frozen) {
      c.strokeStyle = "rgba(235,250,255,0.4)";
      c.lineWidth = 1;
      for (let i = 0; i < 8; i++) {
        const cx2 = sa + (i + 0.5) * ((sb - sa) / 8);
        if (this.surface(cx2) <= level) continue;
        c.beginPath();
        c.moveTo(cx2, level + 3); c.lineTo(cx2 + 9, level + 11); c.lineTo(cx2 + 4, level + 20);
        c.stroke();
      }
    } else {
      c.fillStyle = infernoW ? "rgba(255,200,120,0.5)" : this.map === "jungle" ? "rgba(190,255,200,0.4)" : "rgba(215,242,255,0.5)";
      const w = Math.max(1, sb - sa);
      for (let i = 0; i < 7; i++) {
        const gx = sa + ((this.time * 30 + i * (w / 7) * 1.6) % w);
        if (this.surface(gx) > level) {
          c.fillRect(gx, level + 4 + Math.sin(this.time * 2 + i) * 1.6, 13, 1.5);
        }
      }
      // пузырьки Озера Проклятых
      if (infernoW) {
        for (let i = 0; i < 6; i++) {
          const gx = sa + ((i * (w / 6)) + Math.sin(this.time * 1.3 + i) * 8);
          const gy = level + 6 + Math.abs(Math.sin(this.time * 2.2 + i * 2)) * 10;
          if (this.surface(gx) > level) {
            c.strokeStyle = "rgba(255,160,80,0.6)";
            c.lineWidth = 1.2;
            c.beginPath(); c.arc(gx, gy, 2.2 + Math.sin(this.time * 3 + i) * 0.8, 0, Math.PI * 2); c.stroke();
          }
        }
      }
    }
  }

  private drawRaft(c: CanvasRenderingContext2D) {
    if (this.screen !== "game" && this.screen !== "over") return;
    const rx = this.raft.x;
    const ry = this.raftDeckY();
    const tilt = Math.sin(this.time * 1.2) * 0.03;
    c.save();
    c.translate(rx, ry);
    c.rotate(tilt);
    // отражение
    c.fillStyle = "rgba(60,40,20,0.22)";
    c.beginPath(); c.ellipse(0, 12, 44, 6, 0, 0, Math.PI * 2); c.fill();
    // брёвна
    const logCols = ["#7a5326", "#6b4720", "#5e3e1c"];
    for (let i = 0; i < 3; i++) {
      const ly = -2 + i * 5;
      c.fillStyle = logCols[i];
      c.beginPath();
      c.roundRect(-42 + i * 2, ly, 84 - i * 4, 5.4, 2.7);
      c.fill();
      c.strokeStyle = "rgba(30,18,6,0.6)";
      c.lineWidth = 1;
      c.stroke();
      // торцы
      c.fillStyle = "#9a6c36";
      c.beginPath(); c.ellipse(42 - i * 2, ly + 2.7, 2.2, 2.6, 0, 0, Math.PI * 2); c.fill();
    }
    // настил
    c.fillStyle = "#8f6130";
    c.fillRect(-36, -7, 72, 5.4);
    c.strokeStyle = "rgba(40,24,8,0.65)";
    c.lineWidth = 1;
    c.strokeRect(-36, -7, 72, 5.4);
    for (let x = -28; x <= 28; x += 12) {
      c.beginPath(); c.moveTo(x, -7); c.lineTo(x, -1.6); c.stroke();
    }
    // верёвки
    c.strokeStyle = "#c9b58a";
    c.lineWidth = 1.3;
    c.beginPath(); c.moveTo(-30, -7); c.lineTo(-30, 12); c.moveTo(30, -7); c.lineTo(30, 12); c.stroke();
    // фонарь на шесте
    c.strokeStyle = "#3a2814";
    c.lineWidth = 2.4;
    c.beginPath(); c.moveTo(30, -7); c.lineTo(30, -30); c.stroke();
    const flick = 0.7 + 0.3 * Math.sin(this.time * 9 + 1);
    const lg = c.createRadialGradient(30, -32, 1, 30, -32, 16);
    lg.addColorStop(0, `rgba(255,214,120,${0.55 * flick})`);
    lg.addColorStop(1, "rgba(255,180,60,0)");
    c.fillStyle = lg;
    c.beginPath(); c.arc(30, -32, 16, 0, Math.PI * 2); c.fill();
    c.fillStyle = "#f5d67b";
    c.beginPath(); c.arc(30, -32, 3.4, 0, Math.PI * 2); c.fill();
    c.strokeStyle = "#3a2814";
    c.lineWidth = 1.4;
    c.beginPath(); c.arc(30, -32, 4.6, 0, Math.PI * 2); c.stroke();
    c.restore();
  }

  private drawTower(c: CanvasRenderingContext2D, x: number, team: Team) {
    const y = this.surface(clamp(x, 0, WORLD_W - 1)) + 18;
    c.save();
    c.translate(x, y);
    if (team === 0) {
      c.fillStyle = "#2e4433";
      c.fillRect(-16, -34, 32, 34);
      c.fillStyle = "#3a5a42";
      c.fillRect(-12, -64, 24, 30);
      c.fillStyle = "#d9a441";
      c.beginPath();
      c.moveTo(-20, -34); c.quadraticCurveTo(0, -46, 20, -34); c.lineTo(20, -30); c.quadraticCurveTo(0, -42, -20, -30);
      c.closePath(); c.fill();
      c.beginPath();
      c.moveTo(-16, -64); c.quadraticCurveTo(0, -76, 16, -64); c.lineTo(16, -60); c.quadraticCurveTo(0, -72, -16, -60);
      c.closePath(); c.fill();
      c.fillStyle = "#f5d67b";
      c.beginPath(); c.arc(0, -50, 3.4, 0, Math.PI * 2); c.fill();
      c.strokeStyle = "#5e4a20";
      c.lineWidth = 2;
      c.beginPath(); c.moveTo(0, -74); c.lineTo(0, -96); c.stroke();
      const w = Math.sin(this.time * 3) * 3;
      c.fillStyle = "#9fd45a";
      c.beginPath(); c.moveTo(0, -96); c.lineTo(20, -92 + w); c.lineTo(0, -86); c.closePath(); c.fill();
    } else {
      c.fillStyle = "#241614";
      c.fillRect(-16, -30, 32, 30);
      c.fillStyle = "#1c100e";
      c.beginPath();
      c.moveTo(-12, -30); c.lineTo(-6, -78); c.lineTo(6, -78); c.lineTo(12, -30);
      c.closePath(); c.fill();
      c.beginPath();
      c.moveTo(-6, -78); c.lineTo(0, -94); c.lineTo(6, -78); c.closePath(); c.fill();
      c.beginPath(); c.moveTo(-12, -30); c.lineTo(-20, -44); c.lineTo(-9, -38); c.closePath(); c.fill();
      c.beginPath(); c.moveTo(12, -30); c.lineTo(20, -44); c.lineTo(9, -38); c.closePath(); c.fill();
      const gl = 0.5 + 0.3 * Math.sin(this.time * 2.4);
      c.fillStyle = `rgba(255,80,48,${gl})`;
      c.fillRect(-2.4, -62, 4.8, 9);
      c.fillRect(-2.4, -44, 4.8, 7);
      c.strokeStyle = "#3a201a";
      c.lineWidth = 2;
      c.beginPath(); c.moveTo(0, -94); c.lineTo(0, -108); c.stroke();
      const w = Math.sin(this.time * 3.4) * 3;
      c.fillStyle = "#e05038";
      c.beginPath(); c.moveTo(0, -108); c.lineTo(-20, -104 + w); c.lineTo(0, -98); c.closePath(); c.fill();
    }
    c.restore();
  }

  private blob(c: CanvasRenderingContext2D, x: number, y: number, r: number) {
    c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill();
  }

  private drawTree(c: CanvasRenderingContext2D, t: Tree) {
    c.save();
    c.translate(t.x, t.baseY + 2);
    c.scale(t.s, t.s);
    const rng = mulberry32(Math.floor(t.seed * 97) + 11);
    const frost = this.map === "frost";
    const jungle = this.map === "jungle";
    const inferno = this.map === "inferno";

    if (jungle) {
      // ПАЛЬМА: изогнутый ствол + веер листьев + кокосы
      const lean = (rng() - 0.5) * 0.5;
      const H = 74;
      const tg = c.createLinearGradient(-3, 0, 3, 0);
      tg.addColorStop(0, "#4a3018");
      tg.addColorStop(0.5, "#7a5526");
      tg.addColorStop(1, "#3a2412");
      c.fillStyle = tg;
      c.beginPath();
      c.moveTo(-3.6, 0);
      c.quadraticCurveTo(-2 + lean * 20, -H * 0.55, lean * 34 - 2.4, -H);
      c.lineTo(lean * 34 + 2.4, -H);
      c.quadraticCurveTo(2 + lean * 20, -H * 0.55, 3.6, 0);
      c.closePath();
      c.fill();
      // кольца на стволе
      c.strokeStyle = "rgba(40,24,10,0.5)";
      c.lineWidth = 1;
      for (let i = 1; i < 7; i++) {
        const yy = -H * (i / 7);
        const xx = lean * 34 * (i / 7) * (i / 7) * 1.6;
        c.beginPath(); c.moveTo(xx - 3, yy); c.lineTo(xx + 3, yy); c.stroke();
      }
      // веер листьев
      const topX = lean * 34, topY = -H;
      const leafCols = ["#2e6b2a", "#3f8a35", "#55a844", "#2a5e28"];
      for (let i = 0; i < 8; i++) {
        const a = -Math.PI + (i / 7) * Math.PI + (rng() - 0.5) * 0.2;
        const sway = Math.sin(this.time * 1.1 + t.seed + i) * 0.05;
        c.strokeStyle = leafCols[i % 4];
        c.lineWidth = 4.6 - (i % 2);
        c.lineCap = "round";
        c.beginPath();
        c.moveTo(topX, topY);
        const L = 34 + rng() * 14;
        c.quadraticCurveTo(
          topX + Math.cos(a + sway) * L * 0.6,
          topY + Math.sin(a + sway) * L * 0.5 - 8,
          topX + Math.cos(a + sway) * L,
          topY + Math.sin(a + sway) * L * 0.75 + 10
        );
        c.stroke();
      }
      // кокосы
      c.fillStyle = "#5e4426";
      c.beginPath(); c.arc(topX - 3, topY + 4, 3, 0, Math.PI * 2); c.arc(topX + 3, topY + 5, 3, 0, Math.PI * 2); c.fill();
      c.restore();
      return;
    }

    if (inferno) {
      // АДСКОЕ МЁРТВОЕ ДЕРЕВО: чёрные корявые ветви + тлеющие трещины
      c.strokeStyle = "#140b08";
      c.lineCap = "round";
      c.lineWidth = 5;
      c.beginPath();
      c.moveTo(0, 0);
      c.quadraticCurveTo(-3, -26, 2, -52);
      c.stroke();
      c.lineWidth = 3;
      c.beginPath();
      c.moveTo(0, -22); c.quadraticCurveTo(-14, -34, -24, -40);
      c.moveTo(1, -34); c.quadraticCurveTo(12, -46, 20, -56);
      c.moveTo(2, -52); c.quadraticCurveTo(-6, -66, -10, -76);
      c.moveTo(2, -52); c.quadraticCurveTo(8, -68, 14, -78);
      c.stroke();
      c.lineWidth = 1.8;
      c.beginPath();
      c.moveTo(-24, -40); c.lineTo(-30, -46);
      c.moveTo(20, -56); c.lineTo(26, -60);
      c.moveTo(-10, -76); c.lineTo(-14, -84);
      c.stroke();
      // тлеющие прожилки
      const gl = 0.35 + 0.3 * Math.sin(this.time * 2.4 + t.seed);
      c.strokeStyle = `rgba(255,110,40,${gl})`;
      c.lineWidth = 1.2;
      c.beginPath();
      c.moveTo(-1, -6); c.lineTo(1, -20); c.lineTo(-1, -34);
      c.moveTo(12, -48); c.lineTo(16, -54);
      c.stroke();
      c.fillStyle = `rgba(255,140,50,${gl})`;
      c.beginPath(); c.arc(14, -78, 1.8, 0, Math.PI * 2); c.arc(-30, -46, 1.5, 0, Math.PI * 2); c.fill();
      c.restore();
      return;
    }

    if (frost) {
      // ель
      const tg = c.createLinearGradient(-3, 0, 3, 0);
      tg.addColorStop(0, "#241812");
      tg.addColorStop(0.5, "#4a3424");
      tg.addColorStop(1, "#1c120c");
      c.fillStyle = tg;
      c.fillRect(-3, -16, 6, 16);
      const tiers = 4;
      for (let i = 0; i < tiers; i++) {
        const ty = -14 - i * 16;
        const w = 27 - i * 5.6;
        const col = t.side === 1 ? ["#1d3a4a", "#25506a", "#2f6484"][i % 3] : ["#1e4a3a", "#2a6450", "#357c62"][i % 3];
        c.fillStyle = col;
        for (const m of [-1, 0, 1]) {
          c.beginPath();
          c.moveTo(m * w * 0.4 - w * 0.5, ty);
          c.quadraticCurveTo(m * w * 0.4, ty - 24, m * w * 0.4 + w * 0.5, ty);
          c.closePath();
          c.fill();
        }
        c.fillStyle = "rgba(235,248,255,0.9)";
        c.beginPath();
        c.ellipse(0, ty - 15, w * 0.42, 3.4, 0, Math.PI, 0);
        c.fill();
      }
      c.fillStyle = t.side === 1 ? "#2f6484" : "#357c62";
      c.beginPath();
      c.moveTo(-8, -14 - tiers * 16 + 12);
      c.quadraticCurveTo(0, -104, 8, -14 - tiers * 16 + 12);
      c.closePath(); c.fill();
      c.fillStyle = "#fff";
      c.beginPath(); c.ellipse(0, -96, 5, 3, 0, 0, Math.PI * 2); c.fill();
      c.restore();
      return;
    }

    // лиственное дерево: мощный ствол
    const trunkH = 46;
    const tg = c.createLinearGradient(-4, 0, 4, 0);
    tg.addColorStop(0, "#241708");
    tg.addColorStop(0.45, "#5a4026");
    tg.addColorStop(1, "#1c1106");
    c.fillStyle = tg;
    c.beginPath();
    c.moveTo(-5.4, 0);
    c.quadraticCurveTo(-3.4, -trunkH * 0.5, -2.6, -trunkH);
    c.lineTo(2.6, -trunkH);
    c.quadraticCurveTo(3.4, -trunkH * 0.5, 5.4, 0);
    c.closePath();
    c.fill();
    c.beginPath();
    c.moveTo(-5.4, 0); c.quadraticCurveTo(-9, -2, -10.4, 1.6); c.lineTo(-4.6, 1.6);
    c.moveTo(5.4, 0); c.quadraticCurveTo(9, -2, 10.4, 1.6); c.lineTo(4.6, 1.6);
    c.closePath(); c.fill();
    c.strokeStyle = "#3a2814";
    c.lineWidth = 3;
    c.beginPath();
    c.moveTo(-1, -trunkH * 0.72); c.quadraticCurveTo(-14, -trunkH * 0.9, -20, -trunkH * 1.06);
    c.moveTo(1, -trunkH * 0.6); c.quadraticCurveTo(15, -trunkH * 0.78, 21, -trunkH * 0.9);
    c.stroke();

    // крона: кластеры в 4 слоя
    const top = t.side === 0
      ? { sh: "#1e3a1c", d: "#2e5527", m: "#3f7433", l: "#5a9444", hi: "#7cb85a", rim: "rgba(190,230,140,0.5)" }
      : { sh: "#2a1410", d: "#4a241a", m: "#6a3a24", l: "#8a5230", hi: "#a86a3c", rim: "rgba(240,170,120,0.45)" };
    const cx0 = 0, cy0 = -trunkH - 18;
    const clusters: [number, number, number][] = [
      [-26, 8, 17], [26, 6, 16], [-14, -10, 19], [16, -12, 18], [0, 4, 21], [-2, -22, 16], [30, -4, 12], [-30, -2, 12], [0, -2, 17],
    ];
    c.fillStyle = top.sh;
    for (const [dx, dy, r] of clusters) this.blob(c, cx0 + dx, cy0 + dy + 5, r * 0.96);
    c.fillStyle = top.d;
    for (const [dx, dy, r] of clusters) this.blob(c, cx0 + dx, cy0 + dy + 2, r * 0.92);
    c.fillStyle = top.m;
    for (const [dx, dy, r] of clusters) this.blob(c, cx0 + dx, cy0 + dy, r * 0.86);
    c.fillStyle = top.l;
    for (const [dx, dy, r] of clusters) {
      if (dx < 12 && dy < 6) this.blob(c, cx0 + dx - r * 0.22, cy0 + dy - r * 0.28, r * 0.5);
    }
    c.fillStyle = top.hi;
    for (const [dx, dy, r] of clusters) {
      if (dx < 8 && dy < 0) this.blob(c, cx0 + dx - r * 0.3, cy0 + dy - r * 0.4, r * 0.26);
    }
    c.strokeStyle = top.rim;
    c.lineWidth = 1.6;
    for (const [dx, dy, r] of clusters) {
      if (dx > 4) {
        c.beginPath(); c.arc(cx0 + dx, cy0 + dy, r * 0.86, -1.1, 0.7); c.stroke();
      }
    }
    c.fillStyle = top.m;
    for (let i = 0; i < 14; i++) {
      const a = rng() * Math.PI * 2;
      const rr = 30 + rng() * 10;
      this.blob(c, cx0 + Math.cos(a) * rr, cy0 + Math.sin(a) * rr * 0.72 - 4, 3.4 + rng() * 3);
    }
    if (t.side === 1) {
      const gl = 0.4 + 0.3 * Math.sin(this.time * 2.2 + t.seed);
      c.fillStyle = `rgba(255,110,50,${gl})`;
      this.blob(c, cx0 - 10, cy0 + 4, 1.6);
      this.blob(c, cx0 + 14, cy0 - 8, 1.6);
      this.blob(c, cx0 + 2, cy0 + 12, 1.4);
    }
    c.restore();
  }

  private drawCrate(c: CanvasRenderingContext2D, cr: Crate) {
    c.save();
    c.translate(cr.x, cr.y);
    if (!cr.landed) c.rotate(Math.sin(this.time * 2.4 + cr.x * 0.05) * 0.09);

    // свой спрайт подарка из мастерской
    const sprC = this.spriteOf("crate");
    if (sprC) {
      const pulse = 0.75 + 0.25 * Math.sin(this.time * 4 + cr.x);
      const glow = c.createRadialGradient(0, 0, 2, 0, 0, 34);
      glow.addColorStop(0, `rgba(245,214,123,${0.3 * pulse})`);
      glow.addColorStop(1, "rgba(0,0,0,0)");
      c.fillStyle = glow;
      c.beginPath(); c.arc(0, 0, 34, 0, Math.PI * 2); c.fill();
      c.drawImage(sprC.img, -sprC.cfg.w / 2, -sprC.cfg.h / 2 + sprC.cfg.offY, sprC.cfg.w, sprC.cfg.h);
      c.restore();
      return;
    }

    if (!cr.landed) {
      c.strokeStyle = "rgba(207,198,168,0.9)";
      c.lineWidth = 1.1;
      c.beginPath();
      c.moveTo(-12, -9); c.lineTo(-15, -32);
      c.moveTo(12, -9); c.lineTo(15, -32);
      c.moveTo(0, -10); c.lineTo(0, -34);
      c.stroke();
      const segs = 6;
      for (let i = 0; i < segs; i++) {
        const a0 = Math.PI + (i / segs) * Math.PI;
        const a1 = Math.PI + ((i + 1) / segs) * Math.PI;
        c.fillStyle = i % 2 === 0 ? "#d8cfae" : "#a8452e";
        c.beginPath();
        c.moveTo(0, -34);
        c.arc(0, -34, 21, a0, a1);
        c.closePath();
        c.fill();
      }
      c.strokeStyle = "rgba(60,45,25,0.55)";
      c.lineWidth = 1;
      c.beginPath(); c.arc(0, -34, 21, Math.PI, 0); c.stroke();
      c.fillStyle = "rgba(0,0,0,0.18)";
      c.beginPath(); c.arc(0, -34, 21, Math.PI, Math.PI * 1.5); c.lineTo(0, -34); c.closePath(); c.fill();
    }

    const pulse = 0.75 + 0.25 * Math.sin(this.time * 4 + cr.x);
    const glow = c.createRadialGradient(0, 0, 2, 0, 0, 34);
    glow.addColorStop(0, cr.kind === "gold" ? `rgba(245,214,123,${0.32 * pulse})` : `rgba(126,224,138,${0.32 * pulse})`);
    glow.addColorStop(1, "rgba(0,0,0,0)");
    c.fillStyle = glow;
    c.beginPath(); c.arc(0, 0, 34, 0, Math.PI * 2); c.fill();

    const OX = 8, OY = -7;
    c.fillStyle = "#6e4520";
    c.beginPath();
    c.moveTo(12, -10); c.lineTo(12 + OX, -10 + OY); c.lineTo(12 + OX, 10 + OY); c.lineTo(12, 10);
    c.closePath(); c.fill();
    const topG = c.createLinearGradient(0, -10 + OY, 0, -10);
    topG.addColorStop(0, "#c08a4a");
    topG.addColorStop(1, "#8f5f2e");
    c.fillStyle = topG;
    c.beginPath();
    c.moveTo(-12, -10); c.lineTo(-12 + OX, -10 + OY); c.lineTo(12 + OX, -10 + OY); c.lineTo(12, -10);
    c.closePath(); c.fill();
    const frG = c.createLinearGradient(-12, 0, 12, 0);
    frG.addColorStop(0, "#9a6530");
    frG.addColorStop(0.45, "#8a5a2a");
    frG.addColorStop(1, "#6a431e");
    c.fillStyle = frG;
    c.fillRect(-12, -10, 24, 20);
    c.strokeStyle = "rgba(58,36,16,0.6)";
    c.lineWidth = 1.2;
    c.beginPath(); c.moveTo(-12, -3.4); c.lineTo(12, -3.4); c.moveTo(-12, 3.4); c.lineTo(12, 3.4); c.stroke();
    c.strokeStyle = "#4a2d12";
    c.lineWidth = 1.6;
    c.strokeRect(-12, -10, 24, 20);
    c.beginPath();
    c.moveTo(-12, -10); c.lineTo(-12 + OX, -10 + OY); c.lineTo(12 + OX, -10 + OY); c.lineTo(12, -10);
    c.moveTo(12 + OX, -10 + OY); c.lineTo(12 + OX, 10 + OY); c.lineTo(12, 10);
    c.stroke();
    c.fillStyle = "#d9a441";
    for (const [cx2, cy2] of [[-12, -10], [12, -10], [-12, 10], [12, 10]] as const) {
      c.beginPath(); c.arc(cx2, cy2, 2.2, 0, Math.PI * 2); c.fill();
    }
    c.fillStyle = cr.kind === "gold" ? "#e8c14a" : "#5fce74";
    c.fillRect(-2.4, -10, 4.8, 20);
    c.beginPath();
    c.moveTo(-2.4, -10); c.lineTo(-2.4 + OX, -10 + OY); c.lineTo(2.4 + OX, -10 + OY); c.lineTo(2.4, -10);
    c.closePath(); c.fill();
    const bx = OX / 2, by = -10 + OY / 2;
    c.fillStyle = cr.kind === "gold" ? "#f5d67b" : "#7ee08a";
    c.beginPath();
    c.ellipse(bx - 5, by - 2, 4.6, 3, -0.5, 0, Math.PI * 2);
    c.ellipse(bx + 5, by - 2, 4.6, 3, 0.5, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = cr.kind === "gold" ? "#d9a441" : "#4caf63";
    c.beginPath(); c.arc(bx, by - 1.4, 2.6, 0, Math.PI * 2); c.fill();
    c.fillStyle = "rgba(8,10,16,0.55)";
    c.beginPath(); c.arc(0, 0, 5.4, 0, Math.PI * 2); c.fill();
    c.strokeStyle = cr.kind === "gold" ? "#f5d67b" : "#7ee08a";
    c.lineWidth = 1.4;
    c.beginPath(); c.arc(0, 0, 5.4, 0, Math.PI * 2); c.stroke();
    if (cr.kind === "gold") {
      c.fillStyle = "#f5d67b";
      c.beginPath(); c.arc(0, 0, 3, 0, Math.PI * 2); c.fill();
    } else {
      c.strokeStyle = "#7ee08a";
      c.lineWidth = 2;
      c.beginPath(); c.moveTo(0, -2.6); c.lineTo(0, 2.6); c.moveTo(-2.6, 0); c.lineTo(2.6, 0); c.stroke();
    }
    c.restore();
  }

  private drawGrave(c: CanvasRenderingContext2D, h: Hero) {
    c.save();
    c.translate(h.x, h.y);
    c.rotate(Math.sin(h.x) * 0.12);
    c.fillStyle = "rgba(90,96,110,0.85)";
    c.beginPath();
    c.moveTo(-7, 0); c.lineTo(-7, -16); c.arc(0, -16, 7, Math.PI, 0); c.lineTo(7, 0);
    c.closePath(); c.fill();
    c.strokeStyle = "rgba(30,34,42,0.8)";
    c.lineWidth = 1.5;
    c.stroke();
    c.beginPath(); c.moveTo(0, -20); c.lineTo(0, -10); c.moveTo(-3.4, -16.6); c.lineTo(3.4, -16.6); c.stroke();
    c.restore();
  }

  private drawParticles(c: CanvasRenderingContext2D) {
    for (const p of this.particles) {
      const t = p.life / p.max;
      if (p.kind === "glow") {
        c.globalAlpha = t;
        const g = c.createRadialGradient(p.x, p.y, 1, p.x, p.y, p.size);
        g.addColorStop(0, "rgba(255,246,214,0.95)");
        g.addColorStop(0.5, "rgba(255,180,80,0.55)");
        g.addColorStop(1, "rgba(255,120,40,0)");
        c.fillStyle = g;
        c.beginPath(); c.arc(p.x, p.y, p.size * (1.6 - t * 0.6), 0, Math.PI * 2); c.fill();
      } else if (p.kind === "ring") {
        c.globalAlpha = t * 0.8;
        c.strokeStyle = p.color;
        c.lineWidth = 2.5;
        c.beginPath(); c.arc(p.x, p.y, p.size * (1 - t), 0, Math.PI * 2); c.stroke();
      } else {
        c.globalAlpha = t;
        c.fillStyle = p.color;
        c.beginPath(); c.arc(p.x, p.y, p.size * (p.kind === "smoke" ? 1.6 - t * 0.6 : 1), 0, Math.PI * 2); c.fill();
      }
    }
    c.globalAlpha = 1;
  }

  private drawProjectile(c: CanvasRenderingContext2D, p: Proj) {
    const ang = Math.atan2(p.vy, p.vx);
    const id = p.def.id;

    // цепь крюка
    if (id === "hook" && p.shooter) {
      const sx = p.shooter.x, sy = p.shooter.y - HERO_CY;
      const d = Math.hypot(p.x - sx, p.y - sy);
      const n = Math.max(3, Math.floor(d / 14));
      c.strokeStyle = "#8a8f99";
      c.lineWidth = 1.6;
      for (let i = 1; i < n; i++) {
        const t = i / n;
        const lx = lerp(sx, p.x, t);
        const ly = lerp(sy, p.y, t) + Math.sin(t * Math.PI) * 6 + Math.sin(this.time * 14 + i) * 1.6;
        c.beginPath(); c.arc(lx, ly, 2.1, 0, Math.PI * 2); c.stroke();
      }
    }

    c.save();
    c.translate(p.x, p.y);
    if (id === "dynamite") {
      c.rotate(p.spin);
      c.fillStyle = "#c23c2a";
      for (const o of [-3.2, 0, 3.2]) {
        c.save(); c.rotate(o * 0.06); c.fillRect(-2.2, -7 + o * 0.4, 4.4, 14); c.restore();
      }
      c.strokeStyle = "#e8d8a8";
      c.lineWidth = 1.2;
      c.beginPath(); c.moveTo(0, -7); c.quadraticCurveTo(3, -11, 6, -10); c.stroke();
      c.fillStyle = "#ffe9a0";
      c.beginPath(); c.arc(6, -10, 2.4 + Math.sin(this.time * 40) * 0.8, 0, Math.PI * 2); c.fill();
      if (p.fuseT < 1 && Math.sin(this.time * 40) > 0) {
        c.fillStyle = "rgba(255,255,255,0.55)";
        c.beginPath(); c.arc(0, 0, 8, 0, Math.PI * 2); c.fill();
      }
    } else if (id === "napalm") {
      c.rotate(ang);
      c.fillStyle = "#d9742a";
      c.fillRect(-6, -4, 12, 8);
      c.strokeStyle = "#7d3a12";
      c.lineWidth = 1.4;
      c.strokeRect(-6, -4, 12, 8);
      c.fillStyle = "#ffd66b";
      c.beginPath(); c.arc(-8, 0, 2.4, 0, Math.PI * 2); c.fill();
    } else if (id === "cluster") {
      c.rotate(p.spin);
      const r = p.mini ? 3.6 : 5.2;
      c.fillStyle = "#2b303a";
      c.beginPath(); c.arc(0, 0, r, 0, Math.PI * 2); c.fill();
      c.fillStyle = "#5a6270";
      for (const [dx, dy] of [[-1.6, -1], [1.8, -0.4], [0, 1.6]] as const) {
        c.beginPath(); c.arc(dx * (r / 5), dy * (r / 5), r * 0.24, 0, Math.PI * 2); c.fill();
      }
    } else if (id === "hook") {
      c.rotate(ang + 0.4);
      c.strokeStyle = "#c8ccd4";
      c.lineWidth = 3;
      c.beginPath(); c.arc(0, 0, 7, -0.6, Math.PI + 0.2); c.stroke();
      c.fillStyle = "#c8ccd4";
      c.beginPath();
      const hx = Math.cos(Math.PI + 0.2) * 7, hy = Math.sin(Math.PI + 0.2) * 7;
      c.moveTo(hx, hy); c.lineTo(hx + 5, hy - 3); c.lineTo(hx + 2, hy + 4); c.closePath(); c.fill();
      c.fillStyle = "#6a4a2a";
      c.beginPath(); c.arc(Math.cos(-0.6) * 7, Math.sin(-0.6) * 7, 2.4, 0, Math.PI * 2); c.fill();
    } else if (id === "axe") {
      c.rotate(p.spin);
      c.strokeStyle = "#6a4a2a";
      c.lineWidth = 3;
      c.beginPath(); c.moveTo(-8, 0); c.lineTo(8, 0); c.stroke();
      c.fillStyle = "#9aa2ac";
      c.beginPath(); c.moveTo(4, -7); c.quadraticCurveTo(12, -5, 12, 0); c.quadraticCurveTo(12, 5, 4, 7); c.quadraticCurveTo(7, 0, 4, -7); c.closePath(); c.fill();
    } else if (id === "frost" || id === "nova") {
      const g = c.createRadialGradient(0, 0, 1, 0, 0, 12);
      g.addColorStop(0, "rgba(159,220,255,0.7)");
      g.addColorStop(1, "rgba(159,220,255,0)");
      c.fillStyle = g;
      c.beginPath(); c.arc(0, 0, 12, 0, Math.PI * 2); c.fill();
      c.rotate(p.spin);
      c.fillStyle = "#bfe8ff";
      c.beginPath(); c.moveTo(0, -6); c.lineTo(4.4, 0); c.lineTo(0, 6); c.lineTo(-4.4, 0); c.closePath(); c.fill();
    } else if (id === "snipe") {
      c.rotate(ang);
      const g = c.createLinearGradient(-18, 0, 6, 0);
      g.addColorStop(0, "rgba(255,210,123,0)");
      g.addColorStop(1, "rgba(255,210,123,0.9)");
      c.strokeStyle = g;
      c.lineWidth = 2.4;
      c.beginPath(); c.moveTo(-18, 0); c.lineTo(6, 0); c.stroke();
      c.fillStyle = "#fff2cf";
      c.beginPath(); c.arc(6, 0, 2, 0, Math.PI * 2); c.fill();
    } else if (id === "volley") {
      c.rotate(ang);
      c.strokeStyle = "#6a4a2a";
      c.lineWidth = 1.8;
      c.beginPath(); c.moveTo(-7, 0); c.lineTo(6, 0); c.stroke();
      c.fillStyle = "#c8ccd4";
      c.beginPath(); c.moveTo(9, 0); c.lineTo(4, -2.4); c.lineTo(4, 2.4); c.closePath(); c.fill();
    } else if (id === "shotgun") {
      c.fillStyle = "#262a32";
      c.beginPath(); c.arc(0, 0, 2.6, 0, Math.PI * 2); c.fill();
      c.fillStyle = "#5a6270";
      c.beginPath(); c.arc(-0.7, -0.8, 1, 0, Math.PI * 2); c.fill();
    } else {
      const g = c.createRadialGradient(0, 0, 1, 0, 0, 14);
      g.addColorStop(0, "rgba(255,170,70,0.8)");
      g.addColorStop(1, "rgba(255,120,40,0)");
      c.fillStyle = g;
      c.beginPath(); c.arc(0, 0, 14, 0, Math.PI * 2); c.fill();
      c.fillStyle = "#2b303a";
      c.beginPath(); c.arc(0, 0, 5.5, 0, Math.PI * 2); c.fill();
      c.fillStyle = "#5a6270";
      c.beginPath(); c.arc(-1.6, -1.8, 2, 0, Math.PI * 2); c.fill();
    }
    c.restore();
  }

  private drawHero(c: CanvasRenderingContext2D, h: Hero, isActive: boolean) {
    const a = this.aimAngle;
    const dir = Math.cos(a) >= 0 || !isActive ? 1 : -1;
    c.save();
    c.translate(h.x, h.y);

    // командное кольцо
    c.strokeStyle = h.team === 0 ? "rgba(159,212,90,0.5)" : "rgba(224,80,56,0.5)";
    c.lineWidth = 2;
    c.beginPath(); c.ellipse(0, -0.6, 18, 5.6, 0, 0, Math.PI * 2); c.stroke();

    if (isActive) {
      const g = c.createRadialGradient(0, -30, 6, 0, -30, 62);
      g.addColorStop(0, h.team === 0 ? "rgba(159,212,90,0.3)" : "rgba(224,80,56,0.3)");
      g.addColorStop(1, "rgba(0,0,0,0)");
      c.fillStyle = g;
      c.beginPath(); c.arc(0, -30, 62, 0, Math.PI * 2); c.fill();
      c.strokeStyle = h.team === 0 ? "rgba(245,214,123,0.9)" : "rgba(255,140,90,0.9)";
      c.lineWidth = 2.2;
      c.setLineDash([6, 5]);
      c.lineDashOffset = -this.time * 20;
      c.beginPath(); c.ellipse(0, -1, 21, 6.4, 0, 0, Math.PI * 2); c.stroke();
      c.setLineDash([]);
    }

    // тень
    c.fillStyle = "rgba(0,0,0,0.38)";
    c.beginPath(); c.ellipse(0, -1, 16.5, 4.8, 0, 0, Math.PI * 2); c.fill();

    // пользовательская модель из мастерской (якорь — низ по центру, стоит на земле)
    const spr = this.spriteOf(h.type);
    if (spr) {
      const walkingS = h.onGround && isActive && this.moveInput !== 0;
      const bobS = walkingS ? Math.abs(Math.sin(h.walkPhase)) * 1.5 : 0;
      c.translate(0, -bobS);
      c.scale(dir, 1); // авто-отражение по направлению взгляда
      c.drawImage(spr.img, -spr.cfg.w / 2, -spr.cfg.h + spr.cfg.offY, spr.cfg.w, spr.cfg.h);
      c.restore();
      this.drawHeroTop(c, h, isActive, spr.cfg);
      return;
    }

    const walking = h.onGround && isActive && this.moveInput !== 0;
    const bob = walking ? Math.abs(Math.sin(h.walkPhase)) * 1.5 : 0;
    c.translate(0, -bob);
    c.scale(dir * HS, HS);

    const body: Record<string, [string, string]> = {
      sniper: ["#4a6b3a", "#2e4425"],
      cm: ["#4f7fb8", "#33547d"],
      jugg: ["#8a4526", "#5e2e19"],
      lina: ["#b8452f", "#7d2d1e"],
      pudge: ["#7a6a52", "#554a38"],
      axe: ["#8a3a2c", "#59241a"],
      lich: ["#2e5878", "#1d3a52"],
      drow: ["#4a3b55", "#302638"],
    };
    const [main, dark] = body[h.type] || ["#5a5a5a", "#3a3a3a"];
    const skin = h.type === "pudge" ? "#a3b18c" : h.type === "lich" ? "#93a9ba" : h.type === "drow" ? "#cfc4da" : "#d8b48e";
    const teamC = h.team === 0 ? "#d9a441" : "#e05038";

    // плащ
    if (h.type === "cm" || h.type === "lina" || h.type === "lich" || h.type === "drow") {
      const wave = Math.sin(this.time * 2.4 + h.x * 0.1) * 1.6;
      c.fillStyle = dark;
      c.beginPath();
      c.moveTo(-3.5, -30);
      c.quadraticCurveTo(-12, -20, -9.5 - wave, -3);
      c.lineTo(-4.5 - wave * 0.4, -3.5);
      c.quadraticCurveTo(-7, -18, -1.5, -28);
      c.closePath();
      c.fill();
    }
    // колчан Дроу
    if (h.type === "drow") {
      c.save();
      c.translate(-4.5, -24);
      c.rotate(-0.5);
      c.fillStyle = "#4a3520";
      c.fillRect(-2.6, -9, 5.2, 13);
      c.strokeStyle = "#2a1d10"; c.lineWidth = 1;
      c.strokeRect(-2.6, -9, 5.2, 13);
      c.strokeStyle = "#c9c2d4"; c.lineWidth = 1.3;
      c.beginPath(); c.moveTo(-1.2, -9); c.lineTo(-1.2, -13); c.moveTo(1.2, -9); c.lineTo(1.2, -13.6); c.stroke();
      c.restore();
    }

    // ноги
    const lp = walking ? Math.sin(h.walkPhase) * 4 : 0;
    c.strokeStyle = "#241d15";
    c.lineWidth = 4.2;
    c.lineCap = "round";
    c.beginPath(); c.moveTo(-2.6, -15); c.quadraticCurveTo(-3.3 - lp * 0.25, -8.5, -3.4 - lp, -2.2); c.stroke();
    c.beginPath(); c.moveTo(2.6, -15); c.quadraticCurveTo(3.3 + lp * 0.25, -8.5, 3.4 + lp, -2.2); c.stroke();
    c.lineCap = "butt";
    c.fillStyle = "#3b2c1a";
    c.beginPath();
    c.roundRect(-6.6 - lp, -3.6, 6.6, 3.8, 1.6);
    c.roundRect(0.4 + lp, -3.6, 6.6, 3.8, 1.6);
    c.fill();
    c.fillStyle = "rgba(255,255,255,0.09)";
    c.fillRect(-6.2 - lp, -3.6, 5.8, 1);
    c.fillRect(0.8 + lp, -3.6, 5.8, 1);

    // задняя рука
    c.strokeStyle = dark;
    c.lineWidth = 3.6;
    c.lineCap = "round";
    c.beginPath(); c.moveTo(-5.2, -25.5); c.quadraticCurveTo(-8.4, -20.5, -7.2, -14.8); c.stroke();
    c.lineCap = "butt";
    c.fillStyle = skin;
    c.beginPath(); c.arc(-7.2, -14.8, 2, 0, Math.PI * 2); c.fill();

    // торс (объём)
    const wide = h.type === "pudge" ? 12.5 : 9.5;
    const tg = c.createLinearGradient(-wide, -29, wide, -13);
    tg.addColorStop(0, dark);
    tg.addColorStop(0.4, main);
    tg.addColorStop(0.72, main);
    tg.addColorStop(1, "#120d08");
    c.fillStyle = tg;
    c.beginPath();
    c.moveTo(-wide * 0.55, -29);
    c.quadraticCurveTo(-wide * 1.02, -20, -wide * 0.72, -13.5);
    c.lineTo(wide * 0.72, -13.5);
    c.quadraticCurveTo(wide * 1.02, -20, wide * 0.55, -29);
    c.closePath();
    c.fill();
    c.strokeStyle = "rgba(0,0,0,0.5)";
    c.lineWidth = 1.1;
    c.stroke();
    c.fillStyle = "rgba(0,0,0,0.22)";
    c.beginPath();
    c.moveTo(-wide * 0.55, -29);
    c.quadraticCurveTo(-wide * 1.02, -20, -wide * 0.72, -13.5);
    c.lineTo(-wide * 0.08, -13.5);
    c.quadraticCurveTo(-wide * 0.44, -22, -wide * 0.08, -29);
    c.closePath();
    c.fill();
    c.fillStyle = "rgba(255,255,255,0.07)";
    c.beginPath(); c.ellipse(wide * 0.3, -23.5, wide * 0.3, 4.4, -0.3, 0, Math.PI * 2); c.fill();

    // пояс + перевязь
    c.fillStyle = "#2c2115";
    c.fillRect(-wide * 0.72, -15.4, wide * 1.44, 3);
    c.fillStyle = "#d9a441";
    c.fillRect(-1.5, -15.1, 3, 2.4);
    c.strokeStyle = teamC;
    c.lineWidth = 2.4;
    c.beginPath(); c.moveTo(-wide * 0.42, -27.5); c.lineTo(wide * 0.56, -15.8); c.stroke();

    this.drawHeroTorso(c, h.type, wide);

    // наплечники
    c.fillStyle = dark;
    c.beginPath(); c.arc(-6.2, -27.8, 3.5, 0, Math.PI * 2); c.fill();
    c.beginPath(); c.arc(6.2, -27.8, 3.5, 0, Math.PI * 2); c.fill();
    c.strokeStyle = teamC;
    c.lineWidth = 1.2;
    c.beginPath(); c.arc(6.2, -27.8, 3.5, -0.7, 1.1); c.stroke();

    // шея и голова с объёмом
    c.fillStyle = skin;
    c.fillRect(-2, -33.6, 4, 3.6);
    c.beginPath(); c.arc(0, -37.6, 6.4, 0, Math.PI * 2); c.fill();
    const hg = c.createRadialGradient(-2.4, -40.4, 1, 0, -37.6, 7.8);
    hg.addColorStop(0, "rgba(255,255,255,0.34)");
    hg.addColorStop(0.5, "rgba(255,255,255,0.06)");
    hg.addColorStop(0.78, "rgba(0,0,0,0)");
    hg.addColorStop(1, "rgba(0,0,0,0.3)");
    c.fillStyle = hg;
    c.beginPath(); c.arc(0, -37.6, 6.4, 0, Math.PI * 2); c.fill();
    c.strokeStyle = "rgba(0,0,0,0.45)";
    c.lineWidth = 1;
    c.beginPath(); c.arc(0, -37.6, 6.4, 0, Math.PI * 2); c.stroke();
    c.fillStyle = "rgba(0,0,0,0.10)";
    c.beginPath(); c.ellipse(0, -33.6, 3.4, 1.2, 0, 0, Math.PI); c.fill();
    this.drawHeroHead(c, h.type);

    // передняя рука + оружие
    const hasWeapon = isActive && (this.phase === "aim" || this.phase === "ai" || this.phase === "flight");
    if (hasWeapon) {
      const hx = dir * Math.cos(a) * 10.5;
      const hy = -18 + Math.sin(a) * 10.5;
      c.strokeStyle = main;
      c.lineWidth = 3.8;
      c.lineCap = "round";
      c.beginPath(); c.moveTo(dir * 5.4, -25.5); c.quadraticCurveTo(dir * 8.6, -22.5, hx, hy); c.stroke();
      c.lineCap = "butt";
      c.save();
      c.translate(0, -18);
      c.scale(dir, 1);
      c.rotate(a);
      this.drawWeaponInHand(c, weaponById[h.weapon]);
      c.restore();
      c.fillStyle = skin;
      c.beginPath(); c.arc(hx, hy, 2.2, 0, Math.PI * 2); c.fill();
    } else {
      c.strokeStyle = main;
      c.lineWidth = 3.8;
      c.lineCap = "round";
      c.beginPath(); c.moveTo(dir * 5.4, -25.5); c.quadraticCurveTo(dir * 8.2, -20.5, dir * 6.8, -15.5); c.stroke();
      c.lineCap = "butt";
      c.fillStyle = skin;
      c.beginPath(); c.arc(dir * 6.8, -15.5, 2, 0, Math.PI * 2); c.fill();
    }

    c.restore();

    this.drawHeroTop(c, h, isActive, null);
  }

  /** Взмах, полоска HP, имя и вспышка урона — поверх любой модели (векторной или своей) */
  private drawHeroTop(c: CanvasRenderingContext2D, h: Hero, isActive: boolean, sp: SpriteConfig | null) {
    // взмах ближнего боя
    if (h.swingT > 0) {
      const wdef = weaponById[h.weapon];
      const sw = this.aimAngle;
      const k = h.swingT / 0.3;
      c.save();
      c.globalAlpha = k * 0.4;
      c.fillStyle = "#f5d67b";
      c.beginPath();
      c.moveTo(h.x, h.y - HERO_CY);
      c.arc(h.x, h.y - HERO_CY, (wdef.range ?? 60) * (1.15 - k * 0.15), sw - 0.85, sw + 0.85);
      c.closePath();
      c.fill();
      c.globalAlpha = k * 0.9;
      c.strokeStyle = "#fff2cf";
      c.lineWidth = 3;
      c.beginPath();
      c.arc(h.x, h.y - HERO_CY, (wdef.range ?? 60) * (1.15 - k * 0.15), sw - 0.7, sw + 0.7);
      c.stroke();
      c.restore();
    }

    // полоска HP + имя (для своей модели — над её макушкой)
    const topY = sp ? sp.h + 14 : 86;
    const pct = h.hp / h.maxHp;
    const bw = 46;
    const tc = h.team === 0 ? "159,212,90" : "224,80,56";
    c.fillStyle = "rgba(8,10,16,0.85)";
    c.fillRect(h.x - bw / 2 - 1, h.y - topY, bw + 2, 7);
    const hpc = pct > 0.5 ? (h.team === 0 ? "#8fce4f" : "#e06a4a") : pct > 0.25 ? "#e8c14a" : "#e05038";
    c.fillStyle = hpc;
    c.fillRect(h.x - bw / 2, h.y - topY + 1, bw * pct, 5);
    c.strokeStyle = isActive ? "rgba(245,214,123,0.95)" : `rgba(${tc},0.6)`;
    c.lineWidth = 1;
    c.strokeRect(h.x - bw / 2 - 1, h.y - topY, bw + 2, 7);
    c.font = `${isActive ? "700" : "500"} 10.5px "Rubik", sans-serif`;
    c.textAlign = "center";
    c.fillStyle = isActive ? "#f5d67b" : h.team === 0 ? "rgba(207,232,168,0.85)" : "rgba(240,160,142,0.85)";
    c.strokeStyle = "rgba(8,10,16,0.9)";
    c.lineWidth = 2.5;
    c.strokeText(h.name, h.x, h.y - topY - 4);
    c.fillText(h.name, h.x, h.y - topY - 4);

    if (h.flashT > 0) {
      c.fillStyle = `rgba(255,255,255,${h.flashT * 3.4})`;
      const fh = sp ? sp.h * 0.5 : 36;
      const fw = sp ? Math.max(20, sp.w * 0.4) : 20;
      c.beginPath(); c.ellipse(h.x, h.y - fh + (sp ? sp.offY : 4), fw, fh, 0, 0, Math.PI * 2); c.fill();
    }
  }

  private drawHeroTorso(c: CanvasRenderingContext2D, type: string, wide: number) {
    switch (type) {
      case "sniper":
        c.strokeStyle = "#4a3520";
        c.lineWidth = 3;
        c.beginPath(); c.moveTo(-wide * 0.5, -27); c.lineTo(wide * 0.55, -17); c.stroke();
        c.fillStyle = "#6a4d28";
        for (let i = 0; i < 3; i++) {
          const t = 0.25 + i * 0.25;
          c.fillRect(lerp(-wide * 0.5, wide * 0.55, t) - 1.6, lerp(-27, -17, t) - 1.4, 3.4, 4);
        }
        break;
      case "cm":
        c.fillStyle = "rgba(220,240,250,0.5)";
        c.beginPath();
        c.moveTo(-wide * 0.4, -28.6); c.lineTo(0, -24); c.lineTo(wide * 0.4, -28.6); c.lineTo(0, -26);
        c.closePath(); c.fill();
        break;
      case "jugg":
        c.strokeStyle = "#d8d0c0";
        c.lineWidth = 1.2;
        c.beginPath();
        c.moveTo(-wide * 0.5, -26); c.lineTo(wide * 0.5, -26);
        c.moveTo(-wide * 0.55, -22); c.lineTo(wide * 0.55, -22);
        c.stroke();
        break;
      case "lina":
        c.fillStyle = "#ffd27b";
        c.beginPath(); c.arc(0, -21.5, 2, 0, Math.PI * 2); c.fill();
        c.fillStyle = "rgba(255,140,59,0.7)";
        c.beginPath(); c.arc(0, -21.5, 3.6, 0, Math.PI * 2); c.fill();
        break;
      case "pudge":
        c.strokeStyle = "#3a3226";
        c.lineWidth = 1.3;
        c.beginPath();
        c.moveTo(-wide * 0.4, -15); c.lineTo(-wide * 0.1, -19); c.lineTo(wide * 0.1, -16);
        c.stroke();
        c.fillStyle = "rgba(60,50,36,0.65)";
        c.fillRect(-wide * 0.72, -13.4, wide * 1.44, 5.6);
        break;
      case "axe":
        c.fillStyle = "#4e565f";
        c.beginPath();
        c.moveTo(-wide * 0.55, -28.8);
        c.quadraticCurveTo(0, -26, wide * 0.55, -28.8);
        c.lineTo(wide * 0.5, -22);
        c.quadraticCurveTo(0, -19.5, -wide * 0.5, -22);
        c.closePath(); c.fill();
        c.fillStyle = "#8a8f99";
        for (let i = 0; i < 3; i++) {
          c.beginPath(); c.arc(-3 + i * 3, -24.6, 0.9, 0, Math.PI * 2); c.fill();
        }
        break;
      case "lich":
        c.fillStyle = "rgba(127,232,255,0.55)";
        c.beginPath();
        c.moveTo(0, -27); c.lineTo(2.4, -22); c.lineTo(0, -17); c.lineTo(-2.4, -22);
        c.closePath(); c.fill();
        break;
      case "drow":
        c.strokeStyle = "#8a7a9a";
        c.lineWidth = 1.4;
        c.beginPath(); c.moveTo(-wide * 0.5, -27.4); c.lineTo(-wide * 0.15, -16); c.stroke();
        break;
    }
  }

  private drawHeroHead(c: CanvasRenderingContext2D, type: string) {
    switch (type) {
      case "sniper":
        c.fillStyle = "#3a5430";
        c.beginPath(); c.ellipse(0, -39.4, 8.2, 2.6, 0, 0, Math.PI * 2); c.fill();
        c.fillRect(-5.2, -44.6, 10.4, 5.6);
        c.strokeStyle = "#2a3c22";
        c.lineWidth = 1.4;
        c.beginPath(); c.moveTo(-5.2, -41.4); c.lineTo(5.2, -41.4); c.stroke();
        c.fillStyle = "#20242c";
        c.fillRect(2.4, -36.6, 2.6, 2.2);
        c.fillStyle = "#8a7a62";
        c.fillRect(1.4, -32.4, 4.6, 1.6);
        break;
      case "cm":
        c.fillStyle = "#cfe6f7";
        c.beginPath();
        c.moveTo(-7, -31); c.quadraticCurveTo(-8.4, -44, 0, -45.4); c.quadraticCurveTo(8.4, -44, 7, -31);
        c.quadraticCurveTo(0, -37, -7, -31);
        c.closePath(); c.fill();
        c.fillStyle = "#e8f4fc";
        c.beginPath(); c.moveTo(-5.6, -42); c.quadraticCurveTo(0, -45.4, 5.6, -42); c.quadraticCurveTo(0, -43.4, -5.6, -42); c.fill();
        c.fillStyle = "#cfe6f7";
        c.beginPath(); c.moveTo(-6.6, -32); c.quadraticCurveTo(-8.4, -26, -6, -20); c.quadraticCurveTo(-4.6, -26, -5, -31); c.fill();
        c.beginPath(); c.moveTo(6.6, -32); c.quadraticCurveTo(8.4, -26, 6, -20); c.quadraticCurveTo(4.6, -26, 5, -31); c.fill();
        c.fillStyle = "#28455e";
        c.fillRect(2.2, -35.6, 2.4, 2);
        c.strokeStyle = "#8fb8d8";
        c.lineWidth = 1.6;
        c.beginPath(); c.moveTo(-10.4, -24); c.lineTo(-10.4, -2); c.stroke();
        c.fillStyle = "#bfe8ff";
        c.beginPath(); c.moveTo(-10.4, -6.4); c.lineTo(-13.4, -2); c.lineTo(-10.4, 0.4); c.lineTo(-7.4, -2); c.closePath(); c.fill();
        break;
      case "jugg":
        c.fillStyle = "#e8e4d8";
        c.beginPath(); c.arc(0, -35, 6.8, 0, Math.PI * 2); c.fill();
        c.strokeStyle = "rgba(0,0,0,0.3)";
        c.lineWidth = 1;
        c.stroke();
        c.fillStyle = "#20242c";
        c.fillRect(-4.6, -37.2, 3.2, 2.4);
        c.fillRect(1.4, -37.2, 3.2, 2.4);
        c.strokeStyle = "#8a3a2c";
        c.lineWidth = 1.5;
        c.beginPath();
        c.moveTo(-3.4, -31.2); c.lineTo(3.4, -31.2);
        c.moveTo(-2.4, -30); c.lineTo(2.4, -30);
        c.stroke();
        c.strokeStyle = "#c8ccd4";
        c.lineWidth = 2.8;
        c.beginPath(); c.moveTo(-11, -26); c.quadraticCurveTo(-16.4, -16, -12, -3); c.stroke();
        break;
      case "lina":
        c.fillStyle = "#ff8c3b";
        c.beginPath();
        c.moveTo(-6.4, -37); c.quadraticCurveTo(-9.6, -48, -3, -46.4); c.quadraticCurveTo(-2, -53, 2, -46.4); c.quadraticCurveTo(8.6, -49, 6.4, -37);
        c.closePath(); c.fill();
        c.fillStyle = "#ffd27b";
        c.beginPath(); c.moveTo(-3.4, -40); c.quadraticCurveTo(0, -49, 3.4, -40); c.closePath(); c.fill();
        c.fillStyle = "#ffe9a0";
        c.beginPath(); c.moveTo(-1.4, -41); c.quadraticCurveTo(0, -46, 1.4, -41); c.closePath(); c.fill();
        c.fillStyle = "#20242c";
        c.fillRect(2.2, -35.6, 2.4, 2);
        break;
      case "pudge":
        c.fillStyle = "#8f8577";
        c.fillRect(-6, -33.4, 12, 3.2);
        c.strokeStyle = "#5a5044";
        c.lineWidth = 1;
        c.beginPath();
        c.moveTo(-4, -33.4); c.lineTo(-4, -30.2);
        c.moveTo(0, -33.4); c.lineTo(0, -30.2);
        c.moveTo(4, -33.4); c.lineTo(4, -30.2);
        c.stroke();
        c.strokeStyle = "#3a3226";
        c.lineWidth = 1.3;
        c.beginPath();
        c.moveTo(-4.4, -40.4); c.lineTo(-1.2, -37.4);
        c.moveTo(1.2, -40.4); c.lineTo(4.4, -37.4);
        c.stroke();
        c.fillStyle = "#20242c";
        c.fillRect(2.2, -36.6, 2.6, 2.2);
        c.fillStyle = "#f0ead8";
        c.fillRect(-2.6, -30.4, 1.8, 2.2);
        c.fillRect(0.8, -30.4, 1.8, 2.2);
        c.fillStyle = "#9aa2ac";
        c.beginPath(); c.moveTo(10, -20); c.lineTo(18.4, -24.4); c.lineTo(16, -11); c.closePath(); c.fill();
        break;
      case "axe":
        c.fillStyle = "#4a4e58";
        c.beginPath(); c.arc(0, -36.4, 7.2, Math.PI, 0); c.fill();
        c.fillStyle = "#d8d0c0";
        c.beginPath(); c.moveTo(-7.2, -38.4); c.quadraticCurveTo(-12.6, -44.4, -9.4, -47.6); c.quadraticCurveTo(-7.2, -42.4, -5, -40.4); c.closePath(); c.fill();
        c.beginPath(); c.moveTo(7.2, -38.4); c.quadraticCurveTo(12.6, -44.4, 9.4, -47.6); c.quadraticCurveTo(7.2, -42.4, 5, -40.4); c.closePath(); c.fill();
        c.fillStyle = "#c23c2a";
        c.fillRect(-1.6, -44.6, 3.2, 6.4);
        c.strokeStyle = "#7c2a1e";
        c.lineWidth = 1;
        c.strokeRect(-1.6, -44.6, 3.2, 6.4);
        c.fillStyle = "#20242c";
        c.fillRect(2.2, -35.8, 2.6, 2);
        break;
      case "lich":
        c.fillStyle = "#1d3a52";
        c.beginPath();
        c.moveTo(-7, -30); c.quadraticCurveTo(-9.4, -45, 0, -46.4); c.quadraticCurveTo(9.4, -45, 7, -30); c.quadraticCurveTo(0, -34, -7, -30);
        c.closePath(); c.fill();
        c.fillStyle = "#152c40";
        c.beginPath(); c.moveTo(-7, -30); c.quadraticCurveTo(-8, -24, -5.4, -19); c.quadraticCurveTo(-3.4, -25, -3.6, -30.6); c.closePath(); c.fill();
        c.beginPath(); c.moveTo(7, -30); c.quadraticCurveTo(8, -24, 5.4, -19); c.quadraticCurveTo(3.4, -25, 3.6, -30.6); c.closePath(); c.fill();
        const gl = 0.6 + 0.4 * Math.sin(this.time * 3.2);
        c.fillStyle = `rgba(127,232,255,${gl})`;
        c.beginPath(); c.arc(2.6, -36.2, 1.9, 0, Math.PI * 2); c.arc(-2.6, -36.2, 1.9, 0, Math.PI * 2); c.fill();
        break;
      case "drow":
        c.fillStyle = "#302638";
        c.beginPath();
        c.moveTo(-7, -30); c.quadraticCurveTo(-8.4, -44, 0, -45.4); c.quadraticCurveTo(8.4, -44, 7, -30);
        c.lineTo(9, -25); c.quadraticCurveTo(0, -33, -7, -30);
        c.closePath(); c.fill();
        c.fillStyle = "#e8e2f0";
        c.beginPath();
        c.moveTo(-6, -31); c.quadraticCurveTo(-8, -22, -5.4, -16); c.quadraticCurveTo(-4, -23, -4.4, -30);
        c.closePath(); c.fill();
        c.beginPath();
        c.moveTo(6, -31); c.quadraticCurveTo(8, -22, 5.4, -16); c.quadraticCurveTo(4, -23, 4.4, -30);
        c.closePath(); c.fill();
        c.fillStyle = "#cfc4da";
        c.beginPath(); c.moveTo(5.8, -37.6); c.lineTo(9.4, -39.4); c.lineTo(6.2, -34.6); c.closePath(); c.fill();
        c.fillStyle = "#8a5aa0";
        c.fillRect(2, -36.2, 2.4, 2);
        c.strokeStyle = "#8a7a9a";
        c.lineWidth = 2.2;
        c.beginPath(); c.arc(8.4, -18, 12.4, -1.25, 1.25); c.stroke();
        break;
    }
  }

  private drawWeaponInHand(c: CanvasRenderingContext2D, w: WeaponDef) {
    switch (w.id) {
      case "shotgun":
        c.strokeStyle = "#23262e"; c.lineWidth = 4;
        c.beginPath(); c.moveTo(2, -1.6); c.lineTo(20, -1.6); c.moveTo(2, 1.6); c.lineTo(20, 1.6); c.stroke();
        c.strokeStyle = "#8a6a2c"; c.lineWidth = 2;
        c.beginPath(); c.moveTo(14, 0); c.lineTo(20, 0); c.stroke();
        break;
      case "snipe":
        c.strokeStyle = "#23262e"; c.lineWidth = 3;
        c.beginPath(); c.moveTo(2, 0); c.lineTo(31, 0); c.stroke();
        c.strokeStyle = "#4a5a3a"; c.lineWidth = 2;
        c.beginPath(); c.moveTo(2, 0); c.lineTo(10, 0); c.stroke();
        c.fillStyle = "#23262e";
        c.beginPath(); c.arc(12, -3, 2.4, 0, Math.PI * 2); c.fill();
        break;
      case "frost": case "nova": case "laguna": {
        c.strokeStyle = "#6a4a2a"; c.lineWidth = 3;
        c.beginPath(); c.moveTo(2, 0); c.lineTo(24, 0); c.stroke();
        const orb = w.id === "laguna" ? "#ff8c3b" : "#7fe8ff";
        const r = w.id === "laguna" ? 4 + Math.sin(this.time * 10) * 1 : 4;
        c.fillStyle = orb;
        c.beginPath(); c.arc(25, 0, r, 0, Math.PI * 2); c.fill();
        c.fillStyle = "rgba(255,255,255,0.7)";
        c.beginPath(); c.arc(24, -1.2, r * 0.35, 0, Math.PI * 2); c.fill();
        break;
      }
      case "dynamite":
        c.fillStyle = "#c23c2a";
        c.save(); c.translate(14, 0); c.rotate(0.3); c.fillRect(-2.4, -6, 4.8, 12); c.restore();
        c.strokeStyle = "#e8d8a8"; c.lineWidth = 1;
        c.beginPath(); c.moveTo(16, -5); c.lineTo(19, -8); c.stroke();
        break;
      case "napalm":
        c.fillStyle = "#d9742a";
        c.fillRect(9, -4.4, 11, 8.8);
        c.strokeStyle = "#7d3a12"; c.lineWidth = 1.4;
        c.strokeRect(9, -4.4, 11, 8.8);
        c.fillStyle = "#ffd66b";
        c.beginPath(); c.arc(9, 0, 2, 0, Math.PI * 2); c.fill();
        break;
      case "cluster":
        c.fillStyle = "#2b303a";
        c.beginPath(); c.arc(14, 0, 5, 0, Math.PI * 2); c.fill();
        c.fillStyle = "#5a6270";
        c.beginPath(); c.arc(12.6, -1.4, 1.2, 0, Math.PI * 2); c.arc(15.6, 0.6, 1.2, 0, Math.PI * 2); c.fill();
        break;
      case "hook":
        c.strokeStyle = "#6a4a2a"; c.lineWidth = 3;
        c.beginPath(); c.moveTo(2, 0); c.lineTo(16, 0); c.stroke();
        c.strokeStyle = "#c8ccd4"; c.lineWidth = 2.6;
        c.beginPath(); c.arc(20, 0, 5.4, -0.9, Math.PI + 0.3); c.stroke();
        c.fillStyle = "#c8ccd4";
        c.beginPath(); c.moveTo(15, -4.6); c.lineTo(19, -7.4); c.lineTo(18, -2.4); c.closePath(); c.fill();
        break;
      case "bat":
        c.strokeStyle = "#8a5a2a"; c.lineWidth = 6;
        c.beginPath(); c.moveTo(6, 0); c.lineTo(23, -4); c.stroke();
        c.strokeStyle = "#5e3c1a"; c.lineWidth = 1.4;
        c.beginPath(); c.moveTo(9, -1); c.lineTo(12, 1.4); c.stroke();
        break;
      case "blade":
        c.strokeStyle = "#c8ccd4"; c.lineWidth = 3;
        c.beginPath(); c.moveTo(5, 0); c.quadraticCurveTo(16, -2, 26, -6); c.stroke();
        c.strokeStyle = "#8a6a2c"; c.lineWidth = 2.4;
        c.beginPath(); c.moveTo(3, -2); c.lineTo(7, 2); c.stroke();
        break;
      case "cleaver":
        c.fillStyle = "#9aa2ac";
        c.beginPath(); c.moveTo(8, -6); c.lineTo(22, -6); c.lineTo(22, 1); c.quadraticCurveTo(14, 5, 8, 2); c.closePath(); c.fill();
        c.strokeStyle = "#5e3c1a"; c.lineWidth = 2.6;
        c.beginPath(); c.moveTo(2, 1); c.lineTo(9, 0); c.stroke();
        break;
      case "axe":
        c.strokeStyle = "#6a4a2a"; c.lineWidth = 3;
        c.beginPath(); c.moveTo(4, 3); c.lineTo(20, -4); c.stroke();
        c.fillStyle = "#9aa2ac";
        c.beginPath(); c.moveTo(16, -9); c.quadraticCurveTo(25, -7, 25, -2); c.quadraticCurveTo(21, -2, 17, -3); c.closePath(); c.fill();
        break;
      case "volley":
        c.strokeStyle = "#6a4a2a"; c.lineWidth = 2.6;
        c.beginPath(); c.arc(8, 0, 11, -1.25, 1.25); c.stroke();
        c.strokeStyle = "#cfc6a8"; c.lineWidth = 1;
        c.beginPath(); c.moveTo(8 + 11 * Math.cos(-1.25), 11 * Math.sin(-1.25)); c.lineTo(8 + 11 * Math.cos(1.25), 11 * Math.sin(1.25)); c.stroke();
        break;
      default:
        c.strokeStyle = "#23262e"; c.lineWidth = 4;
        c.beginPath(); c.moveTo(2, 0); c.lineTo(23, 0); c.stroke();
        c.strokeStyle = "#8a6a2c"; c.lineWidth = 2;
        c.beginPath(); c.moveTo(16, 0); c.lineTo(23, 0); c.stroke();
    }
  }

  private drawAim(c: CanvasRenderingContext2D, h: Hero) {
    const x0 = h.x, y0 = h.y - HERO_CY;
    const def = weaponById[h.weapon];

    if (def.kind === "melee") {
      const r = def.range ?? 60;
      c.fillStyle = "rgba(245,214,123,0.10)";
      c.beginPath();
      c.moveTo(x0, y0);
      c.arc(x0, y0, r, this.aimAngle - 0.85, this.aimAngle + 0.85);
      c.closePath();
      c.fill();
      c.strokeStyle = "rgba(245,214,123,0.7)";
      c.lineWidth = 2;
      c.setLineDash([6, 5]);
      c.beginPath();
      c.arc(x0, y0, r, this.aimAngle - 0.85, this.aimAngle + 0.85);
      c.stroke();
      c.setLineDash([]);
      return;
    }

    if (def.kind === "beam") {
      const dx = Math.cos(this.aimAngle), dy = Math.sin(this.aimAngle);
      let dist = 0, x1 = x0 + dx * 24, y1 = y0 + dy * 24;
      const sx = x1, sy = y1;
      while (dist < 1600) {
        dist += 6;
        x1 = sx + dx * dist; y1 = sy + dy * dist;
        if (x1 < 0 || x1 > WORLD_W - 1) break;
        if (y1 >= this.surface(x1) + 2) break;
      }
      const g = c.createLinearGradient(sx, sy, x1, y1);
      g.addColorStop(0, "rgba(255,210,123,0.9)");
      g.addColorStop(1, "rgba(255,90,42,0.55)");
      c.strokeStyle = g;
      c.lineWidth = 3;
      c.setLineDash([10, 6]);
      c.lineDashOffset = -this.time * 40;
      c.beginPath(); c.moveTo(sx, sy); c.lineTo(x1, y1); c.stroke();
      c.setLineDash([]);
      c.strokeStyle = "#ffd27b";
      c.lineWidth = 2;
      c.beginPath(); c.arc(x1, y1, 8 + Math.sin(this.time * 6) * 2, 0, Math.PI * 2); c.stroke();
      return;
    }

    const sp = (SHOT_MIN + this.power * SHOT_SPAN) * def.speedMul;
    const g = GRAVITY * def.gravMul;
    const wv = this.wind * def.windMul;
    const sim = (ang: number, alpha: number) => {
      let px = x0 + Math.cos(ang) * 20;
      let py = y0 + Math.sin(ang) * 20;
      let vx = Math.cos(ang) * sp;
      let vy = Math.sin(ang) * sp;
      const dt = 1 / 60;
      c.fillStyle = def.ice ? "rgba(159,220,255,0.9)" : "rgba(245,214,123,0.9)";
      for (let i = 0; i < 55; i++) {
        vx += wv * dt;
        vy += g * dt;
        px += vx * dt;
        py += vy * dt;
        if (py >= this.surface(px) || py > WORLD_H + 40) break;
        if (i % 4 === 0) {
          const a2 = 1 - i / 55;
          c.globalAlpha = alpha * a2;
          c.beginPath(); c.arc(px, py, 2.1, 0, Math.PI * 2); c.fill();
        }
      }
      c.globalAlpha = 1;
    };
    if (def.kind === "pellets") {
      sim(this.aimAngle - (def.spread ?? 0.1), 0.3);
      sim(this.aimAngle, 0.85);
      sim(this.aimAngle + (def.spread ?? 0.1), 0.3);
    } else {
      sim(this.aimAngle, 0.85);
    }

    if (this.charging || this.power > 0) {
      c.strokeStyle = `rgba(${Math.round(lerp(245, 255, this.power))},${Math.round(lerp(214, 80, this.power))},${Math.round(lerp(123, 48, this.power))},0.95)`;
      c.lineWidth = 3.4;
      c.beginPath();
      c.arc(h.x, h.y - HERO_CY, 30, -Math.PI / 2, -Math.PI / 2 + this.power * Math.PI * 1.6);
      c.stroke();
    }
  }

  private drawBlink(c: CanvasRenderingContext2D, h: Hero) {
    c.save();
    c.strokeStyle = "rgba(245,214,123,0.55)";
    c.lineWidth = 1.6;
    c.setLineDash([10, 8]);
    c.lineDashOffset = -this.time * 30;
    c.beginPath(); c.arc(h.x, h.y - 20, BLINK_RADIUS, 0, Math.PI * 2); c.stroke();
    c.setLineDash([]);
    const g = c.createRadialGradient(h.x, h.y - 20, BLINK_RADIUS * 0.6, h.x, h.y - 20, BLINK_RADIUS);
    g.addColorStop(0, "rgba(245,214,123,0)");
    g.addColorStop(1, "rgba(245,214,123,0.08)");
    c.fillStyle = g;
    c.beginPath(); c.arc(h.x, h.y - 20, BLINK_RADIUS, 0, Math.PI * 2); c.fill();
    const a = this.aimAngle;
    const dx = Math.cos(a) * BLINK_RADIUS;
    const tx = clamp(h.x + dx, 18, WORLD_W - 18);
    const ty = this.surface(tx);
    const py = ty > this.waterY ? this.waterY : ty;
    c.strokeStyle = "#f5d67b";
    c.lineWidth = 2;
    c.beginPath(); c.arc(tx, py - 14, 9 + Math.sin(this.time * 6) * 2, 0, Math.PI * 2); c.stroke();
    c.beginPath(); c.moveTo(tx - 14, py - 14); c.lineTo(tx + 14, py - 14); c.moveTo(tx, py - 28); c.lineTo(tx, py); c.stroke();
    c.restore();
  }

  // ================= UI SNAPSHOT =================
  private emit() {
    const h = this.order.length ? this.cur() : null;
    const mapTeam = (team: Team) =>
      this.heroes.filter((x) => x.team === team).map((x) => ({
        name: x.name, type: x.type, hp: Math.max(0, Math.round(x.hp)), maxHp: x.maxHp, alive: x.alive, current: x === h,
      }));
    const snap: UISnapshot = {
      screen: this.screen,
      phase: this.phase,
      paused: this.paused,
      muted: sfx.muted,
      round: Math.max(1, Math.floor(this.turnCount / Math.max(1, this.order.length)) + 1),
      turnId: this.turnCount,
      currentTeam: h ? h.team : 0,
      isPlayerTurn: !!h && h.team === 0,
      active: h && this.screen === "game"
        ? {
            name: h.name, type: h.type, sig: h.sig,
            hp: Math.max(0, Math.round(h.hp)), maxHp: h.maxHp,
            items: Array.from(h.items), mekCount: h.mek, blinkCd: h.blinkCd,
            canBlink: this.canBlink(h), moveLeft: Math.round(this.moveLeft), moveMax: this.moveMax,
            weapon: h.weapon, ammo: { ...h.ammo },
          }
        : null,
      gold: [Math.round(this.teamGold[0]), Math.round(this.teamGold[1])],
      teams: [mapTeam(0), mapTeam(1)],
      timer: Math.max(0, Math.ceil(this.timer)),
      timerMax: TURN_TIME,
      wind: this.wind,
      blinkMode: this.blinkMode,
      winner: this.winner,
      difficulty: this.difficulty,
      map: this.map,
      mode: this.mode,
      stats: { kills: [...this.stats.kills] as [number, number], dmg: [...this.stats.dmg] as [number, number], gold: [...this.stats.gold] as [number, number] },
    };
    this.onUI(snap);
  }
}
