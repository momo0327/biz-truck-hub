import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { DragDropContext, Droppable, Draggable, type DropResult, type DraggableProvided, type DraggableStateSnapshot } from "@hello-pangea/dnd";
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

function PortalCard({
  provided,
  snapshot,
  children,
}: {
  provided: DraggableProvided;
  snapshot: DraggableStateSnapshot;
  children: React.ReactNode;
}) {
  const el = (
    <div
      ref={provided.innerRef as any}
      {...(provided.draggableProps as any)}
      {...(provided.dragHandleProps as any)}
      style={{
        ...(provided.draggableProps as any).style,
        ...(snapshot.isDragging ? { pointerEvents: "none" } : {}),
      }}
    >
      {children}
    </div>
  );
  if (snapshot.isDragging) {
    return createPortal(el, document.body);
  }
  return el;
}

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
    const company = companies.find((c) => c.id === r.draggableId);
    if (!company) return;
    // Optimistic update — move card to new status immediately
    upsertCompany({ ...company, status: newStatus });
    updateStatus(r.draggableId, newStatus).then(({ data }) => {
      if (data) upsertCompany(data as Company);
    });
  }

  return (
    <div className="flex flex-col h-full">
      <div className="px-8 pt-8 pb-4 flex items-end gap-4 flex-wrap shrink-0">
        <h1 className="font-display text-3xl tracking-wide">Pipeline</h1>
        <p className="text-sm text-muted-foreground mb-1">Drag leads between stages to update status</p>
      </div>

      {/* Top stage summary strip */}
      <div className="px-8 pb-4 grid grid-cols-5 gap-3 shrink-0">
        {totals.map(({ status, count }) => {
          const meta = STATUS_META[status];
          return (
            <div
              key={status}
              className="bg-card rounded-lg border p-4"
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

      {/* Pipeline board — full width, fills remaining height */}
      <DragDropContext onDragEnd={onDragEnd}>
        <div className="flex-1 overflow-x-auto px-8 pb-8">
          <div className="grid gap-3 h-full min-h-[500px]" style={{ gridTemplateColumns: `repeat(${PIPELINE_ORDER.length}, minmax(220px, 1fr))` }}>
            {PIPELINE_ORDER.map((status) => {
              const meta = STATUS_META[status];
              const items = companies.filter((c) => c.status === status);
              return (
                <Droppable droppableId={status} key={status}>
                  {(provided, snap) => (
                    <div
                      ref={provided.innerRef}
                      {...provided.droppableProps}
                      className={`rounded-lg border bg-card flex flex-col h-full ${
                        snap.isDraggingOver ? "ring-2 ring-primary/30 bg-primary/5" : ""
                      }`}
                      style={{ borderTop: `3px solid ${meta.accent}` }}
                    >
                      <div className="px-3 pt-3 pb-2 flex items-center justify-between shrink-0">
                        <div className="flex items-center gap-2 text-xs font-semibold tracking-[0.14em] uppercase">
                          <span className={`size-2 rounded-full ${meta.dot}`} />
                          {meta.label}
                        </div>
                        <span className="text-xs text-muted-foreground bg-muted rounded-full px-2 py-0.5">
                          {items.length}
                        </span>
                      </div>
                      <div className="p-2 pt-1 space-y-2 overflow-y-auto flex-1">
                        {items.map((c, idx) => {
                          const temp = temperatureFor(c);
                          const trucks = vehicleCount(c);
                          return (
                            <Draggable draggableId={c.id} index={idx} key={c.id}>
                              {(p, s) => (
                                <PortalCard provided={p} snapshot={s}>
                                  <div
                                    onClick={() => setSelected(c)}
                                    className={`bg-background rounded-lg border p-3 cursor-grab active:cursor-grabbing hover:border-primary/40 transition-shadow ${
                                      s.isDragging ? "shadow-xl ring-2 ring-primary/20 rotate-1" : ""
                                    }`}
                                    style={{ borderLeft: `3px solid ${meta.accent}` }}
                                  >
                                    <div className="font-display text-base leading-tight">{c.name}</div>
                                    <div className="text-xs text-muted-foreground mt-1 truncate">
                                      {c.address?.split(",")[0] || "—"}
                                      {c.trucks_info ? ` · ${c.trucks_info.slice(0, 24)}` : ""}
                                    </div>
                                    <div className="mt-3 flex items-center justify-between">
                                      <span className="text-[11px] text-muted-foreground">
                                        {trucks > 0 ? `${trucks} trucks` : c.fleet_size || "—"}
                                      </span>
                                      <span className={`text-[10px] font-semibold tracking-wider px-2 py-0.5 rounded ${temp.tone}`}>
                                        {temp.label}
                                      </span>
                                    </div>
                                  </div>
                                </PortalCard>
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
        </div>
      </DragDropContext>

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
