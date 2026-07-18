// 이름분석표 동명이인 자동매칭 판정 (v1 — 신청일 축, 순수 함수, 부작용 없음).
// 규칙(원장님 확정):
//  - 이름은 후보 게이트로만(점수 없음).
//  - 판정 축 = 신청일(T와의 근접도). Firebase 이름기반 상담일은 판정에 쓰지 않는다.
//  - 자동연결 근거로 인정하는 신청일은 "상담신청서와 source_consultation_id 로 확인된" 것만.
//    customer.createdAt 프록시/불명은 점수가 높아도 자동연결 금지(needs_review).
//  - 자동연결: 최고 70점↑ AND 2위와 30점차↑ AND 기간 게이트 통과 AND 취소 아님 AND 신청일 출처=consultation.
export type ReportInfo = {
  firstSeenAt: Date; // 기준 T = 최초 감지 시각(불변)
  reportType: "family" | "individual";
};

export type AppDateSource = "consultation" | "customer_proxy" | "unknown";

export type Candidate = {
  customerId: string;
  customerName: string;
  consultationId: string | null;       // 근거 상담신청 ID(있으면)
  applicationDate: Date | null;        // 신청일
  applicationDateSource: AppDateSource; // 신청일 출처(신뢰도)
  numPeople: number | null;            // 신청 인원
  consultStatus: string | null;        // 상담 상태(있으면)
  alreadyLinkedSameType: boolean;      // 같은 유형 분석표 이미 연결됨
};

const DAY = 24 * 60 * 60 * 1000;
const daysSigned = (later: Date, earlier: Date) => (later.getTime() - earlier.getTime()) / DAY;

const isCancelled = (s: string | null) => !!s && /취소|중지|기각/.test(s);
const isActiveStatus = (s: string | null) => !!s && /(완료|진행|접수|확인|예정)/.test(s);

// 기간 게이트: 신청일 ∈ [T-90, T+3]. 신청일 없으면 불통과.
export function passesDateGate(r: ReportInfo, c: Candidate): boolean {
  if (!c.applicationDate) return false;
  const d = daysSigned(r.firstSeenAt, c.applicationDate); // T - 신청일 (양수=신청이 먼저)
  return d >= -3 && d <= 90;
}

export type Scored = {
  customerId: string;
  score: number;
  passedGate: boolean;
  autoEligible: boolean; // 신청일 출처가 consultation 이라 자동연결 근거로 인정되는가
  parts: string[];
};

export function scoreCandidate(r: ReportInfo, c: Candidate): Scored {
  const parts: string[] = [];
  const passedGate = passesDateGate(r, c);
  let score = 0;

  // 주 신호: 신청일 근접도
  if (c.applicationDate) {
    const d = Math.abs(daysSigned(r.firstSeenAt, c.applicationDate));
    if (d <= 3) { score += 70; parts.push("신청일 ±3일 +70"); }
    else if (d <= 7) { score += 55; parts.push("신청일 ±7일 +55"); }
    else if (d <= 14) { score += 40; parts.push("신청일 ±14일 +40"); }
    else if (d <= 30) { score += 20; parts.push("신청일 ±30일 +20"); }
    else parts.push("신청일 31~90일 +0");
  } else {
    parts.push("신청일 없음");
  }
  // 보조
  if (r.reportType === "family" && (c.numPeople ?? 0) >= 2) { score += 10; parts.push("가족+인원2↑ +10"); }
  if (isActiveStatus(c.consultStatus)) { score += 10; parts.push("상담 완료/진행 +10"); }
  if (isCancelled(c.consultStatus)) { score -= 100; parts.push("상담취소 -100"); }
  if (c.alreadyLinkedSameType) { score -= 30; parts.push("이미 연결됨 -30"); }

  // 신청일 출처: consultation 만 자동연결 근거 인정
  const autoEligible = c.applicationDateSource === "consultation";
  if (!autoEligible) parts.push(`신청일 출처=${c.applicationDateSource}(자동연결 불가)`);

  return { customerId: c.customerId, score, passedGate, autoEligible, parts };
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
  const topCand = top ? candidates.find((c) => c.customerId === top.customerId)! : null;

  const auto =
    !!top &&
    top.autoEligible &&                 // 신청일 출처=consultation
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
  let why: string;
  if (eligible.length === 0) why = "기간 게이트 통과 후보 없음(오래된 자료/신청일 부재)";
  else if (top && !top.autoEligible) why = `신청일 출처 미확인(${topCand?.applicationDateSource}) — 상담신청서 연결 안 됨 → 수동 확인`;
  else if (topScore < AUTO_MIN) why = `최고 점수 ${topScore} < ${AUTO_MIN}(신청일 근접 근거 부족)`;
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
