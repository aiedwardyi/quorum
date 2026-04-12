import { redirect } from "next/navigation"

export default async function ChatRedirect({
  searchParams,
}: {
  searchParams: Promise<{ thread?: string }>
}) {
  const params = await searchParams
  const thread = params.thread
  redirect(thread ? `/?thread=${thread}` : "/")
}
