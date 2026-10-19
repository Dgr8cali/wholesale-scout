import {
  ArrowLeftRightIcon, AwardIcon, BanknoteIcon, CalendarCheckIcon, ChartPieIcon, CircleHelpIcon, CirclePlusIcon, ClipboardListIcon,
  FactoryIcon, FileSpreadsheetIcon, FlaskConicalIcon, HouseIcon, LayoutDashboardIcon,
  LightbulbIcon, ListChecksIcon, ListFilterIcon, ListTodoIcon, PackagePlusIcon, PackageSearchIcon, ReceiptTextIcon, RepeatIcon, RocketIcon,
  SettingsIcon, StarIcon, StoreIcon, TextSearchIcon, TruckIcon, WarehouseIcon, type LucideIcon,
} from "lucide-react";

/** Each page's own icon. "?" is Help's alone. */
export const NAV_ICON: Record<string, LucideIcon> = {
  "/": HouseIcon, "/settings": SettingsIcon, "/help": CircleHelpIcon,
  "/runs": ListChecksIcon, "/products": PackageSearchIcon, "/suppliers": TruckIcon, "/shortlist": StarIcon,
  "/new-run": CirclePlusIcon, "/sellers": StoreIcon, "/brands": AwardIcon,
  "/plan": ClipboardListIcon,
  "/pl/candidates": FlaskConicalIcon, "/pl/niches": ChartPieIcon, "/pl/suppliers": FactoryIcon, "/pl/quotes": ReceiptTextIcon,
  "/pl/launch": ListTodoIcon,
  "/ads/dashboard": LayoutDashboardIcon, "/ads/proposals": LightbulbIcon, "/ads/launch": RocketIcon, "/ads/search-terms": TextSearchIcon,
  "/ads/rules": ListFilterIcon, "/ads/review": CalendarCheckIcon,
  "/stock/levels": WarehouseIcon, "/stock/purchases": PackagePlusIcon, "/stock/reorder": RepeatIcon, "/stock/movements": ArrowLeftRightIcon,
  "/stock/sales": BanknoteIcon, "/stock/import": FileSpreadsheetIcon,
};
