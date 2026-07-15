// 음성 비서: "헤이 뉴미" 호출 → "네, 주인님" → 명령 실행 (KNOP 화면 열려 있을 때, 크롬 권장)
// Web Speech API(음성인식) + speechSynthesis(음성응답). 명령: 고객 열기 / 오늘 일정 / 문자 대화
import { useEffect, useRef, useState } from "react";
import { Mic, MicOff } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { knopApi } from "@/lib/knopApi";

// 웨이크워드(발음 오인식 대비 여러 변형)
const WAKE = /(헤이\s*)?(뉴미|누미|유미|늇미|뉴 미|new me|newme)/i;

export function VoiceAssistant({ onOpenCustomer }: { onOpenCustomer: (id: string) => void }) {
  const { toast } = useToast();
  const [on, setOn] = useState(false);
  const [status, setStatus] = useState("");
  const [heard, setHeard] = useState("");

  const onRef = useRef(false);
  const awaitingRef = useRef(false); // 웨이크워드 후 명령 대기 상태
  const awaitTimer = useRef<any>(null);
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

  const setAwaiting = (v: boolean) => {
    awaitingRef.current = v;
    if (awaitTimer.current) clearTimeout(awaitTimer.current);
    if (v) awaitTimer.current = setTimeout(() => (awaitingRef.current = false), 9000);
  };

  const runCommand = async (raw: string) => {
    const t = raw.replace(/\s+/g, " ").trim();
    if (!t) return;
    if (busyRef.current) return;
    busyRef.current = true;
    try {
      // 오늘 일정
      if (/오늘/.test(t) && /(일정|스케|뭐|약속|예약|있)/.test(t)) {
        const agenda = await knopApi.calendarAgenda();
        const today = new Date().toLocaleDateString("sv-SE");
        const list = agenda.filter((e) => (e.date || "") === today);
        if (!list.length) {
          setStatus("오늘 일정 없음");
          speak("오늘 일정이 없습니다.");
        } else {
          const names = list.map((e) => e.title).slice(0, 12).join(", ");
          setStatus(`오늘 일정 ${list.length}건`);
          speak(`오늘 일정 ${list.length}건입니다. ${names}`);
        }
        return;
      }

      // 이름 추출: 명령/조사 단어 제거 후 남는 한글
      const wantMsg = /(문자|대화|메시지)/.test(t);
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
        if (wantMsg) {
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
    if (WAKE.test(t)) {
      const cmd = t.replace(WAKE, "").trim();
      if (cmd) {
        setAwaiting(false);
        runCommand(cmd);
      } else {
        setAwaiting(true);
        setStatus("네, 주인님 · 명령을 말하세요");
        speak("네, 주인님");
      }
    } else if (awaitingRef.current) {
      setAwaiting(false);
      runCommand(t);
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
      setStatus("대기 중 · \"헤이 뉴미\"라고 불러주세요");
      speak("음성 명령을 시작합니다. 헤이 뉴미, 라고 불러주세요.");
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
    <div className="fixed bottom-5 right-5 z-50 flex flex-col items-end gap-2">
      {on && status && (
        <div className="max-w-[240px] rounded-xl bg-white shadow-lg border border-gray-200 px-3 py-2 text-xs">
          <div className="font-semibold text-[#3fc4ca]">🎤 뉴미</div>
          <div className="text-gray-700 mt-0.5">{status}</div>
          {heard && <div className="text-gray-400 mt-0.5 truncate">들은 말: {heard}</div>}
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
  );
}
