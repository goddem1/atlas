import { Fragment, useEffect, useMemo, useRef, type ReactNode } from "react";
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from "@tanstack/react-table";
import type { CryptocurrencyListItem } from "@atlas-v1/shared";
import type { TradeRecord, TradeUpsertPayload } from "../../../services/api";
import { extractPlainText } from "../../notes/noteContentMeta";
import {
  formatTradeDateTime,
  formatTradeFeeUsd,
  formatTradePnlPercent,
  formatTradePnlUsdTable,
  pnlTone,
  stripSymbolUsdt,
} from "./journalFormat";
import { TradeFormShell } from "./TradeForm";
import { JournalFiltersPopover, type JournalFilterState } from "./JournalFiltersPopover";
import { bindTelegramScrollbar } from "../../../lib/bindTelegramScrollbar";

type Props = {
  trades: TradeRecord[];
  assetsBySymbol: Map<string, CryptocurrencyListItem>;
  expandedId: string | null;
  onToggleExpand: (id: string) => void;
  onEdit: (trade: TradeRecord) => void;
  filters: JournalFilterState;
  onFiltersChange: (filters: JournalFilterState) => void;
  filtersOpen: boolean;
  onFiltersOpenChange: (open: boolean) => void;
  editingTrade?: TradeRecord | null;
  saving?: boolean;
  formError?: string | null;
  onSubmitTrade?: (payload: TradeUpsertPayload) => void | Promise<void>;
  onCancelEdit?: () => void;
  formResetKey?: number;
  formOpen?: boolean;
  onOpenForm?: () => void;
};

const columnHelper = createColumnHelper<TradeRecord>();

function FilterIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 16 16" aria-hidden="true">
      <path
        d="M1.5 2.5h13l-4.5 5.2v4.3l-4 2V7.7L1.5 2.5z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function EditIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M18 10L14 6M2.5 21.5L5.88437 21.124C6.29786 21.078 6.5046 21.055 6.69785 20.9925C6.86929 20.937 7.03245 20.8586 7.18289 20.7594C7.35245 20.6475 7.49955 20.5005 7.79373 20.2063L21 7C22.1046 5.89543 22.1046 4.10457 21 3C19.8955 1.89543 18.1046 1.89543 17 3L3.79373 16.2063C3.49955 16.5005 3.35246 16.6475 3.24064 16.8171C3.14143 16.9676 3.06301 17.1307 3.00751 17.3022C2.94496 17.4954 2.92198 17.7021 2.87604 18.1156L2.5 21.5Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function TradeTableBody({
  trades,
  expandedId,
  table,
  addFormAtTop = false,
  inlineEditTradeId = null,
  formRow,
  addButtonRow,
  tableFooter,
}: {
  trades: TradeRecord[];
  expandedId: string | null;
  table: ReturnType<typeof useReactTable<TradeRecord>>;
  addFormAtTop?: boolean;
  inlineEditTradeId?: string | null;
  formRow?: ReactNode;
  addButtonRow?: ReactNode;
  tableFooter?: ReactNode;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const columnClass = (id: string) => {
    if (id === "expand") return "journal-table-filter-col journal-col-expand";
    return `journal-col-${id}`;
  };

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    return bindTelegramScrollbar(el);
  }, [trades.length, expandedId, addFormAtTop, inlineEditTradeId, addButtonRow, tableFooter]);

  return (
    <div ref={wrapRef} className="journal-table-wrap">
      <table className="journal-table">
        <colgroup>
          <col className="journal-col-entryAt" />
          <col className="journal-col-symbol" />
          <col className="journal-col-pnlUsd" />
          <col className="journal-col-pnlPercent" />
          <col className="journal-col-commission" />
          <col className="journal-col-fundingFee" />
          <col className="journal-col-direction" />
          <col className="journal-col-reason" />
          <col className="journal-col-commentPreview" />
          <col className="journal-col-expand" />
        </colgroup>
        <thead>
          {table.getHeaderGroups().map((headerGroup) => (
            <tr key={headerGroup.id}>
              {headerGroup.headers.map((header) => (
                <th key={header.id} className={columnClass(header.column.id)}>
                  {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                </th>
              ))}
            </tr>
          ))}
        </thead>
        <tbody>
          {addButtonRow}
          {addFormAtTop ? formRow : null}
          {table.getRowModel().rows.map((row) => {
            if (inlineEditTradeId === row.original.id) {
              return <Fragment key={row.id}>{formRow}</Fragment>;
            }

            const expanded = expandedId === row.original.id;
            return (
              <tr key={row.id} className={expanded ? "is-expanded" : undefined}>
                {row.getVisibleCells().map((cell) => (
                  <td key={cell.id} className={columnClass(cell.column.id)}>
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
        {tableFooter ? <tfoot>{tableFooter}</tfoot> : null}
      </table>
      {trades.length === 0 && addFormAtTop ? (
        <p className="journal-table-empty">Сделок пока нет — заполните строку выше</p>
      ) : null}
    </div>
  );
}

export function JournalTradesTable({
  trades,
  assetsBySymbol,
  expandedId,
  onToggleExpand,
  onEdit,
  filters,
  onFiltersChange,
  filtersOpen,
  onFiltersOpenChange,
  editingTrade = null,
  saving = false,
  formError = null,
  onSubmitTrade,
  onCancelEdit,
  formResetKey = 0,
  formOpen = false,
  onOpenForm,
}: Props) {
  const filterBtnRef = useRef<HTMLButtonElement>(null);
  const addFormAtTop = formOpen && !editingTrade;
  const inlineEditTradeId = editingTrade?.id ?? null;
  const showForm = addFormAtTop || Boolean(inlineEditTradeId);

  const columns = useMemo(
    () => [
      columnHelper.display({
        id: "tradeAt",
        header: "Дата",
        cell: (info) => {
          const trade = info.row.original;
          const expanded = expandedId === trade.id;
          return (
            <div className="journal-table-date">
              <span className="journal-table-date-main">{formatTradeDateTime(trade.entryAt)}</span>
              {expanded && trade.exitAt ? (
                <span className="journal-table-date-exit">{formatTradeDateTime(trade.exitAt)}</span>
              ) : null}
            </div>
          );
        },
      }),
      columnHelper.accessor("symbol", {
        header: "Символ",
        cell: (info) => {
          const symbol = info.getValue();
          const base = stripSymbolUsdt(symbol);
          const asset = assetsBySymbol.get(base);
          return (
            <span className="journal-table-symbol">
              {asset?.iconUrl ? <img src={asset.iconUrl} alt="" width={20} height={20} /> : null}
              <span>{base}</span>
            </span>
          );
        },
      }),
      columnHelper.accessor("pnlUsd", {
        header: "PnL, $",
        cell: (info) => (
          <span className={`journal-pnl journal-pnl--${pnlTone(info.getValue())}`}>
            {formatTradePnlUsdTable(info.getValue())}
          </span>
        ),
      }),
      columnHelper.accessor("pnlPercent", {
        header: "PnL, %",
        cell: (info) => (
          <span className={`journal-pnl journal-pnl--${pnlTone(info.getValue())}`}>
            {formatTradePnlPercent(info.getValue())}
          </span>
        ),
      }),
      columnHelper.accessor("commission", {
        header: "Комиссия, $",
        cell: (info) => formatTradeFeeUsd(Number(info.getValue())),
      }),
      columnHelper.accessor("fundingFee", {
        header: "Фандинг, $",
        cell: (info) => formatTradeFeeUsd(Number(info.getValue())),
      }),
      columnHelper.accessor("direction", {
        header: "L/S",
        cell: (info) => (
          <span className={`journal-direction journal-direction--${info.getValue()}`}>
            {info.getValue() === "short" ? "Short" : "Long"}
          </span>
        ),
      }),
      columnHelper.accessor("reason", {
        header: "Основание",
        cell: (info) => {
          const text = info.getValue()?.trim() ?? "";
          const expanded = expandedId === info.row.original.id;
          if (!text) return <span>—</span>;
          return (
            <span className={expanded ? "journal-table-text-full" : "journal-table-clamp"}>{text}</span>
          );
        },
      }),
      columnHelper.display({
        id: "commentPreview",
        header: "Комментарий",
        cell: ({ row }) => {
          const preview = extractPlainText(row.original.comment);
          const expanded = expandedId === row.original.id;
          if (!preview) return <span>—</span>;
          return (
            <span className={expanded ? "journal-table-text-full" : "journal-table-clamp"}>{preview}</span>
          );
        },
      }),
      columnHelper.display({
        id: "expand",
        header: () => (
          <div className="journal-table-expand-cell">
            <button
              ref={filterBtnRef}
              type="button"
              className={`journal-table-filter-btn${filtersOpen ? " is-active" : ""}`}
              aria-label="Фильтры"
              aria-expanded={filtersOpen}
              onClick={() => onFiltersOpenChange(!filtersOpen)}
            >
              <FilterIcon />
            </button>
          </div>
        ),
        cell: ({ row }) => {
          const expanded = expandedId === row.original.id;
          return (
            <div className="journal-table-expand-cell">
              <button
                type="button"
                className={`journal-table-expand${expanded ? " is-open" : ""}`}
                aria-label={expanded ? "Свернуть" : "Развернуть комментарий"}
                onClick={() => onToggleExpand(row.original.id)}
              >
                ›
              </button>
              {expanded ? (
                <button
                  type="button"
                  className="journal-table-edit-btn journal-table-edit-btn--inline"
                  aria-label="Изменить"
                  onClick={() => onEdit(row.original)}
                >
                  <EditIcon />
                </button>
              ) : null}
            </div>
          );
        },
      }),
    ],
    [assetsBySymbol, expandedId, filtersOpen, onEdit, onFiltersOpenChange, onToggleExpand],
  );

  const table = useReactTable({
    data: trades,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  const colSpan = table.getAllColumns().length;

  const addButtonFooter = (
    <tr className="journal-table-footer-row">
      <td colSpan={colSpan} className="journal-table-footer-cell">
        <div className="journal-table-footer">
          <button
            type="button"
            className="journal-table-footer-btn journal-table-footer-btn--primary"
            onClick={onOpenForm}
          >
            Добавить сделку
          </button>
        </div>
      </td>
    </tr>
  );

  const addButtonUnderHeader = (
    <>
      <tr className="journal-table-empty-row">
        <td colSpan={colSpan} className="journal-table-empty-cell">
          <p className="journal-table-empty">Сделок пока нет</p>
        </td>
      </tr>
      <tr className="journal-table-footer-row journal-table-footer-row--top">
        <td colSpan={colSpan} className="journal-table-footer-cell">
          <div className="journal-table-footer journal-table-footer--top">
            <button
              type="button"
              className="journal-table-footer-btn journal-table-footer-btn--primary"
              onClick={onOpenForm}
            >
              Добавить сделку
            </button>
          </div>
        </td>
      </tr>
    </>
  );

  const showAddButtonAtTop = trades.length === 0 && !showForm;
  const showAddButtonAtBottom = trades.length > 0 && !showForm;

  const filtersPopover = (
    <JournalFiltersPopover
      open={filtersOpen}
      anchorRef={filterBtnRef}
      filters={filters}
      onChange={onFiltersChange}
      onClose={() => onFiltersOpenChange(false)}
    />
  );

  if (!onSubmitTrade) {
    return (
      <>
        <TradeTableBody trades={trades} expandedId={expandedId} table={table} />
        {filtersPopover}
      </>
    );
  }

  if (!showForm) {
    return (
      <>
        <TradeTableBody
          trades={trades}
          expandedId={expandedId}
          table={table}
          addButtonRow={showAddButtonAtTop ? addButtonUnderHeader : null}
          tableFooter={showAddButtonAtBottom ? addButtonFooter : null}
        />
        {filtersPopover}
      </>
    );
  }

  return (
    <>
      <TradeFormShell
        key={editingTrade ? editingTrade.id : `add-${formResetKey}`}
        initial={editingTrade}
        saving={saving}
        error={formError}
        colSpan={colSpan}
        onSubmit={onSubmitTrade}
        onCancel={onCancelEdit}
      >
        {({ formRow }) => (
          <TradeTableBody
            trades={trades}
            expandedId={expandedId}
            table={table}
            addFormAtTop={addFormAtTop}
            inlineEditTradeId={inlineEditTradeId}
            formRow={formRow}
          />
        )}
      </TradeFormShell>
      {filtersPopover}
    </>
  );
}
