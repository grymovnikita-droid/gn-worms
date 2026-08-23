import { useState } from "react";
import { DIFFS, MAPS, ITEMS, ARMORY_IDS, weaponById } from "../game/types";
import type { Difficulty, MapId, BattleMode } from "../game/types";
import { Emblem, ItemIcon, CoinIcon, SwordIcon, WeaponIcon, SkullIcon } from "./Icons";

const EMBERS = Array.from({ length: 22 }, (_, i) => ({
  left: `${(i * 53) % 100}%`,
  dur: `${5 + ((i * 7) % 6)}s`,
  delay: `${-((i * 13) % 8)}s`,
  drift: `${((i * 17) % 60) - 30}px`,
  scale: 0.6 + ((i * 11) % 10) / 12,
}));

const MAP_THEME: Record<MapId, {
  sky: string; hillL: string; hillR: string; water: string; moon: string; moonGlow: string;
}> = {
  canyon: {
    sky: "linear-gradient(180deg,#0a1220_0%,#33264a_45%,#7a4020_100%)",
    hillL: "#4c7a34", hillR: "#6a3424",
    water: "linear-gradient(180deg,rgba(120,200,255,0.9),rgba(30,90,160,0.9))",
    moon: "#f6ead0", moonGlow: "rgba(246,234,208,0.8)",
  },
  frost: {
    sky: "linear-gradient(180deg,#0a1830_0%,#1c4060_55%,#2c6a94_100%)",
    hillL: "#bfe0f2", hillR: "#a8c8e4",
    water: "linear-gradient(180deg,rgba(200,235,252,0.95),rgba(60,120,170,0.9))",
    moon: "#dceeff", moonGlow: "rgba(180,225,255,0.9)",
  },
  jungle: {
    sky: "linear-gradient(180deg,#04140c_0%,#0c2f1a_50%,#2a5436_100%)",
    hillL: "#3f8a35", hillR: "#2a5e28",
    water: "linear-gradient(180deg,rgba(120,195,115,0.9),rgba(8,45,35,0.9))",
    moon: "#dcefdd", moonGlow: "rgba(210,240,210,0.8)",
  },
  inferno: {
    sky: "linear-gradient(180deg,#100302_0%,#3a0e06_55%,#7a2410_100%)",
    hillL: "#4a2018", hillR: "#35170f",
    water: "linear-gradient(180deg,rgba(230,90,40,0.95),rgba(50,5,8,0.9))",
    moon: "#ff6a3b", moonGlow: "rgba(255,110,60,0.9)",
  },
};

