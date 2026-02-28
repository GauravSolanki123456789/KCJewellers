'use client'

import { useCart } from '@/context/CartContext'
import CartDrawer from './CartDrawer'

export default function CartDrawerWrapper() {
  const { isCartOpen, closeCart } = useCart()
  return <CartDrawer isOpen={isCartOpen} onClose={closeCart} />
}
