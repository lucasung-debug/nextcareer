import { describe, expect, it, beforeEach } from "vitest";

import {
  addAssignment,
  addExperience,
  editItem,
  emptySession,
  removeItem,
  setItemStatus,
  updateAssignment,
  __resetIdCounter,
} from "./session.js";
import {
  buildJobBridge,
  jobBridgeAvailable,
  wantedSearchUrl,
  WANTED_ORIGIN,
  JOB_BRIDGE_CAVEAT,
} from "./jobBridge.js";
import type { CardItem, FieldKey, ItemStatus, SessionState } from "./types.js";

beforeEach(() => __resetIdCounter());

function addItem(state: SessionState, text: string, status: ItemStatus, field: FieldKey = "duties"): SessionState {
  const expId = state.activeExperienceId;
  if (!expId) throw new Error("no experience");
  const item: CardItem = {
    id: `item_${text.length}_${Math.random().toString(36).slice(2, 8)}`,
    experienceId: expId,
    field,
    text,
    evidence: [],
    status,
    userAuthored: true,
  };
  return {
    ...state,
    assignments: state.assignments.map((a) => ({
      ...a,
      experiences: a.experiences.map((e) =>
        e.id === expId ? { ...e, items: [...e.items, item] } : e,
      ),
    })),
  };
}

function allItems(state: SessionState): CardItem[] {
  return state.assignments.flatMap((a) => a.experiences.flatMap((e) => e.items));
}

function sampleState(): SessionState {
  let s = emptySession();
  s = addAssignment(s, "제7군수대대");
  s = updateAssignment(s, s.activeAssignmentId!, { role: "보급관" });
  s = addExperience(s, s.activeAssignmentId!, "보급품 수불 관리");
  return s;
}

/** URL에 나갈 수 있는 통제된 민간 검색어 전체 목록 (원티드에서 실제로 흔한 직무명) */
const CIVILIAN_KEYWORDS = [
  "물류",
  "재고관리",
  "인사",
  "HR",
  "총무",
  "사무",
  "고객상담",
  "상담",
  "정비",
  "시설관리",
  "경비",
  "보안",
];

