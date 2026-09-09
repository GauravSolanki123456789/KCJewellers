'use client'

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { useLoginModal } from '@/context/LoginModalContext'
import { useResellerBranding } from '@/context/ResellerBrandingContext'
import SignInPanel from '@/components/SignInPanel'

export default function LoginModal() {
  const { isOpen, close, returnTo } = useLoginModal()
  const { customDomainHost } = useResellerBranding()

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && close()}>
      <DialogContent className="bg-slate-900/95 backdrop-blur-xl border border-white/10 text-slate-100 max-w-sm sm:max-w-md w-[calc(100vw-2rem)] sm:w-auto">
        <DialogHeader>
          <DialogTitle className="text-amber-500 text-lg">Sign In</DialogTitle>
          <DialogDescription className="text-slate-400 text-sm">
            {customDomainHost ? 'Sign in' : 'Sign in to access cart, checkout, and Book Rate'}
          </DialogDescription>
        </DialogHeader>
        <div className="py-2">
          {isOpen ? (
            <SignInPanel returnTo={returnTo} onAuthenticated={close} variant="modal" />
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  )
}
