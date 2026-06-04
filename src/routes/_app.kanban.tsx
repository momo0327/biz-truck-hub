import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { DragDropContext, Droppable, Draggable, type DropResult } from "@hello-pangea/dnd";
import { CompanyDrawer } from "@/components/CompanyDrawer";
import {
  useCompanies,
  updateStatus,
  STATUS_META,
  PIPELINE_ORDER,
  type Company,
  type Status,
} from "@/lib/companies";
import { KanbanSkeleton } from "@/components/PageSkeletons";


export const Route = createFileRoute("/_app/kanban")({ component: PipelinePage });

function vehicleCount(c: Company) {
  if (Array.isArray(c.vehicles)) return c.vehicles.length;
  return 0;
}

function temperatureFor(c: Company): { label: string; tone: string } {
  // Heuristic: recent contact = hot, fleet researched = warm, else cold
  if (c.status === "in_negotiation" || c.status === "deal_made") return { label: "HOT", tone: "bg-[var(--stage-negotiating)]/10 text-[var(--stage-negotiating)]" };
  if (c.researched_at) return { label: "WARM", tone: "bg-muted text-muted-foreground" };
  return { label: "COLD", tone: "bg-muted text-muted-foreground" };
}

function PipelinePage() {
  const { companies, loading, upsertCompany, removeCompanies } = useCompanies();
  const [selected, setSelected] = useState<Company | null>(null);

  const totals = useMemo(() => {
    return PIPELINE_ORDER.map((s) => {
      const items = companies.filter((c) => c.status === s);
      return { status: s, count: items.length, items };
    });
  }, [companies]);

  if (loading) return <KanbanSkeleton />;

  async function onDragEnd(r: DropResult) {
    if (!r.destination) return;
    const newStatus = r.destination.droppableId as Status;
    if (r.source.droppableId === newStatus) return;
    const { data } = await updateStatus(r.draggableId, newStatus);
    if (data) upsertCompany(data as Company);
  }

  return (
    <div className="p-8 space-y-6">
      <header className="flex items-end gap-4 flex-wrap">
        <h1 className="font-display text-3xl tracking-wide">Pipeline</h1>
        <p className="text-sm text-muted-foreground mb-1">Drag leads between stages to update status</p>
      </header>

      {/* Top stage summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {totals.map(({ status, count }) => {
          const meta = STATUS_META[status];
          return (
            <div
              key={status}
              className="bg-card rounded-lg border p-4 relative overflow-hidden"
              style={{ borderTop: `3px solid ${meta.accent}` }}
            >
              <div className="text-[11px] font-medium tracking-[0.18em] uppercase text-muted-foreground">
                {meta.label}
              </div>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="font-display text-4xl leading-none">{count}</span>
                <span className="text-xs text-muted-foreground">leads</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Pipeline board */}
      <section className="bg-card border rounded-xl p-6">
        <header className="flex items-start justify-between gap-4 mb-5 flex-wrap">
          <div>
            <h1 className="font-display text-2xl tracking-wide uppercase">Lead Pipeline</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Drag any card between stages to update status · changes save instantly
            </p>
          </div>
        </header>

        <DragDropContext onDragEnd={onDragEnd}>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-4">
            {PIPELINE_ORDER.map((status) => {
              const meta = STATUS_META[status];
              const items = companies.filter((c) => c.status === status);
              return (
                <Droppable droppableId={status} key={status}>
                  {(provided, snap) => (
                    <div
                      ref={provided.innerRef}
                      {...provided.droppableProps}
                      className={`rounded-lg border bg-background/50 flex flex-col min-h-[200px] ${
                        snap.isDraggingOver ? "ring-2 ring-primary/30" : ""
                      }`}
                      style={{ borderTop: `3px solid ${meta.accent}` }}
                    >
                      <div className="px-3 pt-3 pb-2 flex items-center justify-between">
                        <div className="flex items-center gap-2 text-xs font-semibold tracking-[0.14em] uppercase">
                          <span className={`size-2 rounded-full ${meta.dot}`} />
                          {meta.label}
                        </div>
                        <span className="text-xs text-muted-foreground bg-muted rounded-full px-2 py-0.5">
                          {items.length}
                        </span>
                      </div>
                      <div className="p-2 pt-1 space-y-2 max-h-[calc(100vh-360px)] overflow-y-auto">
                        {items.map((c, idx) => {
                          const temp = temperatureFor(c);
                          const trucks = vehicleCount(c);
                          return (
                            <Draggable draggableId={c.id} index={idx} key={c.id}>
                              {(p, s) => (
                                <div
                                  ref={p.innerRef}
                                  {...p.draggableProps}
                                  {...p.dragHandleProps}
                                  onClick={() => setSelected(c)}
                                  className={`bg-card rounded-lg border p-3 cursor-pointer hover:border-primary/40 ${
                                    s.isDragging ? "shadow-lg" : ""
                                  }`}
                                  style={{ borderLeft: `3px solid ${meta.accent}` }}
                                >
                                  <div className="font-display text-base leading-tight">
                                    {c.name}
                                  </div>
                                  <div className="text-xs text-muted-foreground mt-1 truncate">
                                    {c.address?.split(",")[0] || "—"}
                                    {c.trucks_info ? ` · ${c.trucks_info.slice(0, 24)}` : ""}
                                  </div>
                                  <div className="mt-3 flex items-center justify-between">
                                    <span className="text-[11px] text-muted-foreground">
                                      {trucks > 0 ? `${trucks} trucks` : c.fleet_size || "—"}
                                    </span>
                                    <span
                                      className={`text-[10px] font-semibold tracking-wider px-2 py-0.5 rounded ${temp.tone}`}
                                    >
                                      {temp.label}
                                    </span>
                                  </div>
                                </div>
                              )}
                            </Draggable>
                          );
                        })}
                        {provided.placeholder}
                      </div>
                    </div>
                  )}
                </Droppable>
              );
            })}
          </div>
        </DragDropContext>
      </section>

      {selected && (
        <CompanyDrawer
          company={companies.find((c) => c.id === selected.id) ?? selected}
          onClose={() => setSelected(null)}
          onCompanyChange={(company) => {
            upsertCompany(company);
            setSelected(company);
          }}
          onCompanyDeleted={(id) => removeCompanies([id])}
        />
      )}
    </div>
  );
}
