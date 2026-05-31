"use client"
import { useEffect, useState, useCallback, useMemo } from "react"
import { getSensor, deleteSensor, updateSensor, getStatuses } from "@/lib/api"
import { useTheme } from "@teispace/next-themes";
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow
} from "@/components/ui/table"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from "@/components/ui/select";
import {
  Tooltip, TooltipTrigger, TooltipContent, TooltipProvider,
} from "@/components/ui/tooltip";
import { Switch } from "@/components/ui/switch"
import { Trash2, Settings2, Sun, Moon, PlusCircle, AlertTriangle, Search } from "lucide-react"
import { toast } from "sonner"
import CreateSensorDialog from "./create-sensor-dialog"

const SENSOR_TYPES = ["temperature", "humidity", "motion", "co2"] as const
type SensorType = typeof SENSOR_TYPES[number]

type Sensor = {
  name: string
  type: string
  location: string
  interval: number
  enabled: boolean
  mean: number
  std: number
  status?: "alive" | "dead"
}

type EditState = Sensor | null

function highlight(text: string, query: string) {
  if (!query) return <>{text}</>
  const idx = text.toLowerCase().indexOf(query.toLowerCase())
  if (idx === -1) return <>{text}</>
  return (
    <>
      {text.slice(0, idx)}
      <mark className="bg-yellow-200 dark:bg-yellow-800 text-inherit rounded-sm px-0.5">
        {text.slice(idx, idx + query.length)}
      </mark>
      {text.slice(idx + query.length)}
    </>
  )
}

export default function SensorsTable({ initialData }: { initialData: Sensor[] }) {

	const [mounted, setMounted] = useState(false);
	const { setTheme, resolvedTheme } = useTheme();

	const [data, setData] = useState<Sensor[]>(initialData);
	const [selected, setSelected] = useState<Set<string>>(new Set());
	const [editSensor, setEditSensor] = useState<EditState>(null);
	const [editDraft, setEditDraft] = useState<Sensor | null>(null);
	const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set());
	const [confirmBulkDelete, setConfirmBulkDelete] = useState(false);
	const [isSaving, setIsSaving] = useState(false);
	const [searchQuery, setSearchQuery] = useState("");
	const [statuses, setStatuses] = useState<Record<string, "alive" | "dead">>({});

	useEffect(() => {
	  setMounted(true);
	}, []);

	useEffect(() => {
		const threshold = 180;
	  const fetchStatus = async () => {
		const result = await getStatuses(threshold);
		const map = Object.fromEntries(
		  result.map(r => [r.name, r.status] as [string, "alive" | "dead"])
		);
		setStatuses(map);
	  };
	  fetchStatus();
	  const interval = setInterval(fetchStatus, threshold * 1000);
	  return () => clearInterval(interval);
	}, []);

  const filtered = useMemo(() => {
    if (!searchQuery.trim())
		return data

    const q = searchQuery.toLowerCase()
    return data.filter(s =>
      s.name.toLowerCase().includes(q) ||
      s.type.toLowerCase().includes(q) ||
      s.location.toLowerCase().includes(q)
    )
  }, [data, searchQuery])

  const allSelected = filtered.length > 0 && filtered.every(s => selected.has(s.name))
  const someSelected = filtered.some(s => selected.has(s.name)) && !allSelected

  const toggleAll = () => {
    if (allSelected) {
      setSelected(prev => {
        const next = new Set(prev)
        filtered.forEach(s => next.delete(s.name))
        return next
      })
    } else {
      setSelected(prev => new Set([...prev, ...filtered.map(s => s.name)]))
    }
  }

  const toggleOne = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

const handleBulkDelete = async () => {
  const ids = Array.from(selected)
  setDeletingIds(new Set(ids))
  const toastId = toast.loading(`Deleting ${ids.length} sensors…`)
  const results = await Promise.allSettled(ids.map(id => deleteSensor(id)))
  const succeeded = ids.filter((_, i) => results[i].status === "fulfilled")
  const failedCount = ids.length - succeeded.length

  setData(prev => prev.filter(s => !succeeded.includes(s.name)))
  setSelected(prev => {
    const n = new Set(prev)
    succeeded.forEach(id => n.delete(id))
    return n
  })
  setDeletingIds(new Set())
  setConfirmBulkDelete(false)

  if (failedCount === 0) toast.success(`Deleted ${succeeded.length} sensor${succeeded.length !== 1 ? "s" : ""}`, { id: toastId })
  else if (succeeded.length === 0) toast.error(`Failed to delete ${failedCount} sensor${failedCount !== 1 ? "s" : ""}`, { id: toastId })
  else toast.warning(`Deleted ${succeeded.length}, failed ${failedCount}`, { id: toastId })
}