function MapCard({ id, selected, onPick }: { id: MapId; selected: boolean; onPick: () => void }) {
  const frost = id === "frost";
  const jungle = id === "jungle";
  const inferno = id === "inferno";
  const th = MAP_THEME[id];
  return (
    <button
      onClick={onPick}
      className={`clip-angled-sm relative overflow-hidden text-left transition-all duration-150 border ${
        selected ? "panel-gold border-[#d9a441] -translate-y-1" : "panel border-[#38466a] hover:border-[#8a6a2c] opacity-85 hover:opacity-100"
      }`}
    >
      <div className="relative h-[74px] overflow-hidden">
        <div className="absolute inset-0" style={{ background: th.sky.replace(/_/g, " ") }} />
        {/* луна / багровое око */}
        <div
          className={`absolute w-5 h-5 rounded-full right-6 top-2.5 ${inferno ? "" : ""}`}
          style={{ background: th.moon, boxShadow: `0 0 18px ${th.moonGlow}` }}
        />
        {frost && <div className="absolute inset-x-0 top-0 h-10 bg-[linear-gradient(115deg,transparent_20%,rgba(80,255,170,0.22)_38%,transparent_52%,rgba(120,140,255,0.18)_68%,transparent_82%)]" />}
        {inferno && <div className="absolute inset-x-0 bottom-0 h-8 bg-[linear-gradient(0deg,rgba(255,120,40,0.5),transparent)]" />}
        {/* холмы */}
        <div className="absolute bottom-0 left-0 w-[62%] h-9 [clip-path:polygon(0_58%,16%_34%,32%_52%,50%_24%,70%_50%,86%_32%,100%_55%,100%_100%,0_100%)]" style={{ background: th.hillL }} />
        <div className="absolute bottom-0 right-0 w-[62%] h-9 [clip-path:polygon(0_55%,14%_30%,30%_50%,48%_22%,68%_48%,84%_30%,100%_52%,100%_100%,0_100%)]" style={{ background: th.hillR }} />
        {/* вода + плот */}
        <div className="absolute bottom-0 left-[38%] w-[24%] h-[16px]" style={{ background: th.water.replace(/_/g, " ") }}>
          <div className="absolute left-1/2 -translate-x-1/2 top-[3px] w-4 h-[3px] bg-[#7a5326] rounded-[1px]" />
        </div>
        {frost && (
          <>
            <div className="absolute top-0 left-[12%] w-0 h-0 border-l-[7px] border-r-[7px] border-t-[26px] border-l-transparent border-r-transparent border-t-[#7fb8dd] opacity-90" />
            <div className="absolute top-0 left-[30%] w-0 h-0 border-l-[5px] border-r-[5px] border-t-[16px] border-l-transparent border-r-transparent border-t-[#9fd0ec] opacity-80" />
            <div className="absolute top-0 right-[20%] w-0 h-0 border-l-[8px] border-r-[8px] border-t-[30px] border-l-transparent border-r-transparent border-t-[#6fa8cc] opacity-90" />
          </>
        )}
        {jungle && (
          <>
            {/* пальмы */}
            <div className="absolute bottom-3 left-[14%] w-[2px] h-8 bg-[#7a5526] rotate-6" />
            <div className="absolute bottom-9 left-[8%] w-6 h-3 rounded-full bg-[#3f8a35]" />
            <div className="absolute bottom-3 right-[16%] w-[2px] h-7 bg-[#7a5526] -rotate-6" />
            <div className="absolute bottom-8 right-[10%] w-5 h-3 rounded-full bg-[#2e6b2a]" />
            {/* лианы */}
            <div className="absolute top-0 left-[24%] w-[1.5px] h-6 bg-[#4a7a35]" />
            <div className="absolute top-0 left-[44%] w-[1.5px] h-9 bg-[#3f6b2e]" />
            <div className="absolute top-0 right-[30%] w-[1.5px] h-7 bg-[#4a7a35]" />
            {/* светлячки */}
            <div className="absolute left-[30%] top-[38%] w-1 h-1 rounded-full bg-[#c8ff9a] shadow-[0_0_6px_rgba(200,255,150,0.9)]" />
            <div className="absolute left-[58%] top-[30%] w-1 h-1 rounded-full bg-[#c8ff9a] shadow-[0_0_6px_rgba(200,255,150,0.9)]" />
          </>
        )}
        {inferno && (
          <>
            {/* огненные столбы */}
            <div className="absolute bottom-0 left-[18%] w-[3px] h-9 bg-[linear-gradient(0deg,rgba(255,120,40,0.95),rgba(255,200,90,0.4),transparent)]" />
            <div className="absolute bottom-0 right-[22%] w-[3px] h-7 bg-[linear-gradient(0deg,rgba(255,120,40,0.95),rgba(255,200,90,0.4),transparent)]" />
            {/* шипы */}
            <div className="absolute bottom-0 left-[8%] w-0 h-0 border-l-[4px] border-r-[4px] border-b-[10px] border-l-transparent border-r-transparent border-b-[#1a0c08]" />
            <div className="absolute bottom-0 left-[30%] w-0 h-0 border-l-[3px] border-r-[3px] border-b-[8px] border-l-transparent border-r-transparent border-b-[#1a0c08]" />
            <div className="absolute bottom-0 right-[10%] w-0 h-0 border-l-[4px] border-r-[4px] border-b-[11px] border-l-transparent border-r-transparent border-b-[#1a0c08]" />
          </>
        )}
      </div>
      <div className="px-4 py-3">
        <div className={`font-display font-800 text-[14px] tracking-[0.12em] ${selected ? "text-[#f5d67b]" : "text-[#e8ddc4]"}`}>
          {MAPS.find((m) => m.id === id)!.name.toUpperCase()}
        </div>
        <div className="text-[12.5px] text-[#93a0b8] mt-1 leading-snug">{MAPS.find((m) => m.id === id)!.desc}</div>
      </div>
      {selected && <div className="absolute top-2 right-2 w-3 h-3 rotate-45 bg-[#f5d67b] shadow-[0_0_12px_rgba(245,214,123,0.9)]" />}
    </button>
  );
}

