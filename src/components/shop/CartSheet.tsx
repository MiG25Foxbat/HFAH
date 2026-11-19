"use client";
import { AnimatePresence, motion } from "motion/react";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo } from "react";
import { cartSnapshot, type CartItem } from "@/lib/cart";
import { cartReconcile, cartRemove, cartUpdate, useCart } from "@/lib/cart-store";
import { UNIT_LABEL, type Service } from "@/lib/catalog";
import { worksCount } from "@/lib/format";
import { formatRub, type PricingSettings, type SnapshotLine } from "@/lib/pricing";
import { closeCart, useCartOpen } from "@/lib/ui-store";
import { Button, ButtonLink, IconButton, TextArea } from "@/components/ui/controls";
import { TrashIcon } from "@/components/ui/icons";
import { QtyStepper } from "@/components/ui/QtyStepper";
import { Sheet } from "@/components/ui/Sheet";
import { PriceSummary } from "./PriceSummary";

const SPRING = { type: "spring", stiffness: 380, damping: 34 } as const;

/** Корзина — лист, смонтированный в layout: открывается с любой страницы. Заодно сверяет сохранённую корзину с каталогом. */
export function CartSheetHost({ services, pricing }: { services: Service[]; pricing: PricingSettings }) {
  const open = useCartOpen();
  const { lines } = useCart();
  const pathname = usePathname();
  const router = useRouter();
  const byId = useMemo(() => new Map(services.map((s) => [s.id, s])), [services]);
  const snap = useMemo(() => cartSnapshot(services, pricing, lines), [services, pricing, lines]);

  useEffect(() => cartReconcile(services), [services]);

  const chooseWorks = () => {
    closeCart();
    if (pathname !== "/") router.push("/");
  };

  return (
    <Sheet
      open={open}
      onClose={closeCart}
      title={lines.length ? `Корзина: ${worksCount(lines.length)}` : "Корзина"}
      footer={
        lines.length > 0 && (
          <div className="grid gap-2">
            <ButtonLink href="/checkout" onClick={closeCart} className="w-full">
              Оформить заявку
            </ButtonLink>
            <Button variant="secondary" onClick={chooseWorks} className="w-full">
              Добавить ещё работу
            </Button>
          </div>
        )
      }
    >
      {lines.length === 0 ? (
        <div className="grid justify-items-start gap-4 py-6">
          <p className="max-w-[28ch] text-[1.0625rem] leading-snug">Корзина пуста. Выберите категорию и добавьте работу — цена появится сразу.</p>
          <Button onClick={chooseWorks}>Выбрать работы</Button>
        </div>
      ) : (
        <div className="grid gap-5">
          <ul className="grid gap-3">
            <AnimatePresence initial={false} mode="popLayout">
              {lines.map((item) => (
                <CartLineRow key={item.id} item={item} line={snap?.lines.find((l) => l.key === item.key)} service={byId.get(item.serviceId)} />
              ))}
            </AnimatePresence>
          </ul>
          {snap && (
            <>
              <PriceSummary totals={snap} minutes={snap.minutes} manualCount={lines.filter((l) => l.manual).length} minOrder={pricing.minOrder} />
              <p className="text-[0.8125rem] leading-snug text-muted">
                Срочный выезд ({`+${pricing.urgentPct}%`}) и выезд за город ({formatRub(pricing.outOfTownFee)}) отмечаются при оформлении и добавляются в расчёт.
              </p>
            </>
          )}
        </div>
      )}
    </Sheet>
  );
}

function MiniCheck({ checked, onChange, children }: { checked: boolean; onChange: (v: boolean) => void; children: React.ReactNode }) {
  return (
    <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-full border border-line bg-surface px-3 text-[0.875rem] has-[:checked]:border-accent has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-accent">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="size-5 accent-(--accent)" />
      {children}
    </label>
  );
}

function CartLineRow({ item, line, service }: { item: CartItem; line?: SnapshotLine; service?: Service }) {
  const price = line?.unitPrice;
  return (
    <motion.li
      layout="position"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.97 }}
      transition={SPRING}
      className="grid gap-3 rounded-field border border-line bg-surface p-4"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-medium leading-snug">{service?.title ?? item.title}</p>
          <p className="text-[0.875rem] text-muted tabular-nums">
            {item.manual ? "Стоимость — по фото" : price != null ? `${formatRub(price)} за ${UNIT_LABEL[item.unit]}` : ""}
          </p>
        </div>
        <IconButton label={`Убрать: ${item.title}`} onClick={() => cartRemove(item.key)} className="-mr-2 -mt-2">
          <TrashIcon />
        </IconButton>
      </div>

      {item.manual ? (
        <TextArea
          id={`cart-desc-${item.uid}`}
          label="Что нужно сделать"
          value={item.description ?? ""}
          onChange={(e) => cartUpdate(item.key, { description: e.target.value })}
          hint={(item.description ?? "").trim().length < 10 ? "Нужно описание не короче 10 символов — иначе заявку не отправить." : undefined}
          maxLength={1000}
          className="min-h-20"
        />
      ) : (
        <>
          <QtyStepper unit={item.unit} value={item.qty} onChange={(qty) => cartUpdate(item.key, { qty })} label={`Количество: ${item.title}`} compact />
          <div className="flex flex-wrap gap-2">
            <MiniCheck checked={item.complex} onChange={(complex) => cartUpdate(item.key, { complex })}>
              Сложные условия
            </MiniCheck>
            {service?.dismantleAllowed && (
              <MiniCheck checked={item.dismantle} onChange={(dismantle) => cartUpdate(item.key, { dismantle })}>
                Демонтаж старого
              </MiniCheck>
            )}
          </div>
        </>
      )}

      <div className="flex items-baseline justify-between gap-3 border-t border-line pt-3" aria-live="polite" aria-atomic="true">
        <span className="text-[0.875rem] text-muted">{line && line.pct > 0 ? `Надбавка ${line.pct}%` : "За работу"}</span>
        <span className="text-[1.125rem] font-semibold tabular-nums">{line?.total == null ? "По фото" : formatRub(line.total)}</span>
      </div>
    </motion.li>
  );
}