const handleDelete = useCallback(async (name: string) => {
  setDeletingIds(prev => new Set(prev).add(name))
  const toastId = toast.loading("Deleting sensor…")
  try {
    await deleteSensor(name)
    setData(prev => prev.filter(s => s.name !== name))
    setSelected(prev => { const n = new Set(prev); n.delete(name); return n })
    toast.success("Sensor deleted", { id: toastId })
  } catch {
    toast.error("Failed to delete sensor", { id: toastId })
  } finally {
    setDeletingIds(prev => { const n = new Set(prev); n.delete(name); return n })
  }
}, [])

const handleSave = async () => {
  if (!editDraft) return

  setIsSaving(true)
  const toastId = toast.loading("Saving sensor…")
  try {
    await updateSensor(editDraft.name, {
      type: editDraft.type,
      location: editDraft.location,
      interval: editDraft.interval,
      enabled: editDraft.enabled,
      mean: editDraft.mean,
      std: editDraft.std
    })
    const updated = await getSensor(editDraft.name)
    setData(prev => prev.map(s => s.name === updated.name ? { ...updated, status: s.status } : s))
    setEditSensor(null)
    toast.success("Sensor updated", { id: toastId })
  } catch {
    toast.error("Failed to update sensor", { id: toastId })
  } finally {
    setIsSaving(false)
  }
}

