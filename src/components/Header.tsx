"use client"

import { useState, useEffect } from "react"
import { Locale, ResponseLength } from "@/types"
import { Sun, Moon, AlignLeft, ChevronDown, User, Settings2, Sparkles, LogIn, LogOut } from "lucide-react"
import { cn } from "@/lib/utils"
import { motion, AnimatePresence } from "framer-motion"

const translations = {
  en: {
    round: "Round",
    short: "Short",
    medium: "Medium",
    long: "Long",
    roundTooltip: "Current discussion round",
    lengthTooltip: "Set response length",
    login: "Log In",
    logout: "Log Out",
    settings: "Settings",
  },
  ko: {
    round: "라운드",
    short: "짧게",
    medium: "보통",
    long: "길게",
    roundTooltip: "현재 토론 라운드",
    lengthTooltip: "답변 길이 설정",
    login: "로그인",
    logout: "로그아웃",
    settings: "설정",
  },
}

export default function ChatHeader({
  currentRound,
  maxRounds,
  responseLength,
  onChangeResponseLength,
  locale,
  onToggleLocale,
  theme,
  onToggleTheme,
  onOpenSettings,
  isLoggedIn,
  onLogin,
  onLogout,
  isDebating = false,
}: {
  currentRound: number
  maxRounds: number
  responseLength: ResponseLength
  onChangeResponseLength: (length: ResponseLength) => void
  locale: Locale
  onToggleLocale: () => void
  theme: "light" | "dark"
  onToggleTheme: () => void
  onOpenSettings: () => void
  isLoggedIn: boolean
  onLogin: () => void
  onLogout: () => void
  isDebating?: boolean
}) {
  const t = translations[locale]
  const [showLengthDropdown, setShowLengthDropdown] = useState(false)
  const [showUserMenu, setShowUserMenu] = useState(false)

  useEffect(() => {
    const handleBlur = () => {
      setShowLengthDropdown(false)
      setShowUserMenu(false)
    }
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      if (!target.closest("[data-header-dropdown]")) {
        setShowLengthDropdown(false)
        setShowUserMenu(false)
      }
    }
    window.addEventListener("blur", handleBlur)
    document.addEventListener("mousedown", handleClickOutside)
    return () => {
      window.removeEventListener("blur", handleBlur)
      document.removeEventListener("mousedown", handleClickOutside)
    }
  }, [])

  return (
    <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 sm:px-6 py-3 border-b border-zinc-200 dark:border-zinc-800 bg-white/80 dark:bg-zinc-950/80 backdrop-blur-md sticky top-0 z-50">
      {/* Title + Round + Length */}
      <div className="flex items-center gap-2 sm:gap-4">
        <h1 className="text-lg sm:text-xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100">Quorum</h1>

        <div className="flex items-center gap-1.5 sm:gap-4">
          <div className="relative group shrink-0">
            <div className="flex items-center gap-1.5">
              <span className="text-[9px] font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-widest hidden lg:inline-block">
                {t.round}
              </span>
              <span className="text-[9px] font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-widest lg:hidden">R</span>
              <span className="text-[11px] sm:text-xs font-mono font-bold text-zinc-900 dark:text-zinc-100">
                {currentRound}/{maxRounds}
              </span>
            </div>
            <div className="absolute top-full mt-2 left-1/2 -translate-x-1/2 px-2 py-1 bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 text-[10px] font-medium rounded opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity whitespace-nowrap z-50 shadow-sm hidden sm:block">
              {t.roundTooltip}
            </div>
          </div>

          <div className="w-px h-3 bg-zinc-200 dark:bg-zinc-800 shrink-0" />

          <div className={cn("relative shrink-0 group", isDebating && "pointer-events-none opacity-40")} data-header-dropdown>
            <motion.button
              whileTap={{ scale: 0.95 }}
              onClick={() => setShowLengthDropdown(!showLengthDropdown)}
              className="flex items-center gap-1 sm:gap-1.5 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors"
            >
              <AlignLeft className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-zinc-400 dark:text-zinc-500" />
              <span className="text-[11px] sm:text-xs font-medium text-zinc-600 dark:text-zinc-400 capitalize hidden sm:inline-block">
                {t[responseLength]}
              </span>
              <ChevronDown className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-zinc-400 dark:text-zinc-500 opacity-50" />
            </motion.button>

            <div className={cn(
              "absolute top-full mt-2 left-1/2 -translate-x-1/2 px-2 py-1 bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 text-[10px] font-medium rounded pointer-events-none transition-opacity delay-100 whitespace-nowrap z-50 shadow-sm hidden sm:block",
              showLengthDropdown ? "opacity-0" : "opacity-0 group-hover:opacity-100"
            )}>
              {t.lengthTooltip}
            </div>

            <AnimatePresence>
              {showLengthDropdown && (
                  <motion.div
                    initial={{ opacity: 0, y: 5, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 5, scale: 0.95 }}
                    className="absolute top-full left-0 mt-1 w-32 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl shadow-lg overflow-hidden z-[60] py-1"
                  >
                    {(["short", "medium", "long"] as ResponseLength[]).map((len) => (
                      <motion.button
                        key={len}
                        whileTap={{ scale: 0.98 }}
                        onClick={() => {
                          onChangeResponseLength(len)
                          setShowLengthDropdown(false)
                        }}
                        className={cn(
                          "w-full text-left px-3 py-2 text-xs hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors capitalize",
                          responseLength === len
                            ? "font-medium text-zinc-900 dark:text-zinc-100"
                            : "text-zinc-600 dark:text-zinc-400"
                        )}
                      >
                        {t[len]}
                      </motion.button>
                    ))}
                  </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>

      {/* Right side controls */}
      <div className="flex items-center gap-2 sm:gap-4">
        <div className="flex items-center gap-2 sm:gap-3">
          <div className="hidden sm:flex items-center gap-1 px-2 py-1 sm:px-3 sm:py-1.5 bg-zinc-100 dark:bg-zinc-800 rounded-full border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-all cursor-default group">
            <Sparkles className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-amber-500 group-hover:scale-110 transition-transform" />
            <span className="text-[10px] sm:text-xs font-mono font-medium text-zinc-900 dark:text-zinc-100">1,250</span>
          </div>

          <motion.button
            whileTap={{ scale: 0.95 }}
            onClick={onToggleTheme}
            className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-all group"
          >
            {theme === "light" ? (
              <motion.div
                whileHover={{
                  rotate: [0, -15, 15, -15, 0],
                  transition: { duration: 0.5, repeat: Infinity, ease: "easeInOut" }
                }}
              >
                <Moon className="w-3.5 h-3.5 text-zinc-600 dark:text-zinc-400" />
              </motion.div>
            ) : (
              <motion.div
                whileHover={{
                  rotate: [0, 360],
                  transition: { duration: 3, repeat: Infinity, ease: "linear" }
                }}
              >
                <Sun className="w-3.5 h-3.5 text-zinc-600 dark:text-zinc-400" />
              </motion.div>
            )}
          </motion.button>
        </div>

        <div className="relative" data-header-dropdown>
          {isLoggedIn ? (
            <motion.button
              whileTap={{ scale: 0.95 }}
              onClick={() => setShowUserMenu(!showUserMenu)}
              className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-all shadow-sm"
            >
              <User className="w-3.5 h-3.5 text-zinc-600 dark:text-zinc-400" />
            </motion.button>
          ) : (
            <motion.button
              whileTap={{ scale: 0.95 }}
              onClick={onLogin}
              className="flex items-center justify-center gap-2 h-7 w-7 sm:h-8 sm:w-auto sm:px-4 bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 rounded-full border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-all shadow-sm"
            >
              <LogIn className="w-3.5 h-3.5" />
              <span className="hidden sm:inline text-xs font-bold">{t.login}</span>
            </motion.button>
          )}

          <AnimatePresence>
            {showUserMenu && isLoggedIn && (
                <motion.div
                  initial={{ opacity: 0, y: 5, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 5, scale: 0.95 }}
                  className="absolute top-full right-0 mt-2 w-48 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl shadow-lg overflow-hidden z-[60]"
                >
                  <div className="p-1">
                    <button
                      onClick={() => { setShowUserMenu(false); onOpenSettings() }}
                      className="w-full flex items-center gap-2 px-3 py-2 text-sm text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition-colors"
                    >
                      <Settings2 className="w-4 h-4" />
                      {t.settings}
                    </button>
                    <div className="h-px bg-zinc-100 dark:bg-zinc-800 my-1" />
                    <button
                      onClick={() => { setShowUserMenu(false); onLogout() }}
                      className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                    >
                      <LogOut className="w-4 h-4" />
                      {t.logout}
                    </button>
                  </div>
                </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </header>
  )
}
