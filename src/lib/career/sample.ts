/**
 * 가상 사례 시나리오
 *
 * 실제 인물의 정보가 아니다. 데모와 심사용 예시로만 쓴다.
 *
 * 설계 원칙
 *  - 미리 만들어 둔 화면을 보여주는 게 아니라, 실제 면담 파이프라인(conductor)에
 *    스크립트를 그대로 태운다. 질문 순서도 planner 가 정한다.
 *  - 그래서 예시 화면에 보이는 것은 실제 동작 결과와 같다.
 *  - 모든 근거 인용은 대화에 "글자 그대로" 존재한다. grounding 검증을 통과한다.
 *    (sample.test.ts 에서 확인한다)
 */

import { submitAnswer, startInterview, type ExtractFn } from "./conductor.js";
import { emptySession, setItemStatus, setService, setDocPreview } from "./session.js";
import { buildCareerDocument, renderPreview } from "./careerDocument.js";
import type { AiExtraction, SessionState } from "./types.js";

export type SampleTurn = {
  /** 사용자가 하는 답변 */
  answer: string;
  /** 심층 질문 답변일 때 AI가 뽑아내는 결과. 기본정보 단계에는 없다. */
  extraction?: AiExtraction;
};

const none: AiExtraction = {
  reflection: "",
  items: [],
  interpretations: [],
  skipped: false,
  conflicts: [],
};

