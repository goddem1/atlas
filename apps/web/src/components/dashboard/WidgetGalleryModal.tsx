import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import type { DashboardWidgetType } from "../../lib/dashboardWidgets";
import type { MarketIndexId } from "../widgets/index/marketIndexCatalog";
import {
  filterWidgetGalleryItems,
  isWidgetGalleryCategoryEnabled,
  WIDGET_GALLERY_CATEGORIES,
  WIDGET_GALLERY_ITEMS,
  type WidgetGalleryCategoryId,
} from "../../lib/widgetGalleryCatalog";
import { WidgetGalleryPreview } from "./WidgetGalleryPreview";
import { useBackdropBlurPause } from "../../lib/useBackdropBlurPause";
import { isTelegramEnabled } from "../../lib/telegramFeature";
import "../widgets/portfolio/portfolio-widget.css";
import "./widget-gallery.css";

type Props = {
  open: boolean;
  isLoggedIn: boolean;
  onClose: () => void;
  onPick: (type: DashboardWidgetType, options?: { indexId?: MarketIndexId }) => void;
};

export function WidgetGalleryModal({ open, onClose, onPick }: Props) {
  useBackdropBlurPause(open);
  const [categoryId, setCategoryId] = useState<WidgetGalleryCategoryId>("all");
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (!open) return;
    setCategoryId("all");
    setQuery("");
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const baseItems = useMemo(() => {
    return WIDGET_GALLERY_ITEMS.filter(
      (item) => isTelegramEnabled() || item.widgetType !== "news",
    );
  }, []);

  const items = useMemo(() => {
    return filterWidgetGalleryItems(baseItems, categoryId, query);
  }, [baseItems, categoryId, query]);

  useEffect(() => {
    if (!open) return;
    if (isWidgetGalleryCategoryEnabled(categoryId, baseItems)) return;
    setCategoryId("all");
  }, [open, categoryId, baseItems]);

  if (!open) return null;
  if (typeof document === "undefined") return null;

  return createPortal(
    <div className="widget-gallery-overlay" role="presentation">
      <button type="button" className="widget-gallery-backdrop" aria-label="Закрыть" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="widget-gallery-title"
        className="widget-gallery-dialog atlas-glass"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="widget-gallery-title" className="widget-gallery-sr-only">
          Добавить виджет
        </h2>
        <div className="widget-gallery-layout">
          <aside className="widget-gallery-sidebar">
            <label className="widget-gallery-search">
              <span className="widget-gallery-sr-only">Поиск виджета</span>
              <span className="widget-gallery-search-icon" aria-hidden />
              <input
                type="search"
                className="portfolio-input-ghost list-on-glass widget-gallery-search-input"
                placeholder="Поиск виджета"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </label>
            <nav className="widget-gallery-categories" aria-label="Категории виджетов">
              <ul className="widget-gallery-categories-list">
                {WIDGET_GALLERY_CATEGORIES.map((category) => {
                  const enabled = isWidgetGalleryCategoryEnabled(category.id, baseItems);
                  return (
                    <li key={category.id}>
                      <button
                        type="button"
                        className={`widget-gallery-category-btn${categoryId === category.id ? " is-active" : ""}`}
                        aria-current={categoryId === category.id ? "true" : undefined}
                        disabled={!enabled}
                        onClick={() => {
                          if (!enabled) return;
                          setCategoryId(category.id);
                        }}
                      >
                        {category.label}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </nav>
          </aside>

          <div className="widget-gallery-content">
            {items.length === 0 ? (
              <p className="widget-gallery-empty">Ничего не найдено</p>
            ) : (
              <ul className="widget-gallery-grid">
                {items.map((item) => (
                    <li key={item.id}>
                      <button
                        type="button"
                        className="widget-gallery-card"
                        onClick={() => {
                          onPick(item.widgetType, item.indexId ? { indexId: item.indexId } : undefined);
                          onClose();
                        }}
                      >
                        <div className="widget-gallery-card-preview">
                          <WidgetGalleryPreview widgetType={item.widgetType} indexId={item.indexId} />
                        </div>
                        <div className="widget-gallery-card-text">
                          <p className="widget-gallery-card-title">{item.title}</p>
                          <p className="widget-gallery-card-desc">{item.description}</p>
                        </div>
                      </button>
                    </li>
                  ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
