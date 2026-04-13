"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { useRouter } from "next/navigation"
import { useSession, signIn, signOut } from "next-auth/react"
import { Locale, Provider, ResponseLength, Theme } from "@/types"
import ThreadDropdown from "@/components/ThreadDropdown"
import ConfirmDialog from "@/components/ConfirmDialog"
import ModelToggleGroup from "@/components/ModelToggleGroup"
import { Sun, Moon, Star, Heart, Flame, Cat, Snowflake, AlignLeft, ChevronDown, User, Settings2, Sparkles, LogIn, LogOut, Sunrise, RotateCw } from "lucide-react"
import { cn } from "@/lib/utils"
import { motion, AnimatePresence } from "framer-motion"

export const leaveDebateStrings = {
  en: {
    leaveTitle: "Leave debate?",
    leaveDesc: "A debate is still running. Leaving this page will stop it.",
    leaveConfirm: "Leave",
    leaveCancel: "Stay",
  },
  ko: {
    leaveTitle: "토론을 나가시겠습니까?",
    leaveDesc: "토론이 진행 중입니다. 이 페이지를 나가면 중단됩니다.",
    leaveConfirm: "나가기",
    leaveCancel: "머무르기",
  },
}

const translations = {
  en: {
    round: "Round",
    short: "Short",
    medium: "Medium",
    long: "Long",
    roundTooltip: "Current discussion round",
    lengthTooltip: "Set response length",
    rounds: "Rounds",
    roundsTooltip: "Set discussion rounds",
    login: "Sign In",
    logout: "Log Out",
    settings: "Settings",
    ...leaveDebateStrings.en,
  },
  ko: {
    round: "라운드",
    short: "짧게",
    medium: "보통",
    long: "길게",
    roundTooltip: "현재 토론 라운드",
    lengthTooltip: "답변 길이 설정",
    rounds: "라운드",
    roundsTooltip: "토론 라운드 설정",
    login: "로그인",
    logout: "로그아웃",
    settings: "설정",
    ...leaveDebateStrings.ko,
  },
}

