export async function sendFeedback(payload: {
  requestId?: string;
  fileName: string;
  verdict: "accepted" | "corrected";
  original: Record<string, unknown>;
  corrected?: Record<string, unknown>;
}) {
  const url = import.meta.env.VITE_FEEDBACK_URL;
  const res = await fetch(`${url}/feedback`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ timestamp: new Date().toISOString(), ...payload })
  });
  if (!res.ok) throw new Error(`feedback failed: ${res.status}`);
  return res.json() as Promise<{ ok: true; persisted: boolean }>;
}