export const SAMPLE_SCRIPT: SampleTurn[] = [
  /* ---------------- 복무 기본정보 (AI 호출 없음) ---------------- */
  { answer: "육군" },
  { answer: "중사로 전역했습니다" },
  { answer: "장기복무 미선발" },

  /* ---------------- 보직 1: 보급관 ---------------- */
  // 가상의 부대명이다. 숫자가 들어가야
  // "문서에 실명을 넣을지 ○○로 넣을지" 선택 기능을 보여줄 수 있다.
  { answer: "제7군수대대" },
  { answer: "보급관" },
  { answer: "2019년 3월 ~ 2022년 2월" },
  { answer: "정기인사" },
  { answer: "보급품 수불 관리하는 일을 주로 했어요" },

  {
    answer:
      "매일 아침에 창고 재고를 확인하고 부족한 물품은 상급부대에 청구했습니다. 각 중대에서 요청이 오면 물품을 불출하고 수불대장에 기록했어요.",
    extraction: {
      ...none,
      reflection: "매일 재고를 확인하고 청구와 불출까지 맡으셨군요.",
      items: [
        {
          field: "duties",
          text: "매일 아침 창고 재고를 확인하고 부족한 물품을 상급부대에 청구했습니다.",
          evidence: [
            {
              messageId: "",
              quote: "매일 아침에 창고 재고를 확인하고 부족한 물품은 상급부대에 청구했습니다.",
            },
          ],
        },
        {
          field: "duties",
          text: "각 중대의 요청에 따라 물품을 불출하고 수불대장에 기록했습니다.",
          evidence: [
            { messageId: "", quote: "각 중대에서 요청이 오면 물품을 불출하고 수불대장에 기록했어요." },
          ],
        },
      ],
      interpretations: [
        {
          text: "재고 확인 및 청구 절차 운영",
          sourceQuotes: ["매일 아침에 창고 재고를 확인하고 부족한 물품은 상급부대에 청구했습니다."],
        },
      ],
    },
  },

  {
    answer:
      "창고 재고와 불출은 제가 전담했고, 금액이 큰 청구는 대대장님 결재를 받았습니다. 대상은 대대 예하 4개 중대였어요.",
    extraction: {
      ...none,
      reflection: "어디까지가 본인 몫이고 어디부터 결재였는지 정리됐습니다.",
      items: [
        {
          field: "scope",
          text: "창고 재고와 불출 업무를 전담했습니다.",
          evidence: [{ messageId: "", quote: "창고 재고와 불출은 제가 전담했고" }],
        },
        {
          field: "scope",
          text: "금액이 큰 청구는 대대장 결재를 받았습니다.",
          evidence: [{ messageId: "", quote: "금액이 큰 청구는 대대장님 결재를 받았습니다." }],
        },
        {
          field: "scope",
          text: "대대 예하 4개 중대를 대상으로 했습니다.",
          evidence: [{ messageId: "", quote: "대상은 대대 예하 4개 중대였어요." }],
        },
      ],
    },
  },

  {
    answer:
      "아침에 창고를 열어 품목별로 재고를 세고, 부족분을 목록으로 만들어 청구서를 올렸습니다. 물품이 들어오면 수량을 검수하고 수불대장에 올린 뒤 중대별로 나눠 불출했습니다.",
    extraction: {
      ...none,
      reflection: "확인부터 불출까지 순서대로 말씀해 주셨습니다.",
      items: [
        {
          field: "actions",
          text: "아침에 창고를 열어 품목별로 재고를 확인했습니다.",
          evidence: [{ messageId: "", quote: "아침에 창고를 열어 품목별로 재고를 세고" }],
        },
        {
          field: "actions",
          text: "부족분을 목록으로 만들어 청구서를 올렸습니다.",
          evidence: [{ messageId: "", quote: "부족분을 목록으로 만들어 청구서를 올렸습니다." }],
        },
        {
          field: "actions",
          text: "물품이 입고되면 수량을 검수하고 수불대장에 기록했습니다.",
          evidence: [{ messageId: "", quote: "물품이 들어오면 수량을 검수하고 수불대장에 올린 뒤" }],
        },
        {
          field: "actions",
          text: "중대별로 나눠 불출했습니다.",
          evidence: [{ messageId: "", quote: "중대별로 나눠 불출했습니다." }],
        },
      ],
      interpretations: [
        {
          text: "입고부터 불출까지 처리 절차 수행",
          sourceQuotes: ["물품이 들어오면 수량을 검수하고 수불대장에 올린 뒤"],
        },
      ],
    },
  },

  {
    answer:
      "청구 우선순위는 잔량이 적고 자주 쓰는 품목을 먼저 올렸습니다. 애매하면 규정에 정해진 보유 기준을 따랐어요.",
    extraction: {
      ...none,
      reflection: "무엇을 먼저 올릴지 정하는 기준이 있으셨네요.",
      items: [
        {
          field: "judgment",
          text: "잔량이 적고 자주 쓰는 품목을 먼저 청구했습니다.",
          evidence: [{ messageId: "", quote: "잔량이 적고 자주 쓰는 품목을 먼저 올렸습니다" }],
        },
        {
          field: "judgment",
          text: "기준이 애매한 경우 규정에 정해진 보유 기준을 따랐습니다.",
          evidence: [{ messageId: "", quote: "애매하면 규정에 정해진 보유 기준을 따랐어요." }],
        },
      ],
    },
  },

  {
    answer:
      "각 중대 보급담당 부사관들과 매주 통화했고, 상급부대 보급과 담당자와는 청구할 때마다 확인했습니다.",
    extraction: {
      ...none,
      reflection: "안팎으로 연락하실 곳이 나뉘어 있었군요.",
      items: [
        {
          field: "collaboration",
          text: "각 중대 보급담당 부사관과 매주 연락했습니다.",
          evidence: [{ messageId: "", quote: "각 중대 보급담당 부사관들과 매주 통화했고" }],
        },
        {
          field: "collaboration",
          text: "상급부대 보급과 담당자와 청구 건마다 확인했습니다.",
          evidence: [
            { messageId: "", quote: "상급부대 보급과 담당자와는 청구할 때마다 확인했습니다." },
          ],
        },
      ],
      interpretations: [
        { text: "부서 간 정기 소통", sourceQuotes: ["각 중대 보급담당 부사관들과 매주 통화했고"] },
      ],
    },
  },

  {
    answer: "수불대장이랑 청구서 양식을 썼고, 엑셀로 품목별 잔량표를 따로 만들어서 썼습니다.",
    extraction: {
      ...none,
      reflection: "직접 만들어 쓰신 양식도 있었군요.",
      items: [
        {
          field: "tools",
          text: "수불대장과 청구서 양식을 사용했습니다.",
          evidence: [{ messageId: "", quote: "수불대장이랑 청구서 양식을 썼고" }],
        },
        {
          field: "tools",
          text: "엑셀로 품목별 잔량표를 직접 만들어 사용했습니다.",
          evidence: [{ messageId: "", quote: "엑셀로 품목별 잔량표를 따로 만들어서 썼습니다." }],
        },
      ],
    },
  },

  {
    answer:
      "분기말에 요청이 몰리면 처리 순서 잡는 게 번거로웠습니다. 그럴 때는 훈련 일정이 급한 중대부터 먼저 처리했어요.",
    extraction: {
      ...none,
      reflection: "몰릴 때 나름의 처리 순서를 두셨네요.",
      items: [
        {
          field: "difficulty",
          text: "분기말에 요청이 몰릴 때 처리 순서를 정하는 일이 번거로웠습니다.",
          evidence: [
            { messageId: "", quote: "분기말에 요청이 몰리면 처리 순서 잡는 게 번거로웠습니다." },
          ],
        },
        {
          field: "difficulty",
          text: "훈련 일정이 급한 중대부터 먼저 처리했습니다.",
          evidence: [{ messageId: "", quote: "훈련 일정이 급한 중대부터 먼저 처리했어요." }],
        },
      ],
    },
  },

  {
    answer: "따로 수치로 기록해 둔 건 없습니다. 감사 때 지적받은 적은 없었어요.",
    extraction: {
      ...none,
      reflection: "수치는 없지만 확인하신 부분은 남겨두겠습니다.",
      items: [
        {
          field: "outcomes",
          text: "미확인 — 수치로 기록해 둔 결과는 없습니다.",
          evidence: [{ messageId: "", quote: "따로 수치로 기록해 둔 건 없습니다." }],
        },
        {
          field: "outcomes",
          text: "감사에서 지적받은 적은 없었습니다.",
          evidence: [{ messageId: "", quote: "감사 때 지적받은 적은 없었어요." }],
        },
      ],
    },
  },

  /* ---------------- 보직 1의 두 번째 업무 ---------------- */
  { answer: "신병 개인 물품 불출하는 것도 했어요" },
  {
    answer:
      "신병이 들어오는 날에 맞춰 개인 물품을 미리 챙겨두고, 인솔 간부와 함께 확인하면서 나눠줬습니다.",
    extraction: {
      ...none,
      reflection: "입대 일정에 맞춰 준비하고 함께 확인하셨군요.",
      items: [
        {
          field: "duties",
          text: "신병 입소 일정에 맞춰 개인 물품을 준비했습니다.",
          evidence: [
            { messageId: "", quote: "신병이 들어오는 날에 맞춰 개인 물품을 미리 챙겨두고" },
          ],
        },
        {
          field: "actions",
          text: "인솔 간부와 함께 확인하면서 개인 물품을 나눠줬습니다.",
          evidence: [{ messageId: "", quote: "인솔 간부와 함께 확인하면서 나눠줬습니다." }],
        },
      ],
    },
  },
  // 모르면 넘어가는 모습을 보여준다. 건너눈 항목은 사실로 저장되지 않는다.
  { answer: "그건 잘 기억이 안 나요" }, // 책임 범위
  { answer: "넘어갈게요" }, // 판단 기준
  { answer: "넘어갈게요" }, // 함께 일한 대상
  { answer: "넘어갈게요" }, // 사용한 도구
  { answer: "넘어갈게요" }, // 어려웠던 점
  { answer: "넘어갈게요" }, // 결과
  { answer: "없음" }, // 이 보직에 다른 업무는 없음

  /* ---------------- 보직 2: 인사담당관 ---------------- */
  { answer: "제3군수지원사령부 인사처" },
  { answer: "인사담당관" },
  { answer: "2022년 3월 ~ 2024년 2월" },
  { answer: "전역" },
  { answer: "인사명령 처리하는 일을 했어요" },
  {
    answer:
      "상급부대에서 인사명령이 내려오면 내용을 확인해서 인사대장에 반영하고, 해당되는 부서에 전달했습니다. 명령 내용이 서로 안 맞으면 인사과에 다시 확인했어요.",
    extraction: {
      ...none,
      reflection: "명령을 받아 대장에 반영하고 전달까지 맡으셨군요.",
      items: [
        {
          field: "duties",
          text: "상급부대 인사명령을 확인해 인사대장에 반영했습니다.",
          evidence: [
            { messageId: "", quote: "인사명령이 내려오면 내용을 확인해서 인사대장에 반영하고" },
          ],
        },
        {
          field: "duties",
          text: "해당 부서에 인사명령을 전달했습니다.",
          evidence: [{ messageId: "", quote: "해당되는 부서에 전달했습니다." }],
        },
        {
          field: "judgment",
          text: "명령 내용이 서로 맞지 않으면 인사과에 다시 확인했습니다.",
          evidence: [
            { messageId: "", quote: "명령 내용이 서로 안 맞으면 인사과에 다시 확인했어요." },
          ],
        },
      ],
      interpretations: [
        {
          text: "문서 확인 및 부서 전달 절차 수행",
          sourceQuotes: ["인사명령이 내려오면 내용을 확인해서 인사대장에 반영하고"],
        },
      ],
    },
  },
  { answer: "넘어갈게요" },
  {
    answer:
      "명령을 받으면 먼저 대상자와 일자를 대조하고, 대장에 입력한 뒤 부서별로 공문을 보냈습니다.",
    extraction: {
      ...none,
      reflection: "대조부터 공문 발송까지 순서가 있으셨네요.",
      items: [
        {
          field: "actions",
          text: "명령을 받으면 대상자와 일자를 먼저 대조했습니다.",
          evidence: [{ messageId: "", quote: "먼저 대상자와 일자를 대조하고" }],
        },
        {
          field: "actions",
          text: "인사대장에 입력한 뒤 부서별로 공문을 보냈습니다.",
          evidence: [{ messageId: "", quote: "대장에 입력한 뒤 부서별로 공문을 보냈습니다." }],
        },
      ],
    },
  },
  { answer: "넘어갈게요" },
  { answer: "넘어갈게요" },
  { answer: "넘어갈게요" },
  { answer: "넘어갈게요" },
  { answer: "없음" },
  { answer: "더 없음" },
];

