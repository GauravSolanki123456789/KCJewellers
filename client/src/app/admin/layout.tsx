import AdminAttentionSectionSync from '@/components/AdminAttentionSectionSync'

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <AdminAttentionSectionSync />
      {children}
    </>
  )
}
