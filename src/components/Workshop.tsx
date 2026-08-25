import { useRef, useState } from "react";
import type { Engine } from "../game/engine";
import { SLOT_DEFS, processImageFile } from "../game/workshop";
import type { SpriteConfig, SlotDef } from "../game/workshop";

interface Props { engine: Engine; onClose: () => void; }

function clampNum(v: number, a: number, b: number) {
  return Math.max(a, Math.min(b, v));
}

export default function Workshop({ engine, onClose }: Props) {
  const [data, setData] = useState<Record<string, SpriteConfig>>(() => ({ ...engine.getWorkshopData() }));
  const [notice, setNotice] = useState("");
  const fileRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const show = (m: string) => {
    setNotice(m);
    window.setTimeout(() => setNotice(""), 2600);
  };

  const set = (key: string, cfg: SpriteConfig | null) => {
    const ok = engine.applySprite(key, cfg);
    setData({ ...engine.getWorkshopData() });
    if (!ok) show("Хранилище браузера переполнено — картинка слишком большая");
  };

  const onFile = async (slot: SlotDef, file: File | null) => {
    if (!file) return;
    try {
      const { dataUrl, aspect } = await processImageFile(file);
      let cfg: SpriteConfig;
      if (slot.kind === "bg") {
        cfg = { dataUrl, w: 0, h: 0, offY: 0 };
      } else if (slot.kind === "hero") {
        const h = slot.dh;
        cfg = { dataUrl, w: clampNum(Math.round(h * aspect), 14, 240), h, offY: 0 };
      } else {
        const h = slot.dh;
        cfg = { dataUrl, w: clampNum(Math.round(h * aspect), 14, 200), h, offY: 0 };
      }
      set(slot.key, cfg);
      show(`${slot.name}: модель загружена`);
    } catch (e) {
      show(e instanceof Error ? e.message : "Не удалось загрузить файл");
    }
  };

  const upd = (key: string, patch: Partial<SpriteConfig>) => {
    const cur = data[key];
    if (!cur) return;
    set(key, { ...cur, ...patch });
  };

  return (
    <div className="absolute inset-0 z-40 grid place-items-center bg-[#05070c]/78 anim-fade p-3" onClick={onClose}>
      <div className="panel-angled w-full max-w-4xl max-h-[94vh] overflow-y-auto anim-pop" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between gap-3 px-6 py-4 border-b border-[#38466a]">
          <div>
            <div className="font-display font-black text-[22px] tracking-[0.12em] text-[#f5d67b]">МАСТЕРСКАЯ МОДЕЛЕЙ</div>
            <div className="text-[13px] text-[#93a0b8] mt-0.5">Загружай свои картинки — игра заменит ими стандартные модели и сохранит их</div>
          </div>
          <button onClick={onClose} className="btn-iron w-11 h-11 grid place-items-center text-2xl leading-none">×</button>
        </div>

        {notice && (
          <div className="mx-6 mt-3 px-4 py-2 text-[13.5px] font-bold text-[#f5d67b] bg-[#2a2410] border border-[#8a6a2c] anim-fade">
            {notice}
          </div>
        )}

        {/* памятка по формату */}
        <div className="mx-6 mt-4 grid sm:grid-cols-3 gap-3 text-[12.5px] leading-snug">
          <div className="clip-angled-sm panel px-4 py-3">
            <b className="text-[#f0dcae]">Формат</b>
            <p className="text-[#93a0b8] mt-1">PNG с прозрачным фоном (лучше всего), JPG, WebP или SVG. Всё сжимается автоматически.</p>
          </div>
          <div className="clip-angled-sm panel px-4 py-3">
            <b className="text-[#f0dcae]">Габариты</b>
            <p className="text-[#93a0b8] mt-1">Задаются в пикселях карты. Стандартный герой ≈ 40×68. Якорь — <b className="text-[#c9c2ae]">низ по центру</b> (ноги на земле).</p>
          </div>
          <div className="clip-angled-sm panel px-4 py-3">
            <b className="text-[#f0dcae]">Совет</b>
            <p className="text-[#93a0b8] mt-1">Рисуй персонажа «в полный рост», ноги внизу картинки. Слайдеры подгонят размер прямо в бою.</p>
          </div>
        </div>

        <div className="p-6 grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {SLOT_DEFS.map((slot) => {
            const cfg = data[slot.key];
            const isBg = slot.kind === "bg";
            return (
              <div key={slot.key} className="clip-angled-sm panel p-4 flex flex-col hover:border-[#8a6a2c] transition-all">
                <div className="flex items-center justify-between">
                  <span className="font-display font-800 text-[14px] tracking-wide text-[#f0dcae]">{slot.name}</span>
                  <span className={`text-[10px] font-bold tracking-widest px-2 py-0.5 ${slot.kind === "hero" ? "text-[#9fd45a] bg-[#1c2a12]" : slot.kind === "obj" ? "text-[#f5d67b] bg-[#2a2410]" : "text-[#7fc4e8] bg-[#12202e]"}`}>
                    {slot.kind === "hero" ? "ГЕРОЙ" : slot.kind === "obj" ? "ОБЪЕКТ" : "ФОН"}
                  </span>
                </div>
                <div className="text-[11.5px] text-[#7a86a0] mt-0.5">{slot.hint}</div>

                {/* превью */}
                <div
                  className={`mt-3 h-28 grid place-items-center overflow-hidden border border-[#2a3448] ${isBg ? "" : "bg-[radial-gradient(circle,#1c2436_0%,#0d1220_80%)]"}`}
                  style={isBg && cfg ? { backgroundImage: `url(${cfg.dataUrl})`, backgroundSize: "cover", backgroundPosition: "center" } : undefined}
                >
                  {!isBg && cfg && <img src={cfg.dataUrl} alt={slot.name} className="max-h-full max-w-full object-contain" style={{ imageRendering: "auto" }} />}
                  {!cfg && <span className="text-[12px] text-[#4a5a7d]">стандартная модель</span>}
                </div>

                <input
                  ref={(el) => { fileRefs.current[slot.key] = el; }}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => onFile(slot, e.target.files?.[0] ?? null)}
                />

                <div className="mt-3 flex gap-2">
                  <button onClick={() => fileRefs.current[slot.key]?.click()} className="btn-war flex-1 px-3 py-1.5 text-[13px]">
                    {cfg ? "ЗАМЕНИТЬ" : "ЗАГРУЗИТЬ"}
                  </button>
                  {cfg && (
                    <button onClick={() => { set(slot.key, null); show(`${slot.name}: возвращена стандартная модель`); }} className="btn-iron px-3 py-1.5 text-[13px]">
                      СБРОС
                    </button>
                  )}
                </div>

                {/* габариты */}
                {cfg && !isBg && (
                  <div className="mt-3 space-y-2">
                    <label className="block text-[11.5px] text-[#93a0b8]">
                      <span className="flex justify-between"><span>Ширина</span><b className="text-[#e8ddc4] tabular-nums">{cfg.w}px</b></span>
                      <input type="range" min={14} max={240} value={cfg.w} onChange={(e) => upd(slot.key, { w: Number(e.target.value) })} className="w-full accent-[#d9a441]" />
                    </label>
                    <label className="block text-[11.5px] text-[#93a0b8]">
                      <span className="flex justify-between"><span>Высота</span><b className="text-[#e8ddc4] tabular-nums">{cfg.h}px</b></span>
                      <input type="range" min={14} max={300} value={cfg.h} onChange={(e) => upd(slot.key, { h: Number(e.target.value) })} className="w-full accent-[#d9a441]" />
                    </label>
                    <label className="block text-[11.5px] text-[#93a0b8]">
                      <span className="flex justify-between"><span>Сдвиг по вертикали</span><b className="text-[#e8ddc4] tabular-nums">{cfg.offY}px</b></span>
                      <input type="range" min={-80} max={80} value={cfg.offY} onChange={(e) => upd(slot.key, { offY: Number(e.target.value) })} className="w-full accent-[#d9a441]" />
                    </label>
                  </div>
                )}
                {cfg && isBg && (
                  <div className="mt-3 text-[11.5px] text-[#7a86a0]">Растягивается на весь экран автоматически (cover).</div>
                )}
              </div>
            );
          })}
        </div>

        <div className="px-6 pb-5 text-[12.5px] text-[#7a86a0]">
          Модели хранятся в твоём браузере и подхватываются автоматически при следующем запуске. Изменения видны сразу — можно подгонять размер прямо во время боя.
        </div>
      </div>
    </div>
  );
}
