const ONES = [
  '',
  'One',
  'Two',
  'Three',
  'Four',
  'Five',
  'Six',
  'Seven',
  'Eight',
  'Nine',
  'Ten',
  'Eleven',
  'Twelve',
  'Thirteen',
  'Fourteen',
  'Fifteen',
  'Sixteen',
  'Seventeen',
  'Eighteen',
  'Nineteen',
]
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety']

function wordsBelow1000(n: number): string {
  if (n === 0) return ''
  if (n < 20) return ONES[n]
  if (n < 100) {
    const t = Math.floor(n / 10)
    const r = n % 10
    return r ? `${TENS[t]} ${ONES[r]}` : TENS[t]
  }
  const h = Math.floor(n / 100)
  const r = n % 100
  return r ? `${ONES[h]} Hundred And ${wordsBelow1000(r)}` : `${ONES[h]} Hundred`
}

function integerToWords(n: number): string {
  if (n === 0) return 'Zero'
  let rem = n
  const parts: string[] = []
  const crore = Math.floor(rem / 10000000)
  rem %= 10000000
  const lakh = Math.floor(rem / 100000)
  rem %= 100000
  const thousand = Math.floor(rem / 1000)
  rem %= 1000
  if (crore) parts.push(`${wordsBelow1000(crore)} Crore`)
  if (lakh) parts.push(`${wordsBelow1000(lakh)} Lakh`)
  if (thousand) parts.push(`${wordsBelow1000(thousand)} Thousand`)
  if (rem) parts.push(wordsBelow1000(rem))
  return parts.join(' ').replace(/\s+/g, ' ').trim()
}

/** Indian-style rupee amount in words for tax invoices. */
export function amountInWordsInr(amount: number): string {
  const n = Math.round(Number(amount) || 0)
  if (n === 0) return 'Zero Only'
  return `${integerToWords(n)} Only`
}
