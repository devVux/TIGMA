"use client"
import { useState } from "react"
import { createSensor } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter
} from "@/components/ui/dialog"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from "@/components/ui/select"
import { toast } from "sonner"

const SENSOR_TYPES = ["temperature", "humidity", "motion", "co2"] as const

type Props = {
  onCreated: (s: any) => void
  trigger?: React.ReactNode
}

export default function CreateSensorDialog({ onCreated, trigger }: Props) {
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({ name: "", type: "", location: "", enabled: false, interval: 1, mean: 0, std: 1})
  const [isSubmitting, setIsSubmitting] = useState(false)

  async function handleSubmit() {
    if (!form.name || !form.type || !form.location) {
      toast.error("All fields are required")
      return
    }
    setIsSubmitting(true)
    try {
      const res = await createSensor(form)
      onCreated({ ...form })
      toast.success("Sensor created")
      setOpen(false)
  		setForm({ name: "", type: "", location: "", enabled: false, interval: 1, mean: 0, std: 1})
    } catch (e) {
		console.log(e)
      toast.error("Failed to create sensor")
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>Add Sensor</Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Create Sensor</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="new-name" className="text-right">Name</Label>
            <Input
              id="new-name"
              className="col-span-3"
              placeholder="Sensor name"
              value={form.name}
              onChange={e => setForm({ ...form, name: e.target.value })}
            />
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label className="text-right">Type</Label>
            <Select value={form.type} onValueChange={val => setForm({ ...form, type: val })}>
              <SelectTrigger className="col-span-3">
                <SelectValue placeholder="Select type" />
              </SelectTrigger>
              <SelectContent>
                {SENSOR_TYPES.map(t => (
                  <SelectItem key={t} value={t} className="capitalize">{t}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="new-location" className="text-right">Location</Label>
            <Input
              id="new-location"
              className="col-span-3"
              placeholder="Location"
              value={form.location}
              onChange={e => setForm({ ...form, location: e.target.value })}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={isSubmitting}>
            {isSubmitting ? "Creating..." : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
