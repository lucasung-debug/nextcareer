/**
 * 민감정보 차단
 *
 * 설계 변경 이력:
 *   이전 버전은 "부대명"을 통째로 차단했다.
 *   경력기술서에는 소속 표기가 필요하므로, 부대명은 사용자가 직접 입력하되
 *   (1) 문서 표기 방식을 사용자가 고르게 하고
 *   (2) 위치·규모·장비처럼 실제로 민감한 정보만 차단한다.
 */

export type SensitiveKind =
  | "resident_id"
  | "military_id"
  | "phone"
  | "email"
  | "address"
  | "coordinate"
  | "weapon_count"
  | "equipment_serial"
  | "security_procedure";

export type SensitiveHit = {
  kind: SensitiveKind;
  /** 사용자에게 보여줄 안내 (원문은 담지 않는다) */
  label: string;
};

const LABELS: Record<SensitiveKind, string> = {
  resident_id: "주민등록번호",
  military_id: "군번",
  phone: "전화번호",
  email: "이메일 주소",
  address: "상세 주소",
  coordinate: "위치 좌표",
  weapon_count: "총기·탄약 수량",
  equipment_serial: "장비 식별번호",
  security_procedure: "보안 절차",
};

const RESIDENT_ID = /\b\d{6}\s*[-–]\s*[1-4]\d{6}\b/;
const MILITARY_ID = /\b\d{2}-\d{5,8}\b/;
const PHONE = /\b01[016-9][-\s.]?\d{3,4}[-\s.]?\d{4}\b/;
const EMAIL = /\b[\w.+-]+@[\w-]+\.[\w.]{2,}\b/;
const ADDRESS =
  /(?:[가-힣]+(?:시|도)\s*)?[가-힣]+(?:시|군|구)\s*[가-힣0-9]+(?:읍|면|동|리|로|길)\s*\d/;
const COORDINATE = /\b\d{2,3}\.\d{3,}\s*[,/]\s*\d{2,3}\.\d{3,}\b/;

/** 총기·탄약류 + 수량 표현이 함께 나오는 경우 */
const WEAPON_WORDS = /(총기|소총|권총|기관총|탄약|실탄|공포탄|수류탄|폭발물|유탄)/;
const COUNT_NEAR = /\d+\s*(정|발|박스|상자|개|톤|kg|킬로)/;

/** 장비 일련번호로 보이는 패턴 */
const EQUIPMENT_SERIAL = /\b[A-Z]{2,}[-_]?\d{4,}\b/;

/** 보안 절차·암구호류 */
const SECURITY_WORDS =
  /(암구호|비밀번호|비밀등급|대외비|II급비밀|2급비밀|3급비밀|작전계획|작계|경계배치도|병력배치|출입통제코드)/;

export function detectSensitive(text: string): SensitiveHit[] {
  const hits: SensitiveHit[] = [];
  const push = (kind: SensitiveKind) => {
    if (!hits.some((h) => h.kind === kind)) hits.push({ kind, label: LABELS[kind] });
  };

  if (RESIDENT_ID.test(text)) push("resident_id");
  if (MILITARY_ID.test(text)) push("military_id");
  if (PHONE.test(text)) push("phone");
  if (EMAIL.test(text)) push("email");
  if (ADDRESS.test(text)) push("address");
  if (COORDINATE.test(text)) push("coordinate");
  if (WEAPON_WORDS.test(text) && COUNT_NEAR.test(text)) push("weapon_count");
  if (EQUIPMENT_SERIAL.test(text)) push("equipment_serial");
  if (SECURITY_WORDS.test(text)) push("security_procedure");

  return hits;
}

export function sensitiveMessage(hits: SensitiveHit[]): string {
  const labels = hits.map((h) => h.label).join(", ");
  return `${labels}로 보이는 내용이 있어 이 답변은 AI로 보내지 않았습니다. 해당 부분을 빼고 다시 적어 주세요. 하신 일과 역할만으로도 경력은 충분히 정리됩니다.`;
}

/* ------------------------------------------------------------------ */
/* 부대명 일반화                                                        */
/* ------------------------------------------------------------------ */

const UNIT_NOUNS = [
  "사령부",
  "사단",
  "여단",
  "연대",
  "대대",
  "중대",
  "소대",
  "비행단",
  "전대",
  "함대",
  "전단",
  "군단",
  "지원단",
  "정비창",
  "학교",
  "교육대",
  "수사대",
  "헌병대",
  "군사경찰대",
  "본부",
  "부대",
];

/**
 * 부대명을 문서용 일반 표기로 바꾼다.
 * 숫자·고유 식별자를 ○○ 로 치환하고, 부대 종류 명사는 남긴다.
 *   "제1사단 군사경찰대" -> "○○사단 군사경찰대"
 *   "수도권 소재 부대"   -> "수도권 소재 부대" (숫자가 없으면 그대로)
 */
export function generalizeUnitLabel(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";

  let out = trimmed
    .replace(/제\s*\d+/g, "○○")
    .replace(/\d+/g, "○○")
    .replace(/○○(?:\s*○○)+/g, "○○")
    .trim();

  const hasUnitNoun = UNIT_NOUNS.some((n) => out.includes(n));
  if (!hasUnitNoun) {
    // 부대 종류를 알 수 없으면 최소 표기만 남긴다.
    return out.includes("부대") ? out : "○○부대";
  }
  return out;
}