/**
 * 스크립트 한 턴에 해당하는 추출기.
 * evidence.messageId 는 실제 대화에 들어간 사용자 메시지 id 로 채워 넣는다.
 */
export function sampleExtractFn(turn: SampleTurn): ExtractFn {
  return async (messages) => {
    const lastUser = [...messages].reverse().find((m) => m.role === "user");
    const base = turn.extraction ?? none;
    const extraction: AiExtraction = {
      ...base,
      items: base.items.map((item) => ({
        ...item,
        evidence: item.evidence.map((ev) => ({
          ...ev,
          messageId: ev.messageId || (lastUser?.id ?? ""),
        })),
      })),
    };
    return { ok: true, extraction };
  };
}

/** 예시에서 "미확인"으로 남겨 둘 문장 */
const UNKNOWN_TEXTS = ["미확인 — 수치로 기록해 둔 결과는 없습니다."];
/** 예시에서 아직 "초안"으로 남겨 둘 문장 (확인 전 상태를 보여주기 위함) */
const DRAFT_TEXTS = ["중대별로 나눠 불출했습니다."];

/**
 * 스크립트를 실제 면담 파이프라인에 태워 상태를 만든다.
 * upTo 를 주면 그 턴까지만 진행한다. (한 단계씩 보여주는 용도)
 */
