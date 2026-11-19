// Заглушка: настоящее предложение игры делает инженер игры (src/components/game/*).
// Контракт: страница заявки монтирует <GameOffer token mode={settings.game.mode} /> после состава заявки.
export function GameOffer(props: { token: string; mode: "off" | "play" | "bonus" }) {
  void props;
  return null;
}
