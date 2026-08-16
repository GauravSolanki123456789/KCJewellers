'use client'

import { useEffect, useRef, useState } from 'react'
import axios from '@/lib/axios'
import { erpBtnGhost, erpBtnPrimary, erpCardCls, erpInputCls } from '@/components/reseller/erp/erp-ui'
import {
  DEFAULT_BILL_TEMPLATE,
  DEFAULT_ESTIMATE_TEMPLATE_GOLD,
  DEFAULT_ESTIMATE_TEMPLATE_SILVER,
  DEFAULT_LABEL_PRN,
  DEFAULT_LABEL_PRN_GOLD,
  DEFAULT_LABEL_PRN_SILVER,
  DEFAULT_LABEL_PRN_SILVER_EXTRAS,
  buildDefaultLabelPrnRules,
  isPrnTemplateLikelyCorrupted,
  LABEL_RULE_FIELD_KEYS,
  LABEL_RULE_FIELD_LABELS,
  migratePrintFormats,
  newRuleId,
  normalizePrnTemplate,
  preserveBillTemplate,
  preservePrnTemplate,
  suggestPrnPlaceholders,
  type ErpPrintFormatsSettings,
  type LabelPrnRule,
  type LabelRuleFieldKey,
} from '@/lib/erp-print-templates'
import {
  ERP_QUOTE_OUTPUT_LABELS,
  ERP_QUOTE_OUTPUT_MODES,
  normalizeQuoteOutputMode,
  type ErpQuoteOutputMode,
} from '@/lib/erp-quote-output'
import { ChevronDown, ChevronUp, FileText, Loader2, Plus, RotateCcw, Save, Tag, Trash2, Upload, Wand2 } from 'lucide-react'

