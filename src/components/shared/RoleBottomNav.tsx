import { useState } from "react";
import { motion } from "framer-motion";
import { MoreHorizontal, Plus } from "lucide-react";
import AttentionBadge from "@/components/attention/AttentionBadge";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { AppBottomBar } from "@/components/layout/AppBottomBar";


export interface RoleNavItem<TId extends string = string> {
  id: TId;
  icon: React.ElementType;
  label: string;
  badge?: number;
}

interface Props<TId extends string> {
  items: RoleNavItem<TId>[];
  active: TId;
  onSelect: (id: TId) => void;
  primarySlots?: number;
  extra?: React.ReactNode;
  /** Optional quick-log "+" button rendered inside the dock. */
  onFABPress?: () => void;
}

/**
 * Shared mobile bottom-dock for Coach / Admin / Partner.
 * Matches the end-user BottomNav visual system:
 *   • flat rectangular bar pinned to the bottom edge (no rounded pill, no floating)
 *   • full phone width, subtle top border + soft shadow
 *   • icon-only tabs, active tab tinted with brand ink
 *   • overflow tabs collapse into a "More" button that opens a bottom drawer
 */
export default function RoleBottomNav<TId extends string>({
  items,
  active,
  onSelect,
  primarySlots = 5,
  extra,
  onFABPress,
}: Props<TId>) {
  const [expanded, setExpanded] = useState(false);

  // Priority split — keep the active tab visible in the dock.
  let primary = items.slice(0, primarySlots);
  let overflow = items.slice(primarySlots);
  if (!primary.some((i) => i.id === active) && overflow.some((i) => i.id === active)) {
    const swapOut = primary[primary.length - 1];
    const activeItem = overflow.find((i) => i.id === active);
    if (swapOut && activeItem) {
      primary = [...primary.slice(0, -1), activeItem];
      overflow = overflow.map((i) => (i.id === active ? swapOut : i));
    }
  }

  const hasOverflow = overflow.length > 0;
  const overflowUnread = overflow.reduce((sum, i) => sum + (i.badge ?? 0), 0);

  const renderDockTab = (item: RoleNavItem<TId>) => {
    const isActive = active === item.id;
    const Icon = item.icon;
    return (
      <motion.button
        key={item.id}
        onClick={() => onSelect(item.id)}
        aria-label={item.label}
        whileTap={{ scale: 0.9 }}
        transition={{ duration: 0.14, ease: [0.22, 1, 0.36, 1] }}
        className="relative flex-1 flex items-center justify-center h-11 rounded-full transition-colors"
        style={
          isActive
            ? { background: "var(--bbdo-ink)", color: "#fff" }
            : { background: "transparent", color: "var(--bbdo-ink-soft)" }
        }
      >
        <Icon className="w-5 h-5" strokeWidth={isActive ? 2 : 1.7} />
        <AttentionBadge count={item.badge ?? 0} className="absolute right-1 top-1" />
      </motion.button>
    );
  };

  const renderSheetTab = (item: RoleNavItem<TId>) => {
    const isActive = active === item.id;
    const Icon = item.icon;
    return (
      <motion.button
        key={item.id}
        onClick={() => {
          onSelect(item.id);
          setExpanded(false);
        }}
        whileTap={{ scale: 0.97 }}
        transition={{ duration: 0.12, ease: [0.22, 1, 0.36, 1] }}
        className="no-pill relative flex flex-col items-center justify-center gap-2 rounded-2xl py-4 px-2 border"
        style={
          isActive
            ? { background: "var(--bbdo-ink)", color: "#fff", borderColor: "var(--bbdo-ink)" }
            : { background: "#ffffff", color: "var(--bbdo-ink)", borderColor: "var(--bbdo-line)" }
        }
      >
        <Icon className="w-5 h-5" strokeWidth={1.7} />
        <span className="text-[11px] font-semibold leading-none text-center no-break">{item.label}</span>
        <AttentionBadge count={item.badge ?? 0} className="absolute right-1.5 top-1.5" />
      </motion.button>
    );
  };

  return (
    <>
      <Drawer open={expanded} onOpenChange={setExpanded}>
        <DrawerContent className="md:hidden max-h-[85vh] flex flex-col">
          <DrawerHeader className="pb-2 flex-shrink-0">
            <DrawerTitle className="text-left text-base font-black text-[var(--bbdo-ink)]">
              All sections
            </DrawerTitle>
          </DrawerHeader>
          <div className="px-4 pb-[max(1rem,env(safe-area-inset-bottom))] overflow-y-auto flex-1 min-h-0">
            <div className="grid grid-cols-3 gap-2">{items.map(renderSheetTab)}</div>
          </div>
        </DrawerContent>
      </Drawer>

      {/* Flat full-width dock — matches end-user BottomNav */}
      <AppBottomBar className="md:hidden" style={{ padding: 0 }}>
        <div
          className="flex items-center gap-0.5 px-2 pt-1.5"
          style={{
            paddingBottom: "calc(max(0.375rem, env(safe-area-inset-bottom)) + var(--bbdo-native-bottom-guard, 0px))",
            background: "#ffffff",
            borderTop: "1px solid var(--bbdo-line)",
            boxShadow: "0 -6px 20px -12px rgba(15,26,61,0.18)",
          }}
        >
          {/* Left tabs */}
          {primary.slice(0, LEFT_SLOTS).map(renderDockTab)}

          {/* Center FAB — identical topology to the end-user dock */}
          {onFABPress && (
            <div className="flex-1 flex items-center justify-center">
              <motion.button
                onClick={onFABPress}
                aria-label="Quick log"
                whileTap={{ scale: 0.92 }}
                transition={{ duration: 0.14, ease: [0.22, 1, 0.36, 1] }}
                className="shrink-0 w-11 h-11 -mt-3 rounded-full flex items-center justify-center"
                style={{
                  background: "var(--bbdo-red, #EA6A5E)",
                  color: "#fff",
                  boxShadow: "0 6px 14px -4px rgba(234,106,94,0.55)",
                  border: "3px solid #ffffff",
                }}
              >
                <Plus className="w-5 h-5" strokeWidth={2.4} />
              </motion.button>
            </div>
          )}

          {/* Right tabs */}
          {primary.slice(LEFT_SLOTS).map(renderDockTab)}

          {hasOverflow && (
            <motion.button
              key="more"
              onClick={() => setExpanded(true)}
              aria-label="More sections"
              whileTap={{ scale: 0.9 }}
              transition={{ duration: 0.14, ease: [0.22, 1, 0.36, 1] }}
              className="relative flex-1 h-11 flex items-center justify-center rounded-full"
              style={{ color: "var(--bbdo-ink-soft)" }}
            >
              <MoreHorizontal className="w-5 h-5" strokeWidth={1.9} />
              <AttentionBadge count={overflowUnread} className="absolute right-1 top-1" />
            </motion.button>
          )}
          {extra}

        </div>
      </AppBottomBar>

    </>
  );
}
