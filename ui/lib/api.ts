const API_URL = "http://localhost:8000"

export async function listSensors(params?: { location?: string; type?: string }) {
	console.log(API_URL)
  const q = new URLSearchParams(params as any).toString()
  const res = await fetch(`http://api:8000/sensors/?${q}`, { cache: "no-store" })
  return res.json()
}

export async function createSensor(data: {
  name: string
  type: string
  location: string
  interval: number
  enabled: boolean
  mean: number
  std: number
}) {
  const res = await fetch(`${API_URL}/sensors`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  })
  if (!res.ok)
	throw new Error(await res.text())

  return res.json()
}

export async function deleteSensor(name: string) {
  await fetch(`${API_URL}/sensors/${name}`, { method: "DELETE" })
}

export async function updateSensor(
  name: string,
  data: { type?: string; location?: string; interval?: number; enabled?: boolean; mean?: number; std?: number}
) {
  if (Object.keys(data).length === 0)
    throw new Error("No fields to update")

  const res = await fetch(`${API_URL}/sensors/${name}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  })
  if (!res.ok)
    throw new Error(await res.text())

  return res.json()
}
export async function getSensor(name: string) {
  const res = await fetch(`${API_URL}/sensors/${name}`, { cache: "no-store" })
  if (!res.ok)
	throw new Error(await res.text())

  return res.json()
}


type SensorStatus = {
  name: string;
  status: "alive" | "dead";
};
export async function getStatuses(threshold: number = 30): Promise<SensorStatus[]> {
	console.log(`${API_URL}/statuses?threshold=${threshold}`)
  const res = await fetch(`${API_URL}/statuses?threshold=${threshold}`)
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}