const openEdit = async (sensor: Sensor) => {
  setEditSensor(sensor)
  setEditDraft({ ...sensor })
  try {
    const cfg = await getSensor(sensor.name)
    setEditDraft({
      name: cfg.name,
      type: cfg.type ?? "",
      location: cfg.location ?? "",
      interval: cfg.interval ?? 60,
      enabled: cfg.enabled ?? false,
      mean: cfg.mean ?? 0,
      std: cfg.std ?? 1
    })
  } catch {
    toast.error("Failed to load sensor config")
  }
}

	if (!mounted) return null;

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-semibold tracking-tight">Sensors</h2>
          <Badge variant="secondary">{data.length}</Badge>
        </div>
        <div className="flex items-center gap-2">
          {selected.size > 0 && (
            <Button
              variant="destructive"
              size="sm"
              onClick={() => setConfirmBulkDelete(true)}
            >
              <Trash2 className="h-4 w-4 mr-1" />
              Delete {selected.size}
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
          >
            {resolvedTheme === "dark" ? (
              <Sun className="h-4 w-4" />
            ) : (
              <Moon className="h-4 w-4" />
            )}
          </Button>
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search by name, type, location…"
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          className="pl-8"
        />
      </div>

      {/* Table */}
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/60 hover:bg-muted/60">
              <TableHead className="w-10">
                <Checkbox
                  checked={allSelected}
                  data-state={someSelected ? "indeterminate" : undefined}
                  onCheckedChange={toggleAll}
                />
              </TableHead>
              <TableHead className="font-bold text-foreground">Name</TableHead>
              <TableHead className="font-bold text-foreground">Type</TableHead>
              <TableHead className="font-bold text-foreground">Location</TableHead>
              <TableHead className="font-bold text-foreground">Status</TableHead>
              <TableHead className="font-bold text-foreground text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>

          <TableBody>
            {filtered.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="h-32 text-center text-muted-foreground">
                  {searchQuery ? "No sensors match your search." : "No sensors found. Add one below."}
                </TableCell>
              </TableRow>
            )}
            {filtered.map((s, i) => (
              <TableRow
                key={s.name}
                className={
                  selected.has(s.name)
                    ? "bg-primary/10"
                    : i % 2 === 0
                    ? "bg-background"
                    : "bg-muted/30"
                }
              >
                <TableCell>
                  <Checkbox
                    checked={selected.has(s.name)}
                    onCheckedChange={() => toggleOne(s.name)}
                  />
                </TableCell>
                <TableCell className="font-medium">{highlight(s.name, searchQuery)}</TableCell>
                <TableCell>{highlight(s.type, searchQuery)}</TableCell>
                <TableCell>{highlight(s.location, searchQuery)}</TableCell>
                <TableCell>
                  <Badge variant={statuses[s.name] === "alive" ? "default" : "destructive"}>
                    {statuses[s.name] === "alive" ? "Alive" : "Dead"}
                  </Badge>
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-2">
                    <Button variant="outline" size="sm" onClick={() => openEdit(s)}>
                      <Settings2 className="h-4 w-4 mr-1" />
                      Edit
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      disabled={deletingIds.has(s.name)}
                      onClick={() => handleDelete(s.name)}
                    >
                      <Trash2 className="h-4 w-4 mr-1" />
                      {deletingIds.has(s.name) ? "Deleting…" : "Delete"}
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Add sensor */}
      <div className="flex items-center gap-2 pt-1">
        <CreateSensorDialog
          onCreated={(s) => setData(prev => [...prev, s])}
          trigger={
            <Button variant="outline" size="sm">
              <PlusCircle className="h-4 w-4 mr-2" />
              Add Sensor
            </Button>
          }
        />
      </div>

      {/* Edit dialog */}
      <Dialog open={!!editSensor} onOpenChange={(open) => !open && setEditSensor(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Sensor</DialogTitle>
          </DialogHeader>

          {editDraft && (
            <div className="space-y-6 py-2">
              <div className="space-y-3">
                <div className="grid grid-cols-4 items-center gap-4">
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Label htmlFor="edit-name" className="text-right cursor-help">
                          Name (?)
                        </Label>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Name cannot be changed.</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                  <Input
                    id="edit-name"
                    value={String(editDraft.name ?? "")}
                    disabled
                    className="col-span-3"
                  />
                </div>

                <div className="grid grid-cols-4 items-center gap-4">
                  <Label className="text-right">Type</Label>
                  <Select
                    value={editDraft.type}
                    onValueChange={val =>
                      setEditDraft(prev => prev ? { ...prev, type: val } : prev)
                    }
                  >
                    <SelectTrigger className="col-span-3">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {SENSOR_TYPES.map(t => (
                        <SelectItem key={t} value={t} className="capitalize">
                          {t}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="edit-location" className="text-right">Location</Label>
                  <Input
                    id="edit-location"
                    value={String(editDraft.location ?? "")}
                    onChange={e =>
                      setEditDraft(prev => prev ? { ...prev, location: e.target.value } : prev)
                    }
                    className="col-span-3"
                  />
                </div>

                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="edit-interval" className="text-right">Interval</Label>
                  <Input
                    id="edit-interval"
                    type="number"
                    min="1"
                    max="60"
                    value={editDraft.interval}
                    onChange={e =>
                      setEditDraft(prev => prev ? { ...prev, interval: Number(e.target.value) } : prev)
                    }
                    className="col-span-3"
                  />
                </div>

                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="edit-mean" className="text-right">Mean</Label>
                  <Input
                    id="edit-mean"
                    type="number"
                    step="any"
                    min="1"
                    max="20"
                    value={editDraft.mean}
                    onChange={e =>
                      setEditDraft(prev => prev ? { ...prev, mean: Number(e.target.value) } : prev)
                    }
                    className="col-span-3"
                  />
                </div>

                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="edit-std" className="text-right">Std</Label>
                  <Input
                    id="edit-std"
                    type="number"
                    step="any"
                    min="1"
                    max="20"
                    value={editDraft.std}
                    onChange={e =>
                      setEditDraft(prev => prev ? { ...prev, std: Number(e.target.value) } : prev)
                    }
                    className="col-span-3"
                  />
                </div>

                <div className="grid grid-cols-4 items-center gap-4">
                  <Label className="text-right">Enabled</Label>
                  <div className="col-span-3 flex items-center gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant={editDraft.enabled ? "default" : "outline"}
                      onClick={() =>
                        setEditDraft(prev => prev ? { ...prev, enabled: true } : prev)
                      }
                    >
                      Enable
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant={!editDraft.enabled ? "destructive" : "outline"}
                      onClick={() =>
                        setEditDraft(prev => prev ? { ...prev, enabled: false } : prev)
                      }
                    >
                      Disable
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditSensor(null)}>Cancel</Button>
            <Button onClick={handleSave} disabled={isSaving}>
              {isSaving ? "Saving…" : "Edit"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk delete confirmation */}
      <Dialog open={confirmBulkDelete} onOpenChange={setConfirmBulkDelete}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              Confirm bulk delete
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            This will permanently delete <strong>{selected.size}</strong> sensor
            {selected.size !== 1 ? "s" : ""}. This action cannot be undone.
          </p>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirmBulkDelete(false)}>Cancel</Button>
            <Button variant="destructive" onClick={handleBulkDelete}>
              Delete {selected.size} sensor{selected.size !== 1 ? "s" : ""}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
