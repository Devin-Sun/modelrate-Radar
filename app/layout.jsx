import "../src/styles.css";

export const metadata = {
  title: "ModelRate Radar — 全球 AI 订阅价格",
  description: "对比 OpenAI 与 Anthropic Claude 的全球订阅价格。"
};

export default function RootLayout({ children }) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
