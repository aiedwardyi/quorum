import type { Metadata } from "next"
import Link from "next/link"

export const metadata: Metadata = {
  title: "Quorum Demo",
  description: "Shareable pipeline demo for Quorum.",
}

export default function DemoPage() {
  return (
    <main className="min-h-screen bg-background text-foreground px-4 py-8 sm:px-6 sm:py-10">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
        <div className="flex flex-col gap-3">
          <div className="inline-flex w-fit items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Shareable Demo
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div className="space-y-2">
              <h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
                Quorum Pipeline Demo
              </h1>
              <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground sm:text-[15px]">
                Auto-playing demo cut with the typed intro, multi-model debate, and polished final
                verdict. Optimized for desktop viewing.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Link
                href="/demo/quorum-pipeline-demo.html"
                target="_blank"
                className="inline-flex items-center justify-center rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground shadow-sm transition-opacity hover:opacity-90"
              >
                Open Full Demo
              </Link>
            </div>
          </div>
        </div>

        <div className="overflow-hidden rounded-[28px] border border-border bg-card shadow-[0_20px_60px_rgba(0,0,0,0.16)]">
          <iframe
            src="/demo/quorum-pipeline-demo.html"
            title="Quorum pipeline demo"
            className="block aspect-[4/3] w-full bg-black"
            allowFullScreen
          />
        </div>

        <p className="text-xs text-muted-foreground">
          Share this page as <span className="font-mono">/demo</span>, or send the direct HTML link
          for the full-screen version.
        </p>
      </div>
    </main>
  )
}
