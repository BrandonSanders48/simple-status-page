"use client";

import { useState } from "react";

export default function DarkModeToggle({ initialDark = false }: { initialDark?: boolean }) {
  const [isDark, setIsDark] = useState(initialDark);

  function toggle() {
    const next = !isDark;
    setIsDark(next);
    document.documentElement.classList.toggle("dark", next);
    document.cookie = `dark_mode=${next ? "on" : "off"};path=/;max-age=31536000`;
  }

  return (
    <button
      type="button"
      onClick={toggle}
      title={isDark ? "Light Mode" : "Dark Mode"}
      className="flex items-center justify-center h-8 w-8 bg-slate-100 dark:bg-slate-800/70 hover:bg-slate-200 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700/60 rounded-lg text-slate-500 dark:text-slate-400 transition-colors"
    >
      <i className={`fa-solid ${isDark ? "fa-sun" : "fa-moon"} text-xs`} />
    </button>
  );
}
