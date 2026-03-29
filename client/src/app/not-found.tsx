import Link from 'next/link'
import { Suspense } from 'react'
import { CATALOG_PATH } from '@/lib/routes'

export default function NotFound() {
  return (
    <Suspense fallback={null}>
      <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-4">
        <div className="glass-card p-8 max-w-md text-center">
          <h1 className="text-4xl font-bold text-yellow-500 mb-4">404</h1>
          <h2 className="text-xl font-semibold text-slate-200 mb-2">Page Not Found</h2>
          <p className="text-slate-400 mb-6">
            The page you're looking for doesn't exist or has been moved.
          </p>
          <Link
            href={CATALOG_PATH}
            className="inline-block px-6 py-3 bg-yellow-500 hover:bg-yellow-400 text-slate-950 font-semibold rounded-lg transition-colors"
          >
            Back to catalogue
          </Link>
        </div>
      </div>
    </Suspense>
  )
}
