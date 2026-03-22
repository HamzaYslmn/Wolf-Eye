// MARK: AI API — sends message to Wolf-Eye master, returns result
import getServer from './getserver';

export async function askAI(message: string): Promise<string> {
  const res = await fetch(`${getServer()}mcp/brain/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message }),
  });
  if (!res.ok) throw new Error(`AI error: ${res.status}`);
  const data = await res.json();
  return data.result;
}
