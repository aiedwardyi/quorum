// Browsers name every clipboard bitmap image.png; files copied in Explorer keep their real name.
const GENERIC_CLIPBOARD_NAME = /^image\.\w+$/i

/** Files to attach from a paste; text wins, since Word and Excel also paste a picture of it. */
export function pastedFiles(
  data: Pick<DataTransfer, "files" | "getData">,
  nextImageName: (ext: string) => string
): File[] {
  if (data.getData("text/plain").trim()) return []
  return Array.from(data.files).map((file) =>
    GENERIC_CLIPBOARD_NAME.test(file.name)
      ? new File([file], nextImageName(file.name.split(".").pop()!.toLowerCase()), {
          type: file.type,
        })
      : file
  )
}
