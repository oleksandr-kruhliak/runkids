// In-app race recording: captures the current tab (canvas + broadcast overlay)
// with the browser's own capture API and saves a .webm when stopped.

export function isRecordingSupported(): boolean {
  return !!(
    typeof navigator !== 'undefined' &&
    navigator.mediaDevices &&
    'getDisplayMedia' in navigator.mediaDevices &&
    typeof MediaRecorder !== 'undefined'
  )
}

/**
 * Ask the browser to capture this tab and start recording. Resolves with a
 * `stop` function; `onDone` fires with the finished blob (also when the user
 * ends the capture from the browser's own UI).
 */
export async function startTabRecording(onDone: (blob: Blob) => void): Promise<() => void> {
  const stream: MediaStream = await (navigator.mediaDevices as any).getDisplayMedia({
    video: { frameRate: 60 },
    // Capture the tab's own audio so the game's sound effects land in the file.
    audio: true,
    // Chrome: preselect this tab in the picker.
    preferCurrentTab: true,
  })
  const mime =
    [
      'video/webm;codecs=vp9,opus',
      'video/webm;codecs=vp8,opus',
      'video/webm;codecs=vp9',
      'video/webm',
    ].find((m) => MediaRecorder.isTypeSupported(m)) ?? ''
  const rec = new MediaRecorder(
    stream,
    mime ? { mimeType: mime, videoBitsPerSecond: 12_000_000 } : undefined,
  )
  const chunks: Blob[] = []
  rec.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data)
  }
  rec.onstop = () => {
    stream.getTracks().forEach((t) => t.stop())
    onDone(new Blob(chunks, { type: mime || 'video/webm' }))
  }
  // The user can also end the capture from the browser UI ("Stop sharing").
  stream.getVideoTracks()[0]?.addEventListener('ended', () => {
    if (rec.state !== 'inactive') rec.stop()
  })
  rec.start(1000)
  return () => {
    if (rec.state !== 'inactive') rec.stop()
  }
}

export function downloadRecording(blob: Blob): void {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  const name = `runkids-race-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}.webm`
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}