export function ErpPrintFormatsWorkspace() {
  const [pf, setPf] = useState<ErpPrintFormatsSettings>(() => migratePrintFormats({}))
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState(false)
  const [tab, setTab] = useState<'label' | 'bill' | 'estimate'>('label')
  const [expandedRuleId, setExpandedRuleId] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const ruleFileRef = useRef<HTMLInputElement>(null)
  const [ruleUploadTargetId, setRuleUploadTargetId] = useState<string | null>(null)

  useEffect(() => {
    void axios
      .get<{ settings: { printFormats?: ErpPrintFormatsSettings } }>('/api/reseller/erp/settings')
      .then((res) => setPf(migratePrintFormats(res.data.settings?.printFormats)))
      .catch(() => {})
  }, [])

  const save = async () => {
    setBusy(true)
    setSaved(false)
    try {
      const payload = migratePrintFormats({
        ...pf,
        labelPrnTemplate: preservePrnTemplate(pf.labelPrnTemplate),
        labelPrnRules: (pf.labelPrnRules || []).map((rule) => ({
          ...rule,
          template: preservePrnTemplate(rule.template),
        })),
        billTemplate: preserveBillTemplate(pf.billTemplate),
        estimateTemplateGold: preserveBillTemplate(pf.estimateTemplateGold),
        estimateTemplateSilver: preserveBillTemplate(pf.estimateTemplateSilver),
      })
      await axios.put('/api/reseller/erp/settings', { settings: { printFormats: payload } })
      setPf(payload)
      setSaved(true)
    } catch {
      alert('Could not save print formats')
    } finally {
      setBusy(false)
    }
  }

  const updateRule = (id: string, patch: Partial<LabelPrnRule>) => {
    setPf((p) => ({
      ...p,
      labelPrnRules: (p.labelPrnRules || []).map((r) => (r.id === id ? { ...r, ...patch } : r)),
    }))
  }

  const removeRule = (id: string) => {
    setPf((p) => ({
      ...p,
      labelPrnRules: (p.labelPrnRules || []).filter((r) => r.id !== id),
    }))
  }

  const addRule = (preset?: 'gold' | 'silver' | 'silver-extras' | 'blank') => {
    const templates: Record<string, string> = {
      gold: DEFAULT_LABEL_PRN_GOLD,
      silver: DEFAULT_LABEL_PRN_SILVER,
      'silver-extras': DEFAULT_LABEL_PRN_SILVER_EXTRAS,
      blank: DEFAULT_LABEL_PRN,
    }
    const names: Record<string, string> = {
      gold: 'Gold',
      silver: 'Silver · standard',
      'silver-extras': 'Silver · gross / bag / stone',
      blank: 'Custom rule',
    }
    const presets: Partial<LabelPrnRule> =
      preset === 'gold'
        ? { metalTypes: ['GOLD'], priority: 20 }
        : preset === 'silver'
          ? { metalTypes: ['SILVER'], priority: 10 }
          : preset === 'silver-extras'
            ? {
                metalTypes: ['SILVER'],
                priority: 30,
                requireAny: ['gross_weight', 'bag_wt', 'stone_charges'],
              }
            : { metalTypes: [], priority: 0 }
    const id = newRuleId()
    const rule: LabelPrnRule = {
      id,
      name: names[preset || 'blank'] || 'Custom rule',
      enabled: true,
      priority: presets.priority ?? 0,
      metalTypes: presets.metalTypes || [],
      requireAny: presets.requireAny || [],
      requireAll: presets.requireAll || [],
      requireNone: presets.requireNone || [],
      template: templates[preset || 'blank'] || DEFAULT_LABEL_PRN,
    }
    setPf((p) => ({
      ...p,
      labelPrnRules: [...(p.labelPrnRules || []), rule].sort((a, b) => b.priority - a.priority),
    }))
    setExpandedRuleId(id)
  }

  const enableSmartRules = () => {
    if ((pf.labelPrnRules || []).length) return
    setPf((p) => ({
      ...p,
      labelPrnRules: buildDefaultLabelPrnRules(p.labelPrnTemplate),
    }))
    setExpandedRuleId('gold')
  }

  const toggleRuleField = (
    id: string,
    listKey: 'requireAny' | 'requireAll' | 'requireNone',
    field: LabelRuleFieldKey,
  ) => {
    setPf((p) => ({
      ...p,
      labelPrnRules: (p.labelPrnRules || []).map((r) => {
        if (r.id !== id) return r
        const current = new Set(r[listKey] || [])
        if (current.has(field)) current.delete(field)
        else current.add(field)
        return { ...r, [listKey]: Array.from(current) as LabelRuleFieldKey[] }
      }),
    }))
  }

  const onUploadRulePrn = async (file: File, ruleId: string) => {
    const raw = await file.text()
    updateRule(ruleId, { template: suggestPrnPlaceholders(raw) })
  }

  const onUploadPrn = async (file: File) => {
    const raw = await file.text()
    const converted = suggestPrnPlaceholders(raw)
    setPf((p) => ({ ...p, labelPrnTemplate: converted, labelUsePrn: true }))
    setTab('label')
  }

  return (
    <div className="space-y-4">
      <div className={erpCardCls}>
        <div className="flex flex-col gap-2 sm:flex-row">
          <button
            type="button"
            className={`min-h-[40px] flex-1 rounded-xl text-sm font-semibold ${
              tab === 'label'
                ? 'bg-[var(--kc-accent,#c41e3a)] text-white'
                : 'border border-[var(--color-slate-700,#e8e4df)] bg-white text-[var(--color-jewelry-black,#1a1814)]'
            }`}
            onClick={() => setTab('label')}
          >
            <Tag className="mr-1 inline size-4" />
            Label (TSC)
          </button>
          <button
            type="button"
            className={`min-h-[40px] flex-1 rounded-xl text-sm font-semibold ${
              tab === 'bill'
                ? 'bg-[var(--kc-accent,#c41e3a)] text-white'
                : 'border border-[var(--color-slate-700,#e8e4df)] bg-white text-[var(--color-jewelry-black,#1a1814)]'
            }`}
            onClick={() => setTab('bill')}
          >
            <FileText className="mr-1 inline size-4" />
            Sales bill (Epson)
          </button>
          <button
            type="button"
            className={`min-h-[40px] flex-1 rounded-xl text-sm font-semibold ${
              tab === 'estimate'
                ? 'bg-[var(--kc-accent,#c41e3a)] text-white'
                : 'border border-[var(--color-slate-700,#e8e4df)] bg-white text-[var(--color-jewelry-black,#1a1814)]'
            }`}
            onClick={() => setTab('estimate')}
          >
            <FileText className="mr-1 inline size-4" />
            Estimate (Epson)
          </button>
        </div>
      </div>

      {tab === 'label' ? (
        <>
          <div className={erpCardCls}>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-semibold text-[var(--color-jewelry-black,#1a1814)]">
                TSC label PRN template
              </p>
              <div className="flex flex-wrap gap-2">
                <input
                  ref={fileRef}
                  type="file"
                  accept=".prn,.txt,.tspl"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0]
                    if (f) void onUploadPrn(f)
                    e.target.value = ''
                  }}
                />
                <button type="button" className={erpBtnGhost} onClick={() => fileRef.current?.click()}>
                  <Upload className="size-4" />
                  Upload .prn
                </button>
                <button
                  type="button"
                  className={erpBtnGhost}
                  onClick={() => setPf((p) => ({ ...p, labelPrnTemplate: DEFAULT_LABEL_PRN }))}
                >
                  <RotateCcw className="size-4" />
                  Reset sample
                </button>
              </div>
            </div>
            <label className="mb-3 flex items-center gap-2 text-xs text-[var(--color-jewelry-black,#1a1814)]/60">
              <input
                type="checkbox"
                checked={pf.labelUsePrn !== false}
                onChange={(e) => setPf((p) => ({ ...p, labelUsePrn: e.target.checked }))}
              />
              Use this PRN template for barcode labels (TTP-244)
            </label>
            {isPrnTemplateLikelyCorrupted(pf.labelPrnTemplate) ? (
              <div className="mb-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-900">
                Line breaks in this PRN look corrupted (commands glued together). TSC needs one command per line.
                <button
                  type="button"
                  className="ml-2 font-semibold text-[var(--kc-accent,#c41e3a)] underline"
                  onClick={() =>
                    setPf((p) => ({
                      ...p,
                      labelPrnTemplate: normalizePrnTemplate(p.labelPrnTemplate || DEFAULT_LABEL_PRN),
                    }))
                  }
                >
                  Fix line breaks
                </button>
                then Save print formats.
              </div>
            ) : null}
            <textarea
              className={`${erpInputCls} min-h-[320px] whitespace-pre-wrap font-mono text-[11px] leading-relaxed`}
              value={pf.labelPrnTemplate || ''}
              onChange={(e) => setPf((p) => ({ ...p, labelPrnTemplate: e.target.value }))}
              spellCheck={false}
            />
          </div>

          <div className={erpCardCls}>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm font-semibold text-[var(--color-jewelry-black,#1a1814)]">
                Smart label rules
              </p>
              <div className="flex flex-wrap gap-2">
                {!pf.labelPrnRules?.length ? (
                  <button type="button" className={erpBtnPrimary} onClick={enableSmartRules}>
                    <Wand2 className="size-4" />
                    Enable smart rules
                  </button>
                ) : (
                  <>
                    <button type="button" className={erpBtnGhost} onClick={() => addRule('gold')}>
                      <Plus className="size-4" />
                      Gold
                    </button>
                    <button type="button" className={erpBtnGhost} onClick={() => addRule('silver')}>
                      <Plus className="size-4" />
                      Silver
                    </button>
                    <button type="button" className={erpBtnGhost} onClick={() => addRule('silver-extras')}>
                      <Plus className="size-4" />
                      Silver extras
                    </button>
                    <button type="button" className={erpBtnGhost} onClick={() => addRule('blank')}>
                      <Plus className="size-4" />
                      Custom
                    </button>
                  </>
                )}
              </div>
            </div>

            <input
              ref={ruleFileRef}
              type="file"
              accept=".prn,.txt,.tspl"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f && ruleUploadTargetId) void onUploadRulePrn(f, ruleUploadTargetId)
                e.target.value = ''
                setRuleUploadTargetId(null)
              }}
            />

            {!pf.labelPrnRules?.length ? null : (
              <div className="space-y-3">
                {[...(pf.labelPrnRules || [])]
                  .sort((a, b) => b.priority - a.priority)
                  .map((rule) => {
                    const open = expandedRuleId === rule.id
                    return (
                      <div
                        key={rule.id}
                        className="overflow-hidden rounded-xl border border-[var(--color-slate-700,#e8e4df)] bg-white"
                      >
                        <button
                          type="button"
                          className="flex w-full min-h-[48px] items-center gap-2 px-3 py-2 text-left sm:px-4"
                          onClick={() => setExpandedRuleId(open ? null : rule.id)}
                        >
                          <span
                            className={`inline-flex size-2 shrink-0 rounded-full ${rule.enabled !== false ? 'bg-emerald-500' : 'bg-[var(--color-slate-700,#e8e4df)]'}`}
                            aria-hidden
                          />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-semibold text-[var(--color-jewelry-black,#1a1814)]">
                              {rule.name}
                            </span>
                            <span className="block truncate text-[10px] text-[var(--color-jewelry-black,#1a1814)]/45">
                              Priority {rule.priority}
                              {rule.metalTypes?.length ? ` · ${rule.metalTypes.join(', ')}` : ' · any metal'}
                              {rule.requireAny?.length ? ` · needs ${rule.requireAny.join(' or ')}` : ''}
                            </span>
                          </span>
                          {open ? (
                            <ChevronUp className="size-4 shrink-0 text-[var(--color-jewelry-black,#1a1814)]/40" />
                          ) : (
                            <ChevronDown className="size-4 shrink-0 text-[var(--color-jewelry-black,#1a1814)]/40" />
                          )}
                        </button>

                        {open ? (
                          <div className="space-y-3 border-t border-[var(--color-slate-700,#e8e4df)] px-3 py-3 sm:px-4">
                            <div className="grid gap-3 sm:grid-cols-2">
                              <label className="text-xs font-medium text-[var(--color-jewelry-black,#1a1814)]/60">
                                Rule name
                                <input
                                  className={`${erpInputCls} mt-1`}
                                  value={rule.name}
                                  onChange={(e) => updateRule(rule.id, { name: e.target.value })}
                                />
                              </label>
                              <label className="text-xs font-medium text-[var(--color-jewelry-black,#1a1814)]/60">
                                Priority (higher = first)
                                <input
                                  className={`${erpInputCls} mt-1 tabular-nums`}
                                  type="number"
                                  value={rule.priority}
                                  onChange={(e) =>
                                    updateRule(rule.id, { priority: Number(e.target.value) || 0 })
                                  }
                                />
                              </label>
                              <label className="text-xs font-medium text-[var(--color-jewelry-black,#1a1814)]/60 sm:col-span-2">
                                Metal types (comma-separated, e.g. GOLD, SILVER)
                                <input
                                  className={`${erpInputCls} mt-1`}
                                  value={(rule.metalTypes || []).join(', ')}
                                  onChange={(e) =>
                                    updateRule(rule.id, {
                                      metalTypes: e.target.value
                                        .split(',')
                                        .map((s) => s.trim())
                                        .filter(Boolean),
                                    })
                                  }
                                  placeholder="Leave empty for any metal"
                                />
                              </label>
                            </div>

                            <label className="flex items-center gap-2 text-xs text-[var(--color-jewelry-black,#1a1814)]/60">
                              <input
                                type="checkbox"
                                checked={rule.enabled !== false}
                                onChange={(e) => updateRule(rule.id, { enabled: e.target.checked })}
                              />
                              Rule active
                            </label>

                            <div>
                              <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-[var(--color-jewelry-black,#1a1814)]/45">
                                Match when any of these columns have a value
                              </p>
                              <div className="flex flex-wrap gap-2">
                                {LABEL_RULE_FIELD_KEYS.map((field) => {
                                  const on = (rule.requireAny || []).includes(field)
                                  return (
                                    <button
                                      key={field}
                                      type="button"
                                      className={`min-h-[36px] rounded-lg px-2.5 text-[11px] font-medium ${
                                        on
                                          ? 'bg-[var(--kc-accent,#c41e3a)] text-white'
                                          : 'border border-[var(--color-slate-700,#e8e4df)] bg-white text-[var(--color-jewelry-black,#1a1814)]/70'
                                      }`}
                                      onClick={() => toggleRuleField(rule.id, 'requireAny', field)}
                                    >
                                      {LABEL_RULE_FIELD_LABELS[field]}
                                    </button>
                                  )
                                })}
                              </div>
                            </div>

                            <div>
                              <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-[var(--color-jewelry-black,#1a1814)]/45">
                                Must all be filled
                              </p>
                              <div className="flex flex-wrap gap-2">
                                {LABEL_RULE_FIELD_KEYS.map((field) => {
                                  const on = (rule.requireAll || []).includes(field)
                                  return (
                                    <button
                                      key={field}
                                      type="button"
                                      className={`min-h-[36px] rounded-lg px-2.5 text-[11px] font-medium ${
                                        on
                                          ? 'bg-emerald-600 text-white'
                                          : 'border border-[var(--color-slate-700,#e8e4df)] bg-white text-[var(--color-jewelry-black,#1a1814)]/70'
                                      }`}
                                      onClick={() => toggleRuleField(rule.id, 'requireAll', field)}
                                    >
                                      {LABEL_RULE_FIELD_LABELS[field]}
                                    </button>
                                  )
                                })}
                              </div>
                            </div>

                            <div>
                              <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-[var(--color-jewelry-black,#1a1814)]/45">
                                Must be empty
                              </p>
                              <div className="flex flex-wrap gap-2">
                                {LABEL_RULE_FIELD_KEYS.map((field) => {
                                  const on = (rule.requireNone || []).includes(field)
                                  return (
                                    <button
                                      key={field}
                                      type="button"
                                      className={`min-h-[36px] rounded-lg px-2.5 text-[11px] font-medium ${
                                        on
                                          ? 'bg-amber-600 text-white'
                                          : 'border border-[var(--color-slate-700,#e8e4df)] bg-white text-[var(--color-jewelry-black,#1a1814)]/70'
                                      }`}
                                      onClick={() => toggleRuleField(rule.id, 'requireNone', field)}
                                    >
                                      {LABEL_RULE_FIELD_LABELS[field]}
                                    </button>
                                  )
                                })}
                              </div>
                            </div>

                            <div className="flex flex-wrap gap-2">
                              <button
                                type="button"
                                className={erpBtnGhost}
                                onClick={() => {
                                  setRuleUploadTargetId(rule.id)
                                  ruleFileRef.current?.click()
                                }}
                              >
                                <Upload className="size-4" />
                                Upload .prn
                              </button>
                              <button
                                type="button"
                                className="inline-flex min-h-[40px] items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 text-xs font-semibold text-rose-700"
                                onClick={() => {
                                  if (confirm(`Remove rule "${rule.name}"?`)) removeRule(rule.id)
                                }}
                              >
                                <Trash2 className="size-4" />
                                Remove rule
                              </button>
                            </div>

                            <textarea
                              className={`${erpInputCls} min-h-[240px] font-mono text-[11px] leading-relaxed`}
                              value={rule.template || ''}
                              onChange={(e) => updateRule(rule.id, { template: e.target.value })}
                              spellCheck={false}
                            />
                          </div>
                        ) : null}
                      </div>
                    )
                  })}
              </div>
            )}
          </div>
        </>
      ) : tab === 'bill' ? (
        <>
          <div className={erpCardCls}>
            <p className="mb-3 text-sm font-semibold text-[var(--color-jewelry-black,#1a1814)]">Shop header</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-xs font-medium text-[var(--color-jewelry-black,#1a1814)]/60 sm:col-span-2">
                Shop name
                <input
                  className={`${erpInputCls} mt-1`}
                  value={pf.shopName || ''}
                  onChange={(e) => setPf((p) => ({ ...p, shopName: e.target.value }))}
                />
              </label>
              <label className="text-xs font-medium text-[var(--color-jewelry-black,#1a1814)]/60 sm:col-span-2">
                Address
                <textarea
                  className={`${erpInputCls} mt-1 min-h-[64px] py-2`}
                  value={pf.shopAddress || ''}
                  onChange={(e) => setPf((p) => ({ ...p, shopAddress: e.target.value }))}
                />
              </label>
              <label className="text-xs font-medium text-[var(--color-jewelry-black,#1a1814)]/60">
                Phone
                <input
                  className={`${erpInputCls} mt-1`}
                  value={pf.shopPhone || ''}
                  onChange={(e) => setPf((p) => ({ ...p, shopPhone: e.target.value }))}
                />
              </label>
              <label className="text-xs font-medium text-[var(--color-jewelry-black,#1a1814)]/60">
                GSTIN
                <input
                  className={`${erpInputCls} mt-1 font-mono`}
                  value={pf.shopGstin || ''}
                  onChange={(e) => setPf((p) => ({ ...p, shopGstin: e.target.value }))}
                />
              </label>
            </div>
          </div>
          <div className={erpCardCls}>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-semibold text-[var(--color-jewelry-black,#1a1814)]">
                Epson receipt template
              </p>
              <button
                type="button"
                className={erpBtnGhost}
                onClick={() => setPf((p) => ({ ...p, billTemplate: DEFAULT_BILL_TEMPLATE }))}
              >
                <RotateCcw className="size-4" />
                Reset sample
              </button>
            </div>
            <textarea
              className={`${erpInputCls} min-h-[280px] whitespace-pre-wrap font-mono text-[11px] leading-relaxed`}
              value={pf.billTemplate || ''}
              onChange={(e) => setPf((p) => ({ ...p, billTemplate: e.target.value }))}
              spellCheck={false}
            />
          </div>
        </>
      ) : (
        <>
          <div className={erpCardCls}>
            <p className="mb-2 text-sm font-semibold text-[var(--color-jewelry-black,#1a1814)]">
              Generate quote — shop default
            </p>
            <p className="mb-3 text-xs leading-relaxed text-[var(--color-jewelry-black,#1a1814)]/55">
              Staff can override this on each workstation (Billing → This workstation). Blank lines in templates
              below are preserved on the Epson printout.
            </p>
            <label className="block text-xs font-medium text-[var(--color-jewelry-black,#1a1814)]/60">
              When staff clicks Generate quote
              <select
                className={`${erpInputCls} mt-1 max-w-md`}
                value={pf.defaultQuoteOutputMode || 'pdf'}
                onChange={(e) =>
                  setPf((p) => ({
                    ...p,
                    defaultQuoteOutputMode: normalizeQuoteOutputMode(e.target.value) as ErpQuoteOutputMode,
                  }))
                }
              >
                {ERP_QUOTE_OUTPUT_MODES.map((mode) => (
                  <option key={mode} value={mode}>
                    {ERP_QUOTE_OUTPUT_LABELS[mode]}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className={erpCardCls}>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-sm font-semibold text-[var(--color-jewelry-black,#1a1814)]">
                  Gold estimate template
                </p>
                <p className="text-xs text-[var(--color-jewelry-black,#1a1814)]/50">
                  Used when the estimate has gold items (or mixed with more gold lines).
                </p>
              </div>
              <button
                type="button"
                className={erpBtnGhost}
                onClick={() => setPf((p) => ({ ...p, estimateTemplateGold: DEFAULT_ESTIMATE_TEMPLATE_GOLD }))}
              >
                <RotateCcw className="size-4" />
                Reset sample
              </button>
            </div>
            <textarea
              className={`${erpInputCls} min-h-[280px] whitespace-pre-wrap font-mono text-[11px] leading-relaxed`}
              value={pf.estimateTemplateGold || ''}
              onChange={(e) => setPf((p) => ({ ...p, estimateTemplateGold: e.target.value }))}
              spellCheck={false}
            />
          </div>

          <div className={erpCardCls}>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-sm font-semibold text-[var(--color-jewelry-black,#1a1814)]">
                  Silver estimate template
                </p>
                <p className="text-xs text-[var(--color-jewelry-black,#1a1814)]/50">
                  Used for silver-only estimates (or mixed with more silver lines).
                </p>
              </div>
              <button
                type="button"
                className={erpBtnGhost}
                onClick={() => setPf((p) => ({ ...p, estimateTemplateSilver: DEFAULT_ESTIMATE_TEMPLATE_SILVER }))}
              >
                <RotateCcw className="size-4" />
                Reset sample
              </button>
            </div>
            <textarea
              className={`${erpInputCls} min-h-[280px] whitespace-pre-wrap font-mono text-[11px] leading-relaxed`}
              value={pf.estimateTemplateSilver || ''}
              onChange={(e) => setPf((p) => ({ ...p, estimateTemplateSilver: e.target.value }))}
              spellCheck={false}
            />
          </div>
        </>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <button type="button" className={erpBtnPrimary} disabled={busy} onClick={() => void save()}>
          {busy ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
          Save print formats
        </button>
        {saved ? <span className="text-xs font-medium text-emerald-600">Saved</span> : null}
      </div>
    </div>
  )
}
