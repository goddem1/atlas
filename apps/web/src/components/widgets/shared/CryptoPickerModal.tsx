import type { CryptocurrencyListItem } from "@atlas-v1/shared";
import { SymbolSearchModal } from "./SymbolSearchModal";

type Props = {
  open: boolean;
  items: CryptocurrencyListItem[];
  /** Ошибка загрузки списка с API (показывается вместо пустого «ничего не найдено»). */
  loadError?: string | null;
  activeSymbol?: string | null;
  onClose: () => void;
  onSelect: (c: CryptocurrencyListItem) => void;
};

export function CryptoPickerModal(props: Props) {
  return <SymbolSearchModal {...props} />;
}
