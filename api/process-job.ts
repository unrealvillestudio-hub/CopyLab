export const maxDuration = 300;

/**
 * CopyLab — api/process-job.ts  v1.1
 *
 * v1.1 (2026-05-21) — Node.js native handler (VercelRequest/VercelResponse)
 * Fix: mismo fix que execute.ts v9.6 — Web API format no respetaba maxDuration
 *
 * v1.0 — Job 2 del modelo async/sync dual-mode.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';

declare const process: { env: Record<string, string | undefined> };

const SB_URL = () => process.env.SUPABASE_URL      ?? '';
const SB_KEY = () => process.env.SUPABASE_ANON_KEY ?? '';

async function sbPatch(id: string, data: Record<string, unknown>) {
  await fetch(`${SB_URL()}/rest/v1/copylab_jobs?id=eq.${id}`, {
    method:  'PATCH',
    headers: {
      apikey:         SB_KEY(),
      Authorization:  `Bearer ${SB_KEY()}`,
      'Content-Type': 'application/json',
      Prefer:         'return=minimal',
    },
    body: JSON.stringify(data),
  });
}

async function sbGetJob(id: string): Promise<Record<string, unknown> | null> {
  const res = await fetch(
    `${SB_URL()}/rest/v1/copylab_jobs?id=eq.${id}&limit=1`,
    { headers: { apikey: SB_KEY(), Authorization: `Bearer ${SB_KEY()}` } }
  );
  if (!res.ok) return null;
  const data = await res.json();
  return Array.isArray(data) ? (data[0] ?? null) : null;
}

const CORS: Record<string, string> = {
  'Content-Type':                 'application/json',
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  Object.entries(CORS).forEach(([k, v]) => res.setHeader(k, v));

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST')
    return res.status(405).json({ error: 'POST only' });

  const body = req.body as { job_id?: string };
  const jobId = body?.job_id;
  if (!jobId)
    return res.status(400).json({ error: 'job_id required' });

  // 1. Leer job
  const job = await sbGetJob(jobId);
  if (!job)
    return res.status(404).json({ error: 'Job not found' });

  // Idempotencia
  if (job.status !== 'queued')
    return res.status(200).json({ status: job.status, job_id: jobId });

  // 2. Marcar processing
  await sbPatch(jobId, {
    status:        'processing',
    started_at:    new Date().toISOString(),
    attempt_count: ((job.attempt_count as number) ?? 0) + 1,
  });

  try {
    // 3. Llamar pipeline sync
    const executeRes = await fetch(
      'https://unrlvl-copy-lab.vercel.app/api/execute',
      {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ ...(job.input as object), async: false }),
      }
    );

    if (!executeRes.ok) {
      const errText = await executeRes.text();
      await sbPatch(jobId, {
        status:       'error',
        error:        `execute ${executeRes.status}: ${errText.slice(0, 500)}`,
        completed_at: new Date().toISOString(),
      });
      return res.status(200).json({ status: 'error', job_id: jobId });
    }

    const result    = await executeRes.json();
    const output    = (result.output as string) ?? '';
    const meta      = result.meta ?? null;

    // 4. Guardar resultado
    await sbPatch(jobId, {
      status:        'done',
      output,
      output_parsed: meta,
      completed_at:  new Date().toISOString(),
    });

    console.log(`[process-job v1.1] done: ${jobId}`);
    return res.status(200).json({ status: 'done', job_id: jobId });

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await sbPatch(jobId, {
      status:        'error',
      error:         msg.slice(0, 1000),
      completed_at: new Date().toISOString(),
    });
    console.error(`[process-job v1.1] error ${jobId}:`, msg);
    return res.status(500).json({ status: 'error', error: msg });
  }
}
