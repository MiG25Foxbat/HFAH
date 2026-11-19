/** Что сейчас требует кадров. Пишут компоненты внутри Canvas из useFrame, читает Driver (сцена рисует по требованию). */
export type Activity = {
  /** Сцена на экране и вкладка видна; иначе кадры не планируются. */
  visible: boolean;
  /** Жест, инерция или сброс ракурса. */
  rig: boolean;
  /** Кольцо подиума докручивается. */
  ring: boolean;
  /** Переход персонажей или клип (приветствие, моргание). */
  show: boolean;
  /** Играет непрерывная idle-анимация (не reduced motion). */
  idle: boolean;
  /** Через сколько секунд нужен следующий кадр, если больше ничего не движется (моргание, приветствие). */
  wake: number | null;
};

export const createActivity = (): Activity => ({ visible: true, rig: false, ring: false, show: false, idle: false, wake: null });
