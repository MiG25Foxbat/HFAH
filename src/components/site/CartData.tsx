import { getShopData } from "@/lib/shop-data";
import { CartSheetHost } from "@/components/shop/CartSheet";

/** Каталог для листа корзины (он смонтирован в layout и открывается с любой страницы). Читает БД, поэтому — внутри <Suspense>. */
export async function CartData() {
  const { services, settings } = await getShopData();
  return <CartSheetHost services={services} pricing={settings.pricing} />;
}
