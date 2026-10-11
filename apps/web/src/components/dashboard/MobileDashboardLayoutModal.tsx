import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  applyMobileLayoutRows,
  dashboardWidgetDisplayTitle,
  dashboardWidgetHasSettings,
  flatIndexBeforeMobileRow,
  groupWidgetsForMobileLayout,
  reorderIndexInMobileRow,
  reorderMobileLayoutRows,
  type DashboardWidget,
  type MobileLayoutRow,
} from "../../lib/dashboardWidgets";
import { useBackdropBlurPause } from "../../lib/useBackdropBlurPause";
import "./mobile-dashboard-layout-modal.css";

type Props = {
  open: boolean;
  widgets: DashboardWidget[];
  onChange: (next: DashboardWidget[]) => void;
  onClose: () => void;
  onInsertAt: (flatIndex: number) => void;
  onRemove: (id: string) => void;
  onOpenSettings?: (widget: DashboardWidget) => void;
};

type DropPlace = "before" | "after";
type RowDropTarget = { index: number; place: DropPlace };
type ColDropTarget = { col: number; place: DropPlace };
type DragAxis = "x" | "y";

const AXIS_LOCK_PX = 10;

function SettingsButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      className="mdl-action-btn btn-glass"
      aria-label="Настройки виджета"
      onClick={onClick}
    >
      <img
        src="/assets/portfolio-ui/settings.svg"
        alt=""
        aria-hidden
        className="mdl-action-icon mdl-action-icon--settings"
      />
    </button>
  );
}

function CloseButton({ onRemove }: { onRemove: () => void }) {
  return (
    <button
      type="button"
      className="mdl-action-btn btn-glass"
      aria-label="Удалить виджет"
      onClick={() => {
        if (window.confirm("Удалить виджет с дашборда?")) onRemove();
      }}
    >
      <img
        src="/assets/portfolio-ui/close.svg"
        alt=""
        aria-hidden
        className="mdl-action-icon mdl-action-icon--close"
      />
    </button>
  );
}

function MoveHandle({
  onMoveStart,
}: {
  onMoveStart: (clientX: number, clientY: number, pointerId: number, target: HTMLElement) => void;
}) {
  return (
    <button
      type="button"
      className="mdl-action-btn btn-glass mdl-move-handle"
      aria-label="Переместить виджет"
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        e.preventDefault();
        e.stopPropagation();
        onMoveStart(e.clientX, e.clientY, e.pointerId, e.currentTarget);
      }}
    >
      <img src="/assets/portfolio-ui/arrow_move.svg" alt="" aria-hidden className="mdl-action-icon" />
    </button>
  );
}

function InsertSlot({ onClick }: { onClick: () => void }) {
  return (
    <div className="mdl-insert">
      <span className="mdl-insert-line" aria-hidden />
      <button type="button" className="mdl-insert-btn" aria-label="Добавить виджет" onClick={onClick}>
        <img src="/assets/portfolio-ui/plus.svg" alt="" aria-hidden className="mdl-insert-plus" />
      </button>
      <span className="mdl-insert-line" aria-hidden />
    </div>
  );
}

function dropTargetFromPoint(
  clientY: number,
  body: HTMLElement | null,
): RowDropTarget | null {
  if (!body) return null;
  const nodes = [...body.querySelectorAll<HTMLElement>("[data-mdl-row-index]")];
  if (nodes.length === 0) return null;

  for (const node of nodes) {
    const rect = node.getBoundingClientRect();
    const index = Number(node.dataset.mdlRowIndex);
    if (!Number.isFinite(index)) continue;
    if (clientY >= rect.top && clientY <= rect.bottom) {
      const mid = rect.top + rect.height / 2;
      return { index, place: clientY < mid ? "before" : "after" };
    }
  }

  let best: { index: number; dist: number; place: DropPlace } | null = null;
  for (const node of nodes) {
    const rect = node.getBoundingClientRect();
    const index = Number(node.dataset.mdlRowIndex);
    if (!Number.isFinite(index)) continue;
    const mid = rect.top + rect.height / 2;
    const dist = Math.abs(clientY - mid);
    const place: DropPlace = clientY < mid ? "before" : "after";
    if (!best || dist < best.dist) best = { index, dist, place };
  }
  return best ? { index: best.index, place: best.place } : null;
}

