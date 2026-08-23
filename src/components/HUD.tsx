import type { UISnapshot } from "../game/types";
import { TEAM_NAMES, ARMORY_IDS, weaponById } from "../game/types";
import type { Engine } from "../game/engine";
import { ItemIcon, CoinIcon, WindIcon, PauseIcon, SoundIcon, SkullIcon, WeaponIcon } from "./Icons";

interface Props { snap: UISnapshot; engine: Engine; onShop: () => void; }

function WindWidget({ wind }: { wind: number }) {
  const strength = Math.min(4, Math.round(Math.abs(wind) / 18));
  const right = wind > 0;
  return (
    <div className="flex items-center gap-2" title="Ветер сносит снаряд">
      <WindIcon className="w-5 h-5 text-[#9db8d8]" />
      {strength === 0 ? (
        <span className="text-[12px] font-bold text-[#7a86a0] tracking-widest">ШТИЛЬ</span>
      ) : (
        <span className={`flex text-[#9db8d8] ${right ? "" : "flex-row-reverse"}`}>
          {Array.from({ length: strength }, (_, i) => (
            <svg key={i} viewBox="0 0 10 12" className={`w-3 h-4 ${right ? "" : "rotate-180"}`} fill="currentColor" style={{ opacity: 0.4 + (i / strength) * 0.6 }}>
              <path d="M1 1 L8 6 L1 11 Z" />
            </svg>
          ))}
        </span>
      )}
    </div>
  );
}

function TimerRing({ t, max }: { t: number; max: number }) {
  const r = 17;
  const c = 2 * Math.PI * r;
  const frac = t / max;
  const danger = t <= 5;
  return (
    <div className="relative w-12 h-12 grid place-items-center">
      <svg viewBox="0 0 44 44" className="w-12 h-12 -rotate-90">
        <circle cx="22" cy="22" r={r} fill="rgba(10,14,22,0.85)" stroke="#2a3448" strokeWidth="3.6" />
        <circle
          cx="22" cy="22" r={r} fill="none"
          stroke={danger ? "#e05038" : "#d9a441"} strokeWidth="3.6" strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c * (1 - frac)}
          style={{ transition: "stroke-dashoffset 0.2s linear" }}
        />
      </svg>
      <span className={`absolute font-display font-800 text-[15px] ${danger ? "text-[#ff6a4d] anim-tick" : "text-[#f0e2bd]"}`}>{t}</span>
    </div>
  );
}

function TeamPlate({ snap, team }: { snap: UISnapshot; team: 0 | 1 }) {
  const radiant = team === 0;
  return (
    <div className={`clip-angled-sm flex items-center gap-3 px-4 py-2 panel ${radiant ? "border-l-[3px] border-l-[#9fd45a]" : "border-l-[3px] border-l-[#e05038]"}`}>
      <div className="min-w-0">
        <div className={`font-display font-800 text-[11px] tracking-[0.2em] leading-none ${radiant ? "text-[#9fd45a]" : "text-[#e05038]"}`}>
          {TEAM_NAMES[team]}
        </div>
        <div className="flex gap-1 mt-1.5">
          {snap.teams[team].map((h, i) => (
            <div key={i} className={`h-2 bg-[#0a0e16] ${h.current ? "ring-1 ring-[#f5d67b]" : ""}`} style={{ width: `${100 / snap.teams[team].length}%`, maxWidth: 34 }} title={`${h.name}: ${h.hp}`}>
              <div
                className={`h-full ${h.alive ? (radiant ? "bg-[#9fd45a]" : "bg-[#e05038]") : "bg-[#3a4152]"}`}
                style={{ width: `${(h.hp / h.maxHp) * 100}%`, minWidth: h.alive ? 2 : 0 }}
              />
            </div>
          ))}
        </div>
      </div>
      <div className="flex items-center gap-1.5 ml-1">
        <CoinIcon className="w-5 h-5" />
        <span className="font-display font-800 text-[17px] text-[#f5d67b] tabular-nums">{snap.gold[team]}</span>
      </div>
    </div>
  );
}

