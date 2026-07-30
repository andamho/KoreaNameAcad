// 새 이름 분석표(파일명에 '새이름')를 고객에게 붙일 때의 판정 — 순수 함수, 부작용 없음.
//
// 왜 별도 경로인가:
//   일반 이름분석표는 '신청일 근접도'로 판정한다(reportMatch.ts). 그런데 새 이름 파일은
//   신청 시점과 무관하게 나중에 나오고, 신청일 근거가 없어 항상 '확인필요'로 빠졌다.
//   실제로 2026-07-30 김경순님 건이 이 이유로 자동연결에 실패했다.
//
// 규칙(원장님 확정):
//   - 파일명 형식: "ㅇㅇㅇ님 새이름.pdf" / "ㅇㅇㅇ님 가족 새이름.pdf"
//   - 찾는 이름은 '새이름' 앞의 ㅇㅇㅇ — 즉 개명 전 기존 이름(고객 기록의 이름)이다.
//   - 후보는 달력에 '작명완료' 일정이 있는 사람으로 한정한다.
//   - 기간: 파일 저장일 기준 가족이면 두 달, 혼자면 한 달 안에 작명완료 일정이 있어야 한다.
//   - 후보가 정확히 1명일 때만 자동연결. 0명이거나 2명 이상이면 확인필요(사람이 고른다).

export type NamingEvent = {
  date: string; // 작명완료 일정 날짜 (YYYY-MM-DD, KST)
  title: string;
  name: string; // 제목에서 뽑은 이름 (괄호·인원수 제거됨)
  phone: string | null; // 정규화된 번호
};

export type NewNameCandidate = {
  customerId: string;
  customerName: string; // 고객 기준이름(가족 꼬리 제거)
  normalizedPhone: string | null;
};

export type NewNameDecision = {
  status: "auto_matched" | "needs_review";
  matchedCustomerId: string | null;
  reason: string;
  windowDays: number;
  matchedEventDate: string | null;
};

const DAY = 24 * 60 * 60 * 1000;

// 가족 두 달, 혼자 한 달
export function windowDaysFor(reportType: "family" | "individual"): number {
  return reportType === "family" ? 60 : 30;
}

// 'YYYY-MM-DD'(KST 달력 날짜) 와 파일 저장 시각의 날짜 차이(일). 양수/음수 모두 허용해 절대값으로 본다.
export function daysBetween(namingDate: string, fileSavedAt: Date): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(namingDate);
  if (!m) return null;
  // 작명완료일 정오(KST)를 기준점으로 삼아 시각 차이로 인한 하루 오차를 없앤다.
  const evt = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 3, 0, 0); // 12:00 KST
  return Math.abs(evt - fileSavedAt.getTime()) / DAY;
}

export function decideNewName(
  extractedName: string,
  reportType: "family" | "individual",
  fileSavedAt: Date,
  events: NamingEvent[],
  candidates: NewNameCandidate[],
): NewNameDecision {
  const windowDays = windowDaysFor(reportType);
  const nameLabel = reportType === "family" ? "가족(두 달)" : "혼자(한 달)";

  if (!extractedName) {
    return { status: "needs_review", matchedCustomerId: null, windowDays, matchedEventDate: null, reason: "확인 필요: 파일명에서 이름을 못 읽음" };
  }

  // 1) 이름이 같은 작명완료 일정만
  const sameName = events.filter((e) => e.name === extractedName);
  if (sameName.length === 0) {
    return {
      status: "needs_review", matchedCustomerId: null, windowDays, matchedEventDate: null,
      reason: `확인 필요: 달력에 '${extractedName}' 작명완료 일정 없음`,
    };
  }

  // 2) 기간 안에 드는 것만
  const inWindow = sameName
    .map((e) => ({ e, d: daysBetween(e.date, fileSavedAt) }))
    .filter((x) => x.d !== null && x.d <= windowDays)
    .sort((a, b) => (a.d! - b.d!));
  if (inWindow.length === 0) {
    const nearest = sameName
      .map((e) => ({ e, d: daysBetween(e.date, fileSavedAt) ?? Infinity }))
      .sort((a, b) => a.d - b.d)[0];
    return {
      status: "needs_review", matchedCustomerId: null, windowDays, matchedEventDate: null,
      reason: `확인 필요: '${extractedName}' 작명완료 일정이 ${nameLabel} 범위 밖 (가장 가까운 일정 ${nearest.e.date}, ${Math.round(nearest.d)}일 차)`,
    };
  }

  // 3) 일정 → 고객 연결. 번호 우선, 없으면 이름.
  const matchedIds = new Set<string>();
  let usedEventDate: string | null = null;
  for (const { e } of inWindow) {
    const byPhone = e.phone ? candidates.filter((c) => c.normalizedPhone && c.normalizedPhone === e.phone) : [];
    const hit = byPhone.length ? byPhone : candidates.filter((c) => c.customerName === extractedName);
    for (const c of hit) {
      matchedIds.add(c.customerId);
      if (!usedEventDate) usedEventDate = e.date;
    }
  }

  if (matchedIds.size === 0) {
    return {
      status: "needs_review", matchedCustomerId: null, windowDays, matchedEventDate: inWindow[0].e.date,
      reason: `확인 필요: 작명완료 일정(${inWindow[0].e.date})은 찾았으나 해당 고객 기록을 못 찾음`,
    };
  }
  if (matchedIds.size > 1) {
    return {
      status: "needs_review", matchedCustomerId: null, windowDays, matchedEventDate: usedEventDate,
      reason: `확인 필요: 조건에 맞는 고객이 ${matchedIds.size}명(동명이인) — 사람이 확인`,
    };
  }

  const only = Array.from(matchedIds)[0];
  return {
    status: "auto_matched",
    matchedCustomerId: only,
    windowDays,
    matchedEventDate: usedEventDate,
    reason: `자동연결(새이름): 달력 작명완료 ${usedEventDate} · ${nameLabel} 기준 · 후보 1명`,
  };
}
