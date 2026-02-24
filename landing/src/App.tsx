import { Footer } from "./components/Footer";
import { Features } from "./components/Features";
import { Hero } from "./components/Hero";
import { HowItWorks } from "./components/HowItWorks";
import { LangSwitcher } from "./components/LangSwitcher";

export default function App() {
  return (
    <div className="min-h-screen flex flex-col">
      <header className="sticky top-0 z-10 flex justify-end border-b border-neutral-200 bg-white/95 px-6 py-4 backdrop-blur">
        <LangSwitcher />
      </header>
      <main className="flex-1">
        <Hero />
        <Features />
        <HowItWorks />
      </main>
      <Footer />
    </div>
  );
}
