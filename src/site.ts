/** Public site identity only. Never place a user session or deployment secret here. */
export const SITE = {
  name: "다음경력",
  alternateName: "NextCareer",
  url: "https://nextcareer-five.vercel.app/",
  title: "다음경력 | 전역 간부를 위한 경력기술서",
  description: "다음경력은 전역 간부의 일상 업무를 대화로 정리하고, 본인이 확인한 근거를 Word 경력기술서와 원티드 직군 탐색으로 연결하는 웹 서비스입니다.",
  image: "https://nextcareer-five.vercel.app/og-image.png",
  imageAlt: "다음경력: 군 경험을 확인된 근거로 정리하는 경력기술서 도우미",
  source: "https://github.com/lucasung-debug/nextcareer",
} as const;

export const PUBLIC_FAQ = [
  {
    question: "다음경력은 어떤 서비스인가요?",
    answer: SITE.description,
  },
  {
    question: "설치나 회원가입, API 키가 필요한가요?",
    answer: "설치나 회원가입, 개인 API 키 없이 브라우저에서 이용합니다. ‘가상 사례 먼저 보기’는 실제 인물의 정보나 AI 요청 없이 면담, 근거 확인, Word 생성, 채용 탐색 흐름을 보여줍니다.",
  },
  {
    question: "특별한 성과나 정확한 수치가 없어도 되나요?",
    answer: "매일 반복해서 한 일부터 이야기하면 됩니다. 말씀하지 않은 수치나 성과는 만들지 않고, 확인되지 않은 내용은 미확인으로 남깁니다. 원문과 직접 대조한 내용만 경력기술서의 사실 항목에 넣습니다.",
  },
  {
    question: "대화와 개인정보는 어떻게 다루나요?",
    answer: "대화는 브라우저 메모리에만 유지되며 이 서비스의 데이터베이스에 저장하지 않습니다. 면담 답변은 사실 추출을 위해 서버를 거쳐 유료 Gemini API로 전송됩니다. 감지된 민감정보는 전송을 차단합니다. Word 파일은 브라우저에서 만들며, 새로고침이나 창 닫기 전에 내려받아야 합니다.",
  },
  {
    question: "채용 공고를 추천하거나 합격 가능성을 판단하나요?",
    answer: "본인이 확인한 업무와 겹치는 직군, 그 이유, 원티드 검색 링크만 제공합니다. 공고를 수집하거나 저장하지 않고 직무 적합도·직급·합격 가능성을 판단하지 않습니다. 검색 링크에는 정해진 일반 업무 키워드만 넣으며 대화 원문·이름·부대명은 넣지 않습니다.",
  },
] as const;

export const SITE_SCHEMA = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebSite",
      "@id": `${SITE.url}#website`,
      name: SITE.name,
      alternateName: SITE.alternateName,
      url: SITE.url,
      inLanguage: "ko",
    },
    {
      "@type": "WebApplication",
      "@id": `${SITE.url}#application`,
      name: SITE.name,
      alternateName: SITE.alternateName,
      url: SITE.url,
      description: SITE.description,
      applicationCategory: "BusinessApplication",
      operatingSystem: "Web",
      browserRequirements: "Requires JavaScript and a modern web browser",
      inLanguage: "ko",
      image: SITE.image,
      isPartOf: { "@id": `${SITE.url}#website` },
      featureList: ["대화형 군 경력 정리", "원문 근거와 본인 확인", "Word 경력기술서 생성", "확인한 업무에 따른 원티드 검색 링크"],
    },
  ],
} as const;
