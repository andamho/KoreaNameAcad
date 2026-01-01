import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

// 고려대학교 볼드체 폰트 로드
const loadKoreaUnivFont = async () => {
  try {
    const font = new FontFace('KoreaUnivB', 'url(/fonts/KoreaUnivB.ttf)');
    await font.load();
    document.fonts.add(font);
    console.log('KoreaUnivB font loaded successfully');
  } catch (e) {
    console.warn('Failed to load KoreaUnivB font:', e);
  }
};
loadKoreaUnivFont();

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}

createRoot(document.getElementById("root")!).render(<App />);
