'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import ScheduleClient from './ScheduleClient'

export default function ScheduleLoader({ profile }: { profile: any }) {
  const [data, setData] = useState<{ rooms: any[]; hosts: any[]; brands: string[] } | null>(null)

  useEffect(() => {
    const supabase = createClient()
    Promise.all([
      supabase.from('rooms').select('*').eq('is_active', true).order('sort_order'),
      supabase.from('profiles').select('id, full_name').eq('role', 'host').eq('is_active', true).order('full_name'),
      supabase.from('profiles').select('client_brand').eq('role', 'client').not('client_brand', 'is', null),
    ]).then(([rooms, hosts, clients]) => {
      const brands = (clients.data || [])
        .map((c: any) => c.client_brand)
        .filter(Boolean)
        .sort() as string[]
      setData({ rooms: rooms.data || [], hosts: hosts.data || [], brands })
    })
  }, [])

  if (!data) return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <p className="text-sm text-gray-400">Memuat jadwal...</p>
    </div>
  )

  return <ScheduleClient profile={profile} rooms={data.rooms} hosts={data.hosts} brands={data.brands} />
}
