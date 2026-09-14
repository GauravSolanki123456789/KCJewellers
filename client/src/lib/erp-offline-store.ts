import axios from '@/lib/axios'
import type { ErpBill, ErpCustomer, ErpProductHit } from '@/components/reseller/erp/erp-ui'

const DB_NAME = 'kc-erp-offline-v1'
const DB_VERSION = 1

export type OfflineQueueType = 'customer' | 'estimate' | 'sale'

export type OfflineQueueItem = {
  id: string
  type: OfflineQueueType
  createdAt: string
  payload: Record<string, unknown>
  localCustomerId?: number | null
  barcodes?: string[]
  status: 'pending' | 'error' | 'done'
  error?: string
  serverBillNumber?: string
  serverId?: number
  localBillNumber?: string
}

export type OfflineSnapshotMeta = {
  capturedAt: string
  customerCount: number
  pieceCount: number
  blockedCount: number
}

type OfflinePiece = ErpProductHit & { barcode?: string | null }

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('This browser cannot store offline data.'))
      return
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta')
      if (!db.objectStoreNames.contains('customers')) db.createObjectStore('customers', { keyPath: 'id' })
      if (!db.objectStoreNames.contains('pieces')) {
        const pieces = db.createObjectStore('pieces', { keyPath: 'id' })
        pieces.createIndex('barcode', 'barcode', { unique: false })
      }
      if (!db.objectStoreNames.contains('blocked')) db.createObjectStore('blocked')
      if (!db.objectStoreNames.contains('queue')) db.createObjectStore('queue', { keyPath: 'id' })
      if (!db.objectStoreNames.contains('localSold')) db.createObjectStore('localSold')
      if (!db.objectStoreNames.contains('rates')) db.createObjectStore('rates')
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error || new Error('IndexedDB open failed'))
  })
}

function reqToPromise<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
    tx.onabort = () => reject(tx.error)
  })
}

export function isOfflineOrNetworkError(e: unknown): boolean {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true
  const err = e as { code?: string; message?: string; response?: unknown }
  if (err?.response) return false
  const code = String(err?.code || '')
  const msg = String(err?.message || '')
  return (
    code === 'ERR_NETWORK' ||
    code === 'ECONNABORTED' ||
    /network error|failed to fetch|load failed|offline/i.test(msg)
  )
}

export async function registerErpOfflineSw(): Promise<void> {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return
  try {
    await navigator.serviceWorker.register('/erp-offline-sw.js', { scope: '/' })
  } catch {
    /* private mode / unsupported */
  }
}

export async function getOfflineSnapshotMeta(): Promise<OfflineSnapshotMeta | null> {
  try {
    const db = await openDb()
    const raw = await reqToPromise(db.transaction('meta').objectStore('meta').get('snapshot'))
    db.close()
    if (!raw || typeof raw !== 'object') return null
    return raw as OfflineSnapshotMeta
  } catch {
    return null
  }
}

export async function listOfflineQueue(): Promise<OfflineQueueItem[]> {
  try {
    const db = await openDb()
    const rows = await reqToPromise(db.transaction('queue').objectStore('queue').getAll())
    db.close()
    return ((rows || []) as OfflineQueueItem[])
      .filter((r) => r.status !== 'done')
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  } catch {
    return []
  }
}

export async function pendingOfflineCount(): Promise<number> {
  const rows = await listOfflineQueue()
  return rows.filter((r) => r.status === 'pending' || r.status === 'error').length
}

async function putLocalSold(barcodes: string[]) {
  if (!barcodes.length) return
  const db = await openDb()
  const tx = db.transaction('localSold', 'readwrite')
  const store = tx.objectStore('localSold')
  for (const bc of barcodes) {
    const key = bc.trim().toLowerCase()
    if (key) store.put(true, key)
  }
  await txDone(tx)
  db.close()
}

