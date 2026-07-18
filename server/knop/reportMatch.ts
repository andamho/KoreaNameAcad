// 이름분석표 동명이인 자동매칭 판정 (v1 — 타이밍 기반, 순수 함수, DB/부작용 없음).
// 규칙(원장님 확정):
//  - 이름은 후보 게이트로만(점수 없음). 파일명엔 대표자만 있어 동명이인 변별 불가.
//  - 실제 변별은 상담일·신청일 근접도 + 신청인원/상담상태/기존연결.
//  - 자동연결: 최고 70점↑ AND 2위와 30점차↑ AND 기간 게이트 통과 AND 취소 아님 AND 동일 PDF 미연결.
//  - 그 외 전부 needs_review(동명이인 확인 필요). 후보 1명이어도 기간 벗어나면 자동 금지.

export type ReportInfo = {
  firstSeenAt: Date; // 기준 T = 최초 감지 시각(불변)
  reportType: "family" | "individual";
};

export type Candidate = {
  customerId: string;
  customerName: string;
  consultationId: string | null; // 근거 상담신청 ID(있으면)
  applicationDate: Date | null; // 신청일 (consultation.createdAt / customer.createdAt)
  consultationDate: Date | null; // 상담일 (consultationTime 파싱)
  numPeople: number | null; // 신청 인원
  consultStatus: string | null; // 상담 상태 (완료/진행/취소 등)
  alreadyLinkedSameType: boolean; // 같은 유형(가족/개인) 분석표가 이미 연결돼 있음
};

const DAY = 24 * 60 * 60 * 1000;
const daysAbs = (a: Date, b: Date) => Math.abs(a.getTime() - b.getTime()) / DAY;
const daysSigned = (later: Date, earlier: Date) => (later.getTime() - earlier.getTime()) / DAY; // later-earlier

const isCancelled = (s: string | null) => !!s && /취소|중지|기각/.test(s);
const isActiveStatus = (s: string | null) => !!s && /(완료|진행|접수|확인|예정)/.test(s);

// 기간 게이트: 신청일 ∈ [T-90, T+3], 상담일(있으면) ∈ [T-14, T+30].
export function passesDateGate(r: ReportInfo, c: Candidate): boolean {
  const T = r.firstSeenAt;
  if (c.applicationDate) {
    const d = daysSigned(T, c.applicationDate); // T - 신청일 (양수=신청이 먼저)
    if (d < -3 || d > 90) return false; // 신청이 T보다 3일 넘게 미래거나, 90일보다 오래 전이면 제외
  } else {
    return false; // 신청일조차 없으면 근거 부족 → 게이트 불통과(=needs_review)
  }
  if (c.consultationDate) {
    const d = daysSigned(c.consultationDate, T); // 상담일 - T
    if (d < -14 || d > 30) return false; // 상담이 T보다 14일 넘게 과거거나 30일 넘게 미래면 제외
  }
  return true;
}

export type Scored = { customerId: string; score: number; passedGate: boolean; parts: string[] };

export function scoreCandidate(r: ReportInfo, c: Candidate): Scored {
  const parts: string[] = [];
  const passedGate = passesDateGate(r, c);
  let score = 0;

  // 주 신호: 상담일 근접도 (상담일 없으면 0 → 보수적으로 자동연결 어려움)
  if (c.consultationDate) {
    const d = daysAbs(c.consultationDate, r.firstSeenAt);
    if (d <= 3) { score += 70; parts.push("상담일 ±3일 +70"); }
    else if (d <= 7) { score += 55; parts.push("상담일 ±7일 +55"); }
    else if (d <= 14) { score += 40; parts.push("상담일 ±14일 +40"); }
    else if (d <= 30) { score += 20; parts.push("상담일 ±30일 +20"); }
  } else {
    parts.push("상담일 없음(주 신호 0)");
  }

  // 보조: 신청일 최근성
  if (c.applicationDate) {
    const d = Math.abs(daysSigned(r.firstSeenAt, c.applicationDate));
    if (d <= 7) { score += 20; parts.push("신청일 ≤7일 +20"); }
    else if (d <= 30) { score += 10; parts.push("신청일 ≤30일 +10"); }
  }
  // 보조: 가족 분석 & 인원 2+
  if (r.reportType === "family" && (c.numPeople ?? 0) >= 2) { score += 10; parts.push("가족+인원2↑ +10"); }
  // 보조: 상담 완료/진행
  if (isActiveStatus(c.consultStatus)) { score += 10; parts.push("상담 완료/진행 +10"); }
  // 감점: 상담취소
  if (isCancelled(c.consultStatus)) { score -= 100; parts.push("상담취소 -100"); }
  // 감점: 같은 유형 분석표 이미 연결
  if (c.alreadyLinkedSameType) { score -= 30; parts.push("이미 연결됨 -30"); }

  return { customerId: c.customerId, score, passedGate, parts };
}

export type Decision = {
  status: "auto_matched" | "needs_review";
  matchedCustomerId: string | null;
  topScore: number;
  secondScore: number;
  scoreGap: number;
  reason: string;
  scored: Scored[];
};

const AUTO_MIN = 70;
const AUTO_GAP = 30;

export function decideMatch(r: ReportInfo, candidates: Candidate[]): Decision {
  const scored = candidates.map((c) => scoreCandidate(r, c)).sort((a, b) => b.score - a.score);
  const eligible = scored.filter((s) => s.passedGate);
  const top = eligible[0];
  const second = eligible[1];
  const topScore = top?.score ?? 0;
  const secondScore = second?.score ?? 0;
  const gap = topScore - secondScore;

  // 자동연결 조건: 게이트 통과 후보 중 최고 70↑ AND 2위와 30점차↑ AND 취소 아님
  const topCand = top ? candidates.find((c) => c.customerId === top.customerId)! : null;
  const auto =
    !!top &&
    topScore >= AUTO_MIN &&
    gap >= AUTO_GAP &&
    !!topCand &&
    !isCancelled(topCand.consultStatus);

  if (auto) {
    return {
      status: "auto_matched",
      matchedCustomerId: top!.customerId,
      topScore, secondScore, scoreGap: gap,
      reason: `자동연결: ${top!.score}점(${top!.parts.join(", ")}) · 2위 ${secondScore}점 · 차 ${gap}`,
      scored,
    };
  }
  // 보류 사유
  let why: string;
  if (eligible.length === 0) why = "기간 게이트 통과 후보 없음(오래된 자료/신청일 부재)";
  else if (topScore < AUTO_MIN) why = `최고 점수 ${topScore} < ${AUTO_MIN}(상담일 근접 근거 부족)`;
  else if (gap < AUTO_GAP) why = `1·2위 점수차 ${gap} < ${AUTO_GAP}(동명이인 구분 불확실)`;
  else why = "자동연결 조건 미달";
  return {
    status: "needs_review",
    matchedCustomerId: null,
    topScore, secondScore, scoreGap: gap,
    reason: `확인 필요: ${why}`,
    scored,
  };
}
