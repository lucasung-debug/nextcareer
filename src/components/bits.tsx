import { useEffect, useId, useRef, useState, type ReactNode } from "react";

import type { CardItem, ItemStatus } from "../lib/career/types.js";

/* ------------------------------------------------------------------ */
/* 상태 배지                                                            */
/* 색만으로 구분하지 않는다. 항상 기호 + 글자를 함께 쓴다.                */
/* ------------------------------------------------------------------ */

const STATUS_META: Record<ItemStatus, { mark: string; label: string; cls: string }> = {
  confirmed: { mark: "✓", label: "본인 확인", cls: "border-[#101010] text-[#101010] bg-white" },
  unknown: { mark: "?", label: "미확인", cls: "border-[#d4d4d8] text-[#5c6270] bg-[#fafafa]" },
  draft: { mark: "•", label: "초안", cls: "border-dashed border-[#d4d4d8] text-[#5c6270] bg-white" },
};

export function StatusBadge({ status }: { status: ItemStatus }) {
  const meta = STATUS_META[status];
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-[3px] text-[11.5px] font-medium ${meta.cls}`}
    >
      <span aria-hidden="true">{meta.mark}</span>
      {meta.label}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* 근거 칩                                                              */
/* ------------------------------------------------------------------ */

export function EvidenceChip({ item, index }: { item: CardItem; index: number }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const panelId = useId();

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const authored = item.userAuthored;

  return (
    <div className="relative inline-block" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={panelId}
        className="rounded border border-[#e5e7eb] px-1.5 py-[1px] align-middle text-[11px] font-medium text-[#1d4ed8] hover:bg-[#eef2ff]"
        title="이 문장의 근거 보기"
      >
        [{index}]
      </button>

      {open && (
        <div
          id={panelId}
          role="dialog"
          aria-label={`근거 ${index}`}
          className="absolute left-0 top-[calc(100%+6px)] z-30 w-[290px] rounded-[10px] border border-[#e5e7eb] bg-white p-3 shadow-lg"
        >
          <p className="mb-1.5 text-[11px] font-semibold tracking-wide text-[#5c6270]">
            {authored ? "직접 입력하신 내용" : "말씀하신 내용"}
          </p>
          {authored ? (
            <p className="text-[13px] leading-relaxed text-[#242424]">
              이 항목은 직접 수정하셨습니다. 본인 진술이 근거입니다.
            </p>
          ) : (
            <ul className="space-y-2">
              {item.evidence.map((ev, i) => (
                <li
                  key={`${ev.messageId}-${i}`}
                  className="border-l-2 border-[#1d4ed8] pl-2 text-[13px] leading-relaxed text-[#242424]"
                >
                  “{ev.quote}”
                </li>
              ))}
            </ul>
          )}
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="mt-2.5 text-[11.5px] text-[#5c6270] underline underline-offset-2"
          >
            닫기
          </button>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 모달                                                                 */
/* ------------------------------------------------------------------ */

export function Modal({
  open,
  title,
  children,
  onClose,
  footer,
}: {
  open: boolean;
  title: string;
  children: ReactNode;
  onClose: () => void;
  footer?: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="max-h-[85vh] w-full max-w-[520px] overflow-auto rounded-[12px] border border-[#e5e7eb] bg-white p-6 shadow-xl"
      >
        <h2 className="mb-3 text-[17px] font-semibold">{title}</h2>
        <div className="chat-text text-[#242424]">{children}</div>
        <div className="mt-5 flex justify-end gap-2">
          {footer ?? (
            <button type="button" className="btn-primary tap" onClick={onClose}>
              닫기
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 안내 줄                                                              */
/* ------------------------------------------------------------------ */

export function Notice({ text, tone = "info" }: { text: string; tone?: "info" | "warn" }) {
  return (
    <div
      role="status"
      className={`rounded-[10px] border px-3 py-2.5 text-[13px] leading-relaxed ${
        tone === "warn"
          ? "border-[#101010] bg-[#fafafa] text-[#242424]"
          : "border-[#e5e7eb] bg-white text-[#5c6270]"
      }`}
    >
      {tone === "warn" && <span className="mr-1 font-semibold">알림</span>}
      {text}
    </div>
  );
}
