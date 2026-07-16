// 인스타 자동화 관리 패널 — 연결 상태 진단 + 웹훅 수신 확인
import { useEffect, useState, useCallback } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { RefreshCw, Link2, Radio, KeyRound, Copy, Check } from "lucide-react";

type Diagnostics = {
  env: {
    appId: boolean;
    appSecret: boolean;
    appSecretLooksValid: boolean;
    webhookVerifyToken: boolean;
    publicBaseUrl: string | null;
  };
  token: { source: "db" | "env"; account: string | null; scope: string | null; expiresAt: string | null; daysLeft: number | null } | null;
  webhookUrl: string | null;
  me?: { id?: string; username?: string; account_type?: string; error?: string };
  subscribedFields?: string[] | { error: string };
  missingScopes: string[] | null;
  appWebhook?: {
    configured?: boolean;
    callbackUrl?: string | null;
    active?: boolean | null;
    fields?: string[];
    callbackMatches?: boolean;
    error?: string;
  };
};

type IgEvent = {
  id: string;
  kind: string;
  dedupeKey: string;
  fromId: string | null;
  fromUsername: string | null;
  mediaId: string | null;
  parentId: string | null;
  text: string | null;
  isEcho: boolean;
  receivedAt: string;
};

function authHeaders() {
  return { Authorization: `Bearer ${localStorage.getItem("kna_admin_token")}` };
}

async function api(path: string, init?: RequestInit) {
  const res = await fetch(path, { ...init, headers: { ...authHeaders(), ...(init?.headers ?? {}) } });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.error || `요청 실패 (${res.status})`);
  return body;
}

function Yes({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <span className={ok ? "text-green-600" : "text-red-600"}>{ok ? "✅" : "❌"}</span>
      <span className={ok ? "" : "text-red-600 font-medium"}>{children}</span>
    </div>
  );
}

