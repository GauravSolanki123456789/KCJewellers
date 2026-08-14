/** ERP billing — camera scan for QR + 1D barcodes (mobile & laptop). */

export type BarcodeScanCallbacks = {
  onDecode: (raw: string) => void
  onStatus?: (status: string) => void
  onError?: (message: string) => void
}

export type StopScanFn = () => Promise<void>

const BARCODE_DETECTOR_FORMATS = [
  'qr_code',
  'code_128',
  'code_39',
  'code_93',
  'ean_13',
  'ean_8',
  'upc_a',
  'upc_e',
  'itf',
  'codabar',
]

async function waitForElement(id: string, maxMs = 2500): Promise<HTMLElement | null> {
  const start = Date.now()
  while (Date.now() - start < maxMs) {
    const el = document.getElementById(id)
    if (el) return el
    await new Promise((r) => requestAnimationFrame(r))
  }
  return document.getElementById(id)
}

async function startNativeScan(readerId: string, callbacks: BarcodeScanCallbacks): Promise<StopScanFn | null> {
  if (typeof window === 'undefined' || !('BarcodeDetector' in window)) return null

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const BarcodeDetectorCtor = (window as any).BarcodeDetector as
    | (new (opts: { formats: string[] }) => {
        detect: (src: ImageBitmapSource) => Promise<Array<{ rawValue?: string }>>
      })
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

    const detector = new BarcodeDetectorCtor({ formats: BARCODE_DETECTOR_FORMATS })
    callbacks.onStatus?.('Point camera at barcode or QR…')

    const tick = () => {
      if (stopped || !video) return
      void detector
        .detect(video)
        .then((codes) => {
          if (stopped) return
          const raw = codes?.[0]?.rawValue?.trim()
          if (raw) {
            const now = Date.now()
            if (raw !== lastRaw || now - lastAt > 700) {
              lastRaw = raw
              lastAt = now
              callbacks.onStatus?.(`Found: ${raw.slice(0, 48)}${raw.length > 48 ? '…' : ''}`)
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
      video?.pause()
      if (video) video.srcObject = null
      stream?.getTracks().forEach((t) => t.stop())
      container.innerHTML = ''
    }
  } catch (e) {
    stream?.getTracks().forEach((t) => t.stop())
    callbacks.onError?.(
      e instanceof Error ? e.message : 'Camera access denied. Allow camera in Chrome settings.',
    )
    return null
  }
}

async function startZxingScan(readerId: string, callbacks: BarcodeScanCallbacks): Promise<StopScanFn | null> {
  const container = await waitForElement(readerId)
  if (!container) {
    callbacks.onError?.('Scanner could not start — try again.')
    return null
  }

  try {
    const { BrowserMultiFormatReader } = await import('@zxing/browser')
    const reader = new BrowserMultiFormatReader(undefined, {
      delayBetweenScanAttempts: 100,
      delayBetweenScanSuccess: 700,
    })

    const devices = await BrowserMultiFormatReader.listVideoInputDevices()
    if (!devices?.length) {
      callbacks.onError?.('No camera found on this device.')
      return null
    }

    const backCam =
      devices.find((d) => /back|rear|environment/i.test(d.label))?.deviceId ||
      devices[devices.length - 1].deviceId

    let lastRaw = ''
    let lastAt = 0

    const controls = await reader.decodeFromVideoDevice(backCam, readerId, (result) => {
      const raw = result?.getText()?.trim()
      if (!raw) return
      const now = Date.now()
      if (raw === lastRaw && now - lastAt < 700) return
      lastRaw = raw
      lastAt = now
      callbacks.onStatus?.(`Found: ${raw.slice(0, 48)}${raw.length > 48 ? '…' : ''}`)
      callbacks.onDecode(raw)
    })

    callbacks.onStatus?.('Point camera at barcode or QR…')

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

async function startHtml5Scan(readerId: string, callbacks: BarcodeScanCallbacks): Promise<StopScanFn | null> {
  if (!(await waitForElement(readerId))) {
    callbacks.onError?.('Scanner could not start — try again.')
    return null
  }

  const { Html5Qrcode, Html5QrcodeSupportedFormats } = await import('html5-qrcode')
  const scanner = new Html5Qrcode(readerId, {
    verbose: false,
    experimentalFeatures: { useBarCodeDetectorIfSupported: true },
    formatsToSupport: [
      Html5QrcodeSupportedFormats.QR_CODE,
      Html5QrcodeSupportedFormats.CODE_128,
      Html5QrcodeSupportedFormats.CODE_39,
      Html5QrcodeSupportedFormats.EAN_13,
      Html5QrcodeSupportedFormats.UPC_A,
      Html5QrcodeSupportedFormats.ITF,
    ],
  })

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
      fps: 16,
      qrbox: (vw, vh) => {
        const side = Math.min(vw, vh) * 0.72
        return { width: side, height: side * 0.55 }
      },
      aspectRatio: 1,
      videoConstraints: { facingMode: { ideal: 'environment' } },
    },
    (decoded) => {
      const raw = String(decoded || '').trim()
      if (!raw) return
      const now = Date.now()
      if (raw === lastRaw && now - lastAt < 800) return
      lastRaw = raw
      lastAt = now
      callbacks.onStatus?.(`Found: ${raw.slice(0, 48)}${raw.length > 48 ? '…' : ''}`)
      callbacks.onDecode(raw)
    },
    () => {},
  )

  callbacks.onStatus?.('Point camera at barcode or QR…')

  return async () => {
    try {
      await scanner.stop()
    } catch {
      /* ignore */
    }
    try {
      scanner.clear()
    } catch {
      /* ignore */
    }
  }
}

export async function startErpBarcodeScanner(
  readerId: string,
  callbacks: BarcodeScanCallbacks,
): Promise<StopScanFn> {
  callbacks.onStatus?.('Starting camera…')

  const nativeStop = await startNativeScan(readerId, callbacks)
  if (nativeStop) return nativeStop

  const zxingStop = await startZxingScan(readerId, callbacks)
  if (zxingStop) return zxingStop

  const h5Stop = await startHtml5Scan(readerId, callbacks)
  if (h5Stop) return h5Stop

  throw new Error('Could not start camera scanner on this device.')
}
