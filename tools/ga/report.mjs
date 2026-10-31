// 홈페이지(korea-name-acad.com) 구글 애널리틱스(GA4) 통계 읽기 — 읽기 전용 계정 kop-ga-reader.
//
// 2026-10-31 원장님 지시: 홈 다음에 어디로 많이 가는지 등 실제 방문 흐름으로 판단하려고 연결.
//  · 계정: kop-ga-reader@zeus1000-6d1a9.iam.gserviceaccount.com (GA 속성 '뷰어' — 통계 변경 불가)
//  · 열쇠: %USERPROFILE%\.kop-ga\sa.json (저장소·채팅에 넣지 않는다) — 다른 곳이면 GA_SA_FILE
//  · 속성: 491248280 (측정 ID G-CZX143K6V6)
//
// 실행: node tools/ga/report.mjs [일수=30]
import fs from "fs";
import path from "path";
import { GoogleAuth } from "google-auth-library";

const PROPERTY = process.env.GA_PROPERTY_ID || "491248280";
const KEY = process.env.GA_SA_FILE || path.join(process.env.USERPROFILE || process.env.HOME, ".kop-ga", "sa.json");
const days = Number(process.argv[2] || 30);

const auth = new GoogleAuth({ credentials: JSON.parse(fs.readFileSync(KEY, "utf8")), scopes: ["https://www.googleapis.com/auth/analytics.readonly"] });
const client = await auth.getClient();

export async function runReport(body) {
  const r = await client.request({ url: `https://analyticsdata.googleapis.com/v1beta/properties/${PROPERTY}:runReport`, method: "POST", data: body });
  return (r.data.rows || []).map((x) => [...x.dimensionValues.map((d) => d.value), ...x.metricValues.map((m) => Number(m.value))]);
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

// 1) 페이지별 조회수
const pages = await runReport({ dateRanges: range, dimensions: [{ name: "pagePath" }], metrics: [{ name: "screenPageViews" }, { name: "activeUsers" }], dimensionFilter: 거르기(), orderBys: [{ metric: { metricName: "screenPageViews" }, desc: true }], limit: 25 });
console.log(`\n■ 페이지별 조회수 (최근 ${days}일, 직원 제외)  [조회수 · 사용자]`);
for (const [p, v, u] of pages) console.log(`  ${String(v).padStart(5)} · ${String(u).padStart(4)}  ${한글(p)}`);

// 2) 홈 다음 페이지: 직전 페이지(pageReferrer)가 홈인 조회
const next = await runReport({
  dateRanges: range, dimensions: [{ name: "pagePath" }], metrics: [{ name: "screenPageViews" }],
  dimensionFilter: 거르기({ filter: { fieldName: "pageReferrer", stringFilter: { matchType: "FULL_REGEXP", value: "https://(www[.])?korea-name-acad[.]com/?([?#].*)?" } } }),
  orderBys: [{ metric: { metricName: "screenPageViews" }, desc: true }], limit: 20,
});
const 합 = next.filter(([p]) => p !== "/").reduce((s, [, v]) => s + v, 0);
console.log(`\n■ 홈 다음에 간 페이지 (최근 ${days}일, 직원 제외, 홈→홈 새로고침 제외 ${합}회)`);
for (const [p, v] of next) if (p !== "/") console.log(`  ${String(v).padStart(5)}  ${(v / 합 * 100).toFixed(0).padStart(3)}%  ${한글(p)}`);
