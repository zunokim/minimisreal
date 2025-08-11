// src/app/data/DataClient.tsx
'use client'

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { DATASETS, type DatasetKey, pickTable } from '@/lib/datasets'

type Option = { value: string; label: string }

type DataRow = {
  prd_de: string
  prd_se: string | null
  region_code: string
  region_name: string | null
  itm_id: string
  itm_name: string | null
  unit: string | null
  value: number | null
}

type RegionRow = {
  region_code: string
  region_name: string | null
}

type ItmRow = {
  itm_id: string
  itm_name: string | null
}

function ymNow(): string {
  const d = new Date()
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}`
}
function ymAdd(ym: string, diff: number): string {
  const y = Number(ym.slice(0, 4))
  const m = Number(ym.slice(4))
  const d = new Date(y, m - 1 + diff, 1)
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}`
}
function formatNumber(n: number | null, unit?: string | null): string {
  if (n === null || n ==
