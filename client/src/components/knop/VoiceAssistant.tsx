// 음성 비서: "헤이 뉴미" 호출 → "네, 주인님" → 명령 실행 (KNOP 화면 열려 있을 때, 크롬 권장)
// Web Speech API(음성인식) + speechSynthesis(음성응답). 명령: 고객 열기 / 오늘 일정 / 문자 대화
import { useEffect, useRef, useState } from "react";
import { Mic, MicOff } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { knopApi } from "@/lib/knopApi";

// 웨이크워드(발음 오인식 대비 여러 변형)
const WAKE = /(헤이\s*)?(뉴미|누미|유미|늇미|뉴 미|new me|newme)/i;

export function VoiceAssistant({
  onOpenCustomer,
  onNavigate,
}: {
  onOpenCustomer: (id: string) => void;
  onNavigate: (view: string) => void;
}) {
  const { toast } = useToast();
  const [on, setOn] = useState(false);
  const [status, setStatus] = useState("");
  const [heard, setHeard] = useState("");
  const [img, setImg] = useState<{ url: string; title: string } | null>(null);

  const onRef = useRef(false);
  const recRef = useRef<any>(null);
  const busyRef = useRef(false);

  const speak = (text: string) => {
    try {
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = "ko-KR";
      u.rate = 1.05;
      window.speechSynthesis.speak(u);
    } catch {
      /* noop */
    }
  };

  const runCommand = async (raw: string) => {
    const t = raw.replace(/\s+/g, " ").trim();
    if (!t) return;
    if (busyRef.current) return;
    busyRef.current = true;
    setStatus("처리 중: " + t);
    try {
      // 0) 달력 열기
      if (/달력/.test(t) && !/(이름|분석표|문자|대화)/.test(t)) {
        onNavigate("calendar");
        setStatus("달력 열기");
        speak("달력을 엽니다.");
        return;
      }

      // 1) 일정/스케줄 (상담 일정, 오늘 일정, 이번 주 일정 등) → 달력 열고 읽어줌
      if (/(일정|스케줄|약속|예약|상담)/.test(t) && !/(문자|대화|메시지|이름|분석표)/.test(t)) {
        const agenda = await knopApi.calendarAgenda();
        const todayStr = new Date().toLocaleDateString("sv-SE");
        let list = agenda;
        let range = "다가오는";
        if (/오늘/.test(t)) {
          list = agenda.filter((e) => (e.date || "") === todayStr);
          range = "오늘";
        } else if (/이번\s*주|주간|이번주/.test(t)) {
          const end = new Date();
          end.setDate(end.getDate() + 7);
          const endStr = end.toLocaleDateString("sv-SE");
          list = agenda.filter((e) => (e.date || "") >= todayStr && (e.date || "") <= endStr);
          range = "이번 주";
        } else {
          const end = new Date();
          end.setDate(end.getDate() + 14);
          const endStr = end.toLocaleDateString("sv-SE");
          list = agenda.filter((e) => (e.date || "") >= todayStr && (e.date || "") <= endStr);
        }
        onNavigate("calendar");
        if (!list.length) {
          setStatus(`${range} 일정 없음`);
          speak(`${range} 일정이 없습니다.`);
          return;
        }
        const top = list
          .slice(0, 8)
          .map((e) => `${(e.date || "").slice(5).replace("-", "월 ")}일 ${e.title}`)
          .join(", ");
        setStatus(`${range} 일정 ${list.length}건`);
        speak(`${range} 일정 ${list.length}건입니다. ${top}`);
        return;
      }

      // 2) 고객/이름분석표/문자 — 이름 추출
      const wantMsg = /(문자|대화|메시지)/.test(t);
      const wantReport = /(이름\s*분석표|이름분석표|분석표)/.test(t);
      const name = t
        .replace(/(이름\s*분석표|이름분석표|분석표|고객|자료|정보|파일|열어줘|열어|띄워줘|보여줘|찾아줘|알려줘|해줘|줘|좀|의|씨|님|문자|대화|메시지|내용)/g, "")
        .replace(/[^가-힣]/g, "")
        .trim();

      if (name.length >= 2) {
        const { customerId } = await knopApi.resolveCustomer("", name);
        if (!customerId) {
          setStatus(`'${name}' 못 찾음`);
          speak(`${name}님을 찾지 못했습니다.`);
          return;
        }
        onOpenCustomer(customerId);
        if (wantReport) {
          // 이름분석표 이미지를 실제로 열기
          const detail = await knopApi.getCustomer(customerId);
          const files = detail.files || [];
          const rep =
            files.find((f) => (f.memo || "").startsWith("이름분석표")) ||
            files.find((f) => (f.fileType || "").startsWith("image/"));
          if (rep) {
            setImg({ url: rep.fileUrl, title: `${name} 이름분석표` });
            setStatus(`${name} 이름분석표 열기`);
            speak(`${name}님 이름분석표를 엽니다.`);
          } else {
            setStatus(`${name} 이름분석표 없음`);
            speak(`${name}님 이름분석표가 없습니다.`);
          }
        } else if (wantMsg) {
          const msgs = await knopApi.customerMessages(customerId);
          setStatus(`${name} · 문자 ${msgs.length}건`);
          speak(`${name}님 자료를 엽니다. 주고받은 문자 ${msgs.length}건입니다.`);
        } else {
          setStatus(`${name} 자료 열기`);
          speak(`${name}님 자료를 엽니다.`);
        }
        return;
      }

      setStatus("명령을 이해 못함: " + t);
      speak("무슨 말씀인지 못 알아들었어요. 다시 말씀해 주세요.");
    } catch (e: any) {
      setStatus("오류: " + (e?.message || ""));
      speak("처리 중 문제가 생겼어요.");
    } finally {
      busyRef.current = false;
    }
  };

  const handleTranscript = (transcript: string) => {
    const t = transcript.trim();
    if (!t) return;
    setHeard(t);
    // 호출어(헤이 뉴미)는 있어도 되고 없어도 됨. 있으면 떼어냄.
    const cmd = t.replace(WAKE, "").trim();
    // 호출어만 말한 경우 → "네 주인님"
    if (WAKE.test(t) && !cmd) {
      setStatus("네, 주인님 · 명령을 말하세요");
      speak("네, 주인님");
      return;
    }
    const c = cmd || t;
    // 명령처럼 보일 때만 실행(주변 대화로 오작동 방지)
    if (/(일정|스케줄|예약|약속|상담)/.test(c) || /(열어|열|보여|띄워|찾아|분석표|자료|정보|고객|문자|대화|메시지)/.test(c)) {
      runCommand(c);
    } else {
      setStatus("대기 중 · 예: \"오늘 일정\", \"홍길동 열어줘\"");
    }
  };

  useEffect(() => {
    onRef.current = on;
    if (!on) {
      try {
        recRef.current?.stop?.();
      } catch {
        /* noop */
      }
      recRef.current = null;
      setStatus("");
      return;
    }
    const SR: any = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) {
      toast({ title: "이 브라우저는 음성인식을 지원하지 않아요", description: "크롬에서 열어주세요", variant: "destructive" });
      setOn(false);
      return;
    }
    const rec = new SR();
    rec.lang = "ko-KR";
    rec.continuous = true;
    rec.interimResults = false;
    rec.onresult = (e: any) => {
      const r = e.results[e.results.length - 1];
      if (r && r.isFinal) handleTranscript(r[0].transcript || "");
    };
    rec.onend = () => {
      if (onRef.current) {
        try {
          rec.start();
        } catch {
          /* 이미 시작됨 무시 */
        }
      }
    };
    rec.onerror = (ev: any) => {
      if (ev?.error === "not-allowed" || ev?.error === "service-not-allowed") {
        toast({ title: "마이크 권한이 필요해요", variant: "destructive" });
        setOn(false);
      }
    };
    recRef.current = rec;
    try {
      rec.start();
      setStatus("대기 중 · 예: \"오늘 일정\", \"홍길동 열어줘\"");
      speak("음성 명령을 시작합니다. 바로 말씀하세요.");
    } catch {
      /* noop */
    }
    return () => {
      rec.onend = null;
      try {
        rec.stop();
      } catch {
        /* noop */
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [on]);

  return (
    <>
      {/* 이름분석표 전체화면 보기 */}
      {img && (
        <div
          className="fixed inset-0 z-[60] bg-black/85 flex flex-col items-center justify-center p-4"
          onClick={() => setImg(null)}
        >
          <div className="text-white text-sm mb-2 font-medium">{img.title} · 화면을 탭하면 닫힘</div>
          <img src={img.url} alt={img.title} className="max-w-full max-h-[85vh] object-contain rounded-lg shadow-2xl" />
        </div>
      )}

    <div className="fixed bottom-5 right-5 z-50 flex flex-col items-end gap-2">
      {on && (
        <div className="w-[250px] rounded-xl bg-white shadow-lg border border-gray-200 px-3 py-2 text-xs">
          <div className="font-semibold text-[#3fc4ca]">🎤 뉴미</div>
          <div className="text-gray-700 mt-0.5">{status || "대기 중"}</div>
          {heard && <div className="text-gray-400 mt-0.5 truncate">들은 말: {heard}</div>}
          {/* 글자로 명령 테스트(음성 안 될 때) */}
          <input
            placeholder="명령 입력 후 Enter (예: 오늘 일정)"
            className="mt-2 w-full text-xs rounded border border-gray-200 px-2 py-1 focus:outline-none focus:border-[#56D5DB]"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                const v = (e.target as HTMLInputElement).value.trim();
                if (v) {
                  setHeard(v);
                  runCommand(v);
                  (e.target as HTMLInputElement).value = "";
                }
              }
            }}
          />
        </div>
      )}
      <button
        onClick={() => setOn((v) => !v)}
        title={on ? "음성 비서 끄기" : "음성 비서 켜기 (헤이 뉴미)"}
        className={`w-14 h-14 rounded-full shadow-lg flex items-center justify-center transition ${
          on ? "bg-[#56D5DB] text-white animate-pulse" : "bg-white text-gray-500 border border-gray-200 hover:text-[#3fc4ca]"
        }`}
      >
        {on ? <Mic className="w-6 h-6" /> : <MicOff className="w-6 h-6" />}
      </button>
    </div>
    </>
  );
}
