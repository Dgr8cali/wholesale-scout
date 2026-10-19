import {
  ArrowLeftRightIcon, AwardIcon, BanknoteIcon, CalendarCheckIcon, ChartPieIcon, CircleHelpIcon, CirclePlusIcon, ClipboardListIcon,
  FactoryIcon, FileSpreadsheetIcon, FileUpIcon, FlaskConicalIcon, HouseIcon, LayoutDashboardIcon,
  LightbulbIcon, ListChecksIcon, ListFilterIcon, ListTodoIcon, PackagePlusIcon, PackageSearchIcon, ReceiptTextIcon, RepeatIcon, RocketIcon,
  SettingsIcon, StarIcon, StoreIcon, TelescopeIcon, TextSearchIcon, TrendingUpIcon, TruckIcon, WarehouseIcon,
  WholeWordIcon, type LucideIcon,
} from "lucide-react";

/** Each page's own icon. "?" is Help's alone. */
export const NAV_ICON: Record<string, LucideIcon> = {
  "/": HouseIcon, "/settings": SettingsIcon, "/help": CircleHelpIcon,
  "/runs": ListChecksIcon, "/products": PackageSearchIcon, "/suppliers": TruckIcon, "/shortlist": StarIcon, "/tracker": TrendingUpIcon,
  "/new-run": CirclePlusIcon, "/sellers": StoreIcon, "/brands": AwardIcon,
  "/plan": ClipboardListIcon,
  "/pl/candidates": FlaskConicalIcon, "/pl/niches": ChartPieIcon, "/pl/suppliers": FactoryIcon, "/pl/quotes": ReceiptTextIcon,
  "/pl/niche-hunt": TelescopeIcon, "/pl/launch": ListTodoIcon,
  "/ads/dashboard": LayoutDashboardIcon, "/ads/proposals": LightbulbIcon, "/ads/launch": RocketIcon, "/ads/keywords": TextSearchIcon,
  "/ads/imports": FileUpIcon, "/ads/rules": ListFilterIcon, "/ads/ngrams": WholeWordIcon, "/ads/review": CalendarCheckIcon,
  "/stock/levels": WarehouseIcon, "/stock/orders": PackagePlusIcon, "/stock/reorder": RepeatIcon, "/stock/movements": ArrowLeftRightIcon,
  "/stock/sales": BanknoteIcon, "/stock/import": FileSpreadsheetIcon,
};