export default function MenuScreen({ onStart }: { onStart: (d: Difficulty, m: MapId, mode: BattleMode) => void }) {
  const [diff, setDiff] = useState<Difficulty>(1);
  const [mapId, setMapId] = useState<MapId>("canyon");
  const [mode, setMode] = useState<BattleMode>(4);

  return (
    <div className="absolute inset-0 z-20 overflow-y-auto">
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        {EMBERS.map((e, i) => (
          <span key={i} className="ember" style={{ left: e.left, animationDuration: e.dur, animationDelay: e.delay, ["--drift" as string]: e.drift, transform: `scale(${e.scale})` }} />
        ))}
      </div>

      <div className="min-h-full relative bg-[linear-gradient(100deg,rgba(5,8,15,0.94)_0%,rgba(5,8,15,0.84)_40%,rgba(5,8,15,0.4)_72%,rgba(5,8,15,0.18)_100%)]">
        <div className="max-w-[1240px] mx-auto px-6 sm:px-10 py-10 lg:py-12 grid lg:grid-cols-[1.1fr_0.9fr] gap-10 lg:gap-14">
          {/* левая колонка */}
          <div className="anim-slide">
            <div className="flex items-center gap-3">
              <Emblem className="w-12 h-12 shrink-0" />
              <div className="font-display font-700 text-[11px] tracking-[0.34em] text-[#8fa0c2]">ПОШАГОВАЯ АРТИЛЛЕРИЯ</div>
              <div className="h-px flex-1 max-w-[180px] bg-gradient-to-r from-[#8a6a2c] to-transparent" />
            </div>

            <h1 className="mt-5 font-display font-black leading-[0.98] text-[13vw] sm:text-7xl xl:text-[80px] text-[#f2e2b8] anim-titleglow select-none">
              ЗОЛОТО
              <br />
              <span className="text-[#e8b64a]">И&nbsp;ПОРОХ</span>
            </h1>

            <p className="mt-4 max-w-[540px] text-[16.5px] leading-relaxed text-[#cfc8b4]">
              Разрушаемые холмы, шальной ветер и восемь героев на одной карте. Глубокое озеро делит мир
              надвое — переправься <b className="text-[#e8b64a]">на плоту</b>, вплавь или Бликом, испепели
              <b className="text-[#ff6a4d]"> Багровый Легион</b> и забери всё золото.
            </p>

            {/* команды */}
            <div className="mt-5 flex items-stretch gap-2">
              <div className="clip-angled-sm flex-1 panel border-l-[3px] border-l-[#9fd45a] px-5 py-2.5">
                <div className="font-display font-800 text-[13px] tracking-[0.18em] text-[#9fd45a]">РАССВЕТ</div>
                <div className="text-[13px] text-[#93a0b8] mt-0.5">твоя команда</div>
              </div>
              <div className="grid place-items-center font-display font-black text-2xl text-[#d9a441] px-1">VS</div>
              <div className="clip-angled-sm flex-1 panel border-r-[3px] border-r-[#e05038] px-5 py-2.5 text-right">
                <div className="font-display font-800 text-[13px] tracking-[0.18em] text-[#e05038]">ЛЕГИОН</div>
                <div className="text-[13px] text-[#93a0b8] mt-0.5">боты</div>
              </div>
            </div>

            {/* карта */}
            <div className="mt-6">
              <div className="font-display font-800 text-[13px] tracking-[0.28em] text-[#e8b64a] mb-3">ПОЛЕ БИТВЫ</div>
              <div className="grid sm:grid-cols-2 gap-3">
                {MAPS.map((m) => (
                  <MapCard key={m.id} id={m.id} selected={mapId === m.id} onPick={() => setMapId(m.id)} />
                ))}
              </div>
            </div>

            {/* масштаб */}
            <div className="mt-5">
              <div className="font-display font-800 text-[13px] tracking-[0.28em] text-[#e8b64a] mb-3">МАСШТАБ БОЙНИ</div>
              <div className="grid grid-cols-2 gap-3">
                {(
                  [
                    [4, "Сквад 4×4", "Классическая перестрелка, быстрый темп"],
                    [10, "Битва 10×10", "Мясорубка: по десять бойцов на команду"],
                  ] as [BattleMode, string, string][]
                ).map(([m, name, desc]) => (
                  <button
                    key={m}
                    onClick={() => setMode(m)}
                    className={`text-left clip-angled-sm px-4 py-3 border transition-all ${
                      mode === m ? "panel-gold border-[#d9a441]" : "panel border-[#38466a] hover:border-[#8a6a2c] opacity-85 hover:opacity-100"
                    }`}
                  >
                    <div className={`font-display font-800 text-[15px] tracking-[0.1em] ${mode === m ? "text-[#f5d67b]" : "text-[#d6deee]"}`}>{name}</div>
                    <div className="text-[12.5px] text-[#93a0b8] mt-0.5 leading-snug">{desc}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* сложность */}
            <div className="mt-5">
              <div className="font-display font-800 text-[13px] tracking-[0.28em] text-[#e8b64a] mb-3">ИСПЫТАНИЕ</div>
              <div className="flex flex-col gap-2">
                {DIFFS.map((d, i) => (
                  <button
                    key={d.name}
                    onClick={() => setDiff(i as Difficulty)}
                    className={`group text-left clip-angled-sm flex items-center gap-4 px-4 py-2.5 border transition-all duration-150 ${
                      diff === i ? "panel-gold border-[#d9a441] translate-x-2" : "panel border-[#38466a] hover:border-[#8a6a2c] hover:translate-x-2 opacity-85 hover:opacity-100"
                    }`}
                  >
                    <span className={`font-display font-black text-2xl w-11 ${diff === i ? "text-[#f5d67b]" : "text-[#4a5a7d]"}`}>0{i + 1}</span>
                    <span className="flex-1 min-w-0">
                      <span className={`font-display font-800 tracking-[0.12em] text-[14.5px] block ${diff === i ? "text-[#f5d67b]" : "text-[#d6deee]"}`}>{d.name.toUpperCase()}</span>
                      <span className="block text-[13px] text-[#93a0b8]">{d.desc}</span>
                    </span>
                    <span className={`w-3 h-3 rotate-45 border-2 shrink-0 ${diff === i ? "bg-[#f5d67b] border-[#f5d67b] shadow-[0_0_14px_rgba(245,214,123,0.9)]" : "border-[#55648a]"}`} />
                  </button>
                ))}
              </div>
            </div>

            <button onClick={() => onStart(diff, mapId, mode)} className="btn-war anim-goldpulse mt-6 px-14 py-4 text-[24px] inline-flex items-center gap-4">
              <SwordIcon className="w-6 h-6" />
              В БОЙ
            </button>
            <div className="mt-3 flex items-center gap-2 text-[13.5px] text-[#7a86a0]">
              <SkullIcon className="w-4 h-4 text-[#e05038]" />
              Рассвет ходит первым · на кону — всё золото королевства
            </div>
          </div>

          {/* правая колонка */}
          <div className="anim-rise" style={{ animationDelay: "0.12s" }}>
            <div className="panel-angled p-6 sm:p-7">
              <div className="font-display font-800 text-[13px] tracking-[0.28em] text-[#e8b64a] mb-4">БОЕВОЙ УСТАВ</div>
              <div className="space-y-2.5">
                {(
                  [
                    [["Мышь"], "прицел · удержи ЛКМ — сила, отпусти — огонь"],
                    [["A", "D"], "движение · Пробел — прыжок"],
                    [["1–8"], "выбор оружия · E — лавка"],
                    [["Колесо"], "масштаб · ПКМ — двигать камеру"],
                  ] as [string[], string][]
                ).map(([keys, label], i) => (
                  <div key={i} className="flex items-center gap-2 flex-wrap">
                    {keys.map((k) => (
                      <span key={k} className="kbd">{k}</span>
                    ))}
                    <span className="text-[14px] text-[#c9c2ae]">{label}</span>
                  </div>
                ))}
              </div>

              <div className="mt-4 grid grid-cols-2 gap-2 text-[13.5px]">
                <div className="clip-angled-sm panel px-3.5 py-2.5 flex items-center gap-2">
                  <CoinIcon className="w-5 h-5 shrink-0" />
                  <span className="text-[#c9c2ae]"><b className="text-[#f5d67b]">+75</b>/ход · <b className="text-[#f5d67b]">+200</b> за убийство</span>
                </div>
                <div className="clip-angled-sm panel px-3.5 py-2.5 flex items-center gap-2">
                  <span className="text-[#ff8c2a] font-black text-lg leading-none shrink-0">▼▼</span>
                  <span className="text-[#c9c2ae]">дно — <b className="text-[#ff8c2a]">лава</b>. Падение = смерть</span>
                </div>
              </div>

              <div className="h-px my-5 bg-gradient-to-r from-transparent via-[#3a4763] to-transparent" />
              <div className="font-display font-800 text-[13px] tracking-[0.28em] text-[#e8b64a] mb-3">ОРУЖЕЙНАЯ</div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {ARMORY_IDS.map((id, i) => {
                  const w = weaponById[id];
                  return (
                    <div key={id} className="clip-angled-sm panel px-2.5 py-2 flex items-center gap-2 transition-all hover:brightness-125 hover:-translate-y-0.5" title={w.desc}>
                      <WeaponIcon id={id} className="w-6 h-6 shrink-0 text-[#f5d67b]" />
                      <span className="min-w-0">
                        <span className="block font-display font-700 text-[10.5px] tracking-wide text-[#e8ddc4] leading-tight truncate">{w.name}</span>
                        <span className="block text-[10.5px] text-[#93a0b8]">{w.ammo === -1 ? "вечно" : `${w.ammo} зар.`}</span>
                      </span>
                      <span className="ml-auto kbd !text-[10px] !px-1.5">{i + 2}</span>
                    </div>
                  );
                })}
              </div>
              <p className="text-[12.5px] text-[#7a86a0] mt-2.5 leading-snug">
                Слот <span className="kbd !text-[10px] !px-1.5">1</span> — фирменное оружие героя: у Снайпера дальний выстрел,
                у Лины луч Лагуны, у Пуджа тесак…
              </p>

              <div className="h-px my-5 bg-gradient-to-r from-transparent via-[#3a4763] to-transparent" />
              <div className="font-display font-800 text-[13px] tracking-[0.28em] text-[#e8b64a] mb-3">ЛАВКА</div>
              <div className="space-y-2">
                {ITEMS.map((it) => (
                  <div key={it.id} className="flex items-center gap-3 group">
                    <span className="clip-angled-sm shrink-0 w-10 h-10 grid place-items-center panel-gold text-[#f5d67b] group-hover:brightness-125 transition-all">
                      <ItemIcon id={it.id} className="w-6 h-6" />
                    </span>
                    <span className="text-[13px] leading-tight min-w-0">
                      <b className="font-display font-700 tracking-wide text-[13.5px] text-[#e8ddc4]">{it.name}</b>{" "}
                      <span className="text-[#f5d67b] font-bold">{it.cost} з.</span>
                      <span className="block text-[12px] text-[#93a0b8] truncate">{it.desc}</span>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