export async function lookupOfflineProduct(code: string): Promise<
  { product: ErpProductHit } | { sold: true } | null
> {
  const needle = code.trim()
  if (!needle) return null
  const key = needle.toLowerCase()
  const db = await openDb()
  const blocked = await reqToPromise(db.transaction('blocked').objectStore('blocked').get(key))
  const localSold = await reqToPromise(db.transaction('localSold').objectStore('localSold').get(key))
  if (blocked || localSold) {
    db.close()
    return { sold: true }
  }
  const idx = db.transaction('pieces').objectStore('pieces').index('barcode')
  const rows = (await reqToPromise(idx.getAll(needle))) as OfflinePiece[]
  const alt = rows.length ? rows : ((await reqToPromise(idx.getAll(needle.toUpperCase()))) as OfflinePiece[])
  db.close()
  const hit =
    alt.find((p) => String(p.barcode || '').trim().toLowerCase() === key) ||
    alt[0] ||
    null
  if (!hit) return null
  return {
    product: {
      ...hit,
      barcode: hit.barcode || needle,
      name: hit.product_name || hit.name || needle,
      product_name: hit.product_name || hit.name || needle,
    },
  }
}

export async function searchOfflineCustomers(q: string): Promise<ErpCustomer[]> {
  const db = await openDb()
  const rows = (await reqToPromise(db.transaction('customers').objectStore('customers').getAll())) as ErpCustomer[]
  db.close()
  const needle = q.trim().toLowerCase()
  if (!needle) return rows.slice(0, 80)
  return rows
    .filter((c) => {
      const blob = [c.name, c.mobile, c.gstin, c.pan, c.email].map((x) => String(x || '').toLowerCase()).join(' ')
      return blob.includes(needle)
    })
    .slice(0, 80)
}

