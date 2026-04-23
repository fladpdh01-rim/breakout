import BreakoutGame from "@/components/BreakoutGame";
import { Metadata } from "next";

export const metadata: Metadata = {
  title: "INU 벽돌깨기",
  description: "인천대학교 AI코딩을 활용한 창의적 앱 개발 중간고사 과제 - 벽돌깨기 게임",
};

export default function Home() {
  return (
    <main className="min-h-screen">
      <BreakoutGame />
    </main>
  );
}
