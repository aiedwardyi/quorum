/** Localized relative-time formatting ("2 hours ago", "2시간 전"). */
import type { Locale } from "@/types"

export function timeAgo(date: string, locale: Locale): string {
  const diff = Date.now() - new Date(date).getTime()
  const minutes = Math.floor(diff / 60000)
  if (minutes < 1) return locale === "ko" ? "방금" : "just now"
  if (minutes < 60) return locale === "ko" ? `${minutes}분 전` : `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return locale === "ko" ? `${hours}시간 전` : `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 7) return locale === "ko" ? `${days}일 전` : `${days}d ago`
  return new Date(date).toLocaleDateString(locale === "ko" ? "ko-KR" : "en-US", {
    month: "short",
    day: "numeric",
  })
}
