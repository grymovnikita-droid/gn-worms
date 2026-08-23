import type { UISnapshot } from "../game/types";
import { TEAM_NAMES } from "../game/types";
import type { Engine } from "../game/engine";
import { Emblem, CoinIcon, SkullIcon, SwordIcon, SoundIcon } from "./Icons";

const EMBERS = Array.from({ length: 16 }, (_, i) => ({
  left: `${(i * 61) % 100}%`,
  dur: `${4.5 + ((i * 7) % 6)}s`,
  delay: `${-((i * 11) % 8)}s`,
  drift: `${((i * 19) % 60) - 30}px`,
}));

export function PauseOverlay({ snap, engine, onMenu }: { snap: UISnapshot; engine: Engine; onMenu: () => void }) {
  return (
    <div className="absolute inset-0 z-40 grid place-items-center bg-[#05070c]/74 anim-fade">
      <div className="panel-angled px-12 py-10 text-center anim-pop">
        <div className="font-display font-black text-5xl tracking-[0.2em] text-[#f0dcae]">ПАУЗА</div>
        <div className="mt-2 text-[13px] font-bold tracking-[0.34em] text-[#7a86a0]">ПОРОХ ОСТЫВАЕТ…</div>
        <div className="mt-7 flex flex-col gap-3 w-64 mx-auto">
          <button onClick={() => engine.togglePause()} className="btn-war px-6 py-3 text-xl">ПРОДОЛЖИТЬ</button>
          <button onClick={() => engine.startGame(snap.difficulty, snap.map, snap.mode)} className="btn-iron px-6 py-2.5 text-[15px]">БИТВА ЗАНОВО</button>
          <button onClick={() => engine.toggleMute()} className="btn-iron px-6 py-2.5 text-[15px] inline-flex items-center justify-center gap-2.5">
            <SoundIcon muted={snap.muted} className="w-5 h-5" />
            ЗВУК: {snap.muted ? "ВЫКЛ" : "ВКЛ"}
          </button>
          <button onClick={onMenu} className="btn-iron px-6 py-2.5 text-[15px]">В МЕНЮ</button>
        </div>
        <div className="mt-5 text-[13px] text-[#7a86a0]">Esc или P — вернуться в бой</div>
      </div>
    </div>
  );
}

export function GameOverOverlay({ snap, engine, onMenu }: { snap: UISnapshot; engine: Engine; onMenu: () => void }) {
  const win = snap.winner === 0;

  return (
    <div className="absolute inset-0 z-40 overflow-hidden">
      {win && (
        <div className="pointer-events-none absolute inset-0">
          {EMBERS.map((e, i) => (
            <span key={i} className="ember" style={{ left: e.left, animationDuration: e.dur, animationDelay: e.delay, ["--drift" as string]: e.drift }} />
          ))}
        </div>
      )}
      <div className="absolute inset-0 grid place-items-center bg-[#05070c]/78 anim-fade p-4">
        <div className={`panel-angled w-full max-w-xl px-8 sm:px-12 py-10 text-center anim-pop ${win ? "border-[#8a6a2c]" : "border-[#5a2a22]"}`}>
          <Emblem className={`w-16 h-16 mx-auto ${win ? "" : "grayscale opacity-70"}`} />
          <div className={`font-display font-black text-6xl sm:text-7xl mt-4 ${win ? "text-[#f5d67b] anim-titleglow" : "text-[#e05038]"}`}>
            {win ? "ПОБЕДА" : "ПОРАЖЕНИЕ"}
          </div>
          <div className="mt-2 font-display font-800 tracking-[0.3em] text-[13px] text-[#93a0b8]">
            {win ? "ЛЕГИОН ОБРАЩЁН В ПЕПЕЛ" : "РАССВЕТ ПАЛ ВО МРАК"}
          </div>

          <div className="mt-7 grid grid-cols-3 gap-2.5 text-center">
            {[
              { lbl: "УБИЙСТВА", v: `${snap.stats.kills[0]} : ${snap.stats.kills[1]}`, icon: <SkullIcon className="w-5 h-5 mx-auto" /> },
              { lbl: "УРОН", v: `${snap.stats.dmg[0]} : ${snap.stats.dmg[1]}`, icon: <SwordIcon className="w-5 h-5 mx-auto" /> },
              { lbl: "ЗОЛОТО", v: `${snap.stats.gold[0]} : ${snap.stats.gold[1]}`, icon: <CoinIcon className="w-5 h-5 mx-auto" /> },
            ].map((s) => (
              <div key={s.lbl} className="clip-angled-sm panel px-2 py-4 hover:brightness-125 transition-all">
                <div className="text-[#d9a441]">{s.icon}</div>
                <div className="font-display font-800 text-[10.5px] tracking-[0.22em] text-[#7a86a0] mt-1.5">{s.lbl}</div>
                <div className="font-display font-800 text-[19px] text-[#f0e2bd] tabular-nums mt-1">{s.v}</div>
                <div className="text-[11px] text-[#5f6b84] mt-0.5">{TEAM_NAMES[0]} / {TEAM_NAMES[1]}</div>
              </div>
            ))}
          </div>

          <div className="mt-8 flex gap-3.5 justify-center flex-wrap">
            <button onClick={() => engine.startGame(snap.difficulty, snap.map, snap.mode)} className="btn-war px-10 py-3 text-xl">РЕВАНШ</button>
            <button onClick={onMenu} className="btn-iron px-7 py-3 text-[15px]">В МЕНЮ</button>
          </div>
        </div>
      </div>
    </div>
  );
}