export default function ChatHeader({
  currentRound,
  maxRounds,
  responseLength,
  onChangeResponseLength,
  onChangeRounds,
  activeModels,
  onToggleModel,
  locale,
  theme,
  onToggleTheme,
  onOpenSettings,
  isDebating = false,
  threadId,
  onNewDebate,
  onDeleteCurrent,
  onStopDebate,
  debateBalance,
  freeDebatesRemaining,
  tier,
  allowedModels,
  balanceLoading,
  onBuyDebates,
}: {
  currentRound: number
  maxRounds: number
  responseLength: ResponseLength
  onChangeResponseLength: (length: ResponseLength) => void
  onChangeRounds: (rounds: number) => void
  activeModels: Provider[]
  onToggleModel: (model: Provider) => void
  locale: Locale
  theme: Theme
  onToggleTheme: () => void
  onOpenSettings: () => void
  isDebating?: boolean
  threadId?: string | null
  onNewDebate?: () => void
  onDeleteCurrent?: () => void
  onStopDebate?: () => void
  debateBalance?: number
  freeDebatesRemaining?: number
  tier?: "anonymous" | "free" | "paid"
  allowedModels?: Provider[]
  balanceLoading?: boolean
  onBuyDebates?: () => void
}) {
  const { data: session } = useSession()
  const router = useRouter()
  const isLoggedIn = !!session?.user
  const t = translations[locale]
  const [showLengthDropdown, setShowLengthDropdown] = useState(false)
  const [showRoundsDropdown, setShowRoundsDropdown] = useState(false)
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false)
  const pendingAction = useRef<(() => void) | null>(null)

  const confirmIfDebating = useCallback((action: () => void) => {
    if (isDebating) {
      pendingAction.current = action
      setShowLeaveConfirm(true)
      return
    }
    action()
  }, [isDebating])

  const handleLeaveConfirm = () => {
    setShowLeaveConfirm(false)
    onStopDebate?.()
    pendingAction.current?.()
    pendingAction.current = null
  }

  const handleLeaveCancel = useCallback(() => {
    setShowLeaveConfirm(false)
    pendingAction.current = null
  }, [])
  const [showUserMenu, setShowUserMenu] = useState(false)

  useEffect(() => {
    const handleBlur = () => {
      setShowLengthDropdown(false)
      setShowRoundsDropdown(false)
      setShowUserMenu(false)
    }
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      if (!target.closest("[data-header-dropdown]")) {
        setShowLengthDropdown(false)
        setShowRoundsDropdown(false)
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
    <>
    <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 sm:px-6 py-3 border-b border-border bg-background/80 backdrop-blur-md sticky top-0 z-50">
      {/* Title + Round + Length */}
      <div className="flex items-center gap-2 sm:gap-4">
        <button
          onClick={() => confirmIfDebating(() => onNewDebate ? onNewDebate() : router.push("/"))}
          className="text-sm sm:text-base font-bold tracking-tight text-zinc-900 dark:text-zinc-100 flex items-center gap-2 hover:opacity-70 transition-opacity"
        >
          <div className="w-3.5 h-3.5 sm:w-4 sm:h-4 rounded-sm bg-zinc-900 dark:bg-zinc-100 shrink-0" />
          Quorum
        </button>
        {isLoggedIn && onNewDebate && (
          <ThreadDropdown
            currentThreadId={threadId ?? null}
            currentTitle={locale === "ko" ? "최근 토론" : "History"}
            locale={locale}
            onNewDebate={onNewDebate}
            onDeleteCurrent={onDeleteCurrent}
            confirmBeforeNav={isDebating ? (action) => confirmIfDebating(action) : undefined}
          />
        )}

        <div className="flex items-center gap-1.5 sm:gap-4">
          <div className="w-px h-3 bg-zinc-200 dark:bg-zinc-800 shrink-0 hidden sm:block" />

          <div className={cn("relative shrink-0 group hidden sm:block", isDebating && "pointer-events-none opacity-40")} data-header-dropdown>
            <motion.button
              whileTap={{ scale: 0.95 }}
              onClick={() => { setShowRoundsDropdown(!showRoundsDropdown); setShowLengthDropdown(false); setShowUserMenu(false) }}
              aria-haspopup="listbox"
              aria-expanded={showRoundsDropdown}
              className="flex items-center gap-1 sm:gap-1.5 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors"
            >
              <RotateCw className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-zinc-400 dark:text-zinc-500" />
              <span className="text-[11px] sm:text-xs font-medium text-zinc-600 dark:text-zinc-400">
                {isDebating ? `${currentRound}/${maxRounds}` : `${maxRounds} ${maxRounds === 1 ? t.round : t.rounds}`}
              </span>
              <ChevronDown className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-zinc-400 dark:text-zinc-500 opacity-50" />
            </motion.button>

            <div className={cn(
              "absolute top-full mt-2 left-1/2 -translate-x-1/2 px-2 py-1 bg-primary text-primary-foreground text-[10px] font-medium rounded pointer-events-none transition-opacity delay-100 whitespace-nowrap z-50 shadow-sm hidden sm:block",
              showRoundsDropdown ? "opacity-0" : "opacity-0 group-hover:opacity-100"
            )}>
              {t.roundsTooltip}
            </div>

            <AnimatePresence>
              {showRoundsDropdown && (
                <motion.div
                  initial={{ opacity: 0, y: 6, scale: 0.92 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 4, scale: 0.95 }}
                  transition={{ type: "spring", stiffness: 400, damping: 24 }}
                  className="absolute top-full left-0 mt-1 w-28 bg-card border border-border rounded-xl shadow-lg overflow-hidden z-[60] py-1"
                >
                  {[1, 2, 3, 5].map((rounds, i) => (
                    <motion.button
                      key={rounds}
                      initial={{ opacity: 0, x: -8 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.04, duration: 0.2 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={() => {
                        onChangeRounds(rounds)
                        setShowRoundsDropdown(false)
                      }}
                      className={cn(
                        "w-full text-left px-3 py-2 text-xs hover:bg-accent transition-colors",
                        maxRounds === rounds
                          ? "font-medium text-zinc-900 dark:text-zinc-100"
                          : "text-zinc-600 dark:text-zinc-400"
                      )}
                    >
                      {rounds} {rounds === 1 ? t.round : t.rounds}
                    </motion.button>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <div className="w-px h-3 bg-zinc-200 dark:bg-zinc-800 shrink-0 hidden sm:block" />

          <div className={cn("relative shrink-0 group hidden sm:block", isDebating && "pointer-events-none opacity-40")} data-header-dropdown>
            <motion.button
              whileTap={{ scale: 0.95 }}
              onClick={() => { setShowLengthDropdown(!showLengthDropdown); setShowRoundsDropdown(false); setShowUserMenu(false) }}
              aria-haspopup="listbox"
              aria-expanded={showLengthDropdown}
              className="flex items-center gap-1 sm:gap-1.5 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors"
            >
              <AlignLeft className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-zinc-400 dark:text-zinc-500" />
              <span className="text-[11px] sm:text-xs font-medium text-zinc-600 dark:text-zinc-400 capitalize hidden sm:inline-block">
                {t[responseLength]}
              </span>
              <ChevronDown className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-zinc-400 dark:text-zinc-500 opacity-50" />
            </motion.button>

            <div className={cn(
              "absolute top-full mt-2 left-1/2 -translate-x-1/2 px-2 py-1 bg-primary text-primary-foreground text-[10px] font-medium rounded pointer-events-none transition-opacity delay-100 whitespace-nowrap z-50 shadow-sm hidden sm:block",
              showLengthDropdown ? "opacity-0" : "opacity-0 group-hover:opacity-100"
            )}>
              {t.lengthTooltip}
            </div>

            <AnimatePresence>
              {showLengthDropdown && (
                  <motion.div
                    initial={{ opacity: 0, y: 6, scale: 0.92 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 4, scale: 0.95 }}
                    transition={{ type: "spring", stiffness: 400, damping: 24 }}
                    className="absolute top-full left-0 mt-1 w-32 bg-card border border-border rounded-xl shadow-lg overflow-hidden z-[60] py-1"
                  >
                    {(["short", "medium", "long"] as ResponseLength[]).map((len, i) => (
                      <motion.button
                        key={len}
                        initial={{ opacity: 0, x: -8 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: i * 0.04, duration: 0.2 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={() => {
                          onChangeResponseLength(len)
                          setShowLengthDropdown(false)
                        }}
                        className={cn(
                          "w-full text-left px-3 py-2 text-xs hover:bg-accent transition-colors capitalize",
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

          <div className="w-px h-3 bg-zinc-200 dark:bg-zinc-800 shrink-0 hidden sm:block" />

          <ModelToggleGroup
            activeModels={activeModels}
            onToggle={onToggleModel}
            locale={locale}
            disabled={isDebating}
            allowedModels={balanceLoading ? undefined : allowedModels}
          />
        </div>
      </div>

      {/* Right side controls */}
      <div className="flex items-center gap-2 sm:gap-4 ml-auto">
        <div className="flex items-center gap-2 sm:gap-3">
          <motion.button
            whileTap={{ scale: 0.95 }}
            whileHover={{ scale: 1.05 }}
            onClick={onBuyDebates}
            aria-label="Buy debates"
            className={cn("hidden sm:flex items-center justify-center w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-all group", theme === "lovelace" && "hover:ring-[1.5px] hover:ring-[#eb6f92]/60", theme === "tokyonight" && "hover:ring-[1.5px] hover:ring-[#7aa2f7]/40", theme === "gruvbox" && "hover:ring-[1.5px] hover:ring-[#fe8019]/50", theme === "catppuccin" && "hover:ring-[1.5px] hover:ring-[#cba6f7]/50", theme === "nord" && "hover:ring-[1.5px] hover:ring-[#88c0d0]/50", theme === "solarized" && "hover:ring-[1.5px] hover:ring-[#073642]/50")}
          >
            <Sparkles className="w-3.5 h-3.5 text-amber-500 group-hover:scale-110 transition-transform" />
          </motion.button>

          <motion.button
            whileTap={{ scale: 0.95 }}
            whileHover={{ scale: 1.05 }}
            onClick={onToggleTheme}
            aria-label="Toggle theme"
            className={cn("w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-all group", theme === "lovelace" && "hover:ring-[1.5px] hover:ring-[#eb6f92]/60", theme === "tokyonight" && "hover:ring-[1.5px] hover:ring-[#7aa2f7]/40", theme === "gruvbox" && "hover:ring-[1.5px] hover:ring-[#fe8019]/50", theme === "catppuccin" && "hover:ring-[1.5px] hover:ring-[#cba6f7]/50", theme === "nord" && "hover:ring-[1.5px] hover:ring-[#88c0d0]/50", theme === "solarized" && "hover:ring-[1.5px] hover:ring-[#073642]/50")}
          >
            <AnimatePresence mode="popLayout">
              {theme === "light" && (
                <motion.div key="sun" initial={{ scale: 0, rotate: -90 }} animate={{ scale: 1, rotate: 0 }} exit={{ scale: 0, rotate: 90 }} transition={{ duration: 0.2 }}
                  whileHover={{ rotate: [0, 360], transition: { duration: 3, repeat: Infinity, ease: "linear" } }}>
                  <Sun className="w-3.5 h-3.5 text-zinc-600 dark:text-zinc-400" />
                </motion.div>
              )}
              {theme === "dark" && (
                <motion.div key="moon" initial={{ scale: 0, rotate: -90 }} animate={{ scale: 1, rotate: 0 }} exit={{ scale: 0, rotate: 90 }} transition={{ duration: 0.2 }}
                  whileHover={{ rotate: [0, -15, 15, -15, 0], transition: { duration: 0.5, repeat: Infinity, ease: "easeInOut" } }}>
                  <Moon className="w-3.5 h-3.5 text-zinc-600 dark:text-zinc-400" />
                </motion.div>
              )}
              {theme === "tokyonight" && (
                <motion.div key="star" initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }} transition={{ duration: 0.2 }}
                  whileHover={{ scale: [1, 1.3, 1], transition: { duration: 1, repeat: Infinity, ease: "easeInOut" } }}>
                  <Star className="w-3.5 h-3.5 text-zinc-600 dark:text-zinc-400" />
                </motion.div>
              )}
              {theme === "lovelace" && (
                <motion.div key="heart" initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }} transition={{ duration: 0.2 }}
                  whileHover={{ scale: [1, 1.2, 1, 1.15, 1], transition: { duration: 0.8, repeat: Infinity, ease: "easeInOut" } }}>
                  <Heart className="w-3.5 h-3.5 text-zinc-600 dark:text-zinc-400" />
                </motion.div>
              )}
              {theme === "gruvbox" && (
                <motion.div key="flame" initial={{ scale: 0, y: 5 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0, y: 5 }} transition={{ duration: 0.2 }}
                  whileHover={{ y: [0, -2, 0, -1, 0], scale: [1, 1.15, 1, 1.1, 1], transition: { duration: 0.6, repeat: Infinity, ease: "easeInOut" } }}>
                  <Flame className="w-3.5 h-3.5 text-zinc-600 dark:text-zinc-400" />
                </motion.div>
              )}
              {theme === "catppuccin" && (
                <motion.div key="cat" initial={{ scale: 0, rotate: 15 }} animate={{ scale: 1, rotate: 0 }} exit={{ scale: 0, rotate: -15 }} transition={{ duration: 0.2 }}
                  whileHover={{ rotate: [0, -10, 10, -5, 0], y: [0, -1, 0], transition: { duration: 0.7, repeat: Infinity, ease: "easeInOut" } }}>
                  <Cat className="w-3.5 h-3.5 text-zinc-600 dark:text-zinc-400" />
                </motion.div>
              )}
              {theme === "nord" && (
                <motion.div key="snowflake" initial={{ scale: 0, rotate: 60 }} animate={{ scale: 1, rotate: 0 }} exit={{ scale: 0, rotate: -60 }} transition={{ duration: 0.2 }}
                  whileHover={{ rotate: [0, 180, 360], scale: [1, 1.15, 1], transition: { duration: 2, repeat: Infinity, ease: "linear" } }}>
                  <Snowflake className="w-3.5 h-3.5 text-zinc-600 dark:text-zinc-400" />
                </motion.div>
              )}
              {theme === "solarized" && (
                <motion.div key="solar" initial={{ scale: 0, y: 4 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0, y: -4 }} transition={{ duration: 0.2 }}
                  whileHover={{ y: [0, -3, 0], scale: [1, 1.15, 1], transition: { duration: 1.2, repeat: Infinity, ease: "easeInOut" } }}>
                  <Sunrise className="w-3.5 h-3.5 text-[#b58900]" />
                </motion.div>
              )}
            </AnimatePresence>
          </motion.button>
        </div>

        <motion.button
          whileTap={{ scale: 0.95 }}
          whileHover={{ scale: 1.05 }}
          onClick={onOpenSettings}
          aria-label="Settings"
          className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-all"
        >
          <Settings2 className="w-3.5 h-3.5 text-zinc-600 dark:text-zinc-400" />
        </motion.button>

        <div className="relative" data-header-dropdown>
          {isLoggedIn ? (
            <motion.button
              whileTap={{ scale: 0.95 }}
              whileHover={{ scale: 1.05 }}
              onClick={() => { setShowUserMenu(!showUserMenu); setShowRoundsDropdown(false); setShowLengthDropdown(false) }}
              aria-label="User menu"
              aria-haspopup="menu"
              aria-expanded={showUserMenu}
              className={cn("w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-all shadow-sm", theme === "lovelace" && "hover:ring-[1.5px] hover:ring-[#eb6f92]/60", theme === "tokyonight" && "hover:ring-[1.5px] hover:ring-[#7aa2f7]/40", theme === "gruvbox" && "hover:ring-[1.5px] hover:ring-[#fe8019]/50", theme === "catppuccin" && "hover:ring-[1.5px] hover:ring-[#cba6f7]/50", theme === "nord" && "hover:ring-[1.5px] hover:ring-[#88c0d0]/50", theme === "solarized" && "hover:ring-[1.5px] hover:ring-[#073642]/50")}
            >
              <User className="w-3.5 h-3.5 text-zinc-600 dark:text-zinc-400" />
            </motion.button>
          ) : (
            <motion.button
              whileTap={{ scale: 0.95 }}
              onClick={() => signIn("google")}
              className="flex items-center justify-center gap-2 h-7 w-7 sm:h-8 sm:w-auto sm:px-4 bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 rounded-full border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-all shadow-sm"
            >
              <LogIn className="w-3.5 h-3.5" />
              <span className="hidden sm:inline text-xs font-bold">{t.login}</span>
            </motion.button>
          )}

          <AnimatePresence>
            {showUserMenu && isLoggedIn && (
                <motion.div
                  initial={{ opacity: 0, y: 6, scale: 0.92 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 4, scale: 0.95 }}
                  transition={{ type: "spring", stiffness: 400, damping: 24 }}
                  className="absolute top-full right-0 mt-2 w-48 bg-card border border-border rounded-xl shadow-lg overflow-hidden z-[60]"
                >
                  <div className="p-1">
                    <button
                      onClick={() => { setShowUserMenu(false); signOut() }}
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

      <ConfirmDialog
        isOpen={showLeaveConfirm}
        title={t.leaveTitle}
        description={t.leaveDesc}
        confirmLabel={t.leaveConfirm}
        cancelLabel={t.leaveCancel}
        onConfirm={handleLeaveConfirm}
        onCancel={handleLeaveCancel}
        destructive
      />
    </>
  )
}
