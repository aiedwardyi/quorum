"use client"

import { useEffect } from "react"
import { sendDailyVisit } from "@/lib/visit-beacon"

export default function VisitBeacon() {
  useEffect(() => {
    void sendDailyVisit()
  }, [])
  return null
}
