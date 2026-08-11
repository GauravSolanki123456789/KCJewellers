/** Fast QR scanning — native BarcodeDetector → ZXing → html5-qrcode fallback. */

export type QrScanCallbacks = {
  onDecode: (raw: string) => void
  onStatus?: (status: string) => void
  onError?: (message: string) => void
}

export function barcodeDetectorSupported(): boolean {
  return typeof window !== 'undefined' && 'BarcodeDetector' in window
}

type StopFn = () => Promise<void>

/** Wait until scanner mount node exists (mobile modal paint). */
async function waitForElement(id: string, maxMs = 2000): Promise<HTMLElement | null> {
  const start = Date.now()
  while (Date.now() - start < maxMs) {
    const el = document.getElementById(id)
    if (el) return el
    await new Promise((r) => requestAnimationFrame(r))
  }
  return document.getElementById(id)
}

async function startBarcodeDetectorScan(
  readerId: string,
  callbacks: QrScanCallbacks,
): Promise<StopFn | null> {
  if (!barcodeDetectorSupported()) return null

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const BarcodeDetectorCtor = (window as any).BarcodeDetector as
    | (new (opts: { formats: string[] }) => { detect: (src: ImageBitmapSource) => Promise<Array<{ rawValue?: string }>> })
    | undefined
  if (!BarcodeDetectorCtor) return null

  const container = await waitForElement(readerId)
  if (!container) {
    callbacks.onError?.('Scanner could not start — try again.')
    return null
  }

  let stream: MediaStream | null = null
  let video: HTMLVideoElement | null = null
  let stopped = false
  let lastRaw = ''
  let lastAt = 0

  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: { ideal: 'environment' },
        width: { ideal: 1920 },
        height: { ideal: 1080 },
      },
      audio: false,
    })

    video = document.createElement('video')
    video.setAttribute('playsinline', 'true')
    video.setAttribute('autoplay', 'true')
    video.muted = true
    video.style.width = '100%'
    video.style.height = '100%'
    video.style.objectFit = 'cover'
    container.innerHTML = ''
    container.appendChild(video)
    video.srcObject = stream
    await video.play()

    const detector = new BarcodeDetectorCtor({ formats: ['qr_code'] })
    callbacks.onStatus?.('Point at QR — scanning…')

    const tick = () => {
      if (stopped || !video) return
      void detector
        .detect(video)
        .then((codes) => {
          if (stopped) return
          const raw = codes?.[0]?.rawValue?.trim()
          if (raw) {
            const now = Date.now()
            if (raw !== lastRaw || now - lastAt > 600) {
              lastRaw = raw
              lastAt = now
              callbacks.onStatus?.(`Detected: ${raw.slice(0, 40)}${raw.length > 40 ? '…' : ''}`)
              callbacks.onDecode(raw)
              return
            }
          }
          if (!stopped) requestAnimationFrame(tick)
        })
        .catch(() => {
          if (!stopped) requestAnimationFrame(tick)
        })
    }
    requestAnimationFrame(tick)

    return async () => {
      stopped = true
      if (video) {
        video.pause()
        video.srcObject = null
      }
      stream?.getTracks().forEach((t) => t.stop())
      if (container) container.innerHTML = ''
    }
  } catch (e) {
    stream?.getTracks().forEach((t) => t.stop())
    callbacks.onError?.(
      e instanceof Error ? e.message : 'Camera access denied. Allow camera in browser settings.',
    )
    return null
  }
}

async function startZxingScan(
  readerId: string,
  callbacks: QrScanCallbacks,
): Promise<StopFn | null> {
  const container = await waitForElement(readerId)
  if (!container) {
    callbacks.onError?.('Scanner could not start — try again.')
    return null
  }

  try {
    const { BrowserQRCodeReader } = await import('@zxing/browser')
    const reader = new BrowserQRCodeReader(undefined, {
      delayBetweenScanAttempts: 80,
      delayBetweenScanSuccess: 600,
    })

    const devices = await BrowserQRCodeReader.listVideoInputDevices()
    if (!devices?.length) {
      callbacks.onError?.('No camera found on this device.')
      return null
    }

    const backCam =
      devices.find((d) => /back|rear|environment/i.test(d.label))?.deviceId ||
      devices[devices.length - 1].deviceId

    let lastRaw = ''
    let lastAt = 0

    const controls = await reader.decodeFromVideoDevice(
      backCam,
      readerId,
      (result) => {
        const raw = result?.getText()?.trim()
        if (!raw) return
        const now = Date.now()
        if (raw === lastRaw && now - lastAt < 600) return
        lastRaw = raw
        lastAt = now
        callbacks.onStatus?.(`Detected: ${raw.slice(0, 40)}${raw.length > 40 ? '…' : ''}`)
        callbacks.onDecode(raw)
      },
    )

    callbacks.onStatus?.('Point at QR — scanning…')

    return async () => {
      try {
        controls.stop()
      } catch {
        /* already stopped */
      }
    }
  } catch {
    return null
  }
}

async function startHtml5QrcodeScan(
  readerId: string,
  callbacks: QrScanCallbacks,
): Promise<StopFn | null> {
  const container = await waitForElement(readerId)
  if (!container) {
    callbacks.onError?.('Scanner could not start — try again.')
    return null
  }

  const { Html5Qrcode, Html5QrcodeSupportedFormats } = await import('html5-qrcode')
  const scanner = new Html5Qrcode(
    readerId,
    {
      verbose: false,
      experimentalFeatures: { useBarCodeDetectorIfSupported: true },
      formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE],
    },
  )

  const cameras = await Html5Qrcode.getCameras()
  if (!cameras?.length) {
    callbacks.onError?.('No camera found on this device.')
    return null
  }

  const backCam =
    cameras.find((c) => /back|rear|environment/i.test(c.label))?.id || cameras[cameras.length - 1].id

  let lastRaw = ''
  let lastAt = 0

  await scanner.start(
    backCam,
    {
      fps: 20,
      qrbox: undefined,
      aspectRatio: 1,
      disableFlip: false,
      videoConstraints: {
        facingMode: { ideal: 'environment' },
        width: { ideal: 1920 },
        height: { ideal: 1080 },
      },
    },
    (decoded) => {
      const raw = String(decoded || '').trim()
      if (!raw) return
      const now = Date.now()
      if (raw === lastRaw && now - lastAt < 800) return
      lastRaw = raw
      lastAt = now
      callbacks.onStatus?.(`Detected: ${raw.slice(0, 40)}${raw.length > 40 ? '…' : ''}`)
      callbacks.onDecode(raw)
    },
    () => {
      /* per-frame miss */
    },
  )

  callbacks.onStatus?.('Point at QR — scanning…')

  return async () => {
    try {
      await scanner.stop()
    } catch {
      /* already stopped */
    }
    try {
      scanner.clear()
    } catch {
      /* ignore */
    }
  }
}

export async function startProductQrScanner(
  readerId: string,
  callbacks: QrScanCallbacks,
): Promise<StopFn> {
  callbacks.onStatus?.('Starting camera…')

  const nativeStop = await startBarcodeDetectorScan(readerId, callbacks)
  if (nativeStop) return nativeStop

  const zxingStop = await startZxingScan(readerId, callbacks)
  if (zxingStop) return zxingStop

  const h5Stop = await startHtml5QrcodeScan(readerId, callbacks)
  if (h5Stop) return h5Stop

  throw new Error('Could not start QR scanner on this device.')
}
