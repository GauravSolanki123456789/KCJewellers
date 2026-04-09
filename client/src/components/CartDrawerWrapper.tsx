'use client'

import { usePathname } from 'next/navigation'
import { useCart } from '@/context/CartContext'
import CartDrawer from './CartDrawer'

export default function CartDrawerWrapper() {
  const pathname = usePathname()
  const { isCartOpen, closeCart } = useCart()
  if (pathname?.startsWith('/shared/')) return null
  return <CartDrawer isOpen={isCartOpen} onClose={closeCart} />
}