export async function buildSampleSession(upTo = SAMPLE_SCRIPT.length): Promise<SessionState> {
  let state = startInterview({ ...emptySession(), consentGiven: true });
  state = { ...state, mode: "sample" };

  const limit = Math.max(0, Math.min(upTo, SAMPLE_SCRIPT.length));
  for (let i = 0; i < limit; i += 1) {
    const turn = SAMPLE_SCRIPT[i]!;
    const result = await submitAnswer(state, turn.answer, sampleExtractFn(turn));
    state = { ...result.state, mode: "sample" };
  }

  // 끝까지 돌렸을 때만 확인 상태와 문서를 채운다.
  if (limit < SAMPLE_SCRIPT.length) return state;

  state = setService(state, { displayName: "홍길동" });

  for (const a of state.assignments) {
    for (const exp of a.experiences) {
      for (const item of exp.items) {
        if (DRAFT_TEXTS.includes(item.text)) continue;
        state = setItemStatus(state, item.id, UNKNOWN_TEXTS.includes(item.text) ? "unknown" : "confirmed");
      }
    }
  }

  state = setDocPreview(state, renderPreview(buildCareerDocument(state)));
  return { ...state, mode: "sample", phase: "document" };
}

/** 예시 대화가 몇 턴인지 */
export const SAMPLE_TURNS = SAMPLE_SCRIPT.length;
