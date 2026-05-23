import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { DragDropContext, Droppable, Draggable, type DropResult } from "@hello-pangea/dnd";
import { CompanyDrawer } from "@/components/CompanyDrawer";
import { useCompanies, updateStatus, STATUS_META, STATUS_ORDER, type Company, type Status } from "@/lib/companies";
import { KanbanSkeleton } from "@/components/PageSkeletons";

export const Route = createFileRoute("/_app/kanban")({ component: KanbanPage });

function KanbanPage() {
  const { companies, loading, upsertCompany, removeCompanies } = useCompanies();
  const [selected, setSelected] = useState<Company | null>(null);

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
      <header>
        <h1 className="font-display text-3xl">Pipeline</h1>
        <p className="text-sm text-muted-foreground mt-1">Drag cards to update status.</p>
      </header>

      <DragDropContext onDragEnd={onDragEnd}>
        <div className="flex gap-4 overflow-x-auto pb-4">
          {STATUS_ORDER.map((status) => {
            const meta = STATUS_META[status];
            const items = companies.filter((c) => c.status === status);
            return (
              <Droppable droppableId={status} key={status}>
                {(provided, snap) => (
                  <div
                    ref={provided.innerRef}
                    {...provided.droppableProps}
                    className={`w-72 shrink-0 rounded-lg border bg-card flex flex-col ${
                      snap.isDraggingOver ? "ring-2 ring-primary/50" : ""
                    }`}
                  >
                    <div className="px-3 py-2.5 border-b flex items-center justify-between">
                      <div className="flex items-center gap-2 text-sm font-medium">
                        <span>{meta.emoji}</span> {meta.label}
                      </div>
                      <span className="text-xs text-muted-foreground">{items.length}</span>
                    </div>
                    <div className="p-2 space-y-2 min-h-32 max-h-[calc(100vh-220px)] overflow-y-auto">
                      {items.map((c, idx) => (
                        <Draggable draggableId={c.id} index={idx} key={c.id}>
                          {(p, s) => (
                            <div
                              ref={p.innerRef}
                              {...p.draggableProps}
                              {...p.dragHandleProps}
                              onClick={() => setSelected(c)}
                              className={`bg-background rounded-md border p-3 cursor-pointer hover:border-primary/50 ${
                                s.isDragging ? "shadow-lg" : ""
                              }`}
                            >
                              <div className="font-medium text-sm">{c.name}</div>
                              {c.phones?.[0] && (
                                <div className="text-xs text-success mt-1">📞 {c.phones[0]}</div>
                              )}
                              {c.trucks_info && (
                                <div className="text-xs text-muted-foreground mt-1.5 line-clamp-2">
                                  {c.trucks_info}
                                </div>
                              )}
                              {c.last_contact && (
                                <div className="text-[10px] text-muted-foreground mt-2">
                                  {new Date(c.last_contact).toLocaleDateString()}
                                </div>
                              )}
                            </div>
                          )}
                        </Draggable>
                      ))}
                      {provided.placeholder}
                    </div>
                  </div>
                )}
              </Droppable>
            );
          })}
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