function CopyRow({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-muted-foreground w-32 shrink-0">{label}</span>
      <code className="text-xs bg-muted px-2 py-1 rounded flex-1 truncate">{value}</code>
      <Button
        size="sm"
        variant="ghost"
        onClick={() => {
          navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }}
      >
        {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
      </Button>
    </div>
  );
}

export function InstagramPanel() {
  const { toast } = useToast();
  const [diag, setDiag] = useState<Diagnostics | null>(null);
  const [events, setEvents] = useState<IgEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [live, setLive] = useState(false);

  const loadDiag = useCallback(async () => {
    try {
      setDiag(await api("/api/admin/instagram/diagnostics"));
    } catch (e: any) {
      toast({ title: "진단 조회 실패", description: e.message, variant: "destructive" });
    }
  }, [toast]);

  const loadEvents = useCallback(async () => {
    try {
      const rows = await api("/api/admin/instagram/events?limit=50");
      setEvents(Array.isArray(rows) ? rows : []);
    } catch {
      // 이벤트 조회 실패는 조용히 (테이블이 아직 없을 수 있음)
    }
  }, []);

  useEffect(() => {
    Promise.all([loadDiag(), loadEvents()]).finally(() => setLoading(false));
  }, [loadDiag, loadEvents]);

  // 실시간 모드: 댓글을 달고 화면에서 바로 확인하기 위한 폴링
  useEffect(() => {
    if (!live) return;
    const t = setInterval(loadEvents, 3000);
    return () => clearInterval(t);
  }, [live, loadEvents]);

  const connect = async () => {
    setBusy("connect");
    try {
      const { url } = await api("/api/admin/instagram/connect-url");
      window.location.href = url; // 인스타 동의 화면으로 이동
    } catch (e: any) {
      toast({ title: "연결 시작 실패", description: e.message, variant: "destructive" });
      setBusy(null);
    }
  };

  const subscribe = async () => {
    setBusy("subscribe");
    try {
      const r = await api("/api/admin/instagram/subscribe", { method: "POST" });
      toast({ title: "웹훅 구독 완료", description: `구독 필드: ${(r.subscribedFields || []).join(", ") || "-"}` });
      await loadDiag();
    } catch (e: any) {
      toast({ title: "웹훅 구독 실패", description: e.message, variant: "destructive" });
    } finally {
      setBusy(null);
    }
  };

  const refreshToken = async () => {
    setBusy("token");
    try {
      const r = await api("/api/admin/instagram/refresh-token", { method: "POST" });
      toast({ title: r.refreshed ? "토큰 갱신됨" : "갱신 안 함", description: r.reason });
      await loadDiag();
    } catch (e: any) {
      toast({ title: "토큰 갱신 실패", description: e.message, variant: "destructive" });
    } finally {
      setBusy(null);
    }
  };

  if (loading) return <div className="text-center py-8 text-muted-foreground">로딩 중...</div>;

  const env = diag?.env;
  const envReady = !!(env?.appId && env?.appSecretLooksValid && env?.webhookVerifyToken && env?.publicBaseUrl);
  const subs = Array.isArray(diag?.subscribedFields) ? diag!.subscribedFields : [];
  const subscribed = subs.includes("comments") && subs.includes("messages");

  return (
    <div className="space-y-6">
      {/* ── 준비 상태 ── */}
      <Card className="p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold">연결 상태</h3>
          <Button size="sm" variant="outline" onClick={() => { loadDiag(); loadEvents(); }}>
            <RefreshCw className="w-3.5 h-3.5 mr-1.5" /> 새로고침
          </Button>
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          <div className="space-y-2">
            <div className="text-xs font-medium text-muted-foreground mb-1">환경변수</div>
            <Yes ok={!!env?.appId}>INSTAGRAM_APP_ID</Yes>
            <Yes ok={!!env?.appSecretLooksValid}>
              INSTAGRAM_APP_SECRET
              {env?.appSecret && !env.appSecretLooksValid && " — 형식 오류(32자리 16진수 아님)"}
            </Yes>
            <Yes ok={!!env?.webhookVerifyToken}>INSTAGRAM_WEBHOOK_VERIFY_TOKEN</Yes>
            <Yes ok={!!env?.publicBaseUrl}>PUBLIC_BASE_URL {env?.publicBaseUrl ? `(${env.publicBaseUrl})` : ""}</Yes>
          </div>

          <div className="space-y-2">
            <div className="text-xs font-medium text-muted-foreground mb-1">계정 / 토큰</div>
            {diag?.token ? (
              <>
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-green-600">✅</span>
                  <span>@{diag.token.account || diag.me?.username || "?"}</span>
                  {diag.token.source === "env" && (
                    <Badge variant="destructive" className="text-[10px]">env 토큰 — 재연결 필요</Badge>
                  )}
                </div>
                {diag.token.expiresAt && (
                  <div className="text-xs text-muted-foreground">
                    만료: {new Date(diag.token.expiresAt).toLocaleDateString("ko-KR")}
                    {diag.token.daysLeft !== null && ` (${diag.token.daysLeft}일 남음, 15일 전 자동갱신)`}
                  </div>
                )}
                {diag.me?.error && <div className="text-xs text-red-600">API 오류: {diag.me.error}</div>}
                {!!diag.missingScopes?.length && (
                  <div className="text-xs text-red-600">누락 권한: {diag.missingScopes.join(", ")} → 재연결 필요</div>
                )}
                <Yes ok={subscribed}>웹훅 구독 {subs.length ? `(${subs.join(", ")})` : "안 됨"}</Yes>
              </>
            ) : (
              <div className="text-sm text-red-600">❌ 연결된 계정 없음</div>
            )}
          </div>
        </div>

        <div className="flex flex-wrap gap-2 mt-5 pt-4 border-t">
          <Button size="sm" onClick={connect} disabled={!envReady || busy === "connect"}>
            <Link2 className="w-3.5 h-3.5 mr-1.5" />
            {diag?.token ? "인스타 다시 연결" : "인스타 연결"}
          </Button>
          <Button size="sm" variant="outline" onClick={subscribe} disabled={!diag?.token || busy === "subscribe"}>
            <Radio className="w-3.5 h-3.5 mr-1.5" /> 웹훅 구독
          </Button>
          <Button size="sm" variant="outline" onClick={refreshToken} disabled={!diag?.token || busy === "token"}>
            <KeyRound className="w-3.5 h-3.5 mr-1.5" /> 토큰 갱신
          </Button>
        </div>

        {!envReady && (
          <p className="text-xs text-muted-foreground mt-3">
            환경변수가 모두 준비돼야 연결을 시작할 수 있습니다. Railway → Variables 에서 설정하세요.
          </p>
        )}
      </Card>

      {/* ── 앱 단위 웹훅 설정 진단 (이벤트가 안 올 때 원인 확인) ── */}
      {diag?.appWebhook && (
        <Card className="p-5">
          <h3 className="font-semibold mb-3">웹훅 전송 설정 (Meta 앱 단위)</h3>
          {diag.appWebhook.error ? (
            <div className="text-sm text-amber-600">
              조회 불가: {diag.appWebhook.error}
              {diag.appWebhook.error.includes("META_APP_ID") && " — Railway에 META_APP_ID=2882176862115913 추가 필요"}
            </div>
          ) : (
            <div className="space-y-2">
              <Yes ok={!!diag.appWebhook.configured}>
                Instagram 웹훅 등록됨 {diag.appWebhook.configured ? "" : "— ❗ 대시보드에서 콜백 URL 저장 안 됨"}
              </Yes>
              <Yes ok={diag.appWebhook.active === true}>
                활성 상태 (active={String(diag.appWebhook.active)})
              </Yes>
              <Yes ok={!!diag.appWebhook.callbackMatches}>
                콜백 URL 일치
              </Yes>
              <div className="text-xs text-muted-foreground break-all pl-6">
                등록된 콜백: <code>{diag.appWebhook.callbackUrl || "(없음)"}</code>
              </div>
              <div className="text-xs text-muted-foreground pl-6">
                구독 필드: {(diag.appWebhook.fields || []).join(", ") || "(없음)"}
              </div>
            </div>
          )}
        </Card>
      )}

      {/* ── Meta 대시보드 설정값 ── */}
      {diag?.webhookUrl && (
        <Card className="p-5">
          <h3 className="font-semibold mb-3">Meta 대시보드 설정값</h3>
          <div className="space-y-2">
            <CopyRow label="웹훅 콜백 URL" value={diag.webhookUrl} />
            <CopyRow label="OAuth 리디렉션" value={diag.webhookUrl.replace("/webhook", "/oauth/callback")} />
          </div>
          <p className="text-xs text-muted-foreground mt-3">
            확인 토큰은 서버의 INSTAGRAM_WEBHOOK_VERIFY_TOKEN 값과 같아야 합니다(보안상 여기 표시하지 않음).
          </p>
        </Card>
      )}

      {/* ── 수신된 이벤트 ── */}
      <Card className="p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="font-semibold">수신된 댓글 / DM</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              웹훅이 실제로 들어오는지 확인하는 곳입니다. 아직 자동 답글·DM은 보내지 않습니다.
            </p>
          </div>
          <Button size="sm" variant={live ? "default" : "outline"} onClick={() => setLive((v) => !v)}>
            <Radio className={`w-3.5 h-3.5 mr-1.5 ${live ? "animate-pulse" : ""}`} />
            {live ? "실시간 켜짐" : "실시간"}
          </Button>
        </div>

        {events.length === 0 ? (
          <div className="text-center py-8 text-sm text-muted-foreground">
            아직 수신된 이벤트가 없습니다.
            <br />
            <span className="text-xs">연결 + 웹훅 구독 후 인스타 게시물에 댓글을 달아보세요.</span>
          </div>
        ) : (
          <div className="space-y-2 max-h-[420px] overflow-y-auto">
            {events.map((e) => (
              <div key={e.id} className="flex items-start gap-3 text-sm border rounded-md p-2.5">
                <Badge variant={e.kind === "comment" ? "default" : "secondary"} className="shrink-0 text-[10px]">
                  {e.kind === "comment" ? "댓글" : "DM"}
                </Badge>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium">{e.fromUsername ? `@${e.fromUsername}` : e.fromId || "?"}</span>
                    {e.parentId && <Badge variant="outline" className="text-[10px]">대댓글</Badge>}
                    {e.isEcho && <Badge variant="outline" className="text-[10px]">내가 보낸 것</Badge>}
                  </div>
                  <div className="text-muted-foreground break-words">{e.text || <i>(내용 없음)</i>}</div>
                </div>
                <span className="text-xs text-muted-foreground shrink-0">
                  {new Date(e.receivedAt).toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                </span>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
