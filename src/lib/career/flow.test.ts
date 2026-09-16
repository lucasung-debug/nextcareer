import { describe, expect, it } from "vitest";

import {
  FABRICATION_REPLY,
  isFabricationRequest,
  isNoMoreAnswer,
  isSkipAnswer,
  parseBranch,
  parseServiceType,
  toExperienceTitle,
} from "./answers.js";
import { buildRequestBody, buildUserPrompt, parseExtraction, trimMessages } from "./extraction.js";
import type { ChatMessage } from "./types.js";

describe("답변 해석", () => {
  it("건너뛰기를 알아본다", () => {
    for (const t of ["기억이 잘 안 나요", "모르겠어요", "넘어갈게요", "패스", "없어요"]) {
      expect(isSkipAnswer(t)).toBe(true);
    }
    expect(isSkipAnswer("근무표를 확인했어요")).toBe(false);
  });

  it("더 없음 선택을 알아본다", () => {
    expect(isNoMoreAnswer("없음")).toBe(true);
    expect(isNoMoreAnswer("더 없음")).toBe(true);
    expect(isNoMoreAnswer("인사업무도 했어요")).toBe(false);
  });

  it("지어내 달라는 요청을 가려낸다", () => {
    expect(isFabricationRequest("성과를 좀 그럴듯하게 써 주세요")).toBe(true);
    expect(isFabricationRequest("없는 경험도 넣어줘")).toBe(true);
    expect(isFabricationRequest("근무표 업무를 정리해 주세요")).toBe(false);
    expect(FABRICATION_REPLY).toContain("만들어 드리지는 못합니다");
  });

  it("군별과 신분을 읽는다", () => {
    expect(parseBranch("육군이요")).toBe("육군");
    expect(parseBranch("해병대")).toBe("해병대");
    expect(parseBranch("잘 모르겠어요")).toBeNull();
    expect(parseServiceType("중사로 복무했습니다")).toBe("부사관");
    expect(parseServiceType("대위 전역입니다")).toBe("장교");
    expect(parseServiceType("준위")).toBe("준사관");
  });

  it("경험 제목을 사용자 표현 그대로 줄인다", () => {
    expect(toExperienceTitle("근무표 확인하고 일정 조정하는 일을 했어요")).toBe(
      "근무표 확인하고 일정 조정",
    );
    expect(toExperienceTitle("인사명령 처리")).toBe("인사명령 처리");
  });

  it("부사가 끼어있어도 제목을 깔끔하게 자른다", () => {
    // 실제 면담에서 나온 입력. 이전에는 "보급품 수불 관리하는 일을 주로" 로 잘렸다.
    expect(toExperienceTitle("보급품 수불 관리하는 일을 주로 했어요")).toBe("보급품 수불 관리");
    expect(toExperienceTitle("문서 수신발을 담당했습니다")).toBe("문서 수신발");
    expect(toExperienceTitle("차량 정비를 자주 했어요")).toBe("차량 정비");
    // "~하는 것도 했어요" 처럼 조사 도 가 붙는 경우
    expect(toExperienceTitle("신병 들어오면 개인 물품 불출하는 것도 했어요")).toBe(
      "신병 들어오면 개인 물품 불출",
    );
  });
});

const messages: ChatMessage[] = [
  { id: "a1", role: "assistant", text: "어떤 일을 하셨나요?" },
  { id: "u1", role: "user", text: "근무표를 확인했어요." },
];

describe("AI 추출 계약", () => {
  it("프롬프트에 대화와 슬롯 안내가 들어간다", () => {
    const prompt = buildUserPrompt(messages, {
      field: "actions",
      experienceTitle: "근무 일정 운영",
      role: "군사경찰 수사관",
    });
    expect(prompt).toContain("군사경찰 수사관");
    expect(prompt).toContain("근무 일정 운영");
    expect(prompt).toContain("사용자 id=u1");
    expect(prompt).toContain("직접 한 행동과 순서");
  });

  it("최근 메시지만 보낸다", () => {
    const many: ChatMessage[] = Array.from({ length: 40 }, (_, i) => ({
      id: `u${i}`,
      role: "user",
      text: `답변 ${i}`,
    }));
    expect(trimMessages(many)).toHaveLength(24);
    expect(trimMessages(many)[0]?.id).toBe("u16");
  });

  it("요청 본문이 JSON 스키마를 강제한다", () => {
    const body = buildRequestBody(messages, {
      field: "duties",
      experienceTitle: "",
      role: "",
    }) as Record<string, any>;
    expect(body["text"].format.strict).toBe(true);
    expect(body["text"].format.schema.required).toContain("items");
    expect(body["stream"]).toBe(true);
  });

  it("잘못된 응답은 null 로 처리한다", () => {
    expect(parseExtraction("설명을 덧붙인 텍스트")).toBeNull();
    expect(parseExtraction("")).toBeNull();
  });

  it("빠진 필드는 기본값으로 채운다", () => {
    const parsed = parseExtraction(JSON.stringify({ reflection: "네, 알겠습니다." }));
    expect(parsed).toMatchObject({ reflection: "네, 알겠습니다.", items: [], skipped: false });
  });
});
