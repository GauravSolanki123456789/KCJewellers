import axios from '@/lib/axios'
import { LOCAL_PRINT_AGENT_URL, getLocalPrintAgentInfo } from '@/lib/erp-local-print'

export type TallyExportJob = {
  ref: string
  type: string
  xml: string
}

export type TallyDaybookExportResponse = {
  date: string
  tallyUrl: string
  company: string
  jobs: TallyExportJob[]
  synced?: number
  failed?: number
  results?: { ok: boolean; ref: string; type?: string; error?: string }[]
  message?: string
  requiresLocalAgent?: boolean
}

async function postXmlViaLocalAgent(tallyUrl: string, xml: string): Promise<void> {
  const r = await fetch(`${LOCAL_PRINT_AGENT_URL}/tally-import`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tallyUrl, xml }),
    signal: AbortSignal.timeout(60000),
  })
  let data: { ok?: boolean; error?: string; tallyError?: string } = {}
  try {
    data = (await r.json()) as typeof data
  } catch {
    data = {}
  }
  if (!r.ok || !data.ok) {
    throw new Error(data.tallyError || data.error || `Tally import failed (${r.status})`)
  }
}

export async function exportDaybookToTallyLocal(date: string): Promise<TallyDaybookExportResponse> {
  const agent = await getLocalPrintAgentInfo()
  if (!agent.ok) {
    throw new Error(
      'Start KC ERP Print Service on this PC (START-KC-Label-Print.bat). Tally runs on your shop computer, not on the website server.',
    )
  }

  const prep = await axios.post<TallyDaybookExportResponse>(
    '/api/reseller/erp/ledger/daybook/export-tally',
    { date },
  )
  const pack = prep.data
  const jobs = pack.jobs || []
  if (!jobs.length) {
    return { ...pack, synced: 0, failed: 0, results: [], message: pack.message || 'Nothing to export.' }
  }

  const tallyUrl = pack.tallyUrl || 'http://localhost:9000'
  const results: TallyDaybookExportResponse['results'] = []
  let synced = 0
  let failed = 0

  for (const job of jobs) {
    try {
      await postXmlViaLocalAgent(tallyUrl, job.xml)
      synced += 1
      results.push({ ok: true, ref: job.ref, type: job.type })
    } catch (e) {
      failed += 1
      results.push({
        ok: false,
        ref: job.ref,
        type: job.type,
        error: e instanceof Error ? e.message : String(e),
      })
    }
  }

  const firstErr = results.find((r) => !r.ok)?.error
  const message =
    failed === 0
      ? `Exported ${synced} voucher(s) to Tally for ${pack.date}.`
      : `Exported ${synced}; ${failed} failed.${firstErr ? ` ${firstErr}` : ''}`

  return { ...pack, synced, failed, results, message }
}
