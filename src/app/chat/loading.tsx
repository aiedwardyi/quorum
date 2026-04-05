export default function ChatLoading() {
  return (
    <div className="flex flex-col h-screen bg-background">
      {/* Header skeleton */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-border">
        <div className="flex items-center gap-4">
          <div className="h-5 w-24 bg-muted rounded animate-pulse" />
          <div className="h-4 w-16 bg-muted rounded animate-pulse" />
        </div>
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 bg-muted rounded-full animate-pulse" />
          <div className="h-8 w-8 bg-muted rounded-full animate-pulse" />
        </div>
      </div>

      {/* Chat area skeleton */}
      <div className="flex-1 flex items-center justify-center">
        <div className="space-y-4 text-center">
          <div className="h-20 w-20 bg-muted rounded-[2.5rem] mx-auto animate-pulse" />
          <div className="h-8 w-48 bg-muted rounded mx-auto animate-pulse" />
          <div className="h-4 w-64 bg-muted rounded mx-auto animate-pulse" />
        </div>
      </div>

      {/* Input skeleton */}
      <div className="w-full max-w-3xl mx-auto p-4 pb-6">
        <div className="h-14 bg-muted rounded-3xl animate-pulse" />
      </div>
    </div>
  )
}