function newOpId() {
  return `off-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

function nextLocalBillNumber(type: OfflineQueueType) {
  const d = new Date()
  const stamp = `${String(d.getDate()).padStart(2, '0')}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getFullYear()).slice(-2)}`
  const seq = String(d.getHours()).padStart(2, '0') + String(d.getMinutes()).padStart(2, '0') + String(d.getSeconds()).padStart(2, '0')
  if (type === 'estimate') return `OFF-EST-${stamp}-${seq}`
  return `OFF-BILL-${stamp}-${seq}`
}

export async function enqueueOfflineCustomer(payload: Record<string, unknown>): Promise<ErpCustomer> {
  const localId = -Math.abs(Date.now())
  const customer: ErpCustomer = {
    id: localId,
    name: String(payload.name || '').trim(),
    mobile: payload.mobile ? String(payload.mobile) : null,
    email: payload.email ? String(payload.email) : null,
    gstin: payload.gstin ? String(payload.gstin) : null,
    pan: payload.pan ? String(payload.pan) : null,
    address: payload.address ? String(payload.address) : null,
    state: payload.state ? String(payload.state) : null,
    notes: payload.notes ? String(payload.notes) : null,
    rate_slab: payload.rate_slab ? String(payload.rate_slab) : null,
  }
  const item: OfflineQueueItem = {
    id: newOpId(),
    type: 'customer',
    createdAt: new Date().toISOString(),
    payload: { ...payload, offline_op_id: newOpId() },
    localCustomerId: localId,
    status: 'pending',
  }
  const db = await openDb()
  const tx = db.transaction(['customers', 'queue'], 'readwrite')
  tx.objectStore('customers').put(customer)
  tx.objectStore('queue').put(item)
  await txDone(tx)
  db.close()
  return customer
}

export async function enqueueOfflineDocument(opts: {
  type: 'sale' | 'estimate'
  payload: Record<string, unknown>
}): Promise<ErpBill> {
  const opId = newOpId()
  const session =
    opts.payload.session && typeof opts.payload.session === 'object'
      ? { ...(opts.payload.session as Record<string, unknown>), offlineOpId: opId }
      : { offlineOpId: opId }
  const payload: Record<string, unknown> = { ...opts.payload, session }
  const lines = Array.isArray(payload.lines) ? (payload.lines as { barcode?: string; code?: string }[]) : []
  const barcodes = lines.map((l) => String(l.barcode || l.code || '').trim()).filter(Boolean)
  const localBillNumber = nextLocalBillNumber(opts.type)
  const localCustomerId =
    payload.customer_id != null && Number(payload.customer_id) < 0 ? Number(payload.customer_id) : null
  const item: OfflineQueueItem = {
    id: opId,
    type: opts.type,
    createdAt: new Date().toISOString(),
    payload,
    localCustomerId,
    barcodes,
    status: 'pending',
    localBillNumber,
  }
  const db = await openDb()
  const tx = db.transaction(['queue', 'localSold'], 'readwrite')
  tx.objectStore('queue').put(item)
  if (opts.type === 'sale') {
    for (const bc of barcodes) {
      tx.objectStore('localSold').put(true, bc.toLowerCase())
    }
  }
  await txDone(tx)
  db.close()
  return {
    id: -Math.abs(Date.now()),
    bill_number: localBillNumber,
    bill_type: opts.type,
    customer_id: payload.customer_id != null ? Number(payload.customer_id) || null : null,
    customer_name: payload.customer_name ? String(payload.customer_name) : null,
    total_inr: Number(payload.total_inr) || 0,
    status: String(payload.status || 'completed'),
    bill_date: payload.bill_date ? String(payload.bill_date) : new Date().toISOString().slice(0, 10),
    lines: lines as ErpBill['lines'],
    session: session as ErpBill['session'],
  }
}

export async function saveOfflineSnapshot(opts: {
  capturedAt: string
  customers: ErpCustomer[]
  pieces: OfflinePiece[]
  blockedBarcodes: string[]
  rates?: unknown
}): Promise<OfflineSnapshotMeta> {
  const db = await openDb()
  const tx = db.transaction(['meta', 'customers', 'pieces', 'blocked', 'rates'], 'readwrite')
  tx.objectStore('customers').clear()
  tx.objectStore('pieces').clear()
  tx.objectStore('blocked').clear()
  for (const c of opts.customers) tx.objectStore('customers').put(c)
  for (const p of opts.pieces) {
    if (p.id == null) continue
    tx.objectStore('pieces').put({ ...p, barcode: String(p.barcode || '').trim() })
  }
  for (const bc of opts.blockedBarcodes) {
    const key = String(bc || '').trim().toLowerCase()
    if (key) tx.objectStore('blocked').put(true, key)
  }
  if (opts.rates != null) tx.objectStore('rates').put(opts.rates, 'display')
  const meta: OfflineSnapshotMeta = {
    capturedAt: opts.capturedAt,
    customerCount: opts.customers.length,
    pieceCount: opts.pieces.length,
    blockedCount: opts.blockedBarcodes.length,
  }
  tx.objectStore('meta').put(meta, 'snapshot')
  await txDone(tx)
  db.close()
  return meta
}

export async function captureOfflineSnapshotFromServer(): Promise<OfflineSnapshotMeta> {
  const res = await axios.get<{
    capturedAt: string
    customers: ErpCustomer[]
    pieces: OfflinePiece[]
    blockedBarcodes: string[]
  }>('/api/reseller/erp/offline/snapshot')
  let rates: unknown
  try {
    const rateRes = await axios.get<{ rates?: unknown }>('/api/rates/display')
    rates = rateRes.data.rates ?? rateRes.data
  } catch {
    rates = undefined
  }
  await registerErpOfflineSw()
  return saveOfflineSnapshot({
    capturedAt: res.data.capturedAt || new Date().toISOString(),
    customers: res.data.customers || [],
    pieces: res.data.pieces || [],
    blockedBarcodes: res.data.blockedBarcodes || [],
    rates,
  })
}

export async function refreshOfflineSnapshotIfStale(maxAgeMs = 6 * 60 * 60 * 1000): Promise<void> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return
  const meta = await getOfflineSnapshotMeta()
  const age = meta?.capturedAt ? Date.now() - new Date(meta.capturedAt).getTime() : Infinity
  if (Number.isFinite(age) && age < maxAgeMs) return
  try {
    await captureOfflineSnapshotFromServer()
  } catch {
    /* keep previous cache */
  }
}

export async function loadCachedDisplayRates(): Promise<unknown | null> {
  try {
    const db = await openDb()
    const rates = await reqToPromise(db.transaction('rates').objectStore('rates').get('display'))
    db.close()
    return rates ?? null
  } catch {
    return null
  }
}

export async function removeOfflineQueueItem(id: string): Promise<void> {
  const db = await openDb()
  await reqToPromise(db.transaction('queue', 'readwrite').objectStore('queue').delete(id))
  db.close()
}

type SyncResult = {
  ok: number
  failed: number
  results: { id: string; ok: boolean; detail: string }[]
}

export async function syncOfflineQueue(): Promise<SyncResult> {
  const items = await listOfflineQueue()
  const localToServerCustomer = new Map<number, number>()
  const results: SyncResult['results'] = []
  let ok = 0
  let failed = 0

  const writeItem = async (item: OfflineQueueItem) => {
    const db = await openDb()
    await reqToPromise(db.transaction('queue', 'readwrite').objectStore('queue').put(item))
    db.close()
  }

  for (const item of items) {
    try {
      if (item.type === 'customer') {
        const payload = { ...item.payload }
        const mobile = String(payload.mobile || '').trim()
        const name = String(payload.name || '').trim()
        let customer: ErpCustomer | null = null
        if (mobile) {
          const found = await axios.get<{ customers: ErpCustomer[] }>('/api/reseller/erp/customers', {
            params: { q: mobile, limit: 20 },
          })
          customer =
            (found.data.customers || []).find(
              (c) => String(c.mobile || '').replace(/\D/g, '') === mobile.replace(/\D/g, ''),
            ) || null
        }
        if (!customer) {
          const created = await axios.post<{ customer: ErpCustomer }>('/api/reseller/erp/customers', payload)
          customer = created.data.customer
        }
        if (item.localCustomerId && customer?.id) localToServerCustomer.set(item.localCustomerId, customer.id)
        item.status = 'done'
        item.serverId = customer?.id
        await writeItem(item)
        results.push({ id: item.id, ok: true, detail: `Customer ${customer?.name || name}` })
        ok += 1
        continue
      }

      const payload = { ...item.payload } as Record<string, unknown>
      const localCid =
        item.localCustomerId ||
        (payload.customer_id != null && Number(payload.customer_id) < 0 ? Number(payload.customer_id) : null)
      if (localCid && localToServerCustomer.has(localCid)) {
        payload.customer_id = localToServerCustomer.get(localCid)
      } else if (localCid && Number(payload.customer_id) < 0) {
        throw new Error('Customer from this device has not synced yet')
      }
      const res = await axios.post<{ bill: ErpBill; shadow?: boolean }>('/api/reseller/erp/bills', payload)
      item.status = 'done'
      item.serverId = res.data.bill?.id
      item.serverBillNumber = res.data.bill?.bill_number
      await writeItem(item)
      results.push({
        id: item.id,
        ok: true,
        detail: `${item.localBillNumber || item.type} → ${res.data.bill?.bill_number || 'saved'}`,
      })
      ok += 1
    } catch (e) {
      const err = e as { response?: { data?: { error?: string } }; message?: string }
      item.status = 'error'
      item.error = err.response?.data?.error || err.message || 'Sync failed'
      await writeItem(item)
      results.push({ id: item.id, ok: false, detail: item.error })
      failed += 1
    }
  }

  return { ok, failed, results }
}
