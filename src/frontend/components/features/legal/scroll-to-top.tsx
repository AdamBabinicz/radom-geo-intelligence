"use client";

import { useEffect, useState } from "react";
import { ArrowUp } from "lucide-react";

export function ScrollToTop({ label }: { label: string }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const onScroll = () => setVisible(window.scrollY > 300);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  if (!visible) return null;

  return (
    <button
      type="button"
      onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
      aria-label={label}
      className="fixed bottom-5 right-5 z-30 grid size-10 place-items-center rounded-full border border-slate-200 bg-white/95 text-slate-700 shadow-lg backdrop-blur-sm transition hover:bg-teal-700 hover:text-white dark:border-slate-700 dark:bg-slate-900/95 dark:text-slate-200 dark:hover:bg-teal-700"
    >
      <ArrowUp size={17} />
    </button>
  );
}
