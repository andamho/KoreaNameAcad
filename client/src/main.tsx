import { startFlashRecorder } from "./flashRecorder";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

// 임시: 인앱에서 글자가 커졌다 작아지는 현상 기록 (확인 후 제거)
startFlashRecorder();

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
    navigator.serviceWorker.getRegistrations().then((registrations) => {
      if (registrations.length > 0) {
        Promise.all(registrations.map(r => r.unregister())).then(() => {
          window.location.reload();
        });
      }
    });
  });
}

createRoot(document.getElementById("root")!).render(<App />);
