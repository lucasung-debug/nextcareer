/**
 * 경력기술서 Word(.docx) 생성
 *
 * 브라우저에서 바로 만들고 내려받는다. 서버로 내용을 보내지 않는다.
 * (대화 내용을 저장하지 않는다는 원칙을 문서 단계에서도 유지한다)
 */

import {
  AlignmentType,
  BorderStyle,
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
  convertMillimetersToTwip,
} from "docx";

import type { CareerDocument, DocumentSection } from "./careerDocument.js";

const FONT = "맑은 고딕";
const GRAY = "595959";
const LINE = "BFBFBF";

function body(text: string, opts: { size?: number; color?: string; bold?: boolean } = {}) {
  return new TextRun({
    text,
    font: FONT,
    size: opts.size ?? 20, // 10pt
    color: opts.color,
    bold: opts.bold,
  });
}

function labelCell(text: string, width: number): TableCell {
  return new TableCell({
    width: { size: width, type: WidthType.PERCENTAGE },
    shading: { fill: "F4F4F4" },
    margins: { top: 60, bottom: 60, left: 120, right: 120 },
    children: [new Paragraph({ children: [body(text, { bold: true })] })],
  });
}

function valueCell(text: string, width: number): TableCell {
  return new TableCell({
    width: { size: width, type: WidthType.PERCENTAGE },
    margins: { top: 60, bottom: 60, left: 120, right: 120 },
    children: [new Paragraph({ children: [body(text)] })],
  });
}

function sectionHeading(text: string): Paragraph {
  return new Paragraph({
    spacing: { before: 320, after: 140 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: LINE, space: 4 } },
    children: [body(text, { bold: true, size: 22 })],
  });
}

function bullet(text: string): Paragraph {
  return new Paragraph({
    bullet: { level: 0 },
    spacing: { after: 60 },
    children: [body(text)],
  });
}

function subLabel(text: string): Paragraph {
  return new Paragraph({
    spacing: { before: 140, after: 60 },
    children: [body(text, { bold: true })],
  });
}

function summaryTable(doc: CareerDocument): Table {
  const rows: [string, string][] = [
    ["군별 / 신분", `${doc.summary.branch} / ${doc.summary.serviceType}`],
    ["복무기간", doc.summary.totalPeriod],
    ["전역(예정) 사유", doc.summary.separationReason],
  ];
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    columnWidths: [28, 72],
    rows: rows.map(
      ([k, v]) => new TableRow({ children: [labelCell(k, 28), valueCell(v, 72)] }),
    ),
  });
}

function historyTable(doc: CareerDocument): Table {
  const header = new TableRow({
    tableHeader: true,
    children: [
      labelCell("기간", 24),
      labelCell("소속", 28),
      labelCell("보직", 26),
      labelCell("이동 사유", 22),
    ],
  });
  const rows = doc.history.map(
    (r) =>
      new TableRow({
        children: [
          valueCell(r.period, 24),
          valueCell(r.unit, 28),
          valueCell(r.role, 26),
          valueCell(r.moveReason, 22),
        ],
      }),
  );
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    columnWidths: [24, 28, 26, 22],
    rows: [header, ...rows],
  });
}

function sectionBlocks(s: DocumentSection): Paragraph[] {
  const out: Paragraph[] = [
    new Paragraph({
      spacing: { before: 260, after: 40 },
      children: [body(`${s.index}. ${s.role}`, { bold: true, size: 21 })],
    }),
    new Paragraph({
      spacing: { after: 100 },
      children: [body(`${s.unit} · ${s.period}`, { size: 18, color: GRAY })],
    }),
  ];

  if (s.duties.length > 0) {
    out.push(subLabel("담당업무"));
    out.push(...s.duties.map(bullet));
  }
  if (s.work.length > 0) {
    out.push(subLabel("수행내용"));
    out.push(...s.work.map(bullet));
  }
  if (s.results.length > 0) {
    out.push(subLabel("결과"));
    out.push(...s.results.map(bullet));
  }
  if (s.unconfirmed.length > 0) {
    out.push(subLabel("미확인 (사실로 확인되지 않음)"));
    out.push(
      ...s.unconfirmed.map(
        (t) =>
          new Paragraph({
            bullet: { level: 0 },
            spacing: { after: 60 },
            children: [body(t, { color: GRAY })],
          }),
      ),
    );
  }
  if (s.interpretations.length > 0) {
    out.push(subLabel("참고 해석 (AI 해석 · 검증된 사실 아님)"));
    out.push(
      ...s.interpretations.map(
        (t) =>
          new Paragraph({
            bullet: { level: 0 },
            spacing: { after: 60 },
            children: [body(t, { color: GRAY })],
          }),
      ),
    );
  }
  return out;
}

export function createDocxDocument(doc: CareerDocument): Document {
  const children: (Paragraph | Table)[] = [
    new Paragraph({
      heading: HeadingLevel.TITLE,
      alignment: AlignmentType.CENTER,
      spacing: { after: 120 },
      children: [body(doc.title, { bold: true, size: 32 })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 280 },
      children: [body(`성명: ${doc.name || "___________"}`, { size: 20, color: GRAY })],
    }),
    sectionHeading("복무 요약"),
    summaryTable(doc),
  ];

  if (doc.history.length > 0) {
    children.push(sectionHeading("보직 이력"));
    children.push(historyTable(doc));
  }

  children.push(sectionHeading("보직별 수행 업무"));
  if (doc.sections.length === 0) {
    children.push(
      new Paragraph({
        children: [body("확인된 항목이 없습니다.", { color: GRAY })],
      }),
    );
  } else {
    for (const s of doc.sections) children.push(...sectionBlocks(s));
  }

  children.push(sectionHeading("확인 안내"));
  for (const n of doc.notices) {
    children.push(
      new Paragraph({
        spacing: { after: 60 },
        children: [body(n, { size: 18, color: GRAY })],
      }),
    );
  }

  return new Document({
    styles: {
      default: {
        document: { run: { font: FONT, size: 20 } },
      },
    },
    sections: [
      {
        properties: {
          page: {
            size: {
              width: convertMillimetersToTwip(210),
              height: convertMillimetersToTwip(297),
            },
            margin: {
              top: convertMillimetersToTwip(20),
              right: convertMillimetersToTwip(20),
              bottom: convertMillimetersToTwip(20),
              left: convertMillimetersToTwip(20),
            },
          },
        },
        children,
      },
    ],
  });
}

/** 브라우저: 내려받기용 Blob */
export function buildDocxBlob(doc: CareerDocument): Promise<Blob> {
  return Packer.toBlob(createDocxDocument(doc));
}

/** Node: 테스트용 버퍼 */
export function buildDocxBuffer(doc: CareerDocument): Promise<Buffer> {
  return Packer.toBuffer(createDocxDocument(doc));
}

/** 파일명: 경력기술서_홍길동_20260916.docx */
export function docxFileName(name: string, now = new Date()): string {
  const stamp = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
  ].join("");
  const safe = name.trim().replace(/[\\/:*?"<>|\s]+/g, "_");
  return safe ? `경력기술서_${safe}_${stamp}.docx` : `경력기술서_${stamp}.docx`;
}
