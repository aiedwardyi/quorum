"use client"

import React, { useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { X, User, Key, Settings, Wallet, Sparkles, Globe, CheckCircle2, Star, Eye, EyeOff, Bot, RotateCw } from "lucide-react"
import { Locale, Provider } from "@/types"
import { cn } from "@/lib/utils"

const ALL_MODELS: Provider[] = ["gemini", "claude", "gpt", "perplexity"]

const modelStyles: Record<Provider, { activeBorder: string; glow: string; iconBg: string; iconColor: string; dot: string }> = {
  gemini: { activeBorder: "border-blue-500/50 dark:border-blue-400/50", glow: "shadow-[0_0_15px_-3px_rgba(59,130,246,0.2)]", iconBg: "bg-blue-50 dark:bg-blue-500/10", iconColor: "text-blue-600 dark:text-blue-400", dot: "bg-blue-500" },
  claude: { activeBorder: "border-orange-500/50 dark:border-orange-400/50", glow: "shadow-[0_0_15px_-3px_rgba(249,115,22,0.2)]", iconBg: "bg-orange-50 dark:bg-orange-500/10", iconColor: "text-orange-600 dark:text-orange-400", dot: "bg-orange-500" },
  gpt: { activeBorder: "border-emerald-500/50 dark:border-emerald-400/50", glow: "shadow-[0_0_15px_-3px_rgba(16,163,127,0.2)]", iconBg: "bg-emerald-50 dark:bg-emerald-500/10", iconColor: "text-emerald-600 dark:text-emerald-400", dot: "bg-emerald-500" },
  perplexity: { activeBorder: "border-teal-500/50 dark:border-teal-400/50", glow: "shadow-[0_0_15px_-3px_rgba(20,184,166,0.2)]", iconBg: "bg-teal-50 dark:bg-teal-500/10", iconColor: "text-teal-600 dark:text-teal-400", dot: "bg-teal-500" },
}

const ModelIcon = ({ provider, size = 16 }: { provider: Provider; size?: number }) => {
  switch (provider) {
    case "gemini":
      return <svg width={size} height={size} viewBox="0 0 24 24" fill="none"><path d="M20.616 10.835a14.147 14.147 0 01-4.45-3.001 14.111 14.111 0 01-3.678-6.452.503.503 0 00-.975 0 14.134 14.134 0 01-3.679 6.452 14.155 14.155 0 01-4.45 3.001c-.65.28-1.318.505-2.002.678a.502.502 0 000 .975c.684.172 1.35.397 2.002.677a14.147 14.147 0 014.45 3.001 14.112 14.112 0 013.679 6.453.502.502 0 00.975 0c.172-.685.397-1.351.677-2.003a14.145 14.145 0 013.001-4.45 14.113 14.113 0 016.453-3.678.503.503 0 000-.975 13.245 13.245 0 01-2.003-.678z" fill="#3186FF" /><path d="M20.616 10.835a14.147 14.147 0 01-4.45-3.001 14.111 14.111 0 01-3.678-6.452.503.503 0 00-.975 0 14.134 14.134 0 01-3.679 6.452 14.155 14.155 0 01-4.45 3.001c-.65.28-1.318.505-2.002.678a.502.502 0 000 .975c.684.172 1.35.397 2.002.677a14.147 14.147 0 014.45 3.001 14.112 14.112 0 013.679 6.453.502.502 0 00.975 0c.172-.685.397-1.351.677-2.003a14.145 14.145 0 013.001-4.45 14.113 14.113 0 016.453-3.678.503.503 0 000-.975 13.245 13.245 0 01-2.003-.678z" fill="url(#sm-gem-g0)" /><path d="M20.616 10.835a14.147 14.147 0 01-4.45-3.001 14.111 14.111 0 01-3.678-6.452.503.503 0 00-.975 0 14.134 14.134 0 01-3.679 6.452 14.155 14.155 0 01-4.45 3.001c-.65.28-1.318.505-2.002.678a.502.502 0 000 .975c.684.172 1.35.397 2.002.677a14.147 14.147 0 014.45 3.001 14.112 14.112 0 013.679 6.453.502.502 0 00.975 0c.172-.685.397-1.351.677-2.003a14.145 14.145 0 013.001-4.45 14.113 14.113 0 016.453-3.678.503.503 0 000-.975 13.245 13.245 0 01-2.003-.678z" fill="url(#sm-gem-g1)" /><path d="M20.616 10.835a14.147 14.147 0 01-4.45-3.001 14.111 14.111 0 01-3.678-6.452.503.503 0 00-.975 0 14.134 14.134 0 01-3.679 6.452 14.155 14.155 0 01-4.45 3.001c-.65.28-1.318.505-2.002.678a.502.502 0 000 .975c.684.172 1.35.397 2.002.677a14.147 14.147 0 014.45 3.001 14.112 14.112 0 013.679 6.453.502.502 0 00.975 0c.172-.685.397-1.351.677-2.003a14.145 14.145 0 013.001-4.45 14.113 14.113 0 016.453-3.678.503.503 0 000-.975 13.245 13.245 0 01-2.003-.678z" fill="url(#sm-gem-g2)" /><defs><linearGradient gradientUnits="userSpaceOnUse" id="sm-gem-g0" x1="7" x2="11" y1="15.5" y2="12"><stop stopColor="#08B962" /><stop offset="1" stopColor="#08B962" stopOpacity="0" /></linearGradient><linearGradient gradientUnits="userSpaceOnUse" id="sm-gem-g1" x1="8" x2="11.5" y1="5.5" y2="11"><stop stopColor="#F94543" /><stop offset="1" stopColor="#F94543" stopOpacity="0" /></linearGradient><linearGradient gradientUnits="userSpaceOnUse" id="sm-gem-g2" x1="3.5" x2="17.5" y1="13.5" y2="12"><stop stopColor="#FABC12" /><stop offset=".46" stopColor="#FABC12" stopOpacity="0" /></linearGradient></defs></svg>
    case "claude":
      return <svg width={size} height={size} viewBox="0 0 24 24" fill="none"><path clipRule="evenodd" d="M20.998 10.949H24v3.102h-3v3.028h-1.487V20H18v-2.921h-1.487V20H15v-2.921H9V20H7.488v-2.921H6V20H4.487v-2.921H3V14.05H0V10.95h3V5h17.998v5.949zM6 10.949h1.488V8.102H6v2.847zm10.51 0H18V8.102h-1.49v2.847z" fill="#D97757" fillRule="evenodd" /></svg>
    case "gpt":
      return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className="text-emerald-500"><path d="M9.205 8.658v-2.26c0-.19.072-.333.238-.428l4.543-2.616c.619-.357 1.356-.523 2.117-.523 2.854 0 4.662 2.212 4.662 4.566 0 .167 0 .357-.024.547l-4.71-2.759a.797.797 0 00-.856 0l-5.97 3.473zm10.609 8.8V12.06c0-.333-.143-.57-.429-.737l-5.97-3.473 1.95-1.118a.433.433 0 01.476 0l4.543 2.617c1.309.76 2.189 2.378 2.189 3.948 0 1.808-1.07 3.473-2.76 4.163zM7.802 12.703l-1.95-1.142c-.167-.095-.239-.238-.239-.428V5.899c0-2.545 1.95-4.472 4.591-4.472 1 0 1.927.333 2.712.928L8.23 5.067c-.285.166-.428.404-.428.737v6.898zM12 15.128l-2.795-1.57v-3.33L12 8.658l2.795 1.57v3.33L12 15.128zm1.796 7.23c-1 0-1.927-.332-2.712-.927l4.686-2.712c.285-.166.428-.404.428-.737v-6.898l1.974 1.142c.167.095.238.238.238.428v5.233c0 2.545-1.974 4.472-4.614 4.472zm-5.637-5.303l-4.544-2.617c-1.308-.761-2.188-2.378-2.188-3.948A4.482 4.482 0 014.21 6.327v5.423c0 .333.143.571.428.738l5.947 3.449-1.95 1.118a.432.432 0 01-.476 0zm-.262 3.9c-2.688 0-4.662-2.021-4.662-4.519 0-.19.024-.38.047-.57l4.686 2.71c.286.167.571.167.856 0l5.97-3.448v2.26c0 .19-.07.333-.237.428l-4.543 2.616c-.619.357-1.356.523-2.117.523zm5.899 2.83a5.947 5.947 0 005.827-4.756C22.287 18.339 24 15.84 24 13.296c0-1.665-.713-3.282-1.998-4.448.119-.5.19-.999.19-1.498 0-3.401-2.759-5.947-5.946-5.946-.642 0-1.26.095-1.88.31A5.962 5.962 0 0010.205 0a5.947 5.947 0 00-5.827 4.757C1.713 5.447 0 7.945 0 10.49c0 1.666.713 3.283 1.998 4.448-.119.5-.19 1-.19 1.499 0 3.401 2.759 5.946 5.946 5.946.642 0 1.26-.095 1.88-.309a5.96 5.96 0 004.162 1.713z" fill="currentColor" fillRule="evenodd" /></svg>
    case "perplexity":
      return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className="text-teal-500"><path d="M19.785 0v7.272H22.5V17.62h-2.935V24l-7.037-6.194v6.145h-1.091v-6.152L4.392 24v-6.465H1.5V7.188h2.884V0l7.053 6.494V.19h1.09v6.49L19.786 0zm-7.257 9.044v7.319l5.946 5.234V14.44l-5.946-5.397zm-1.099-.08l-5.946 5.398v7.235l5.946-5.234V8.965zm8.136 7.58h1.844V8.349H13.46l6.105 5.54v2.655zm-8.982-8.28H2.59v8.195h1.8v-2.576l6.192-5.62zM5.475 2.476v4.71h5.115l-5.115-4.71zm13.219 0l-5.115 4.71h5.115v-4.71z" fill="currentColor" fillRule="evenodd" /></svg>
  }
}

const translations = {
  en: { settings: "Settings", account: "Account", preferences: "Preferences", apiKeys: "API Keys", credits: "Credits", availableBalance: "Available Balance", buyCredits: "Buy Credits", keysDesc: "Use your own API keys or buy credits to use any model.", save: "Save Changes", saved: "Saved!", language: "Language", logout: "Sign Out", activeModels: "Active Models", geminiDesc: "Google's flagship multimodal AI model", perplexityDesc: "AI search engine for up-to-date information", claudeDesc: "Anthropic's advanced reasoning model", gptDesc: "OpenAI's powerful language model", geminiKey: "Gemini API Key", perplexityKey: "Perplexity API Key", claudeKey: "Claude API Key", gptKey: "GPT API Key", discussionRounds: "Discussion Rounds", rounds: "rounds", rounds3Desc: "Quick debate and consensus", rounds5Desc: "Standard back-and-forth discussion", rounds7Desc: "Deep dive with extensive analysis" },
  ko: { settings: "설정", account: "계정", preferences: "환경설정", apiKeys: "API 키", credits: "크레딧", availableBalance: "사용 가능 잔액", buyCredits: "크레딧 구매", keysDesc: "자신의 API 키를 사용하거나 크레딧을 구매하여 모든 모델을 사용하세요.", save: "변경사항 저장", saved: "저장됨!", language: "언어", logout: "로그아웃", activeModels: "활성 모델", geminiDesc: "Google의 대표 멀티모달 AI 모델", perplexityDesc: "최신 정보를 위한 AI 검색 엔진", claudeDesc: "Anthropic의 고급 추론 모델", gptDesc: "OpenAI의 강력한 언어 모델", geminiKey: "Gemini API 키", perplexityKey: "Perplexity API 키", claudeKey: "Claude API 키", gptKey: "GPT API 키", discussionRounds: "토론 라운드", rounds: "라운드", rounds3Desc: "빠른 토론 및 합의", rounds5Desc: "표준적인 의견 교환 및 토론", rounds7Desc: "광범위한 분석을 동반한 심층 토론" },
}

type Tab = "account" | "preferences"

export default function SettingsModal({
  isOpen,
  onClose,
  locale,
  onToggleLocale,
  activeModels,
  onToggleModel,
  maxRounds,
  onChangeRounds,
  showPreferences,
}: {
  isOpen: boolean
  onClose: () => void
  locale: Locale
  onToggleLocale: () => void
  activeModels: Provider[]
  onToggleModel: (model: Provider) => void
  maxRounds: number
  onChangeRounds: (rounds: number) => void
  showPreferences?: boolean
}) {
  const showPrefs = showPreferences !== false
  const [activeTab, setActiveTab] = useState<Tab>("account")
  const [keys, setKeys] = useState({ gemini: "", claude: "", gpt: "", perplexity: "" })
  const [visibleKeys, setVisibleKeys] = useState<Record<string, boolean>>({})
  const [saved, setSaved] = useState(false)
  const t = translations[locale]

  if (!isOpen) return null

  const handleSave = () => {
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const descriptions: Record<Provider, string> = { gemini: t.geminiDesc, perplexity: t.perplexityDesc, claude: t.claudeDesc, gpt: t.gptDesc }
  const keyLabels: Record<Provider, string> = { gemini: t.geminiKey, perplexity: t.perplexityKey, claude: t.claudeKey, gpt: t.gptKey }

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6">
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} className="absolute inset-0 bg-zinc-900/20 dark:bg-black/40 backdrop-blur-sm" />
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 10 }}
          className={cn("relative w-full bg-white dark:bg-zinc-950 border border-zinc-200/80 dark:border-zinc-800/80 shadow-2xl rounded-2xl overflow-hidden", showPrefs ? "max-w-xl flex flex-col sm:flex-row h-[90vh] sm:h-[460px]" : "max-w-md flex flex-col max-h-[90vh]")}
        >
          {/* Sidebar */}
          {showPrefs && <div className="w-full sm:w-44 bg-zinc-50/50 dark:bg-zinc-900/20 border-b sm:border-b-0 sm:border-r border-zinc-200/40 dark:border-zinc-800/40 p-3 sm:p-4 shrink-0 overflow-x-auto no-scrollbar">
            <h2 className="text-[10px] font-bold text-zinc-400 dark:text-zinc-600 mb-4 hidden sm:block tracking-[0.2em] uppercase px-3">{t.settings}</h2>
            <div className="flex flex-row sm:flex-col gap-0.5 sm:w-full items-center sm:items-stretch">
              {([{ id: "account", label: t.account, Icon: User }, { id: "preferences", label: t.preferences, Icon: Settings }] as const).map(({ id, label, Icon }) => (
                <button key={id} onClick={() => setActiveTab(id as Tab)} className={cn("flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] font-medium transition-all duration-200 whitespace-nowrap active:scale-[0.98] sm:w-full", activeTab === id ? "bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 shadow-sm border border-zinc-200/50 dark:border-zinc-700/50" : "text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-100/50 dark:hover:bg-zinc-800/30")}>
                  <Icon className="w-4 h-4 text-zinc-500 dark:text-zinc-400 shrink-0" />
                  {label}
                </button>
              ))}
              <button onClick={onClose} className="sm:hidden ml-auto p-1.5 text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 bg-zinc-100 dark:bg-zinc-900 hover:bg-zinc-200 dark:hover:bg-zinc-800 rounded-full transition-colors active:scale-95"><X className="w-4 h-4" /></button>
            </div>
          </div>}

          {/* Content */}
          <div className="flex-1 p-5 sm:p-7 overflow-y-auto relative">
            <button onClick={onClose} className={cn("absolute top-4 right-4 sm:top-5 sm:right-5 p-1.5 text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 bg-zinc-100 dark:bg-zinc-900 hover:bg-zinc-200 dark:hover:bg-zinc-800 rounded-full transition-colors active:scale-95 z-10", showPrefs && "hidden sm:block")}><X className="w-4 h-4" /></button>

            {activeTab === "account" && (
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-10 w-full max-w-md pb-4">
                <div className="flex items-center gap-2.5 mb-5"><User className="w-[18px] h-[18px] text-zinc-500 dark:text-zinc-400" /><h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-100 tracking-tight">{t.account}</h3></div>
                <div className="space-y-3">
                  <div className="flex items-center gap-2 px-1"><Wallet className="w-3.5 h-3.5 text-zinc-400" /><span className="text-[11px] font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-widest">{t.credits}</span></div>
                  <div className="p-5 rounded-xl bg-zinc-50 dark:bg-zinc-900/30 border border-zinc-200/60 dark:border-zinc-800/60">
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <p className="text-[11px] font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-widest mb-1">{t.availableBalance}</p>
                        <div className="flex items-center gap-2"><span className="text-3xl font-mono font-light tracking-tighter text-zinc-900 dark:text-zinc-100">1,250</span><Star className="w-4 h-4 text-yellow-400 fill-yellow-400" /></div>
                      </div>
                      <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} transition={{ duration: 0.2, ease: "easeOut" }} className="relative group overflow-hidden px-4 py-2 bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 text-[12px] font-bold rounded-lg shadow-md shadow-zinc-200 dark:shadow-none transition-colors">
                        <div className="absolute inset-0 bg-gradient-to-r from-zinc-800 to-zinc-900 dark:from-zinc-100 dark:to-zinc-200 opacity-0 group-hover:opacity-100 transition-opacity" />
                        <div className="absolute inset-0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700 bg-gradient-to-r from-transparent via-white/20 dark:via-zinc-900/10 to-transparent" />
                        <div className="relative flex items-center gap-1.5"><Sparkles className="w-3 h-3 text-amber-400" />{t.buyCredits}</div>
                      </motion.button>
                    </div>
                  </div>
                </div>
                <div className="space-y-4">
                  <div className="space-y-1 px-1">
                    <div className="flex items-center gap-2"><Key className="w-3.5 h-3.5 text-zinc-400" /><span className="text-[11px] font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-widest">{t.apiKeys}</span></div>
                    <p className="text-[11px] text-zinc-500 dark:text-zinc-400 leading-relaxed">{t.keysDesc}</p>
                  </div>
                  <div className="space-y-2">
                    {ALL_MODELS.map((provider) => (
                      <div key={provider} className="flex items-center gap-3 px-3.5 py-2.5 bg-white dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800 rounded-xl focus-within:border-zinc-400 dark:focus-within:border-zinc-600 transition-colors">
                        <div className={cn("shrink-0", modelStyles[provider].iconColor)}><ModelIcon provider={provider} size={16} /></div>
                        <input type={visibleKeys[provider] ? "text" : "password"} value={keys[provider as keyof typeof keys]} onChange={(e) => setKeys({ ...keys, [provider]: e.target.value })} placeholder={keyLabels[provider]} className="flex-1 bg-transparent border-none p-0 text-[13px] text-zinc-900 dark:text-zinc-100 focus:ring-0 focus:outline-none placeholder:text-zinc-500/50 font-medium" />
                        <button onClick={() => setVisibleKeys((prev) => ({ ...prev, [provider]: !prev[provider] }))} className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 transition-colors shrink-0">{visibleKeys[provider] ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}</button>
                      </div>
                    ))}
                  </div>
                  <div className="flex items-center justify-end pt-2">
                    <button onClick={handleSave} className="px-4 py-2 bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 text-[12px] font-medium rounded-lg hover:bg-zinc-800 dark:hover:bg-zinc-200 transition-all active:scale-[0.98] flex items-center gap-2 shadow-sm">{saved ? <CheckCircle2 className="w-3.5 h-3.5" /> : null}{saved ? t.saved : t.save}</button>
                  </div>
                </div>
              </motion.div>
            )}

            {activeTab === "preferences" && showPrefs && (
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-10 w-full max-w-md">
                <div className="flex items-center gap-2.5 mb-5"><Settings className="w-[18px] h-[18px] text-zinc-500 dark:text-zinc-400" /><h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-100 tracking-tight">{t.preferences}</h3></div>
                <div className="space-y-4">
                  <div className="flex items-center justify-between p-3.5 rounded-xl border border-zinc-200/80 dark:border-zinc-800 bg-white dark:bg-zinc-900/50">
                    <div className="flex items-center gap-2.5">
                      <div className="p-1.5 bg-zinc-100 dark:bg-zinc-800 rounded-md"><Globe className="w-4 h-4 text-zinc-500 dark:text-zinc-400" /></div>
                      <div><p className="text-[13px] font-medium text-zinc-900 dark:text-zinc-100">{t.language}</p><p className="text-[11px] text-zinc-500">{locale === "en" ? "English" : "한국어"}</p></div>
                    </div>
                    <button onClick={onToggleLocale} className="px-2.5 py-1 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-900 dark:text-zinc-100 text-[11px] font-medium rounded-md transition-colors active:scale-95">Toggle</button>
                  </div>
                  <div className="space-y-3 pt-2">
                    <div className="flex items-center gap-2 px-1"><Bot className="w-3.5 h-3.5 text-zinc-400" /><span className="text-[11px] font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-widest">{t.activeModels}</span></div>
                    <div className="grid grid-cols-2 gap-2">
                      {ALL_MODELS.map((model, modelIndex) => {
                        const isActive = activeModels.includes(model)
                        const style = modelStyles[model]
                        return (
                          <motion.button key={model} whileHover={{ scale: 1.02, y: -2 }} whileTap={{ scale: 0.98 }} transition={{ duration: 0.2, ease: "easeOut" }} onClick={() => { if (isActive && activeModels.length === 1) return; onToggleModel(model) }} className={cn("relative flex items-center gap-2.5 p-2.5 rounded-xl border transition-colors duration-200 text-left group hover:z-10", isActive ? cn("bg-white dark:bg-zinc-900", style.activeBorder, style.glow) : "bg-zinc-50/50 dark:bg-zinc-900/30 border-zinc-200/60 dark:border-zinc-800/60 grayscale opacity-60 hover:grayscale-0 hover:opacity-100")}>
                            <div className={cn("p-1.5 rounded-lg transition-colors shrink-0", isActive ? style.iconBg : "bg-zinc-200/50 dark:bg-zinc-800")}><ModelIcon provider={model} size={16} /></div>
                            <span className={cn("text-[12px] font-bold tracking-tight flex-1", isActive ? "text-zinc-900 dark:text-zinc-100" : "text-zinc-500")}>{model === "gpt" ? "GPT" : model.charAt(0).toUpperCase() + model.slice(1)}</span>
                            <div className={cn("w-2 h-2 rounded-full transition-all shrink-0", isActive ? style.dot : "bg-zinc-300 dark:bg-zinc-600")} />
                            <div className={cn("absolute left-1/2 -translate-x-1/2 px-2 py-1 bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 text-[10px] font-medium rounded opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity whitespace-nowrap z-50 shadow-sm", modelIndex < 2 ? "bottom-full mb-2" : "top-full mt-2")}>{descriptions[model]}</div>
                          </motion.button>
                        )
                      })}
                    </div>
                  </div>
                  <div className="space-y-3 pt-4">
                    <div className="flex items-center gap-2 px-1"><RotateCw className="w-3.5 h-3.5 text-zinc-400" /><span className="text-[11px] font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-widest">{t.discussionRounds}</span></div>
                    <div className="flex items-center gap-1 bg-zinc-50/50 dark:bg-zinc-900/30 p-1 rounded-xl border border-zinc-200/50 dark:border-zinc-800/50">
                      {[
                        { val: 3, desc: t.rounds3Desc },
                        { val: 5, desc: t.rounds5Desc },
                        { val: 7, desc: t.rounds7Desc },
                      ].map((r) => (
                        <motion.button
                          key={r.val}
                          whileTap={{ scale: 0.95 }}
                          onClick={() => onChangeRounds(r.val)}
                          className={cn(
                            "group/round relative flex-1 px-3 py-2 rounded-lg text-xs font-medium transition-all duration-200",
                            maxRounds === r.val
                              ? "bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 shadow-sm border border-zinc-200/50 dark:border-zinc-700/50"
                              : "text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200 border border-transparent"
                          )}
                        >
                          <div className="absolute top-full mt-2 left-1/2 -translate-x-1/2 px-2 py-1 bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 text-[10px] font-medium rounded opacity-0 group-hover/round:opacity-100 pointer-events-none transition-opacity whitespace-nowrap z-50 shadow-sm">
                            {r.desc}
                          </div>
                          {r.val} {t.rounds}
                        </motion.button>
                      ))}
                    </div>
                  </div>
                </div>
              </motion.div>
            )}
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  )
}
