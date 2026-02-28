'use client'
import { Gift, Diamond, Gem } from 'lucide-react'
import Link from 'next/link'

const cats = [
  { key: 'gold', label: 'Gold', icon: Diamond },
  { key: 'silver', label: 'Silver', icon: Gem },
  { key: 'gifts', label: 'Gifts', icon: Gift }
]

export default function QuickCategories() {
  return (
    <div className="glass-card p-4">
      <div className="text-lg font-semibold mb-3">Quick Categories</div>
      <div className="grid grid-cols-3 gap-3">
        {cats.map(({ key, label, icon: Icon }) => (
          <Link key={key} href={`/category/${key}`} className="glass-card p-3 flex flex-col items-center gap-2">
            <Icon className="gold-text" />
            <div className="text-sm">{label}</div>
          </Link>
        ))}
      </div>
    </div>
  )
}