describe("원티드 직군 연결", () => {
  it("확인된 재고·창고 문장은 물류·무역으로 연다", () => {
    let s = sampleState();
    s = addItem(s, "매일 아침 창고 재고를 확인하고 부족한 물품을 상급부대에 청구했습니다.", "confirmed");
    const result = buildJobBridge(s);
    expect(result.families.map((f) => f.id)).toEqual(["logistics"]);
    expect(result.families[0]?.listUrl).toBe("https://www.wanted.co.kr/wdlist/532");
    // 검색어는 통제된 민간 키워드만 나간다. 원티드 실측상 흔한 직무명 한 단어가 가장 잘 맞는다.
    expect(result.families[0]?.keywords).toEqual(["물류", "재고관리"]);
    expect(result.families[0]?.searchUrl).toBe(wantedSearchUrl("물류"));
    expect(result.families[0]?.reasons.some((r) => r.quote.includes("창고 재고"))).toBe(true);
  });

  it("미확인·초안 문장은 직군을 열지 않는다", () => {
    let s = sampleState();
    s = updateAssignment(s, s.activeAssignmentId!, { role: "" });
    s = addItem(s, "창고 재고를 확인했습니다.", "unknown");
    s = addItem(s, "불출 대장을 정리했습니다.", "draft");
    const result = buildJobBridge(s);
    expect(result.families).toHaveLength(0);
  });

  it("보직명·경험 제목만으로는 직군을 열지 않는다", () => {
    let s = sampleState(); // role: 보급관, title: 보급품 수불 관리
    s = addItem(s, "매주 금요일 사무실 청소를 담당했습니다.", "confirmed");
    const result = buildJobBridge(s);
    expect(result.families).toHaveLength(0);
    // 확인된 사실은 있으므로 연결 기능 자체는 사용 가능하다.
    expect(jobBridgeAvailable(s)).toBe(true);
  });

  it("부정 문장은 직군을 열지 않는다", () => {
    let s = sampleState();
    s = addItem(s, "재고 관리는 하지 않았습니다.", "confirmed");
    s = addItem(s, "인사과에 전달만 했고 인사 업무는 담당하지 않았습니다.", "confirmed");
    const result = buildJobBridge(s);
    expect(result.families).toHaveLength(0);
  });

  it("부정 절이 섞인 문장은 겹치는 토큰도 근거로 인정하지 않는다", () => {
    let s = sampleState();
    s = addItem(s, "부족한 물품을 상급부대에 전달만 했고 창고 재고 관리는 하지 않았습니다.", "confirmed");
    const result = buildJobBridge(s);
    expect(result.families).toHaveLength(0);
  });

  it("넓은 단어('안내','점검','청구','인사') 하나만으로는 직군을 열지 않는다", () => {
    for (const text of [
      "안내 책자를 정리했습니다.",
      "점검 일정을 받았습니다.",
      "청구서를 정리했습니다.",
      "인사에 대해 배웠습니다.",
    ]) {
      let s = emptySession();
      s = addAssignment(s, "어느 부대");
      s = addExperience(s, s.activeAssignmentId!, "기타 업무");
      s = addItem(s, text, "confirmed");
      expect(buildJobBridge(s).families).toHaveLength(0);
    }
  });

  it("확인 항목이 없으면 연결할 직군이 없다", () => {
    const s = emptySession();
    expect(jobBridgeAvailable(s)).toBe(false);
    expect(buildJobBridge(s).families).toHaveLength(0);
    expect(buildJobBridge(s).catalogUrl).toBe("https://www.wanted.co.kr/wdlist");
  });

  it("검색어는 통제된 민간 키워드만 나가고 인용문·부대·군 직무명은 나가지 않는다", () => {
    let s = sampleState();
    s = addItem(s, "창고 재고를 확인했습니다.", "confirmed");
    const result = buildJobBridge(s);
    for (const family of result.families) {
      for (const keyword of family.keywords) {
        expect(CIVILIAN_KEYWORDS).toContain(keyword);
      }
      const query = new URL(family.searchUrl).searchParams.get("query") ?? "";
      expect(CIVILIAN_KEYWORDS).toContain(query);
      expect(query).not.toContain("창고");
      expect(query).not.toContain("불출");
      expect(family.searchUrl).not.toContain(encodeURIComponent("제7군수대대"));
      expect(family.searchUrl).not.toContain(encodeURIComponent("보급관"));
      expect(family.searchUrl).not.toContain(encodeURIComponent("창고 재고를 확인했습니다."));
    }
  });

  it("모든 URL은 원티드 도메인으로만 만든다", () => {
    let s = sampleState();
    s = addItem(s, "창고 재고를 확인했습니다.", "confirmed");
    s = addItem(s, "인사과 서류를 정리했습니다.", "confirmed");
    const result = buildJobBridge(s);
    expect(result.catalogUrl).toBe(`${WANTED_ORIGIN}/wdlist`);
    for (const family of result.families) {
      expect(family.listUrl.startsWith(`${WANTED_ORIGIN}/`)).toBe(true);
      expect(family.searchUrl.startsWith(`${WANTED_ORIGIN}/search?query=`)).toBe(true);
      expect(family.searchUrl.endsWith("&tab=position")).toBe(true);
    }
    const logistics = result.families.find((f) => f.id === "logistics");
    // 실측된 직군 경로만 사용한다.
    expect(logistics?.listUrl).toBe(`${WANTED_ORIGIN}/wdlist/532`);
  });

  it("wantedSearchUrl 은 안전하게 인코딩한다", () => {
    const url = wantedSearchUrl("물류 운영 / 재고");
    expect(url).toBe(
      `${WANTED_ORIGIN}/search?query=${encodeURIComponent("물류 운영 / 재고")}&tab=position`,
    );
    expect(new URL(url).searchParams.get("query")).toBe("물류 운영 / 재고");
    expect(url).not.toContain(" ");
  });

  it("삭제·상태 변경·수정 시 직군 연결을 다시 계산한다", () => {
    let s = sampleState();
    s = addItem(s, "창고 재고를 확인했습니다.", "confirmed");
    expect(buildJobBridge(s).families.map((f) => f.id)).toEqual(["logistics"]);

    // unknown 으로 바꾸면 사라진다.
    const itemId = allItems(s)[0]!.id;
    s = setItemStatus(s, itemId, "unknown");
    expect(buildJobBridge(s).families).toHaveLength(0);

    // 다시 confirmed 면 돌아온다.
    s = setItemStatus(s, itemId, "confirmed");
    expect(buildJobBridge(s).families.map((f) => f.id)).toEqual(["logistics"]);

    // 삭제하면 사라진다.
    s = removeItem(s, itemId);
    expect(buildJobBridge(s).families).toHaveLength(0);

    // 문장을 고치면 새 문장 기준으로 다시 계산된다.
    s = addItem(s, "창고 재고를 확인했습니다.", "confirmed");
    const secondId = allItems(s)[0]!.id;
    s = editItem(s, secondId, "부대 행사 사진 촬영을 도왔습니다.");
    expect(buildJobBridge(s).families).toHaveLength(0);
  });

  it("입력 상태를 변경하지 않는다", () => {
    let s = sampleState();
    s = addItem(s, "창고 재고를 확인했습니다.", "confirmed");
    const before = JSON.parse(JSON.stringify(s));
    buildJobBridge(s);
    jobBridgeAvailable(s);
    expect(JSON.parse(JSON.stringify(s))).toEqual(before);
  });

  it("같은 문장에서 같은 토큰은 한 번만 근거로 삼고, 순서가 안정적이다", () => {
    let s = sampleState();
    s = addItem(s, "창고 재고를 확인했습니다.", "confirmed");
    s = addItem(s, "창고 재고를 확인했습니다.", "confirmed"); // 동일 문장 복제
    const result = buildJobBridge(s);
    const reasons = result.families[0]?.reasons ?? [];
    expect(reasons.map((r) => r.token)).toEqual(["창고", "재고"]);
    // 두 번 빌드해도 결과가 동일하다.
    expect(buildJobBridge(s)).toEqual(result);
  });

  it("근거에 항목 id·슬롯·원문 인용을 담는다", () => {
    let s = sampleState();
    s = addItem(s, "창고 재고를 확인했습니다.", "confirmed", "actions");
    const result = buildJobBridge(s);
    const item = allItems(s)[0]!;
    for (const r of result.families[0]?.reasons ?? []) {
      expect(r.source).toBe("item");
      expect(r.itemId).toBe(item.id);
      expect(r.field).toBe("actions");
      expect(r.quote).toBe("창고 재고를 확인했습니다.");
    }
  });

  it("직군 제안은 탐색용임을 명시하고 적합도 점수를 두지 않는다", () => {
    let s = sampleState();
    s = addItem(s, "창고 재고를 확인했습니다.", "confirmed");
    const result = buildJobBridge(s);
    const family = result.families[0]!;
    expect(family.caveat).toBe(JOB_BRIDGE_CAVEAT);
    expect(family.caveat).toContain("적합도");
    expect(family.caveat).toContain("탐색용");
    expect(family.description?.length ?? 0).toBeGreaterThan(0);
    expect("confidence" in family).toBe(false);
    expect("fitScore" in family).toBe(false);
    expect("seniority" in family).toBe(false);
  });

  it("인사명령이 확인되면 인사 계열을 제안한다", () => {
    let s = emptySession();
    s = addAssignment(s, "인사처");
    s = updateAssignment(s, s.activeAssignmentId!, { role: "인사담당관" });
    s = addExperience(s, s.activeAssignmentId!, "인사명령 처리");
    s = addItem(s, "상급부대 인사명령을 확인해 인사대장에 반영했습니다.", "confirmed");
    const result = buildJobBridge(s);
    expect(result.families[0]?.id).toBe("hr");
    expect(result.families[0]?.keywords).toEqual(["인사", "HR"]);
    expect(result.families[0]?.searchUrl).toBe(wantedSearchUrl("인사"));
    expect(result.families[0]?.searchUrl).toContain("tab=position");
  });

  it("검색 URL에 직급 환산 단어를 넣지 않는다", () => {
    let s = sampleState();
    s = addItem(s, "창고 재고를 확인했습니다.", "confirmed");
    const url = buildJobBridge(s).families[0]?.searchUrl ?? "";
    expect(url).not.toContain("과장");
    expect(url).not.toContain("총괄");
    expect(url).not.toContain("매니저");
  });
});
