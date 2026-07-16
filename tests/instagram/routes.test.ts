// 인스타 라우트 통합 테스트 — 실제 Express + 실제 HTTP 요청.
// 실행: npm run test:instagram
//
// DB에 붙지 않는다(DATABASE_URL 미설정 → db=null → storeEvents가 0을 반환).
// 검증 대상은 "웹훅이 서버 문 앞에서 올바르게 받아들여지거나 거부되는가":
//  - 핸드셰이크가 challenge를 그대로 돌려주는가
//  - 서명 위조를 403으로 막는가
//  - 전역 express.json이 원본 바디를 먹어버리지 않는가  ← 가장 깨지기 쉬운 지점
import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "crypto";
import express from "express";
import type { Server } from "http";
import type { AddressInfo } from "net";

const SECRET = "test_app_secret_123";
const VERIFY = "test_verify_token";
process.env.INSTAGRAM_APP_SECRET = SECRET;
process.env.INSTAGRAM_APP_ID = "1234567890";
process.env.INSTAGRAM_WEBHOOK_VERIFY_TOKEN = VERIFY;
process.env.PUBLIC_BASE_URL = "https://example.test";
delete process.env.INSTAGRAM_ACCESS_TOKEN; // 토큰 없는 상태를 기본으로

const { registerInstagramRoutes } = await import("../../server/instagram/routes");

let server: Server;
let base: string;

before(async () => {
  const app = express();
  // server/index.ts 와 동일한 설정이어야 의미가 있다 (원본 바디 보존 로직 포함)
  app.use(
    express.json({
      limit: "10mb",
      verify: (req, _res, buf) => {
        if ((req as any).url?.startsWith("/api/instagram/webhook")) {
          (req as any).rawBody = Buffer.from(buf);
        }
      },
    }),
  );
  const allowAdmin: express.RequestHandler = (_req, _res, next) => next();
  registerInstagramRoutes(app, allowAdmin);

  await new Promise<void>((resolve) => {
    server = app.listen(0, "127.0.0.1", resolve);
  });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

after(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

function sign(body: string, secret = SECRET) {
  return "sha256=" + crypto.createHmac("sha256", secret).update(Buffer.from(body)).digest("hex");
}

describe("웹훅 검증 핸드셰이크 (GET)", () => {
  test("verify_token이 맞으면 challenge를 그대로 돌려준다", async () => {
    const q = new URLSearchParams({
      "hub.mode": "subscribe",
      "hub.verify_token": VERIFY,
      "hub.challenge": "1158201444",
    });
    const r = await fetch(`${base}/api/instagram/webhook?${q}`);
    assert.equal(r.status, 200);
    assert.equal(await r.text(), "1158201444", "challenge를 가공 없이 그대로 반환해야 Meta가 URL을 승인한다");
  });

  test("verify_token이 틀리면 403", async () => {
    const q = new URLSearchParams({ "hub.mode": "subscribe", "hub.verify_token": "wrong", "hub.challenge": "1" });
    assert.equal((await fetch(`${base}/api/instagram/webhook?${q}`)).status, 403);
  });

  test("mode가 subscribe가 아니면 403", async () => {
    const q = new URLSearchParams({ "hub.mode": "unsubscribe", "hub.verify_token": VERIFY, "hub.challenge": "1" });
    assert.equal((await fetch(`${base}/api/instagram/webhook?${q}`)).status, 403);
  });
});

describe("웹훅 수신 (POST)", () => {
  const payload = JSON.stringify({
    object: "instagram",
    entry: [
      {
        id: "17841400008460056",
        time: 1569262486134,
        changes: [
          {
            field: "comments",
            value: {
              from: { id: "1134445676786405", username: "tester" },
              media: { id: "17878512141199967" },
              comment_id: "17892100113811950",
              text: "이름 분석 궁금해요",
            },
          },
        ],
      },
    ],
  });

  test("올바른 서명이면 200 (전역 express.json이 원본 바디를 먹지 않음을 증명)", async () => {
    const r = await fetch(`${base}/api/instagram/webhook`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-hub-signature-256": sign(payload) },
      body: payload,
    });
    assert.equal(r.status, 200, "여기서 403이면 rawBody 보존이 깨진 것");
  });

  test("서명 없으면 403", async () => {
    const r = await fetch(`${base}/api/instagram/webhook`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: payload,
    });
    assert.equal(r.status, 403);
  });

  test("위조 서명이면 403", async () => {
    const r = await fetch(`${base}/api/instagram/webhook`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-hub-signature-256": sign(payload, "attacker_secret") },
      body: payload,
    });
    assert.equal(r.status, 403);
  });

  test("서명은 맞지만 내용이 비어도 200 (Meta가 재전송을 멈추도록)", async () => {
    const body = JSON.stringify({ object: "instagram", entry: [] });
    const r = await fetch(`${base}/api/instagram/webhook`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-hub-signature-256": sign(body) },
      body,
    });
    assert.equal(r.status, 200);
  });

  test("한글 본문도 서명이 통과한다 (바이트 길이 ≠ 문자 길이)", async () => {
    const body = JSON.stringify({
      object: "instagram",
      entry: [{ id: "1", changes: [{ field: "comments", value: { comment_id: "c9", text: "안녕하세요 이름 분석 문의드려요", from: { id: "u9" } } }] }],
    });
    const r = await fetch(`${base}/api/instagram/webhook`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-hub-signature-256": sign(body) },
      body,
    });
    assert.equal(r.status, 200);
  });
});

