export const maxDuration = 300;

/**
 * CopyLab — api/process-job.ts  v1.0
 * Job 2 del modelo async/sync dual-mode.
 *
 * Llamado en fire-and-forget desde /api/execute cuando async: true.
 * Recibe { job_id }, ejecuta el pipeline sync internamente,
 * guarda resultado en copylab_jobs.
 *
 * Nunca lo llama el browser directamente.
 */

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

const CORS = {
  'Content-Type':                 'application/json',
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export default async function handler(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (req.method !== 'POST')
    return new Response(JSON.stringify({ error: 'POST only' }), { status: 405, headers: CORS });

  let body: { job_id?: string };
  try   { body = await req.json(); }
  catch { return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400, headers: CORS }); }

  const jobId = body.job_id;
  if (!jobId)
    return new Response(JSON.stringify({ error: 'job_id required' }), { status: 400, headers: CORS });

  // 1. Leer job
  const job = await sbGetJob(jobId);
  if (!job)
    return new Response(JSON.stringify({ error: 'Job not found' }), { status: 404, headers: CORS });

  // Idempotencia: si ya fue procesado, no repetir
  if (job.status !== 'queued')
    return new Response(JSON.stringify({ status: job.status, job_id: jobId }), { status: 200, headers: CORS });

  // 2. Marcar processing
  await sbPatch(jobId, {
    status:        'processing',
    started_at:    new Date().toISOString(),
    attempt_count: ((job.attempt_count as number) ?? 0) + 1,
  });

  try {
    // 3. Llamar al pipeline sync — reutiliza toda la lógica de execute.ts sin duplicar
    //    { async: false } garantiza que no hay loop
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
      return new Response(JSON.stringify({ status: 'error', job_id: jobId }), { status: 200, headers: CORS });
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

    console.log(`[process-job] done: ${jobId}`);
    return new Response(
      JSON.stringify({ status: 'done', job_id: jobId }),
      { status: 200, headers: CORS }
    );

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await sbPatch(jobId, {
      status:       'error',
      error:        msg.slice(0, 1000),
      completed_at: new Date().toISOString(),
    });
    console.error(`[process-job] error ${jobId}:`, msg);
    return new Response(JSON.stringify({ status: 'error', error: msg }), { status: 500, headers: CORS });
  }
}