export default function HUD({ snap, engine, onShop }: Props) {
  const a = snap.active;
  const playerAim = snap.isPlayerTurn && snap.phase === "aim";
  const shopAllowed = playerAim && !snap.paused && snap.winner === null;

  const hint = snap.blinkMode
    ? "Кликни точку внутри круга — герой мерцает и исчезает"
    : snap.winner !== null
      ? ""
      : !snap.isPlayerTurn
        ? "Легион совещается…"
        : snap.phase === "flight"
          ? "Снаряд в воздухе…"
          : snap.phase === "settle"
            ? "…"
            : "A/D — движение · Пробел — прыжок · Зажми ЛКМ и отпусти для выстрела";

  return (
    <div className="absolute inset-0 z-10 pointer-events-none select-none">
      {/* верх слева */}
      <div className="absolute top-2.5 left-2.5 flex flex-col gap-2 anim-fade max-w-[300px]">
        <div className="clip-angled-sm inline-flex items-center gap-2 px-4 py-1.5 panel-gold w-fit">
          <span className="font-display font-800 text-[13px] tracking-[0.22em] text-[#f0dcae]">РАУНД {snap.round}</span>
        </div>
        <TeamPlate snap={snap} team={0} />
        <TeamPlate snap={snap} team={1} />
      </div>

      {/* верх справа */}
      <div className="absolute top-2.5 right-2.5 flex items-start gap-2.5 pointer-events-auto">
        <div className="clip-angled-sm panel px-4 py-2.5 mt-1"><WindWidget wind={snap.wind} /></div>
        {snap.isPlayerTurn && snap.winner === null && <TimerRing t={snap.timer} max={snap.timerMax} />}
        <div className="flex flex-col gap-2">
          <button onClick={() => engine.togglePause()} className="btn-iron w-11 h-11 grid place-items-center" title="Пауза (Esc)">
            <PauseIcon className="w-5 h-5" />
          </button>
          <button onClick={() => engine.toggleMute()} className="btn-iron w-11 h-11 grid place-items-center" title="Звук">
            <SoundIcon muted={snap.muted} className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* знамя хода */}
      {snap.winner === null && snap.turnId >= 0 && (
        <div key={snap.turnId} className="absolute top-16 left-1/2 -translate-x-1/2 anim-banner pointer-events-none">
          <div className={`px-10 py-2.5 skew-x-[-10deg] border-y-[3px] ${snap.isPlayerTurn ? "bg-[#17240e]/92 border-[#9fd45a]" : "bg-[#2a120c]/92 border-[#e05038]"}`}>
            <div className="skew-x-[10deg] text-center">
              <div className={`font-display font-800 text-[13px] tracking-[0.34em] ${snap.isPlayerTurn ? "text-[#9fd45a]" : "text-[#e05038]"}`}>
                {snap.isPlayerTurn ? "ТВОЙ ХОД" : "ХОД ЛЕГИОНА"}
              </div>
              <div className="font-display font-black text-[22px] text-[#f0e2bd] leading-tight">{a?.name}</div>
            </div>
          </div>
        </div>
      )}

      {/* плита активного героя */}
      {a && snap.isPlayerTurn && snap.winner === null && (
        <div className="absolute bottom-2.5 left-2.5 clip-angled panel px-5 py-3.5 w-[260px] anim-fade">
          <div className="flex items-baseline justify-between gap-2">
            <span className="font-display font-800 text-[15px] tracking-wide text-[#f0dcae] truncate">{a.name}</span>
            <span className="text-[12px] text-[#93a0b8] shrink-0">Раунд {snap.round}</span>
          </div>
          <div className="mt-2">
            <div className="flex justify-between text-[11px] font-bold tracking-[0.18em] text-[#93a0b8] mb-1">
              <span>ЗДОРОВЬЕ</span><span className="tabular-nums">{a.hp}/{a.maxHp}</span>
            </div>
            <div className="h-2.5 bg-[#0a0e16] border border-[#2a3448]">
              <div
                className="h-full transition-all duration-300"
                style={{ width: `${(a.hp / a.maxHp) * 100}%`, background: a.hp > 50 ? "linear-gradient(90deg,#6f9c3f,#9fd45a)" : a.hp > 25 ? "linear-gradient(90deg,#b8922f,#e8c14a)" : "linear-gradient(90deg,#a03423,#e05038)" }}
              />
            </div>
          </div>
          <div className="mt-2">
            <div className="flex justify-between text-[11px] font-bold tracking-[0.18em] text-[#93a0b8] mb-1">
              <span>ПЕРЕХОД</span><span className="tabular-nums">{a.moveLeft}m</span>
            </div>
            <div className="h-2 bg-[#0a0e16] border border-[#2a3448]">
              <div className="h-full bg-gradient-to-r from-[#3f6f8f] to-[#7fc4e8] transition-all duration-150" style={{ width: `${(a.moveLeft / a.moveMax) * 100}%` }} />
            </div>
          </div>
        </div>
      )}

      {/* подсказка (над арсеналом) */}
      {hint && (
        <div className="absolute bottom-[100px] left-1/2 -translate-x-1/2 text-[14px] font-medium text-[#d5cdb6] bg-[#0a0e16]/75 border border-[#2a3448] px-5 py-2 hidden sm:block whitespace-nowrap">
          {hint}
        </div>
      )}

      {/* предметы + действия */}
      {snap.isPlayerTurn && snap.winner === null && (
        <div className="absolute bottom-2.5 right-2.5 flex flex-col items-end gap-2.5 pointer-events-auto anim-fade">
          <div className="flex gap-2">
            {a && a.items.map((id) => {
              if (id === "blink") {
                const ready = a.canBlink;
                return (
                  <button
                    key={id}
                    onClick={() => engine.toggleBlink()}
                    disabled={!ready && !snap.blinkMode}
                    title="Клинок Мерцания — телепорт"
                    className={`relative w-[58px] h-[58px] grid place-items-center clip-angled-sm panel-gold text-[#f5d67b] transition-all hover:scale-105 active:scale-95 ${snap.blinkMode ? "anim-blinkready" : ""} ${!ready && !snap.blinkMode ? "opacity-50 grayscale" : ""}`}
                  >
                    <ItemIcon id="blink" className="w-8 h-8" />
                    {!ready && !snap.blinkMode && (
                      <span className="absolute inset-0 grid place-items-center bg-[#0a0e16]/70 font-display font-800 text-xl text-[#cfd8ea]">{a.blinkCd}</span>
                    )}
                  </button>
                );
              }
              return (
                <div key={id} title={`${id} — пассивный предмет`} className="relative w-[58px] h-[58px] grid place-items-center clip-angled-sm panel text-[#9db8d8]">
                  <ItemIcon id={id} className="w-8 h-8" />
                  <span className="absolute bottom-1 right-1.5 text-[9px] font-bold tracking-wider text-[#7a86a0]">ПАСС</span>
                </div>
              );
            })}
            {a && a.mekCount > 0 && (
              <button
                onClick={() => engine.useMek()}
                disabled={a.hp >= a.maxHp}
                title="Меканзм — +45 здоровья"
                className={`relative w-[58px] h-[58px] grid place-items-center clip-angled-sm panel-gold text-[#7ee08a] transition-all hover:scale-105 active:scale-95 ${a.hp >= a.maxHp ? "opacity-40" : ""}`}
              >
                <ItemIcon id="mek" className="w-8 h-8" />
                <span className="absolute -top-1.5 -right-1.5 min-w-[20px] h-[20px] px-1 grid place-items-center bg-[#2a4a2e] border border-[#7ee08a] text-[12px] font-bold text-[#c9f5ce]">
                  {a.mekCount}
                </span>
              </button>
            )}
          </div>
          <div className="flex gap-2.5">
            <button onClick={onShop} disabled={!shopAllowed} className="btn-war px-5 py-2.5 text-[15px] inline-flex items-center gap-2">
              <CoinIcon className="w-5 h-5" /> ЛАВКА
            </button>
            <button onClick={() => engine.endTurn()} disabled={!playerAim} className="btn-iron px-5 py-2.5 text-[13px]">
              КОНЕЦ ХОДА
            </button>
          </div>
        </div>
      )}

      {/* арсенал */}
      {snap.isPlayerTurn && snap.phase === "aim" && snap.winner === null && a && (
        <div className="absolute bottom-2.5 left-1/2 -translate-x-1/2 flex gap-1.5 pointer-events-auto anim-fade">
          {[a.sig, ...ARMORY_IDS].map((id, i) => {
            const def = weaponById[id];
            const ammo = def.ammo === -1 ? -1 : a.ammo[id] ?? 0;
            const out = ammo === 0;
            const selected = a.weapon === id;
            return (
              <button
                key={id}
                onClick={() => engine.setWeapon(id)}
                disabled={out}
                title={`${def.name} — ${def.desc}`}
                className={`relative w-[64px] h-[64px] clip-angled-sm grid place-items-center transition-all duration-100 ${
                  selected
                    ? "panel-gold text-[#f5d67b] -translate-y-1.5 ring-2 ring-[#f5d67b]/80 shadow-[0_0_18px_rgba(245,214,123,0.35)]"
                    : out
                      ? "panel text-[#4a5164] opacity-60"
                      : "panel text-[#c9c2ae] hover:-translate-y-1 hover:brightness-125"
                }`}
              >
                <WeaponIcon id={id} className="w-8 h-8" />
                {i === 0 && (
                  <span className="absolute top-0.5 left-1 text-[8px] font-black tracking-widest text-[#d9a441]">ФИРМ</span>
                )}
                <span className="absolute bottom-0.5 left-1.5 text-[11px] font-bold text-[#7a86a0]">{i + 1}</span>
                {ammo !== -1 && (
                  <span className={`absolute bottom-0 right-1 text-[11px] font-black tabular-nums ${out ? "text-[#e05038]" : "text-[#e8c14a]"}`}>
                    {out ? "✕" : `×${ammo}`}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* тач-кнопки */}
      {snap.isPlayerTurn && snap.phase === "aim" && snap.winner === null && (
        <div className="absolute bottom-[104px] left-2.5 flex gap-2 pointer-events-auto md:hidden">
          {(
            [
              ["◀", -1],
              ["▶", 1],
            ] as [string, -1 | 1][]
          ).map(([lbl, dir]) => (
            <button
              key={lbl}
              className="btn-iron w-16 h-16 text-2xl grid place-items-center active:brightness-150"
              onPointerDown={(e) => { e.preventDefault(); engine.setMove(dir); }}
              onPointerUp={() => engine.setMove(0)}
              onPointerLeave={() => engine.setMove(0)}
              onPointerCancel={() => engine.setMove(0)}
            >
              {lbl}
            </button>
          ))}
          <button
            className="btn-iron w-16 h-16 text-2xl grid place-items-center active:brightness-150"
            onPointerDown={(e) => { e.preventDefault(); engine.jump(); }}
            title="Прыжок"
          >
            ▲
          </button>
        </div>
      )}

      {/* счётчик черепов */}
      <div className="absolute top-2.5 left-1/2 -translate-x-1/2 hidden lg:flex items-center gap-4 clip-angled-sm panel px-5 py-2">
        <span className="flex items-center gap-2 text-[#9fd45a]">
          <SkullIcon className="w-5 h-5" />
          <span className="font-display font-800 text-[15px] tabular-nums">{snap.teams[1].filter((h) => !h.alive).length}</span>
        </span>
        <span className="w-px h-5 bg-[#3a4763]" />
        <span className="flex items-center gap-2 text-[#e05038]">
          <SkullIcon className="w-5 h-5" />
          <span className="font-display font-800 text-[15px] tabular-nums">{snap.teams[0].filter((h) => !h.alive).length}</span>
        </span>
      </div>
    </div>
  );
}
