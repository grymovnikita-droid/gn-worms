import { ITEMS } from "../game/types";
import type { UISnapshot } from "../game/types";
import type { Engine } from "../game/engine";
import { ItemIcon, CoinIcon } from "./Icons";

interface Props { snap: UISnapshot; engine: Engine; onClose: () => void; }

export default function ShopModal({ snap, engine, onClose }: Props) {
  const gold = snap.gold[0];
  const a = snap.active;

  return (
    <div className="absolute inset-0 z-30 grid place-items-center bg-[#05070c]/72 anim-fade p-3" onClick={onClose}>
      <div className="panel-angled w-full max-w-2xl max-h-[92vh] overflow-y-auto anim-pop" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between gap-3 px-6 py-4 border-b border-[#38466a]">
          <div>
            <div className="font-display font-black text-[22px] tracking-[0.14em] text-[#f5d67b]">ЛАВКА ОРУЖИЙ</div>
            <div className="text-[13px] text-[#93a0b8] mt-0.5">Покупки получает <b className="text-[#e8ddc4]">{a?.name}</b> · время хода заморожено</div>
          </div>
          <div className="flex items-center gap-3">
            <span className="clip-angled-sm panel-gold px-4 py-2 flex items-center gap-2">
              <CoinIcon className="w-6 h-6" />
              <span className="font-display font-800 text-[20px] text-[#f5d67b] tabular-nums">{gold}</span>
            </span>
            <button onClick={onClose} className="btn-iron w-11 h-11 grid place-items-center text-2xl leading-none">×</button>
          </div>
        </div>

        <div className="p-4 sm:p-5 grid sm:grid-cols-2 gap-3">
          {ITEMS.map((it) => {
            const owned = a ? a.items.includes(it.id) : false;
            const afford = gold >= it.cost;
            const mekOwned = it.id === "mek" ? a?.mekCount ?? 0 : 0;
            const disabled = !afford || (owned && !it.consumable);
            return (
              <div key={it.id} className="clip-angled-sm panel p-4 flex gap-3.5 items-start hover:border-[#8a6a2c] hover:brightness-110 transition-all">
                <span className={`clip-angled-sm shrink-0 w-14 h-14 grid place-items-center ${owned && !it.consumable ? "panel text-[#9fd45a]" : "panel-gold text-[#f5d67b]"}`}>
                  <ItemIcon id={it.id} className="w-8 h-8" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="font-display font-800 tracking-wide text-[15px] text-[#f0dcae]">{it.name}</span>
                    <span className="flex items-center gap-1.5 text-[15px] font-bold text-[#f5d67b] tabular-nums shrink-0">
                      {it.cost} <CoinIcon className="w-4 h-4" />
                    </span>
                  </div>
                  <p className="text-[13.5px] leading-snug text-[#c9c2ae] mt-1">{it.desc}</p>
                  <p className="text-[12.5px] italic text-[#7a86a0] leading-snug mt-1">«{it.lore}»</p>
                  <div className="mt-2.5 flex items-center justify-between gap-2">
                    {owned && !it.consumable ? (
                      <span className="font-display font-800 text-[12px] tracking-[0.2em] text-[#9fd45a]">✓ У ГЕРОЯ</span>
                    ) : mekOwned > 0 ? (
                      <span className="font-display font-800 text-[12px] tracking-[0.2em] text-[#7ee08a]">В СУМКЕ: {mekOwned}</span>
                    ) : (
                      <span className="text-[12px] font-bold tracking-widest text-[#7a86a0]">{it.passive ? "ПАССИВНЫЙ" : "АКТИВНЫЙ"}</span>
                    )}
                    <button
                      onClick={() => engine.buyItem(it.id)}
                      disabled={disabled}
                      className="btn-war px-5 py-1.5 text-[13px]"
                    >
                      {owned && !it.consumable ? "КУПЛЕНО" : !afford ? "МАЛО ЗОЛОТА" : "КУПИТЬ"}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        <div className="px-6 pb-5 text-[13px] text-[#7a86a0]">
          Казна общая на всю команду Рассвета. Предметы закрепляются за героем, чей ход идёт.
        </div>
      </div>
    </div>
  );
}
