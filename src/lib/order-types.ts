/** Типы заявки, общие для сервера, клиентской страницы /o/<токен> и кабинета. Без серверных импортов. */
import type { CategoryId, CharacterKey, Unit } from "./catalog";
import type { GameSettings } from "./settings";
import type { ClientType, Materials } from "./order-schema";

export const ORDER_STATUSES = ["new", "agreed", "done", "cancelled"] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  new: "Новая",
  agreed: "Согласована",
  done: "Завершена",
  cancelled: "Отменена",
};

export interface PublicOrderLine {
  title: string;
  /** Категория работы из снимка заявки (id на момент заказа). */
  category: CategoryId;
  /** Название, цвет и персонаж категории на момент заказа: по персонажу игра выбирает предмет. У старых заявок — запасные значения. */
  categoryTitle: string;
  categoryColor: string;
  character: CharacterKey;
  qty: number;
  unit: Unit;
  /** null — «По фото». */
  unitPrice: number | null;
  /** null — «По фото». */
  total: number | null;
  complex: boolean;
  dismantle: boolean;
  description?: string;
}

export interface BonusCodePublic {
  code: string;
  amount: number;
  minOrder: number;
  expiresAt: string;
  status: "issued" | "redeemed" | "void";
}

/** То, что клиент упомянул в заявке, но компания этого не делает (из списка «не берём»). Без ключевых слов и места совпадения. */
export interface PublicExcluded {
  title: string;
  /** Подсказка, куда обратиться (из текущих настроек компании); пусто, если пункт убрали из списка. */
  hint: string;
}

/** Ответ GET /api/orders/[token]. Здесь нет телефона, адреса, доступа, заметки владельца и фото. */
export interface PublicOrder {
  number: number;
  status: OrderStatus;
  createdAt: string;
  /** Кто заказывал; название организации — данные самого клиента на его приватной странице. */
  clientType: ClientType;
  orgName: string | null;
  wantsInvoice: boolean;
  lines: PublicOrderLine[];
  totals: {
    subtotal: number;
    topUp: number;
    urgent: number;
    worksTotal: number;
    outOfTown: number;
    /** null — известной суммы нет (только «По фото»). */
    knownTotal: number | null;
    hasManual: boolean;
    minimumIsPreliminary: boolean;
  };
  flags: { urgent: boolean; outOfTown: boolean };
  /** Ориентировочное время, минуты (без времени «по фото»). */
  minutes: number;
  materials: Materials;
  desiredDate: string | null;
  desiredTime: string | null;
  /** Итоговая цена, которую назначил владелец. */
  finalPrice: number | null;
  /** Согласованное время выезда (ISO). */
  agreedAt: string | null;
  photoCount: number;
  /** Из текста самого клиента найдено то, чем компания не занимается. Пусто, если ничего. */
  excluded: PublicExcluded[];
  bonus: BonusCodePublic | null;
  /** Лица у персонажей включены владельцем: игра рисует предмет с лицом или без. */
  facesEnabled: boolean;
  /** Режим и условия игры: клиентская страница решает, предлагать ли её. */
  game: GameSettings;
}
