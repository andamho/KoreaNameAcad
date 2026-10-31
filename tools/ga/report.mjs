// 홈페이지(korea-name-acad.com) 구글 애널리틱스(GA4) 통계 읽기 — 읽기 전용 계정 kop-ga-reader.
//
// 2026-10-31 원장님 지시: 홈 다음에 어디로 많이 가는지 등 실제 방문 흐름으로 판단하려고 연결.
//  · 계정: kop-ga-reader@zeus1000-6d1a9.iam.gserviceaccount.com (GA 속성 '뷰어' — 통계 변경 불가)
//  · 열쇠: %USERPROFILE%\.kop-ga\sa.json (저장소·채팅에 넣지 않는다) — 다른 곳이면 GA_SA_FILE
//  · 속성: 491248280 (측정 ID G-CZX143K6V6)
//
// 실행: node tools/ga/report.mjs [일수=30] [--json]   (--json = 사무실 SNS 성과 보드용)
import fs from "fs";
import path from "path";
import { GoogleAuth } from "google-auth-library";

const PROPERTY = process.env.GA_PROPERTY_ID || "491248280";
const KEY = process.env.GA_SA_FILE || path.join(process.env.USERPROFILE || process.env.HOME, ".kop-ga", "sa.json");
const days = Number(process.argv.slice(2).find((a) => /^\d+$/.test(a)) || 30);

const auth = new GoogleAuth({ credentials: JSON.parse(fs.readFileSync(KEY, "utf8")), scopes: ["https://www.googleapis.com/auth/analytics.readonly"] });
const client = await auth.getClient();

export async function runReport(body) {
  const r = await client.request({ url: `https://analyticsdata.googleapis.com/v1beta/properties/${PROPERTY}:runReport`, method: "POST", data: body });
  return (r.data.rows || []).map((x) => [...(x.dimensionValues || []).map((d) => d.value), ...x.metricValues.map((m) => Number(m.value))]);
}

const range = [{ startDate: `${days}daysAgo`, endDate: "today" }];
// 직원 방문 빼기(2026-10-31 원장님 지시):
//  · 태안군 = 사무실(관리자 화면 방문의 대부분). 고객이 태안에서 들어오는 경우는 드물어 통째로 뺀다.
//  · /admin 화면 조회
//  · 직원 기기 표시(index.html 의 traffic_type=internal → GA '내부 트래픽' 필터, 테스트 상태)
const 직원아님 = [
  { notExpression: { filter: { fieldName: "city", stringFilter: { matchType: "EXACT", value: "Taean-gun" } } } },
  { notExpression: { filter: { fieldName: "pagePath", stringFilter: { matchType: "BEGINS_WITH", value: "/admin" } } } },
  { notExpression: { filter: { fieldName: "testDataFilterName", stringFilter: { matchType: "EXACT", value: "Internal Traffic" } } } },
];
const 거르기 = (f) => ({ andGroup: { expressions: f ? [f, ...직원아님] : 직원아님 } });
const 한글 = (p) => { try { return decodeURIComponent(p); } catch { return p; } };

// 페이지 주소 → 화면 이름(메뉴 이름과 같게)
const 이름 = {
  "/": "홈", "/ig": "홈(인스타 링크)", "/tt": "홈(틱톡 링크)", "/experience-zone": "체험 ZONE", "/services": "전문서비스", "/reviews": "이름후기",
  "/pricing": "비용", "/name-stories": "이름이야기", "/columns": "이름과 삶(칼럼)", "/about": "협회 소개", "/inquiry": "실시간 상담",
  "/expert-course": "전문가 과정", "/gratitude": "미용감사 안내", "/purify": "과거 이름 정화하기",
  "/experience-zone/husband-luck": "체험: 남편운", "/experience-zone/short-life": "체험: 단명", "/experience-zone/name-rank": "체험: 이름 전국순위",
  "/experience-zone/children-luck": "체험: 자식운", "/experience-zone/alone-fate": "체험: 독신",
};
const 표시 = (p) => 이름[p] || (/^\/(reviews|name-stories|columns|about|inquiry)\/./.test(p) ? `${이름["/" + p.split("/")[1]]} 글` : 한글(p));
const JSON_OUT = process.argv.includes("--json");

// 0) 기간 합계
const [tot] = await runReport({ dateRanges: range, metrics: [{ name: "activeUsers" }, { name: "sessions" }, { name: "screenPageViews" }], dimensionFilter: 거르기() });

// 1) 페이지별 조회수
const pages = await runReport({ dateRanges: range, dimensions: [{ name: "pagePath" }], metrics: [{ name: "screenPageViews" }, { name: "activeUsers" }], dimensionFilter: 거르기(), orderBys: [{ metric: { metricName: "screenPageViews" }, desc: true }], limit: 25 });

// 2) 홈 다음 페이지: 직전 페이지(pageReferrer)가 홈인 조회. 홈→홈(새로고침)은 뺀다.
const next = (await runReport({
  dateRanges: range, dimensions: [{ name: "pagePath" }], metrics: [{ name: "screenPageViews" }],
  dimensionFilter: 거르기({ filter: { fieldName: "pageReferrer", stringFilter: { matchType: "FULL_REGEXP", value: "https://(www[.])?korea-name-acad[.]com/?([?#].*)?" } } }),
  orderBys: [{ metric: { metricName: "screenPageViews" }, desc: true }], limit: 20,
})).filter(([p]) => p !== "/");
const 합 = next.reduce((s, [, v]) => s + v, 0);

if (JSON_OUT) {
  // 사무실 'SNS 성과' 보드(배포팀/sns_stats.py)가 읽는 모양
  console.log(JSON.stringify({
    ok: true, days, staffExcluded: true,
    totals: tot ? { users: tot[0], sessions: tot[1], views: tot[2] } : null,
    pages: pages.map(([p, v, u]) => ({ path: 한글(p), name: 표시(p), views: v, users: u })),
    homeNext: next.map(([p, v]) => ({ path: 한글(p), name: 표시(p), views: v, pct: 합 ? Math.round((v / 합) * 100) : 0 })),
    homeNextTotal: 합,
  }));
} else {
  if (tot) console.log(`
■ 최근 ${days}일 합계(직원 제외): 사용자 ${tot[0]} · 방문 ${tot[1]} · 조회 ${tot[2]}`);
  console.log(`
■ 페이지별 조회수 (최근 ${days}일, 직원 제외)  [조회수 · 사용자]`);
  for (const [p, v, u] of pages) console.log(`  ${String(v).padStart(5)} · ${String(u).padStart(4)}  ${표시(p)}  ${p}`);
  console.log(`
■ 홈 다음에 간 페이지 (최근 ${days}일, 직원 제외, 홈→홈 새로고침 제외 ${합}회)`);
  for (const [p, v] of next) console.log(`  ${String(v).padStart(5)}  ${(v / 합 * 100).toFixed(0).padStart(3)}%  ${표시(p)}`);
}
