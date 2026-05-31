import { listSensors } from "@/lib/api"
import SensorsTable from "@/components/ui/sensors-table"

export default async function Page() {
  const sensors = await listSensors()

  return (
    <div className="p-6">
      <SensorsTable initialData={sensors} />
    </div>
  )
}
