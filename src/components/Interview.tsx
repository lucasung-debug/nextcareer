import { useEffect, useRef, useState } from "react";

import type { QuestionPlan } from "../lib/career/planner.js";
import type { ChatMessage } from "../lib/career/types.js";
import { Notice } from "./bits.js";

const PHASE_LABEL: Record<string, string> = {
  service: "복무 기본정보",
  assignment: "보직 정보",
  experience_pick: "업무 고르기",
  deep_dive: "자세히 여쭤보기",
  review: "확인",
  document: "경력기술서",
};

export function Interview({
  messages,
  plan,
  busy,
  notice,
  onSubmit,
  onSkip,
}: {
  messages: ChatMessage[];
  plan: QuestionPlan | null;
  busy: boolean;
  notice: string | null;
  onSubmit: (text: string) => void;
  onSkip: () => void;
}) {
  const [draft, setDraft] = useState("");
  const [composing, setComposing] = useState(false);
  const logRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: "smooth" });
  }, [messages.length, busy]);

  useEffect(() => {
    if (!busy) inputRef.current?.focus();
  }, [busy, plan?.question]);

  const send = (value: string) => {
    const text = value.trim();
    if (!text || busy) return;
    setDraft("");
    onSubmit(text);
  };

  return (
    <section className="surface flex h-full min-h-0 flex-col" aria-label="면담">
      {/* 진행 상태 */}
      <header className="flex items-center justify-between border-b border-[#e5e7eb] px-5 py-3">
        <h2 className="text-[13.5px] font-semibold">
          {plan ? PHASE_LABEL[plan.phase] ?? "면담" : "정리 완료"}
        </h2>
        <span className="meta-text">한 번에 하나씩 여쭤봅니다</span>
      </header>

      {/* 대화 로그 */}
      <div ref={logRef} className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
        {messages.length === 0 && (
          <p className="chat-text readable text-[#5c6270]">
            잘 정리해서 말하지 않으셔도 괜찮습니다. 실제로 하신 일을 하나씩 여쭤보겠습니다.
          </p>
        )}

        {messages.map((m) => (
          <div key={m.id} className={m.role === "user" ? "flex justify-end" : ""}>
            <div
              className={
                m.role === "user"
                  ? "chat-text readable max-w-[85%] rounded-[12px] rounded-br-[4px] bg-[#101010] px-4 py-2.5 text-white"
                  : "chat-text readable max-w-[92%] rounded-[12px] rounded-bl-[4px] bg-[#f4f4f4] px-4 py-2.5 text-[#242424]"
              }
            >
              {m.text}
            </div>
          </div>
        ))}

        {busy && (
          <div className="chat-text flex items-center gap-2 text-[#5c6270]">
            <span className="inline-flex gap-1" aria-hidden="true">
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-[#5c6270] [animation-delay:-0.2s]" />
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-[#5c6270] [animation-delay:-0.1s]" />
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-[#5c6270]" />
            </span>
            말씀하신 내용을 정리하고 있습니다
          </div>
        )}
      </div>

      {/* 입력 영역 */}
      <div className="space-y-3 border-t border-[#e5e7eb] px-5 py-4">
        {notice && <Notice text={notice} tone="warn" />}

        {plan?.hint && <p className="meta-text readable">{plan.hint}</p>}

        {plan?.choices && plan.choices.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {plan.choices.map((c) => (
              <button
                key={c}
                type="button"
                className="btn-quiet tap"
                disabled={busy}
                onClick={() => send(c)}
              >
                {c}
              </button>
            ))}
          </div>
        )}

        {plan ? (
          <>
            <label htmlFor="answer" className="sr-only">
              답변 입력
            </label>
            <textarea
              id="answer"
              ref={inputRef}
              rows={3}
              value={draft}
              disabled={busy}
              placeholder="편하게 말씀해 주세요"
              onChange={(e) => setDraft(e.target.value)}
              onCompositionStart={() => setComposing(true)}
              onCompositionEnd={() => setComposing(false)}
              onKeyDown={(e) => {
                // 한글 입력 중(IME 조합 중) Enter 는 글자 확정이므로 전송하지 않는다.
                if (e.key === "Enter" && !e.shiftKey && !composing && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  send(draft);
                }
              }}
              className="w-full resize-none rounded-[10px] border border-[#e5e7eb] bg-white px-3.5 py-2.5 text-[15px] leading-relaxed outline-none placeholder:text-[#9aa0ab] focus:border-[#101010] disabled:bg-[#fafafa]"
            />
            <div className="flex items-center justify-between gap-3">
              <span className="meta-text">Enter 전송 · Shift+Enter 줄바꿈 · 대화는 저장되지 않습니다</span>
              <div className="flex gap-2">
                {plan.skippable && (
                  <button type="button" className="btn-quiet tap" disabled={busy} onClick={onSkip}>
                    건너뛰기
                  </button>
                )}
                <button
                  type="button"
                  className="btn-primary tap"
                  disabled={busy || !draft.trim()}
                  onClick={() => send(draft)}
                >
                  보내기
                </button>
              </div>
            </div>
          </>
        ) : (
          <Notice text="여쭤볼 내용이 끝났습니다. 오른쪽에서 확인하시고 경력기술서를 내려받으세요." />
        )}
      </div>
    </section>
  );
}
