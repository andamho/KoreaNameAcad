import { geminiJson, geminiText } from "./gemini";

/**
 * 텔레그램에서 사용자가 버튼 대신 "대화하듯" 보낸 자유 문장을 해석해
 * 실행 가능한 액션 목록으로 변환한다. (Google Gemini)
 * 예: "2번 제목으로 하고 썸네일은 3번, 더 가려주고 게시해줘"
 *   → [{type:"setTitle",index:2},{type:"setThumbnail",index:3},{type:"maskMore"},{type:"publish"}]
 */

export type IntentAction =
  | { type: "setTitle"; index?: number; text?: string }
  | { type: "setThumbnailTitle"; index?: number; text?: string }
  | { type: "setThumbnail"; index: number }
  | { type: "moreTitles" }
  | { type: "moreThumbnailTitles" }
  | { type: "moreThumbnails"; keywords?: string; fromTitle?: boolean }
  | { type: "setLabel"; labelType: "consultation" | "rename" }
  | { type: "editBody"; newText?: string; instruction?: string }
  | { type: "maskMore" }
  | { type: "maskRegion"; index?: number; top: number; bottom: number }
  | { type: "remask" }
  | { type: "publish" }
  | { type: "naverPackage" }
  | { type: "preview" }
  | { type: "savePreference"; text: string }
  | { type: "help" }
  | { type: "unknown"; note?: string };

export type DraftSummary = {
  titleCandidates: string[];
  thumbnailTitleCandidates: string[];
  thumbnailCount: number;
  selectedTitle?: string | null;
  selectedThumbnailTitle?: string | null;
  hasThumbnailSelected: boolean;
};

const SCHEMA = {
  type: "OBJECT",
  properties: {
    actions: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          type: {
            type: "STRING",
            enum: ["setTitle", "setThumbnailTitle", "setThumbnail", "moreTitles", "moreThumbnailTitles", "moreThumbnails", "setLabel", "editBody", "maskMore", "maskRegion", "remask", "publish", "naverPackage", "preview", "savePreference", "help", "unknown"],
          },
          index: { type: "INTEGER" },
          text: { type: "STRING" },
          keywords: { type: "STRING", description: "moreThumbnails에서 새 검색어(영어). 예: sea, family, sunset" },
          fromTitle: { type: "BOOLEAN", description: "moreThumbnails에서 현재 제목의 핵심단어로 찾을 때 true" },
          labelType: { type: "STRING", enum: ["consultation", "rename"], description: "setLabel에서 후기 종류" },
          top: { type: "NUMBER", description: "maskRegion 세로 시작 위치(0=맨위,1=맨아래)" },
          bottom: { type: "NUMBER", description: "maskRegion 세로 끝 위치(0~1)" },
          newText: { type: "STRING" },
          instruction: { type: "STRING" },
          note: { type: "STRING" },
        },
        required: ["type"],
      },
    },
  },
  required: ["actions"],
};

export async function parseIntent(message: string, draft: DraftSummary): Promise<IntentAction[]> {
  const system = `당신은 후기 게시 봇의 명령 해석기입니다. 사용자가 한국어로 자유롭게 말한 요청을 액션 JSON으로 변환하세요.

현재 상태:
- 게시 제목 후보(1~${draft.titleCandidates.length}): ${draft.titleCandidates.map((t, i) => `${i + 1})${t}`).join(" / ") || "없음"}
- 썸네일 문구 후보(1~${draft.thumbnailTitleCandidates.length}): ${draft.thumbnailTitleCandidates.map((t, i) => `${i + 1})${t}`).join(" / ") || "없음"}
- 썸네일 이미지: 1~${draft.thumbnailCount}번 중 선택 가능${draft.hasThumbnailSelected ? " (현재 선택됨)" : ""}

규칙:
- "제목 2번" → {type:setTitle, index:2}. "제목을 ○○로" → {type:setTitle, text:"○○"}.
- "제목 다른 거/다시 추천/제목 마음에 안 들어/다른 제목 5개" → {type:moreTitles} (게시 제목 후보 새로 5개 생성).
- "썸네일 문구 다른 거/문구 다시 추천/문구 마음에 안 들어/다른 문구 5개" → {type:moreThumbnailTitles} (썸네일 문구 후보 새로 5개).
- "썸네일 문구/카피 N번" → {type:setThumbnailTitle, index:N}. "썸네일 문구를 '○○'로/○○로 바꿔/수정" 처럼 직접 문구를 주면 → {type:setThumbnailTitle, text:"○○"}. "썸네일/이미지 N번" → {type:setThumbnail, index:N}.
- "썸네일 다른 거/더 찾아줘/다시 찾아/마음에 안 들어" → {type:moreThumbnails}. "바다 느낌으로/가족 사진으로 다시" 처럼 소재를 지정하면 {type:moreThumbnails, keywords:"<영어 검색어>"} (예: 바다→"sea ocean", 가족→"family"). "제목으로 찾아줘/제목 기반으로/제목에 맞게 썸네일" → {type:moreThumbnails, fromTitle:true}.
- "개명후기로 (바꿔)" → {type:setLabel, labelType:"rename"}. "상담후기로/이름분석으로 (바꿔)" → {type:setLabel, labelType:"consultation"}. (썸네일 위 분류 라벨 변경)
- "본문/내용 ~로 바꿔/고쳐" → editBody (전체 교체면 newText, 부분 수정 지시면 instruction).
- "더 가려/이름 더 가려" → maskMore. "마스킹 다시/처음부터" → remask.
- "위에서 30% 가려줘 / 위 20~40% 가려줘 / N번째 줄도 가려줘" 처럼 특정 세로 구간을 가리라는 요청 → {type:maskRegion, top, bottom}. top/bottom은 0~1(위=0). "위에서 30%"는 top≈0.26 bottom≈0.35 처럼 좁은 띠로. "N번째 줄"은 대략 위치를 추정(예: 3번째 줄≈0.22~0.30). "○번 이미지"라 하면 index=그 번호.
- "게시/올려/홈페이지" → publish. "네이버/블로그용/복붙" → naverPackage. "미리보기" → preview.
- "앞으로/항상/매번/늘/계속 ~해줘" 처럼 앞으로 모든 후기에 적용할 표준 지침이면 → {type:savePreference, text:"<핵심 지침만 간결히>"} (예: "이모지 쓰지 마", "제목은 12자 이내"). 단 "이번엔/이건" 같은 1회성은 savePreference가 아니라 해당 동작(editBody 등)으로 처리.
- 한 문장에 "앞으로 항상 짧게 하고 이번 건 게시해줘" 처럼 표준 지침+동작이 섞이면 savePreference와 해당 동작을 모두 actions에 넣습니다.
- 모르겠으면 [{type:"unknown"}].`;

  const out = await geminiJson<{ actions: IntentAction[] }>(
    system,
    [{ text: message }],
    SCHEMA,
    600,
  );
  const actions = out.actions || [];
  return actions.length ? actions : [{ type: "unknown" }];
}

/** editBody instruction(부분 수정)을 실제 본문에 적용 */
export async function applyBodyEdit(currentBody: string, instruction: string): Promise<string> {
  const text = await geminiText(
    `당신은 "한국이름학교" 후기 본문 편집자입니다. 주어진 본문을 사용자 지시대로 수정하되, 개인정보는 계속 익명화 상태를 유지하고 정중한 톤을 지킵니다. 수정된 본문 전체만 출력하세요(설명·따옴표 없이).`,
    `[현재 본문]\n${currentBody}\n\n[수정 지시]\n${instruction}`,
    1500,
  );
  return text.trim() || currentBody;
}