function indexColDropFromPoint(clientX: number, grid: HTMLElement | null): ColDropTarget | null {
  if (!grid) return null;
  const cells = [...grid.querySelectorAll<HTMLElement>("[data-mdl-index-col]")];
  if (cells.length === 0) return null;

  const first = cells[0]!;
  const last = cells[cells.length - 1]!;
  const firstCol = Number(first.dataset.mdlIndexCol);
  const lastCol = Number(last.dataset.mdlIndexCol);
  if (!Number.isFinite(firstCol) || !Number.isFinite(lastCol)) return null;

  const firstRect = first.getBoundingClientRect();
  const lastRect = last.getBoundingClientRect();

  // Без боковых полей: строго по краям ячеек.
  if (clientX < firstRect.left) {
    return { col: firstCol, place: "before" };
  }
  if (clientX > lastRect.right) {
    return { col: lastCol, place: "after" };
  }

  for (const cell of cells) {
    const rect = cell.getBoundingClientRect();
    const col = Number(cell.dataset.mdlIndexCol);
    if (!Number.isFinite(col)) continue;
    if (clientX >= rect.left && clientX <= rect.right) {
      const mid = rect.left + rect.width / 2;
      return { col, place: clientX < mid ? "before" : "after" };
    }
  }

  for (let i = 0; i < cells.length - 1; i += 1) {
    const left = cells[i]!;
    const right = cells[i + 1]!;
    const leftRect = left.getBoundingClientRect();
    const rightRect = right.getBoundingClientRect();
    if (clientX > leftRect.right && clientX < rightRect.left) {
      const mid = (leftRect.right + rightRect.left) / 2;
      const leftCol = Number(left.dataset.mdlIndexCol);
      const rightCol = Number(right.dataset.mdlIndexCol);
      if (!Number.isFinite(leftCol) || !Number.isFinite(rightCol)) continue;
      return clientX < mid
        ? { col: leftCol, place: "after" }
        : { col: rightCol, place: "before" };
    }
  }

  return null;
}

/** Индекс вставки после удаления `from` из списка. */
function resolveInsertIndex(from: number, targetIndex: number, place: DropPlace): number {
  let insertAt = place === "before" ? targetIndex : targetIndex + 1;
  if (from < insertAt) insertAt -= 1;
  return insertAt;
}