describe("관리자 진단", () => {
  test("diagnostics가 env 준비 상태를 보고한다", async () => {
    const r = await fetch(`${base}/api/admin/instagram/diagnostics`);
    assert.equal(r.status, 200);
    const j: any = await r.json();
    assert.equal(j.env.appId, true);
    assert.equal(j.env.appSecret, true);
    assert.equal(j.env.webhookVerifyToken, true);
    assert.equal(j.env.publicBaseUrl, "https://example.test");
    assert.equal(j.token, null, "토큰 미설정 상태가 그대로 드러나야 함");
    assert.equal(j.webhookUrl, "https://example.test/api/instagram/webhook");
  });

  test("앱 시크릿 형식 검사: 32자리 16진수가 아니면 걸러낸다", async () => {
    // 이 테스트의 시크릿("test_app_secret_123")은 존재하지만 형식이 틀림
    const j: any = await (await fetch(`${base}/api/admin/instagram/diagnostics`)).json();
    assert.equal(j.env.appSecret, true, "값은 있음");
    assert.equal(j.env.appSecretLooksValid, false, "형식은 틀림 → 있다/맞다를 구분해야 함");
  });

  test("앱 시크릿 형식 검사: 진짜 형식이면 통과한다", async () => {
    const original = process.env.INSTAGRAM_APP_SECRET;
    process.env.INSTAGRAM_APP_SECRET = "a".repeat(32); // 32자리 16진수
    try {
      const j: any = await (await fetch(`${base}/api/admin/instagram/diagnostics`)).json();
      assert.equal(j.env.appSecretLooksValid, true);
    } finally {
      process.env.INSTAGRAM_APP_SECRET = original;
    }
  });

  test("앱 시크릿 형식 검사: 대시보드 마스킹 문자를 복사한 경우를 잡아낸다", async () => {
    const original = process.env.INSTAGRAM_APP_SECRET;
    process.env.INSTAGRAM_APP_SECRET = "•".repeat(9); // 실제로 겪은 실수
    try {
      const j: any = await (await fetch(`${base}/api/admin/instagram/diagnostics`)).json();
      assert.equal(j.env.appSecretLooksValid, false, "마스킹 문자열이 초록불로 보이면 안 됨");
    } finally {
      process.env.INSTAGRAM_APP_SECRET = original;
    }
  });

  test("connect-url이 올바른 동의 화면 URL을 만든다", async () => {
    const r = await fetch(`${base}/api/admin/instagram/connect-url`);
    assert.equal(r.status, 200);
    const j: any = await r.json();
    const u = new URL(j.url);
    assert.equal(u.origin + u.pathname, "https://www.instagram.com/oauth/authorize");
    assert.equal(u.searchParams.get("client_id"), "1234567890");
    assert.equal(u.searchParams.get("redirect_uri"), "https://example.test/api/instagram/oauth/callback");
    assert.equal(u.searchParams.get("response_type"), "code");
    const scopes = (u.searchParams.get("scope") || "").split(",");
    for (const s of ["instagram_business_basic", "instagram_business_content_publish", "instagram_business_manage_comments", "instagram_business_manage_messages"]) {
      assert.ok(scopes.includes(s), `스코프 ${s} 누락 — 재인증 시 기존 릴스 배포 권한까지 날아감`);
    }
    assert.ok(u.searchParams.get("state"), "CSRF state 필요");
    // 이게 빠지면 동의 화면이 Facebook 로그인 경로로 빠져 코드 교환이
    // "Error validating verification code" 로 실패한다. 실제로 겪은 문제라 고정한다.
    assert.equal(u.searchParams.get("enable_fb_login"), "0", "순수 인스타 로그인으로 고정돼야 함");
  });
});

describe("OAuth 콜백 보안", () => {
  test("state가 없으면 토큰 교환을 시도하지 않는다", async () => {
    const r = await fetch(`${base}/api/instagram/oauth/callback?code=fake_code`, { redirect: "manual" });
    assert.equal(r.status, 200);
    assert.match(await r.text(), /유효하지 않습니다/);
  });

  test("위조된 state를 거부한다", async () => {
    const forged = `${Date.now()}.deadbeef.${"0".repeat(64)}`;
    const r = await fetch(`${base}/api/instagram/oauth/callback?code=fake&state=${forged}`);
    assert.match(await r.text(), /유효하지 않습니다/);
  });

  test("사용자가 동의를 취소하면 안내 페이지를 보여준다", async () => {
    const r = await fetch(`${base}/api/instagram/oauth/callback?error=access_denied&error_description=denied`);
    assert.equal(r.status, 200);
    assert.match(await r.text(), /취소/);
  });
});
