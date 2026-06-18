'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

interface Props {
  children: (profile: any) => React.ReactNode
  requiredRole?: string[]
}

let cachedProfile: any = null

export default function AuthGuard({ children, requiredRole }: Props) {
  const [profile, setProfile] = useState<any>(cachedProfile)
  const [loading, setLoading] = useState(!cachedProfile)
  const router = useRouter()

  useEffect(() => {
    if (cachedProfile) {
      if (requiredRole && !requiredRole.includes(cachedProfile.role)) {
        router.replace('/dashboard')
      }
      return
    }
    const supabase = createClient()
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) { router.replace('/login'); return }
      const { data: prof } = await supabase
        .from('profiles').select('*').eq('id', session.user.id).single()
      if (!prof) { router.replace('/login'); return }
      if (requiredRole && !requiredRole.includes(prof.role)) {
        router.replace('/dashboard'); return
      }
      cachedProfile = prof
      setProfile(prof)
      setLoading(false)
    })
  }, [router, requiredRole])

  // Clear cache on logout
  useEffect(() => {
    const supabase = createClient()
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') cachedProfile = null
    })
    return () => subscription.unsubscribe()
  }, [])

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center space-y-3">
        <div className="w-10 h-10 bg-brand-600 rounded-xl flex items-center justify-center mx-auto">
          <span className="text-white font-bold text-sm">NW</span>
        </div>
        <div className="flex gap-1 justify-center">
          {[0,1,2].map(i => (
            <div key={i} className="w-1.5 h-1.5 bg-brand-400 rounded-full animate-bounce"
              style={{ animationDelay: `${i * 0.15}s` }} />
          ))}
        </div>
      </div>
    </div>
  )

  return <>{children(profile)}</>
}