export function MobileDashboardLayoutModal({
  open,
  widgets,
  onChange,
  onClose,
  onInsertAt,
  onRemove,
  onOpenSettings,
}: Props) {
  useBackdropBlurPause(open);
  const [rows, setRows] = useState<MobileLayoutRow[]>(() => groupWidgetsForMobileLayout(widgets));
  const rowsRef = useRef(rows);
  const bodyRef = useRef<HTMLDivElement>(null);
  const dragFromRowRef = useRef<number | null>(null);
  const dragFromColRef = useRef<number | null>(null);
  const dragAxisRef = useRef<DragAxis | null>(null);
  const [dragFromRow, setDragFromRow] = useState<number | null>(null);
  const [dragFromCol, setDragFromCol] = useState<number | null>(null);
  const [dragAxis, setDragAxis] = useState<DragAxis | null>(null);
  const [rowDropTarget, setRowDropTarget] = useState<RowDropTarget | null>(null);
  const [colDropTarget, setColDropTarget] = useState<ColDropTarget | null>(null);

  useEffect(() => {
    rowsRef.current = rows;
  }, [rows]);

  useEffect(() => {
    if (!open) return;
    setRows(groupWidgetsForMobileLayout(widgets));
  }, [open, widgets]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const commitRows = (next: MobileLayoutRow[]) => {
    setRows(next);
    onChange(applyMobileLayoutRows(next));
  };

  const clearDragState = () => {
    dragFromRowRef.current = null;
    dragFromColRef.current = null;
    dragAxisRef.current = null;
    setDragFromRow(null);
    setDragFromCol(null);
    setDragAxis(null);
    setRowDropTarget(null);
    setColDropTarget(null);
  };

  const startRowMove = (rowIndex: number, clientY: number, pointerId: number, target: HTMLElement) => {
    dragFromRowRef.current = rowIndex;
    dragFromColRef.current = null;
    dragAxisRef.current = "y";
    setDragFromRow(rowIndex);
    setDragFromCol(null);
    setDragAxis("y");
    setRowDropTarget(null);
    setColDropTarget(null);
    target.setPointerCapture(pointerId);

    const onMove = (e: PointerEvent) => {
      const from = dragFromRowRef.current;
      const targetDrop = dropTargetFromPoint(e.clientY, bodyRef.current);
      if (!targetDrop || from == null) {
        setRowDropTarget(null);
        return;
      }
      const insertAt = resolveInsertIndex(from, targetDrop.index, targetDrop.place);
      if (insertAt === from) {
        setRowDropTarget(null);
        return;
      }
      setRowDropTarget(targetDrop);
    };

    const onUp = (e: PointerEvent) => {
      target.releasePointerCapture(pointerId);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);

      const from = dragFromRowRef.current;
      const targetDrop = dropTargetFromPoint(e.clientY, bodyRef.current);
      clearDragState();
      if (from == null || !targetDrop) return;
      const to = resolveInsertIndex(from, targetDrop.index, targetDrop.place);
      if (to === from) return;
      commitRows(reorderMobileLayoutRows(rowsRef.current, from, to));
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
  };

  const startIndexMove = (
    rowIndex: number,
    colIndex: number,
    startX: number,
    startY: number,
    pointerId: number,
    target: HTMLElement,
  ) => {
    dragFromRowRef.current = rowIndex;
    dragFromColRef.current = colIndex;
    dragAxisRef.current = null;
    setDragFromRow(rowIndex);
    setDragFromCol(colIndex);
    setDragAxis(null);
    setRowDropTarget(null);
    setColDropTarget(null);
    target.setPointerCapture(pointerId);

    const grid = bodyRef.current?.querySelector<HTMLElement>(
      `[data-mdl-row-index="${rowIndex}"] .mdl-index-grid`,
    );

    const onMove = (e: PointerEvent) => {
      const fromRow = dragFromRowRef.current;
      const fromCol = dragFromColRef.current;
      if (fromRow == null || fromCol == null) return;

      let axis = dragAxisRef.current;
      if (axis == null) {
        const dx = e.clientX - startX;
        const dy = e.clientY - startY;
        if (Math.abs(dx) < AXIS_LOCK_PX && Math.abs(dy) < AXIS_LOCK_PX) return;
        axis = Math.abs(dx) >= Math.abs(dy) ? "x" : "y";
        dragAxisRef.current = axis;
        setDragAxis(axis);
      }

      if (axis === "y") {
        setColDropTarget(null);
        const targetDrop = dropTargetFromPoint(e.clientY, bodyRef.current);
        if (!targetDrop) {
          setRowDropTarget(null);
          return;
        }
        const insertAt = resolveInsertIndex(fromRow, targetDrop.index, targetDrop.place);
        if (insertAt === fromRow) {
          setRowDropTarget(null);
          return;
        }
        setRowDropTarget(targetDrop);
        return;
      }

      setRowDropTarget(null);
      const liveGrid =
        bodyRef.current?.querySelector<HTMLElement>(
          `[data-mdl-row-index="${fromRow}"] .mdl-index-grid`,
        ) ?? grid;
      const targetDrop = indexColDropFromPoint(e.clientX, liveGrid ?? null);
      if (!targetDrop) {
        setColDropTarget(null);
        return;
      }
      const insertAt = resolveInsertIndex(fromCol, targetDrop.col, targetDrop.place);
      if (insertAt === fromCol) {
        setColDropTarget(null);
        return;
      }
      setColDropTarget(targetDrop);
    };

    const onUp = (e: PointerEvent) => {
      target.releasePointerCapture(pointerId);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);

      const fromRow = dragFromRowRef.current;
      const fromCol = dragFromColRef.current;
      const axis = dragAxisRef.current;
      const rowTarget = dropTargetFromPoint(e.clientY, bodyRef.current);
      const liveGrid =
        fromRow == null
          ? null
          : (bodyRef.current?.querySelector<HTMLElement>(
              `[data-mdl-row-index="${fromRow}"] .mdl-index-grid`,
            ) ?? grid);
      const colTarget = indexColDropFromPoint(e.clientX, liveGrid ?? null);
      clearDragState();

      if (fromRow == null) return;

      if (axis === "y") {
        if (!rowTarget) return;
        const to = resolveInsertIndex(fromRow, rowTarget.index, rowTarget.place);
        if (to === fromRow) return;
        commitRows(reorderMobileLayoutRows(rowsRef.current, fromRow, to));
        return;
      }

      if (axis === "x" && fromCol != null) {
        if (!colTarget) return;
        const to = resolveInsertIndex(fromCol, colTarget.col, colTarget.place);
        if (to === fromCol) return;
        commitRows(reorderIndexInMobileRow(rowsRef.current, fromRow, fromCol, to));
      }
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
  };

  const rowKeys = useMemo(
    () =>
      rows.map((row) =>
        row.kind === "single" ? row.widget.id : row.widgets.map((w) => w.id).join("|"),
      ),
    [rows],
  );

  if (!open) return null;
  if (typeof document === "undefined") return null;

  return createPortal(
    <div className="mdl-overlay" role="presentation">
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Расположение виджетов"
        className="mdl-dialog"
      >
        <div className="mdl-body" ref={bodyRef}>
          {rows.map((row, rowIndex) => {
            const key = rowKeys[rowIndex]!;
            const isRowDragging = dragFromRow === rowIndex && dragAxis === "y";
            const showLineBefore =
              rowDropTarget?.index === rowIndex && rowDropTarget.place === "before";
            const showLineAfter =
              rowDropTarget?.index === rowIndex && rowDropTarget.place === "after";
            return (
              <div key={key} className="mdl-block">
                {showLineBefore ? <div className="mdl-drop-line" aria-hidden /> : null}
                <div
                  className={`mdl-row${isRowDragging ? " is-dragging" : ""}`}
                  data-mdl-row-index={rowIndex}
                >
                  {row.kind === "single" ? (
                    <div className="mdl-pill-row">
                      <div className="mdl-pill atlas-glass">
                        <span className="mdl-pill-label">{dashboardWidgetDisplayTitle(row.widget)}</span>
                      </div>
                      <div className="mdl-pill-actions">
                        <CloseButton onRemove={() => onRemove(row.widget.id)} />
                        {dashboardWidgetHasSettings(row.widget.type) && onOpenSettings ? (
                          <SettingsButton onClick={() => onOpenSettings(row.widget)} />
                        ) : null}
                        <MoveHandle
                          onMoveStart={(x, y, pointerId, target) =>
                            startRowMove(rowIndex, y, pointerId, target)
                          }
                        />
                      </div>
                    </div>
                  ) : (
                    <div className="mdl-index-grid">
                      {row.widgets.map((widget, colIndex) => {
                        const isColDragging =
                          dragFromRow === rowIndex &&
                          dragFromCol === colIndex &&
                          dragAxis === "x";
                        const showColBefore =
                          dragFromRow === rowIndex &&
                          dragAxis === "x" &&
                          colDropTarget?.col === colIndex &&
                          colDropTarget.place === "before";
                        const showColAfter =
                          dragFromRow === rowIndex &&
                          dragAxis === "x" &&
                          colDropTarget?.col === colIndex &&
                          colDropTarget.place === "after";
                        return (
                          <div
                            key={widget.id}
                            className={`mdl-index-cell${isColDragging ? " is-dragging" : ""}`}
                            data-mdl-index-col={colIndex}
                          >
                            {showColBefore ? (
                              <div className="mdl-drop-line-v" aria-hidden />
                            ) : null}
                            <div className="mdl-pill mdl-pill--index atlas-glass">
                              <span className="mdl-pill-label">Индекс</span>
                            </div>
                            <div className="mdl-pill-actions mdl-pill-actions--below mdl-pill-actions--index">
                              <div className="mdl-pill-actions-row">
                                {dashboardWidgetHasSettings(widget.type) && onOpenSettings ? (
                                  <SettingsButton onClick={() => onOpenSettings(widget)} />
                                ) : null}
                                <MoveHandle
                                  onMoveStart={(x, y, pointerId, target) =>
                                    startIndexMove(rowIndex, colIndex, x, y, pointerId, target)
                                  }
                                />
                              </div>
                              <CloseButton onRemove={() => onRemove(widget.id)} />
                            </div>
                            {showColAfter ? (
                              <div className="mdl-drop-line-v mdl-drop-line-v--after" aria-hidden />
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
                {showLineAfter ? <div className="mdl-drop-line" aria-hidden /> : null}

                <InsertSlot onClick={() => onInsertAt(flatIndexBeforeMobileRow(rows, rowIndex + 1))} />
              </div>
            );
          })}

          {rows.length === 0 ? (
            <InsertSlot onClick={() => onInsertAt(0)} />
          ) : null}
        </div>
      </div>
    </div>,
    document.body,
  );
}
