import { useEffect, useRef, useState } from "react";
import { Engine } from "./game/engine";
import type { UISnapshot, Difficulty, MapId, BattleMode } from "./game/types";
import MenuScreen from "./components/MenuScreen";
import HUD from "./components/HUD";
import ShopModal from "./components/ShopModal";
import { PauseOverlay, GameOverOverlay } from "./components/Overlays";

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<Engine | null>(null);
  const [snap, setSnap] = useState<UISnapshot | null>(null);
  const [shop, setShop] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const engine = new Engine(canvas, setSnap);
    engineRef.current = engine;
    engine.onShopClose = () => setShop(false);
    return () => {
      engine.destroy();
      engineRef.current = null;
    };
  }, []);

  return (
    <div className="fixed inset-0 bg-[#070b12] overflow-hidden">
      <canvas ref={canvasRef} className={`game-canvas absolute inset-0 ${snap?.blinkMode ? "blink-aim" : ""}`} />
      {snap && snap.screen !== "menu" && (
        <>
          <HUD snap={snap} engine={engineRef.current!} onShop={() => { setShop(true); engineRef.current?.setShopOpen(true); }} />
          {shop && (
            <ShopModal
              snap={snap}
              engine={engineRef.current!}
              onClose={() => { setShop(false); engineRef.current?.setShopOpen(false); }}
            />
          )}
          {snap.paused && !shop && snap.winner === null && (
            <PauseOverlay snap={snap} engine={engineRef.current!} onMenu={() => engineRef.current?.toMenu()} />
          )}
          {snap.winner !== null && (
            <GameOverOverlay snap={snap} engine={engineRef.current!} onMenu={() => engineRef.current?.toMenu()} />
          )}
        </>
      )}
      {snap && snap.screen === "menu" && (
        <MenuScreen
          onStart={(d: Difficulty, m: MapId, mode: BattleMode) =>
            engineRef.current?.startGame(d, m, mode)
          }
        />
      )}
    </div>
  );
}
