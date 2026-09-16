import {
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from "react";

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
  const authored = item.userAuthored;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        title={`근거 ${index} 보기`}
        className="inline-flex min-h-[28px] min-w-[28px] items-center justify-center rounded border border-line px-2 align-middle text-[11px] font-medium text-evidence hover:bg-evidence-soft"
      >
        [{index}]
      </button>

      <Modal open={open} title={`근거 ${index}`} onClose={() => setOpen(false)}>
        <p className="mb-1.5 text-[11px] font-semibold tracking-wide text-muted">
          {authored ? "직접 입력하신 내용" : "말씀하신 내용"}
        </p>
        {authored ? (
          <p className="text-[13px] leading-relaxed">
            이 항목은 직접 수정하셨습니다. 본인 진술이 근거입니다.
          </p>
        ) : (
          <ul className="space-y-2">
            {item.evidence.map((ev, i) => (
              <li
                key={`${ev.messageId}-${i}`}
                className="border-l-2 border-evidence pl-2 text-[13px] leading-relaxed"
              >
                “{ev.quote}”
              </li>
            ))}
          </ul>
        )}
      </Modal>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* 모달                                                                 */
/* ------------------------------------------------------------------ */

function getFocusable(root: HTMLElement): HTMLElement[] {
  return Array.from(
    root.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ),
  ).filter((el) => el.getClientRects().length > 0);
}

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
  const headingId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const prevFocusRef = useRef<HTMLElement | null>(null);

  /* 열림/닫힘 상태 전환: 배경 inert, 초기 포커스, 포커스 복귀 */
  useEffect(() => {
    if (!open) return;
    prevFocusRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;

    /* 배경(inert): 루트 아래 형제 브랜치를 막아 모달 밖 탐색을 차단한다 */
    const inerted: Array<{ el: HTMLElement; prev: boolean }> = [];
    const dialog = dialogRef.current;
    if (dialog) {
      let top: HTMLElement = dialog;
      while (top.parentElement && top.parentElement !== document.body) {
        top = top.parentElement;
      }
      const root = top.parentElement;
      if (root) {
        for (const node of Array.from(root.children)) {
          if (node instanceof HTMLElement && node !== top) {
            inerted.push({ el: node, prev: node.inert });
            node.inert = true;
          }
        }
      }
    }

    dialogRef.current?.focus();

    return () => {
      for (const { el, prev } of inerted) el.inert = prev;
      const prev = prevFocusRef.current;
      if (prev && prev.isConnected) prev.focus();
      prevFocusRef.current = null;
    };
  }, [open]);

  /* 배경 스크롤 잠금: 닫힐 때 이전 값으로 정확히 복원 */
  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [open]);

  const onOverlayKeyDown = (e: ReactKeyboardEvent) => {
    if (e.key === "Escape") {
      e.stopPropagation();
      onClose();
      return;
    }
    if (e.key !== "Tab") return;
    const dialog = dialogRef.current;
    if (!dialog) return;
    const focusables = getFocusable(dialog);
    if (focusables.length === 0) {
      e.preventDefault();
      dialog.focus();
      return;
    }
    const first = focusables[0]!;
    const last = focusables[focusables.length - 1]!;
    const active = document.activeElement;
    const inside = active instanceof HTMLElement && dialog.contains(active);
    if (e.shiftKey) {
      if (!inside || active === first) {
        e.preventDefault();
        last.focus();
      }
    } else if (!inside || active === last) {
      e.preventDefault();
      first.focus();
    }
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 p-4"
      onKeyDown={onOverlayKeyDown}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={headingId}
        tabIndex={-1}
        className="max-h-[85vh] w-full max-w-[520px] overflow-auto rounded-[12px] border border-line bg-white p-5 shadow-xl outline-none sm:p-6"
      >
        <h2 id={headingId} className="mb-3 text-[17px] font-semibold">
          {title}
        </h2>
        <div className="chat-text">{children}</div>
        <div className="mt-5 flex justify-end gap-2">
          {footer ?? (
            <button
              type="button"
              className="btn-primary tap min-h-[44px] min-w-[72px]"
              onClick={onClose}
            >
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
