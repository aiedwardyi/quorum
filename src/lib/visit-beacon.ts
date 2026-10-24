// Browser-only: one anonymous /api/visit ping per Seoul day; any failure is silent.
import { seoulDay } from "@/lib/seoul-day"

const ID_KEY = "quorum_visitor_id"
const DAY_KEY = "quorum_visit_day"

export async function sendDailyVisit(now = new Date()): Promise<void> {
  try {
    const day = seoulDay(now)
    if (localStorage.getItem(DAY_KEY) === day) return
    let id = localStorage.getItem(ID_KEY)
    if (!id) {
      id = crypto.randomUUID()
      localStorage.setItem(ID_KEY, id)
    }
    const res = await fetch("/api/visit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
      keepalive: true,
    })
    if (res.ok) localStorage.setItem(DAY_KEY, day)
  } catch {
    // Counting visitors must never surface to the user.
  }
}
