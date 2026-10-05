import {
  callRpc,
  corsHeaders,
  deleteObject,
  getEnvironment,
  jsonResponse,
} from '../_shared/messaging.ts'

type CleanupCandidate = {
  id: string
  bucket_id: string
  storage_path: string
}

function constantTimeEqual(left: string, right: string): boolean {
  const encoder = new TextEncoder()
  const leftBytes = encoder.encode(left)
  const rightBytes = encoder.encode(right)
  let difference = leftBytes.length ^ rightBytes.length
  const length = Math.max(leftBytes.length, rightBytes.length)
  for (let index = 0; index < length; index += 1) {
    difference |= (leftBytes[index] ?? 0) ^ (rightBytes[index] ?? 0)
  }
  return difference === 0
}

Deno.serve(async (request: Request) => {
  if (request.method === 'OPTIONS')
    return new Response('ok', { headers: corsHeaders })
  if (request.method !== 'POST')
    return jsonResponse(405, {
      error: { code: 'METHOD_NOT_ALLOWED', message: 'Use POST.' },
    })

  const expectedSecret = Deno.env.get('EVIDENCE_CLEANUP_SECRET')
  const presentedSecret = request.headers.get('x-cleanup-secret') ?? ''
  if (
    !expectedSecret ||
    expectedSecret.length < 32 ||
    !constantTimeEqual(expectedSecret, presentedSecret)
  ) {
    return jsonResponse(401, {
      error: {
        code: 'AUTHORIZATION_REQUIRED',
        message: 'Authorization failed.',
      },
    })
  }

  try {
    const environment = getEnvironment()
    const candidates = await callRpc<CleanupCandidate[]>(
      environment.url,
      environment.serviceKey,
      environment.serviceKey,
      'claim_expired_payment_evidence',
      { p_limit: 100 },
    )

    let deleted = 0
    let failed = 0
    for (const candidate of candidates) {
      try {
        await deleteObject(
          environment.url,
          environment.serviceKey,
          candidate.bucket_id,
          candidate.storage_path,
        )
        const completed = await callRpc<boolean>(
          environment.url,
          environment.serviceKey,
          environment.serviceKey,
          'complete_payment_evidence_cleanup',
          { p_attachment_id: candidate.id },
        )
        if (completed) deleted += 1
        else failed += 1
      } catch {
        failed += 1
        await callRpc<boolean>(
          environment.url,
          environment.serviceKey,
          environment.serviceKey,
          'fail_payment_evidence_cleanup',
          {
            p_attachment_id: candidate.id,
            p_safe_error: 'DELETE_FAILED',
          },
        ).catch(() => false)
      }
    }

    return jsonResponse(200, {
      processed: candidates.length,
      deleted,
      failed,
    })
  } catch {
    return jsonResponse(500, {
      error: {
        code: 'CLEANUP_FAILED',
        message: 'Retention cleanup could not be completed.',
      },
    })
  }
})
