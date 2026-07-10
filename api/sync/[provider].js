// api/sync/[provider].js
// Vercel Cron Job: 통합 동기화 핸들러 (Jira + Confluence)
// 2026-05-19: Hobby plan 12-functions 한도 대응으로 두 핸들러를 동적 라우팅으로 병합.
// URL: /api/sync/jira  또는  /api/sync/confluence
//
// 기존 cron 스케줄 (/api/sync/jira)은 vercel.json에 그대로 두어도 라우팅 매칭됨.

import { createClient } from '@supabase/supabase-js'
import JiraClient from '../_lib/jira-client.js'
import ConfluenceClient from '../_lib/confluence-client.js'

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

// 동기화 로그 저장 (테이블 없으면 무시)
async function logSync(provider, status, message, count = 0) {
  const countField = provider === 'jira' ? 'issue_count' : 'page_count'
  const { error } = await supabase
    .from('sync_logs')
    .insert({
      provider,
      status,
      message,
      [countField]: count,
      synced_at: new Date().toISOString(),
    })

  if (error && error.code !== 'PGRST116') {
    console.error('Failed to log sync:', error)
  }
}

// 각 provider별 동작
const HANDLERS = {
  jira: {
    countField: 'issueCount',
    totalLabel: 'totalIssues',
    fetchOne: async (integration) => {
      const client = new JiraClient(integration.user_id, 'jira', integration.cloud_id)
      const jql = 'updated >= -7d ORDER BY updated DESC'
      const result = await client.searchIssues(jql, { maxResults: 50 })
      return result.issues?.length || 0
    },
  },
  confluence: {
    countField: 'pageCount',
    totalLabel: 'totalPages',
    fetchOne: async (integration) => {
      const client = new ConfluenceClient(integration.user_id, integration.cloud_id)
      const cql = 'type = page ORDER BY lastModified DESC'
      const result = await client.searchPages(cql, { limit: 50 })
      return result.results?.length || 0
    },
  },
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  // 보안: Vercel Cron 토큰 검증
  const cronSecret = req.headers['authorization']?.replace('Bearer ', '')
  if (cronSecret !== process.env.CRON_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  // 동적 라우팅 파라미터 추출
  const { provider } = req.query
  const def = HANDLERS[provider]
  if (!def) {
    return res.status(404).json({ error: `Unknown provider: ${provider}` })
  }

  try {
    console.log(`[SYNC] ${provider} 동기화 시작`)

    const { data: integrations, error: intError } = await supabase
      .from('oauth_integrations')
      .select('id, user_id, cloud_id, expires_at, is_active')
      .eq('provider', provider)
      .eq('is_active', true)

    if (intError) throw intError

    if (!integrations?.length) {
      await logSync(provider, 'success', 'No active integrations', 0)
      return res.status(200).json({
        message: 'No active integrations',
        synced: 0,
      })
    }

    let total = 0
    const results = []

    for (const integration of integrations) {
      try {
        const count = await def.fetchOne(integration)
        total += count
        results.push({
          userId: integration.user_id,
          cloudId: integration.cloud_id,
          [def.countField]: count,
          status: 'success',
        })
      } catch (err) {
        console.error(`[SYNC] User ${integration.user_id} 오류:`, err.message)
        results.push({
          userId: integration.user_id,
          cloudId: integration.cloud_id,
          status: 'error',
          error: err.message,
        })
      }
    }

    const successCount = results.filter((r) => r.status === 'success').length
    await logSync(
      provider,
      'success',
      `Synced ${successCount}/${integrations.length} users, ${total} items`,
      total
    )

    res.status(200).json({
      message: `${provider} sync completed`,
      synced: integrations.length,
      [def.totalLabel]: total,
      results,
      timestamp: new Date().toISOString(),
    })
  } catch (err) {
    console.error(`[SYNC] ${provider} 동기화 실패:`, err)
    await logSync(provider, 'error', err.message)
    res.status(500).json({
      error: 'Sync failed',
      message: err.message,
      timestamp: new Date().toISOString(),
    })
  }
}
