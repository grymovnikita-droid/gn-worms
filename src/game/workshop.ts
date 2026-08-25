// ============================================================
// Мастерская: пользовательские модели и элементы
// Хранит спрайты (dataURL) + их габариты в localStorage
// ============================================================
import { HEROES, ultById, weaponById } from "./types";

export interface SpriteConfig {
  dataUrl: string;
  /** ширина на карте, в мировых пикселях */
  w: number;
  /** высота на карте, в мировых пикселях */
  h: number;
  /** вертикальный сдвиг (вверх +, вниз −), в мировых пикселях */
  offY: number;
}

export type WorkshopData = Record<string, SpriteConfig>;

const STORE_KEY = "zoloto_poroh_workshop_v1";

export function loadWorkshop(): WorkshopData {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    return raw ? (JSON.parse(raw) as WorkshopData) : {};
  } catch {
    return {};
  }
}

export function saveWorkshop(data: WorkshopData): boolean {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(data));
    return true;
  } catch {
    return false; // переполнено хранилище
  }
}

export interface SlotDef {
  key: string;
  name: string;
  kind: "hero" | "obj" | "bg";
  /** стандартная ширина */
  dw: number;
  /** стандартная высота */
  dh: number;
  hint: string;
}

/**
 * Габариты задаются в мировых пикселях карты.
 * Якорь модели героя — НИЗ ПО ЦЕНТРУ (ступни стоят на земле).
 * Стандартный векторный герой ≈ 40×68 мировых px.
 * Слоты героев генерируются из таблицы 20 героев.
 */
export const SLOT_DEFS: SlotDef[] = [
  ...HEROES.map((h) => ({
    key: h.id,
    name: h.name,
    kind: "hero" as const,
    dw: 40,
    dh: 68,
    hint: `${ultById[h.ult].name} · ${weaponById[h.sig].name}`,
  })),
  { key: "crate", name: "Подарок (ящик)", kind: "obj", dw: 40, dh: 34, hint: "Падает с парашютом" },
  { key: "bg", name: "Задний фон неба", kind: "bg", dw: 0, dh: 0, hint: "Растягивается на весь экран" },
];

/** Сжимает загруженное изображение до ≤512px по большей стороне и возвращает dataURL + пропорции */
export function processImageFile(file: File): Promise<{ dataUrl: string; aspect: number }> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith("image/")) {
      reject(new Error("Нужен файл изображения (PNG / JPG / WebP / SVG)"));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const src = reader.result as string;
      const img = new Image();
      img.onload = () => {
        const maxSide = 512;
        const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
        if (scale >= 1 && file.size < 800_000) {
          resolve({ dataUrl: src, aspect: img.width / Math.max(1, img.height) });
          return;
        }
        const cv = document.createElement("canvas");
        cv.width = Math.max(1, Math.round(img.width * scale));
        cv.height = Math.max(1, Math.round(img.height * scale));
        cv.getContext("2d")!.drawImage(img, 0, 0, cv.width, cv.height);
        resolve({ dataUrl: cv.toDataURL("image/png"), aspect: img.width / Math.max(1, img.height) });
      };
      img.onerror = () => reject(new Error("Не удалось прочитать изображение"));
      img.src = src;
    };
    reader.onerror = () => reject(new Error("Ошибка чтения файла"));
    reader.readAsDataURL(file);
  });
}
